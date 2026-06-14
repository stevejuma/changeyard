import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoAppStatePath } from "../app-state.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { replaceSection } from "../documents/sections.js";
import { changesRoot } from "../paths.js";
import { replaceMarkedSection } from "../planning/sections.js";
import type { PlanningSectionId } from "../planning/types.js";
import { findChangeFile } from "../state/id.js";
import { assertTransition } from "../state/transitions.js";
import type { ChangeStatus, Frontmatter } from "../types.js";
import { asFrontmatterRecord, assertNoDependencyCycle, parseChangeLinks } from "./changeDependencies.js";

type ParsedChangeMutation = {
  frontmatter?: Frontmatter;
  body?: string;
};

export type UpdateCardMetadataInput = {
  title?: string;
  priority?: string | null;
  labels?: string[];
};

export type UpdatePlanningSectionInput = {
  sectionId: PlanningSectionId;
  content: string;
  expectedUpdatedAt?: string | null;
};

export type UpdateChangeBodyInput = {
  body: string;
  expectedUpdatedAt?: string | null;
};

export type UpdateChangeStatusInput = {
  status: ChangeStatus;
};

function listChangeDependencies(repoRoot: string): Map<string, string[]> {
  const config = loadConfig(repoRoot);
  const root = changesRoot(repoRoot, config);
  const idsToDependencies = new Map<string, string[]>();

  if (!existsSync(root)) return idsToDependencies;

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(root, entry.name);
    const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
    const id = String(parsed.frontmatter.id ?? path.basename(entry.name, ".md"));
    idsToDependencies.set(id, parseChangeLinks(parsed.frontmatter).blockedBy);
  }

  return idsToDependencies;
}

export class ChangeMutationConflictError extends Error {
  readonly currentUpdatedAt: string | null;

  constructor(message: string, currentUpdatedAt: string | null) {
    super(message);
    this.name = "ChangeMutationConflictError";
    this.currentUpdatedAt = currentUpdatedAt;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function lockPath(repoRoot: string, id: string): string {
  return repoAppStatePath(repoRoot, "locks", "changes", `${id}.lock`);
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

export function updatePlanningSection(repoRoot: string, id: string, input: UpdatePlanningSectionInput): string {
  const result = mutateChangeFrontmatter(repoRoot, id, ({ frontmatter, body }) => {
    const currentUpdatedAt = typeof frontmatter.updatedAt === "string" ? frontmatter.updatedAt : null;
    if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== currentUpdatedAt) {
      throw new ChangeMutationConflictError(
        `Change ${id} was updated elsewhere. Reload the latest planning content and retry your edit.`,
        currentUpdatedAt,
      );
    }

    return {
      frontmatter: {
        ...frontmatter,
        updatedAt: nowIso(),
      },
      body: replaceMarkedSection(body, input.sectionId, input.content),
    };
  });

  return result.filePath;
}

export function updateChangeBody(repoRoot: string, id: string, input: UpdateChangeBodyInput): string {
  const result = mutateChangeFrontmatter(repoRoot, id, ({ frontmatter }) => {
    const currentUpdatedAt = typeof frontmatter.updatedAt === "string" ? frontmatter.updatedAt : null;
    if (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt !== currentUpdatedAt) {
      throw new ChangeMutationConflictError(
        `Change ${id} was updated elsewhere. Reload the latest markdown and retry your edit.`,
        currentUpdatedAt,
      );
    }

    return {
      frontmatter: {
        ...frontmatter,
        updatedAt: nowIso(),
      },
      body: input.body,
    };
  });

  return result.filePath;
}

export function updateChangeStatus(repoRoot: string, id: string, input: UpdateChangeStatusInput): string {
  const result = mutateChangeFrontmatter(repoRoot, id, ({ frontmatter, body }) => ({
    frontmatter: {
      ...frontmatter,
      status: input.status,
      updatedAt: nowIso(),
    },
    body,
  }));

  return result.filePath;
}

export function linkChanges(repoRoot: string, id: string, blockedByChangeId: string): string {
  const targetId = blockedByChangeId.trim();
  if (!targetId) throw new Error("blockedByChangeId is required");
  if (id === targetId) throw new Error(`Change ${id} cannot depend on itself.`);

  const dependencies = listChangeDependencies(repoRoot);
  if (!dependencies.has(id)) throw new Error(`Change not found: ${id}`);
  if (!dependencies.has(targetId)) throw new Error(`Linked change not found: ${targetId}`);

  const currentBlockedBy = dependencies.get(id) ?? [];
  if (currentBlockedBy.includes(targetId)) {
    throw new Error(`Change ${id} is already blocked by ${targetId}.`);
  }

  dependencies.set(id, [...currentBlockedBy, targetId]);
  assertNoDependencyCycle(dependencies, id, targetId);

  const result = mutateChangeFrontmatter(repoRoot, id, ({ frontmatter, body }) => {
    const nextFrontmatter = { ...frontmatter };
    const currentLinks = asFrontmatterRecord(frontmatter.links);
    const nextBlockedBy = [...parseChangeLinks(frontmatter).blockedBy, targetId];
    nextFrontmatter.links = {
      ...currentLinks,
      blockedBy: nextBlockedBy,
    };
    nextFrontmatter.updatedAt = nowIso();
    return {
      frontmatter: nextFrontmatter,
      body,
    };
  });

  return result.filePath;
}

export function unlinkChanges(repoRoot: string, id: string, blockedByChangeId: string): string {
  const targetId = blockedByChangeId.trim();
  if (!targetId) throw new Error("blockedByChangeId is required");

  const result = mutateChangeFrontmatter(repoRoot, id, ({ frontmatter, body }) => {
    const current = parseChangeLinks(frontmatter).blockedBy;
    if (!current.includes(targetId)) {
      throw new Error(`Change ${id} is not blocked by ${targetId}.`);
    }

    const nextFrontmatter = { ...frontmatter };
    const currentLinks = asFrontmatterRecord(frontmatter.links);
    const nextBlockedBy = current.filter((entry) => entry !== targetId);

    if (nextBlockedBy.length > 0) {
      nextFrontmatter.links = {
        ...currentLinks,
        blockedBy: nextBlockedBy,
      };
    } else {
      const nextLinks = { ...currentLinks };
      delete nextLinks.blockedBy;
      if (Object.keys(nextLinks).length > 0) nextFrontmatter.links = nextLinks;
      else delete nextFrontmatter.links;
    }

    nextFrontmatter.updatedAt = nowIso();
    return {
      frontmatter: nextFrontmatter,
      body,
    };
  });

  return result.filePath;
}
