import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { changesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import { assertTransition } from "../state/transitions.js";
import type { Frontmatter, WorkspaceMetadata } from "../types.js";
import { shellCommandRunner } from "../workspace/commandRunner.js";
import { deleteWorkspace, getWorkspaceStatus, readWorkspaceMetadataFromRoot, validateLandingDescription, workspaceMetadataPath } from "./workspace.js";

export type LandOptions = {
  target?: string;
  dryRun?: boolean;
  keepWorkspace?: boolean;
};

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function commandOutput(command: string, args: string[], cwd: string): string {
  return shellCommandRunner(command, args, cwd).trim();
}

function jjWorkspaceChangeId(workspacePath: string): string {
  commandOutput("jj", ["status"], workspacePath);
  return commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "change_id.short()"], workspacePath);
}

function jjCommitId(cwd: string, revision: string): string {
  return commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", revision, "--no-graph", "-T", "commit_id"], cwd);
}

function jjDescription(cwd: string, revision: string): string {
  return commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", revision, "--no-graph", "-T", "description"], cwd);
}

function jjWorkspaceChangedFiles(workspacePath: string): string[] {
  const output = commandOutput("jj", ["diff", "--name-only"], workspacePath);
  return output.split("\n").map((line) => line.trim()).filter(Boolean).sort();
}

function writeWorkspaceMetadata(repoRoot: string, id: string, metadata: WorkspaceMetadata): void {
  writeFileSync(workspaceMetadataPath(id, repoRoot), `${JSON.stringify(metadata, null, 2)}\n`);
}

function updateMergedChangeFile(repoRoot: string, workspacePath: string, changePath: string, body: string, frontmatter: Frontmatter): void {
  const nextFrontmatter: Frontmatter = {
    ...frontmatter,
    status: "merged",
    mergedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    remote: {
      ...asRecord(frontmatter.remote),
      provider: String(asRecord(frontmatter.remote).provider ?? "local"),
      mergedLocally: true,
    },
  };
  const workspaceChangePath = path.join(workspacePath, path.relative(repoRoot, changePath));
  mkdirSync(path.dirname(workspaceChangePath), { recursive: true });
  writeFileSync(workspaceChangePath, writeFrontmatter(nextFrontmatter, body));
}

export function runLand(id: string, options: LandOptions = {}, repoRoot = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const config = loadConfig(repoRoot);
  const target = options.target ?? config.project.defaultBase;
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!changePath) throw new Error(`Change not found: ${id}`);
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  const currentStatus = String(parsed.frontmatter.status ?? "unknown");
  if (currentStatus === "merged") {
    return `Already landed ${id}; Next: cy workspace delete ${id}`;
  }
  if (currentStatus !== "ready_for_pr") {
    throw new Error(`Change ${id} must be ready_for_pr before landing; current status is ${currentStatus}`);
  }
  assertTransition(currentStatus, "merged", `Land ${id}`);

  const metadata = readWorkspaceMetadataFromRoot(id, repoRoot);
  if (!metadata) throw new Error(`Workspace metadata not found for ${id}; run cy workspace status ${id}`);
  if (metadata.engine !== "jj") {
    throw new Error(`cy land currently supports JJ workspaces only; workspace engine ${metadata.engine} is not supported yet.`);
  }
  if (!existsSync(metadata.path)) throw new Error(`Workspace path does not exist: ${metadata.path}`);

  let workspaceStatus = getWorkspaceStatus(id, repoRoot);
  if (workspaceStatus.conflicts) throw new Error(`Workspace ${id} has conflicts; resolve them before landing`);
  if (workspaceStatus.rootMismatch) throw new Error(`Workspace ${id} belongs to ${metadata.repoRoot}, not ${repoRoot}`);
  if (workspaceStatus.errors.length > 0) throw new Error(workspaceStatus.errors.join("\n"));

  const workspaceChangeId = metadata.workspaceChangeId ?? workspaceStatus.workspaceChangeId ?? jjWorkspaceChangeId(metadata.path);
  const description = jjDescription(metadata.path, workspaceChangeId);
  const descriptionError = validateLandingDescription(id, description, metadata.seedDescription);
  const workspaceFiles = jjWorkspaceChangedFiles(metadata.path);
  const currentTargetCommitId = workspaceStatus.currentTargetCommitId ?? jjCommitId(repoRoot, target);
  const targetMoved = Boolean(metadata.baseCommitId && metadata.baseCommitId !== currentTargetCommitId);

  if (options.dryRun) {
    const lines = [
      `Dry-run: would land ${id} into ${target}`,
      `workspaceChange: ${workspaceChangeId}`,
      `targetMoved: ${String(targetMoved)}`,
      `landingDescription: ${descriptionError ? "blocked" : "ok"}`,
      `workspaceFiles: ${workspaceFiles.length === 0 ? "none" : workspaceFiles.join(", ")}`,
      `description: ${description.split("\n")[0] ?? description}`,
    ];
    if (descriptionError) lines.push(`blocker: ${descriptionError}`);
    if (!options.keepWorkspace) lines.push(`cleanup: would delete workspace ${id}`);
    return lines.join("\n");
  }
  if (descriptionError) throw new Error(descriptionError);

  let nextMetadata: WorkspaceMetadata = {
    ...metadata,
    workspaceChangeId,
    workspaceCommitId: jjCommitId(metadata.path, workspaceChangeId),
  };
  if (targetMoved) {
    commandOutput("jj", ["rebase", "-r", workspaceChangeId, "-o", target], repoRoot);
    workspaceStatus = getWorkspaceStatus(id, repoRoot);
    if (workspaceStatus.conflicts) throw new Error(`Workspace ${id} has conflicts after rebasing onto ${target}; resolve them before landing`);
    if (workspaceStatus.errors.length > 0) throw new Error(workspaceStatus.errors.join("\n"));
    nextMetadata = {
      ...nextMetadata,
      baseCommitId: currentTargetCommitId,
      workspaceCommitId: jjCommitId(metadata.path, workspaceChangeId),
    };
  }
  updateMergedChangeFile(repoRoot, metadata.path, changePath, parsed.body, parsed.frontmatter);
  commandOutput("jj", ["status"], metadata.path);
  nextMetadata = {
    ...nextMetadata,
    workspaceCommitId: jjCommitId(metadata.path, workspaceChangeId),
  };
  writeWorkspaceMetadata(repoRoot, id, nextMetadata);
  commandOutput("jj", ["bookmark", "set", target, "-r", workspaceChangeId], repoRoot);

  const cleanupMessage = options.keepWorkspace ? null : deleteWorkspace(id, { force: true }, repoRoot);
  const lines = [`Landed ${id} into ${target}`, `Workspace change: ${workspaceChangeId}`, `Description: ${description.split("\n")[0] ?? description}`];
  if (options.keepWorkspace) {
    lines.push(`Next: cy workspace delete ${id}`);
  } else if (cleanupMessage) {
    lines.push(cleanupMessage);
  }
  return lines.join("\n");
}
