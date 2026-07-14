import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildFinalCommitDescription } from "../change/commitDescriptions.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { changesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import type { WorkspaceMetadata } from "../types.js";
import { describeJjWorkspaceCommit } from "../workspace/jjLandingDescriptions.js";
import { inspectWorkspaceChanges } from "../workspace/changeInspection.js";
import { resolveWorkspaceChangePath } from "../workspace/marker.js";
import { readWorkspaceMetadataFromRoot, workspaceMetadataPath } from "./workspace.js";

export type DescribeFinalOptions = {
  dryRun?: boolean;
  target?: string;
};

function writeWorkspaceMetadata(repoRoot: string, id: string, metadata: WorkspaceMetadata): void {
  writeFileSync(workspaceMetadataPath(id, repoRoot), `${JSON.stringify(metadata, null, 2)}\n`);
}

export function finalDescriptionMessage(
  id: string,
  metadata: WorkspaceMetadata,
  repoRoot: string,
  target?: string,
): { message: string; subject: string; warnings: string[]; files: string[]; changePath: string } {
  const config = loadConfig(repoRoot);
  const changePath = metadata.engine === "jj" ? resolveWorkspaceChangePath(metadata) : findChangeFile(changesRoot(repoRoot, config), id) ?? metadata.changePath;
  if (!existsSync(changePath)) throw new Error(`Change document not found for ${id}: ${changePath}`);
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  const changeId = String(parsed.frontmatter.id ?? id);
  const files = inspectWorkspaceChanges(metadata, config).landingFiles;
  const description = buildFinalCommitDescription({
    changeId,
    frontmatter: parsed.frontmatter,
    body: parsed.body,
    files,
  });
  return { message: description.message, subject: description.subject, warnings: description.warnings, files, changePath };
}

export function runDescribeFinal(id: string, options: DescribeFinalOptions = {}, repoRoot = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const metadata = readWorkspaceMetadataFromRoot(id, repoRoot);
  if (!metadata) throw new Error(`Workspace metadata not found for ${id}`);
  const changeId = metadata.changeId;
  const generated = finalDescriptionMessage(changeId, metadata, repoRoot, options.target);
  if (metadata.engine !== "jj") {
    return [
      options.dryRun ? `Dry-run: final description for ${changeId}` : `Generated final description for ${changeId}`,
      "Final landing descriptions are written only for JJ workspaces in this release.",
      "",
      generated.message.trimEnd(),
    ].join("\n");
  }
  const workspaceChangeId = metadata.workspaceChangeId;
  if (!workspaceChangeId) throw new Error(`Workspace ${changeId} is missing workspaceChangeId metadata; run cy repair ${changeId} --workspace.`);
  if (options.dryRun) {
    return [
      `Dry-run: final description for ${changeId}`,
      `workspaceChange: ${workspaceChangeId}`,
      `files: ${generated.files.length ? generated.files.join(", ") : "none"}`,
      "",
      generated.message.trimEnd(),
    ].join("\n");
  }
  describeJjWorkspaceCommit(metadata.path, workspaceChangeId, generated.message);
  writeWorkspaceMetadata(repoRoot, changeId, {
    ...metadata,
    finalDescriptionUpdatedAt: new Date().toISOString(),
  });
  return [
    `Updated final description for ${changeId}`,
    `Workspace change: ${workspaceChangeId}`,
    `Description: ${generated.subject}`,
  ].join("\n");
}
