import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { changesRoot } from "../paths.js";
import { getPlanningStatusSummary } from "../planning/status.js";
import { readOverlayChangeDocument } from "../state/workspaceOverlay.js";
import type { ChangeSummary } from "../types.js";
import { readWorkspaceMetadataFromRoot } from "./workspace.js";

export function listChanges(repoRoot = process.cwd()): ChangeSummary[] {
  const config = loadConfig(repoRoot);
  const changes = changesRoot(repoRoot, config);
  if (!existsSync(changes)) return [];
  return readdirSync(changes)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const filePath = path.join(changes, file);
      const rootParsed = readOverlayChangeDocument(filePath, null);
      const id = String(rootParsed.frontmatter.id ?? path.basename(file, ".md"));
      const parsed = readOverlayChangeDocument(filePath, readWorkspaceMetadataFromRoot(id, repoRoot));
      return {
        id,
        title: String(parsed.frontmatter.title ?? "Untitled"),
        status: String(parsed.frontmatter.status ?? "unknown"),
        type: String(parsed.frontmatter.type ?? "unknown"),
        path: path.relative(repoRoot, filePath),
        planning: getPlanningStatusSummary(parsed.frontmatter, parsed.body),
      };
    });
}

export function runList(repoRoot = process.cwd(), options: { planning?: boolean } = {}): string {
  const changes = listChanges(repoRoot);
  if (changes.length === 0) return "No changes found.";
  if (options.planning) {
    return changes.map((change) => {
      const phase = change.planning?.phase ?? "none";
      return `${change.id}\t${change.status}\t${change.type}\t${phase}\t${change.title}`;
    }).join("\n");
  }
  return changes.map((change) => `${change.id}\t${change.status}\t${change.type}\t${change.title}`).join("\n");
}
