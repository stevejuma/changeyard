import { readFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { parseSections, replaceSection } from "../documents/sections.js";
import { resolveActiveChangePaths, writeChangeDocument } from "../state/activeChangeDocument.js";
import type { Frontmatter } from "../types.js";
import { assertTransition } from "../state/transitions.js";

export type NoteOptions = {
  message?: string;
  replace?: boolean;
  dryRun?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function writeDocument(filePath: string, frontmatter: Frontmatter, body: string, dryRun: boolean | undefined): void {
  if (dryRun) return;
  writeChangeDocument(filePath, { ...frontmatter, updatedAt: nowIso() }, body);
}

export function runNote(id: string, options: NoteOptions = {}, repoRoot = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const message = options.message?.trim();
  if (!message) throw new Error("note message is required; pass --message <text>");

  const paths = resolveActiveChangePaths(id, repoRoot);
  const active = parseFrontmatter(readFileSync(paths.activePath, "utf8"));
  const currentNotes = (parseSections(active.body).get("Completion Notes") ?? "").trim();
  const nextNotes = options.replace || !currentNotes ? message : `${currentNotes}\n\n${message}`;
  const nextActiveBody = replaceSection(active.body, "Completion Notes", nextNotes);
  writeDocument(paths.activePath, active.frontmatter, nextActiveBody, options.dryRun);

  if (paths.rootPath !== paths.activePath) {
    const root = parseFrontmatter(readFileSync(paths.rootPath, "utf8"));
    const nextRootBody = replaceSection(root.body, "Completion Notes", nextNotes);
    writeDocument(paths.rootPath, root.frontmatter, nextRootBody, options.dryRun);
  }

  return [
    options.dryRun ? `Dry-run: would update Completion Notes for ${paths.changeId}` : `Updated Completion Notes for ${paths.changeId}`,
    `Active change file: ${path.relative(repoRoot, paths.activePath) || paths.activePath}`,
    ...(paths.rootPath !== paths.activePath ? [`Mirrored root file: ${path.relative(repoRoot, paths.rootPath) || paths.rootPath}`] : []),
  ].join("\n");
}

export function runMarkInProgress(id: string, options: { dryRun?: boolean } = {}, repoRoot = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const paths = resolveActiveChangePaths(id, repoRoot);
  const active = parseFrontmatter(readFileSync(paths.activePath, "utf8"));
  assertTransition(String(active.frontmatter.status ?? ""), "in_progress", `Mark ${paths.changeId} in progress`);
  writeDocument(paths.activePath, { ...active.frontmatter, status: "in_progress" }, active.body, options.dryRun);

  const changed = [path.relative(repoRoot, paths.activePath) || paths.activePath];
  if (paths.rootPath !== paths.activePath) {
    const root = parseFrontmatter(readFileSync(paths.rootPath, "utf8"));
    try {
      assertTransition(String(root.frontmatter.status ?? ""), "in_progress", `Mark ${paths.changeId} root in progress`);
      writeDocument(paths.rootPath, { ...root.frontmatter, status: "in_progress" }, root.body, options.dryRun);
      changed.push(path.relative(repoRoot, paths.rootPath) || paths.rootPath);
    } catch {
      // Root can intentionally lag behind a JJ workspace; keep active repair useful.
    }
  }

  return `${options.dryRun ? "Dry-run: would mark" : "Marked"} ${paths.changeId} in_progress: ${changed.join(", ")}`;
}
