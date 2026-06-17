import { loadConfig } from "../config/loadConfig.js";
import { changesRoot } from "../paths.js";
import { getPlanningStatusSummary } from "../planning/status.js";
import { findChangeFile } from "../state/id.js";
import { readWorkspaceMetadataFromRoot } from "./workspace.js";
import { readOverlayChangeDocument } from "../state/workspaceOverlay.js";
import type { ChangeSummary } from "../types.js";

export function getStatus(id: string, repoRoot = process.cwd()): ChangeSummary {
  const config = loadConfig(repoRoot);
  const filePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!filePath) throw new Error(`Change not found: ${id}`);
  const rootParsed = readOverlayChangeDocument(filePath, null);
  const changeId = String(rootParsed.frontmatter.id ?? id);
  const parsed = readOverlayChangeDocument(filePath, readWorkspaceMetadataFromRoot(changeId, repoRoot));
  return {
    id: String(parsed.frontmatter.id ?? changeId),
    title: String(parsed.frontmatter.title ?? "Untitled"),
    type: String(parsed.frontmatter.type ?? "unknown"),
    status: String(parsed.frontmatter.status ?? "unknown"),
    path: filePath,
    planning: getPlanningStatusSummary(parsed.frontmatter, parsed.body),
  };
}

export function runStatus(id: string, repoRoot = process.cwd()): string {
  const status = getStatus(id, repoRoot);
  const lines = [
    `id: ${status.id}`,
    `title: ${status.title}`,
    `type: ${status.type}`,
    `status: ${status.status}`,
    `path: ${status.path}`,
  ];

  if (status.planning) {
    lines.push(
      `planning: ${status.planning.model} ${status.planning.strictness}`,
      `planningPhase: ${status.planning.phase}`,
      "planningGates:",
    );
    for (const [gate, value] of Object.entries(status.planning.gates)) {
      lines.push(`  ${gate}: ${value}`);
    }
    if (status.planning.missingSections.length > 0) {
      lines.push(`missingPlanningSections: ${status.planning.missingSections.join(", ")}`);
    }
    if (status.planning.errors.length > 0) {
      lines.push(`planningErrors: ${status.planning.errors.join("; ")}`);
    }
    if (status.planning.nextAction) {
      lines.push(`planningNextAction: ${status.planning.nextAction}`);
    }
  }

  return lines.join("\n");
}
