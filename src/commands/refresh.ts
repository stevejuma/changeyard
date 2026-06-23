import { existsSync, writeFileSync } from "node:fs";
import { loadConfig } from "../config/loadConfig.js";
import type { WorkspaceMetadata } from "../types.js";
import { shellCommandRunner } from "../workspace/commandRunner.js";
import { assertWorkspaceAtRecordedChange, getJjLandingContext, updateJjWorkspaceStale } from "../workspace/jjLandingContext.js";
import { getWorkspaceStatus, readWorkspaceMetadataFromRoot, workspaceMetadataPath } from "./workspace.js";

export type RefreshOptions = {
  target?: string;
  dryRun?: boolean;
};

function commandOutput(command: string, args: string[], cwd: string): string {
  return shellCommandRunner(command, args, cwd).trim();
}

function writeWorkspaceMetadata(repoRoot: string, id: string, metadata: WorkspaceMetadata): void {
  writeFileSync(workspaceMetadataPath(id, repoRoot), `${JSON.stringify(metadata, null, 2)}\n`);
}

export function runRefresh(id: string, options: RefreshOptions = {}, repoRoot = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const config = loadConfig(repoRoot);
  const target = options.target ?? config.project.defaultBase;
  const metadata = readWorkspaceMetadataFromRoot(id, repoRoot);
  if (!metadata) throw new Error(`Workspace metadata not found for ${id}`);
  if (metadata.engine !== "jj") throw new Error(`cy refresh currently supports JJ workspaces only; workspace engine ${metadata.engine} is not supported yet.`);
  if (!existsSync(metadata.path)) throw new Error(`Workspace path does not exist: ${metadata.path}`);

  const changeId = metadata.changeId;
  const before = getJjLandingContext(changeId, metadata, target, repoRoot);
  assertWorkspaceAtRecordedChange(changeId, before);
  const lines = [
    options.dryRun ? `Dry-run: would refresh ${changeId} onto ${target}` : `Refreshed ${changeId} onto ${target}`,
    `oldBaseCommit: ${metadata.baseCommitId ?? "unknown"}`,
    `newBaseCommit: ${before.currentTargetCommitId}`,
    `landingRevset: ${before.landingRevset}`,
    `landingFiles: ${before.landingFiles.length === 0 ? "none" : before.landingFiles.join(", ")}`,
  ];
  if (options.dryRun) return lines.join("\n");

  commandOutput("jj", ["rebase", "-r", before.landingRevset, "-o", target], repoRoot);
  updateJjWorkspaceStale(metadata.path);
  const status = getWorkspaceStatus(changeId, repoRoot);
  if (status.conflicts) {
    return [
      ...lines,
      `conflicts: true`,
      `Next: resolve conflicts in ${metadata.path}, then run cy workspace status ${changeId}`,
    ].join("\n");
  }
  if (status.errors.length > 0) {
    throw new Error(status.errors.join("\n"));
  }
  const nextContext = getJjLandingContext(changeId, metadata, target, repoRoot);
  const nextMetadata: WorkspaceMetadata = {
    ...metadata,
    targetRef: target,
    baseCommitId: before.currentTargetCommitId,
    workspaceChangeId: before.workspaceChangeId,
    workspaceCommitId: nextContext.workspaceCommitId,
    refreshedAt: new Date().toISOString(),
  };
  writeWorkspaceMetadata(repoRoot, changeId, nextMetadata);
  return [
    ...lines,
    `workspaceCommit: ${nextMetadata.workspaceCommitId ?? "unknown"}`,
    `conflicts: false`,
    `Next: cy land ${changeId}`,
  ].join("\n");
}
