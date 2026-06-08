import { readFileSync } from "node:fs";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { changesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import type { ChangeSummary } from "../types.js";

export function getStatus(id: string, repoRoot = process.cwd()): ChangeSummary {
  const config = loadConfig(repoRoot);
  const filePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!filePath) throw new Error(`Change not found: ${id}`);
  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  return {
    id: String(parsed.frontmatter.id ?? id),
    title: String(parsed.frontmatter.title ?? "Untitled"),
    type: String(parsed.frontmatter.type ?? "unknown"),
    status: String(parsed.frontmatter.status ?? "unknown"),
    path: filePath,
  };
}

export function runStatus(id: string, repoRoot = process.cwd()): string {
  const status = getStatus(id, repoRoot);
  return [
    `id: ${status.id}`,
    `title: ${status.title}`,
    `type: ${status.type}`,
    `status: ${status.status}`,
    `path: ${status.path}`,
  ].join("\n");
}
