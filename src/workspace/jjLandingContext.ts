import { existsSync } from "node:fs";
import type { WorkspaceMetadata } from "../types.js";
import { shellCommandRunner, shellInspectionCommandRunner } from "./commandRunner.js";
import { validateJjLandingDescriptions, type JjLandingDescriptionValidation } from "./jjLandingDescriptions.js";

export type JjLandingContext = {
  workspaceChangeId: string;
  currentWorkspaceChangeId: string;
  workspaceCommitId: string;
  currentTargetCommitId: string;
  targetMoved: boolean;
  landingRevset: string;
  landingFiles: string[];
  description: string;
  descriptionValidation: JjLandingDescriptionValidation;
};

function commandOutput(command: string, args: string[], cwd: string): string {
  return shellCommandRunner(command, args, cwd).trim();
}

function inspectionOutput(command: string, args: string[], cwd: string): string {
  return shellInspectionCommandRunner(command, args, cwd).trim();
}

export function jjCommitId(cwd: string, revision: string): string {
  return commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", revision, "--no-graph", "-T", "commit_id"], cwd);
}

export function jjChangeId(cwd: string, revision: string): string {
  return inspectionOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", revision, "--no-graph", "-T", "change_id.short()"], cwd);
}

export function jjDescription(cwd: string, revision: string): string {
  return commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", revision, "--no-graph", "-T", "description"], cwd);
}

export function jjChangedFiles(cwd: string, revset: string): string[] {
  const output = inspectionOutput("jj", ["diff", "--name-only", "-r", revset], cwd);
  return output.split("\n").map((line) => line.trim()).filter(Boolean).sort();
}

export function jjLandingFiles(cwd: string, metadata: WorkspaceMetadata, workspaceChangeId: string): string[] {
  const args = metadata.baseCommitId
    ? ["diff", "--name-only", "--from", metadata.baseCommitId, "--to", workspaceChangeId]
    : ["diff", "--name-only", "-r", workspaceChangeId];
  const output = commandOutput("jj", args, cwd);
  return output.split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== ".changeyard-workspace.json" && line !== ".changeyard-hydrate.json")
    .sort();
}

export function updateJjWorkspaceStale(workspacePath: string): void {
  commandOutput("jj", ["workspace", "update-stale"], workspacePath);
}

export function getJjLandingContext(changeId: string, metadata: WorkspaceMetadata, target: string, repoRoot: string): JjLandingContext {
  if (metadata.engine !== "jj") throw new Error(`JJ landing context requires a JJ workspace, got ${metadata.engine}`);
  if (!existsSync(metadata.path)) throw new Error(`Workspace path does not exist: ${metadata.path}`);
  const currentWorkspaceChangeId = jjChangeId(metadata.path, "@");
  const workspaceChangeId = metadata.workspaceChangeId ?? currentWorkspaceChangeId;
  const workspaceCommitId = jjCommitId(metadata.path, workspaceChangeId);
  const currentTargetCommitId = jjCommitId(repoRoot, target);
  const targetMoved = Boolean(metadata.baseCommitId && metadata.baseCommitId !== currentTargetCommitId);
  const descriptionValidation = validateJjLandingDescriptions(changeId, metadata, workspaceChangeId);
  const landingRevset = descriptionValidation.revset;
  return {
    workspaceChangeId,
    currentWorkspaceChangeId,
    workspaceCommitId,
    currentTargetCommitId,
    targetMoved,
    landingRevset,
    landingFiles: jjLandingFiles(metadata.path, metadata, workspaceChangeId),
    description: jjDescription(metadata.path, workspaceChangeId),
    descriptionValidation,
  };
}

export function assertWorkspaceAtRecordedChange(changeId: string, context: JjLandingContext): void {
  if (context.currentWorkspaceChangeId === context.workspaceChangeId) return;
  throw new Error([
    `Workspace ${changeId} is editing ${context.currentWorkspaceChangeId}, but metadata records ${context.workspaceChangeId}.`,
    "",
    "Recovery:",
    `- Run cy repair ${changeId} --workspace to normalize recoverable workspace drift.`,
    `- Or run cd <workspace> && jj edit ${context.workspaceChangeId}, then re-run the command.`,
  ].join("\n"));
}
