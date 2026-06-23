import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateFinalCommitDescription } from "../change/commitDescriptions.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { changesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import { assertTransition } from "../state/transitions.js";
import type { Frontmatter, WorkspaceMetadata } from "../types.js";
import { shellCommandRunner, shellInspectionCommandRunner } from "../workspace/commandRunner.js";
import { validateJjLandingDescriptions } from "../workspace/jjLandingDescriptions.js";
import { assertWorkspaceAtRecordedChange, getJjLandingContext } from "../workspace/jjLandingContext.js";
import { resolveWorkspaceChangePath } from "../workspace/marker.js";
import { deleteWorkspace, getWorkspaceStatus, readWorkspaceMetadataFromRoot, workspaceMetadataPath } from "./workspace.js";

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

function jjCommitId(cwd: string, revision: string): string {
  return commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", revision, "--no-graph", "-T", "commit_id"], cwd);
}

function jjWorkspaceCommitId(workspacePath: string): string {
  return jjCommitId(workspacePath, "@");
}

function writeWorkspaceMetadata(repoRoot: string, id: string, metadata: WorkspaceMetadata): void {
  writeFileSync(workspaceMetadataPath(id, repoRoot), `${JSON.stringify(metadata, null, 2)}\n`);
}

function mergedChangeDocument(body: string, frontmatter: Frontmatter): string {
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
  return writeFrontmatter(nextFrontmatter, body);
}

function writeChangeDocument(changePath: string, document: string): void {
  mkdirSync(path.dirname(changePath), { recursive: true });
  writeFileSync(changePath, document);
}

function withLandRecovery(message: string, id: string, repoRoot: string, extraRecovery: string[] = []): string {
  return [
    message,
    "",
    "Recovery:",
    `- Run cy audit ${id} from ${repoRoot} to inspect workflow blockers.`,
    `- Run cy workspace status ${id} for workspace-specific blockers.`,
    ...extraRecovery,
    `- Re-run cy land ${id} after the blockers are fixed.`,
  ].join("\n");
}

function formatJjDescriptionFailure(changeId: string, errors: string[]): string {
  return [
    `JJ workspace commit descriptions must start with ${changeId}:`,
    ...errors.map((entry) => `- ${entry}`),
  ].join("\n");
}

