import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { replaceSection } from "../documents/sections.js";
import { changesRoot, storageRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import { assertTransition } from "../state/transitions.js";
import type { ChangeStatus, Frontmatter } from "../types.js";

type ParsedChangeMutation = {
  frontmatter?: Frontmatter;
  body?: string;
};

export type UpdateCardMetadataInput = {
  title?: string;
  priority?: string | null;
  labels?: string[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function lockPath(repoRoot: string, id: string): string {
  const config = loadConfig(repoRoot);
  const root = storageRoot(repoRoot, config);
  return path.join(root, "locks", `${id}.lock`);
}

function acquireLock(repoRoot: string, id: string): () => void {
  const target = lockPath(repoRoot, id);
  mkdirSync(path.dirname(target), { recursive: true });
  let handle: number | undefined;
  try {
    handle = openSync(target, "wx");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Change ${id} is already being updated: ${message}`);
  }

  return () => {
    if (handle !== undefined) closeSync(handle);
    rmSync(target, { force: true });
  };
}

function writeAtomic(filePath: string, contents: string): void {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, contents);
  renameSync(tempPath, filePath);
}

export function mutateChangeFrontmatter(
  repoRoot: string,
  id: string,
  mutate: (parsed: { frontmatter: Frontmatter; body: string }) => ParsedChangeMutation | void,
): { filePath: string; frontmatter: Frontmatter; body: string } {
  const config = loadConfig(repoRoot);
  const filePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!filePath || !existsSync(filePath)) throw new Error(`Change not found: ${id}`);

  const release = acquireLock(repoRoot, id);
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = parseFrontmatter(raw);
    const next = mutate({
      frontmatter: { ...parsed.frontmatter },
      body: parsed.body,
    });
    const frontmatter = next?.frontmatter ?? parsed.frontmatter;
    const body = next?.body ?? parsed.body;

    const previousStatus = parsed.frontmatter.status;
    const nextStatus = frontmatter.status;
    if (typeof previousStatus === "string" && typeof nextStatus === "string") {
      assertTransition(previousStatus, nextStatus as ChangeStatus, `Change ${id}`);
    }

    if (frontmatter.updatedAt === undefined) {
      frontmatter.updatedAt = nowIso();
    }

    writeAtomic(filePath, writeFrontmatter(frontmatter, body));
    return { filePath, frontmatter, body };
  } finally {
    release();
  }
}

export function updateCardMetadata(repoRoot: string, id: string, patch: UpdateCardMetadataInput): string {
  const result = mutateChangeFrontmatter(repoRoot, id, ({ frontmatter, body }) => {
    const nextFrontmatter = { ...frontmatter };

    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new Error("title is required");
      nextFrontmatter.title = title;
    }

    if (patch.priority !== undefined) {
      if (patch.priority === null || patch.priority.trim() === "") delete nextFrontmatter.priority;
      else nextFrontmatter.priority = patch.priority.trim();
    }

    if (patch.labels !== undefined) {
      const labels = patch.labels.map((label) => label.trim()).filter(Boolean);
      if (labels.length === 0) delete nextFrontmatter.labels;
      else nextFrontmatter.labels = labels;
    }

    nextFrontmatter.updatedAt = nowIso();
    return {
      frontmatter: nextFrontmatter,
      body,
    };
  });

  return result.filePath;
}

export function updateCardSection(repoRoot: string, id: string, sectionName: string, content: string): string {
  const result = mutateChangeFrontmatter(repoRoot, id, ({ frontmatter, body }) => ({
    frontmatter: {
      ...frontmatter,
      updatedAt: nowIso(),
    },
    body: replaceSection(body, sectionName, content),
  }));

  return result.filePath;
}