export function runLand(id: string, options: LandOptions = {}, repoRoot = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const config = loadConfig(repoRoot);
  const target = options.target ?? config.project.defaultBase;
  const rootChangePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!rootChangePath) throw new Error(`Change not found: ${id}`);
  const rootParsed = parseFrontmatter(readFileSync(rootChangePath, "utf8"));
  const changeId = String(rootParsed.frontmatter.id ?? id);
  const metadata = readWorkspaceMetadataFromRoot(changeId, repoRoot);
  const changePath = metadata?.engine === "jj" ? resolveWorkspaceChangePath(metadata) : rootChangePath;
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  const currentStatus = String(parsed.frontmatter.status ?? "unknown");
  if (currentStatus === "merged") {
    return `Already landed ${changeId}; Next: cy workspace delete ${changeId}`;
  }
  if (currentStatus !== "ready_for_pr") {
    throw new Error(withLandRecovery(`Change ${changeId} must be ready_for_pr before landing; current status is ${currentStatus}`, changeId, repoRoot));
  }
  assertTransition(currentStatus, "merged", `Land ${changeId}`);

  if (!metadata) throw new Error(withLandRecovery(`Workspace metadata not found for ${changeId}; run cy workspace status ${changeId}`, changeId, repoRoot));
  if (metadata.engine !== "jj") {
    throw new Error(withLandRecovery(`cy land currently supports JJ workspaces only; workspace engine ${metadata.engine} is not supported yet.`, changeId, repoRoot));
  }
  if (!existsSync(metadata.path)) throw new Error(withLandRecovery(`Workspace path does not exist: ${metadata.path}`, changeId, repoRoot));

  let workspaceStatus = getWorkspaceStatus(changeId, repoRoot);
  if (workspaceStatus.conflicts) throw new Error(withLandRecovery(`Workspace ${changeId} has conflicts; resolve them before landing`, changeId, repoRoot));
  if (workspaceStatus.rootMismatch) throw new Error(withLandRecovery(`Workspace ${changeId} belongs to ${metadata.repoRoot}, not ${repoRoot}`, changeId, repoRoot));
  if (workspaceStatus.errors.length > 0) throw new Error(withLandRecovery(workspaceStatus.errors.join("\n"), changeId, repoRoot));
  if (!options.dryRun) {
    commandOutput("jj", ["status"], metadata.path);
  }

  const landing = getJjLandingContext(changeId, metadata, target, repoRoot);
  const workspaceChangeId = landing.workspaceChangeId;
  const description = landing.description;
  const descriptionErrors = landing.descriptionValidation.errors;
  const finalDescription = validateFinalCommitDescription(changeId, description, parsed.body);
  const currentTargetCommitId = landing.currentTargetCommitId;
  const targetMoved = landing.targetMoved;
  const landingRevset = landing.landingRevset;
  if (landing.currentWorkspaceChangeId !== workspaceChangeId) {
    throw new Error(withLandRecovery(`Workspace ${changeId} is editing ${landing.currentWorkspaceChangeId}, but metadata records ${workspaceChangeId}`, changeId, repoRoot, [
      `- Run cy repair ${changeId} --workspace to normalize recoverable workspace drift.`,
    ]));
  }

  if (options.dryRun) {
    const lines = [
      `Dry-run: would land ${changeId} into ${target}`,
      `workspaceChange: ${workspaceChangeId}`,
      `currentWorkspaceChange: ${landing.currentWorkspaceChangeId}`,
      `targetMoved: ${String(targetMoved)}`,
      ...(targetMoved ? [`rebaseRevset: ${landingRevset}`] : []),
      `landingRevset: ${landingRevset}`,
      `landingDescription: ${descriptionErrors.length > 0 ? "blocked" : "ok"}`,
      `landingDescriptions: ${descriptionErrors.length > 0 ? "blocked" : "ok"}`,
      `finalDescriptionValid: ${String(finalDescription.valid)}`,
      `finalDescriptionSummary: ${finalDescription.summary || "unknown"}`,
      `metadataSource: ${metadata.engine === "jj" ? "workspace" : "root"}`,
      `landingFiles: ${landing.landingFiles.length === 0 ? "none" : landing.landingFiles.join(", ")}`,
      `description: ${description.split("\n")[0] ?? description}`,
    ];
    if (targetMoved) lines.push(`blocker: target ${target} moved; run cy refresh ${changeId} --target ${target}`);
    for (const error of descriptionErrors) lines.push(`blocker: ${error}`);
    for (const error of finalDescription.errors) lines.push(`blocker: ${error}`);
    if (!options.keepWorkspace) lines.push(`cleanup: would delete workspace ${changeId}`);
    return lines.join("\n");
  }
  assertWorkspaceAtRecordedChange(changeId, landing);
  if (targetMoved) {
    throw new Error(withLandRecovery(`Target ${target} moved since ${changeId} started; run cy refresh ${changeId} --target ${target} before landing`, changeId, repoRoot, [
      `- Current target commit: ${currentTargetCommitId}`,
      `- Recorded base commit: ${metadata.baseCommitId ?? "unknown"}`,
    ]));
  }
  if (descriptionErrors.length > 0) {
    throw new Error(withLandRecovery(formatJjDescriptionFailure(changeId, descriptionErrors), changeId, repoRoot, [
      `- Fix each invalid workspace commit with the jj describe command shown above.`,
    ]));
  }
  if (!finalDescription.valid) {
    throw new Error(withLandRecovery([
      `Final landing description for ${changeId} is incomplete.`,
      ...finalDescription.errors.map((error) => `- ${error}`),
    ].join("\n"), changeId, repoRoot, [
      `- Run cy describe final ${changeId} from ${repoRoot}.`,
    ]));
  }

  let nextMetadata: WorkspaceMetadata = {
    ...metadata,
    workspaceChangeId,
    workspaceCommitId: landing.workspaceCommitId,
  };
  const mergedDocument = mergedChangeDocument(parsed.body, parsed.frontmatter);
  writeChangeDocument(changePath, mergedDocument);
  if (metadata.engine === "jj" && changePath !== rootChangePath) {
    writeChangeDocument(rootChangePath, mergedDocument);
  }
  commandOutput("jj", ["workspace", "update-stale"], metadata.path);
  commandOutput("jj", ["status"], metadata.path);
  nextMetadata = {
    ...nextMetadata,
    workspaceCommitId: jjWorkspaceCommitId(metadata.path),
  };
  writeWorkspaceMetadata(repoRoot, changeId, nextMetadata);
  commandOutput("jj", ["bookmark", "set", target, "-r", nextMetadata.workspaceCommitId ?? workspaceChangeId], repoRoot);

  const cleanupMessage = options.keepWorkspace ? null : deleteWorkspace(changeId, { force: true }, repoRoot);
  const lines = [`Landed ${changeId} into ${target}`, `Workspace change: ${workspaceChangeId}`, `Description: ${description.split("\n")[0] ?? description}`];
  if (options.keepWorkspace) {
    lines.push(`Next: cy workspace delete ${changeId}`);
  } else if (cleanupMessage) {
    lines.push(cleanupMessage);
  }
  return lines.join("\n");
}
