import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { validateFinalCommitDescription } from "../change/commitDescriptions.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { changesRoot, workspacesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import type { ChangeStatus, WorkspaceMetadata } from "../types.js";
import { shellCommandRunner, shellInspectionCommandRunner } from "../workspace/commandRunner.js";
import { validateJjLandingDescriptions } from "../workspace/jjLandingDescriptions.js";
import { getJjLandingContext } from "../workspace/jjLandingContext.js";
import { resolveWorkspaceChangePath } from "../workspace/marker.js";
import { deleteTaskWorkspace, verifyTaskWorkspace, type WorkspaceRepositoryKind } from "../workspace/runtimeBridge.js";
import { isDenied } from "../workspace/patterns.js";
import { remoteCheckGate } from "./pr.js";
import { readWorkspaceMetadataFromRoot } from "../workspace/metadata.js";

export { readWorkspaceMetadataFromRoot, workspaceMetadataPath } from "../workspace/metadata.js";

export type WorkspaceStatus = {
  id: string;
  status: string;
  rootStatus: string;
  workspaceStatus: string | null;
  path: string | null;
  engine: string | null;
  name: string | null;
  exists: boolean;
  dirty: boolean;
  conflicts: boolean;
  landed: boolean;
  rootMismatch: boolean;
  errors: string[];
  nextCommand: string | null;
  targetRef: string | null;
  baseCommitId: string | null;
  currentTargetCommitId: string | null;
  targetMoved: boolean;
  workspaceChangeId: string | null;
  workspaceCommitId: string | null;
  seedDescription: string | null;
  landingDescription: string | null;
  landingRevset: string | null;
  landingFiles: string[];
  landingDescriptionValid: boolean;
  landingDescriptionError: string | null;
  finalDescriptionValid: boolean;
  finalDescriptionSummary: string | null;
  finalDescriptionErrors: string[];
  remoteChecksSupported: boolean;
  remoteChecksState: string | null;
  remoteCheckBlockers: string[];
  landable: boolean;
  landBlockers: string[];
  cleanupNeeded: boolean;
  cleanupErrors: string[];
};

export type WorkspaceDeleteOptions = {
  dryRun?: boolean;
  force?: boolean;
};

function statusFromChangePath(changePath: string): ChangeStatus | string {
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  return String(parsed.frontmatter.status ?? "unknown");
}

function changeStatus(id: string, repoRoot: string): ChangeStatus | string {
  const config = loadConfig(repoRoot);
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!changePath) return "unknown";
  return statusFromChangePath(changePath);
}

function workspaceChangeStatus(metadata: WorkspaceMetadata): string | null {
  if (metadata.engine !== "jj") return null;
  const changePath = resolveWorkspaceChangePath(metadata);
  if (!existsSync(changePath)) return null;
  return String(statusFromChangePath(changePath));
}

function commandOutput(command: string, args: string[], cwd: string): string {
  try {
    return shellCommandRunner(command, args, cwd);
  } catch {
    return "";
  }
}

function inspectionCommandResult(command: string, args: string[], cwd: string): { ok: true; output: string } | { ok: false; error: string } {
  try {
    return { ok: true, output: shellInspectionCommandRunner(command, args, cwd) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function validateLandingDescription(id: string, description: string | null | undefined, seedDescription: string | null | undefined): string | null {
  const trimmed = (description ?? "").trim();
  if (!trimmed || trimmed === "(no description set)") {
    return `Describe the task commit before landing: jj describe -m "${id}: <summary of landed work>"`;
  }
  if (!trimmed.includes(id)) {
    return `Landing description must include ${id}: jj describe -m "${id}: <summary of landed work>"`;
  }
  return null;
}

function jjLogValue(cwd: string, revision: string, template: string): string | null {
  const output = commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", revision, "--no-graph", "-T", template], cwd);
  return output.trim() || null;
}

function jjCurrentTargetCommit(repoRoot: string, targetRef: string | undefined): string | null {
  if (!targetRef) return null;
  return jjLogValue(repoRoot, targetRef, "commit_id");
}

function jjLandingDescriptionErrors(changeId: string, metadata: WorkspaceMetadata, workspaceChangeId: string | null): string[] {
  if (metadata.engine !== "jj" || !workspaceChangeId) return [];
  try {
    return validateJjLandingDescriptions(changeId, metadata, workspaceChangeId).errors;
  } catch (error) {
    return [`Could not inspect JJ landing descriptions: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function repositoryKind(engine: string): WorkspaceRepositoryKind | null {
  if (engine === "jj") return "jj";
  if (engine === "git-worktree") return "git";
  return null;
}

function listComparableFiles(root: string, neverCopy: string[], prefix = ""): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const relative = prefix ? `${prefix}/${entry}` : entry;
    if (entry === ".changeyard-workspace.json" || entry === ".changeyard-hydrate.json" || isDenied(relative, [".git", ".jj", ".changeyard", ...neverCopy])) continue;
    const fullPath = path.join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) files.push(...listComparableFiles(fullPath, neverCopy, relative));
    else if (stats.isFile()) files.push(relative);
  }
  return files.sort();
}

function plainCopyDirty(repoRoot: string, workspacePath: string, neverCopy: string[]): boolean {
  const repoFiles = listComparableFiles(repoRoot, neverCopy);
  const workspaceFiles = listComparableFiles(workspacePath, neverCopy);
  if (repoFiles.join("\n") !== workspaceFiles.join("\n")) return true;
  for (const file of workspaceFiles) {
    const repoContent = existsSync(path.join(repoRoot, file)) ? readFileSync(path.join(repoRoot, file), "utf8") : "";
    const workspaceContent = existsSync(path.join(workspacePath, file)) ? readFileSync(path.join(workspacePath, file), "utf8") : "";
    if (repoContent !== workspaceContent) return true;
  }
  return false;
}

function inspectDirtyState(metadata: WorkspaceMetadata, neverCopy: string[]): { dirty: boolean; conflicts: boolean; errors: string[] } {
  if (!existsSync(metadata.path)) return { dirty: false, conflicts: false, errors: [`Workspace path does not exist: ${metadata.path}`] };
  if (metadata.engine === "jj") {
    const statusResult = inspectionCommandResult("jj", ["status"], metadata.path);
    if (!statusResult.ok) {
      return { dirty: false, conflicts: false, errors: [`Could not inspect jj workspace status: ${statusResult.error}`] };
    }
    const conflictsResult = inspectionCommandResult("jj", ["resolve", "--list"], metadata.path);
    const noConflicts = !conflictsResult.ok && conflictsResult.error.includes("No conflicts found");
    if (!conflictsResult.ok && !noConflicts) {
      return { dirty: false, conflicts: false, errors: [`Could not inspect jj workspace conflicts: ${conflictsResult.error}`] };
    }
    const status = statusResult.output;
    return {
      dirty: !status.includes("The working copy has no changes."),
      conflicts: conflictsResult.ok && conflictsResult.output.trim().length > 0,
      errors: [],
    };
  }
  if (metadata.engine === "git-worktree") {
    const status = commandOutput("git", ["status", "--porcelain"], metadata.path);
    return {
      dirty: status.trim().length > 0,
      conflicts: /^UU\s/m.test(status) || /^AA\s/m.test(status) || /^DD\s/m.test(status),
      errors: [],
    };
  }
  return {
    dirty: plainCopyDirty(metadata.repoRoot, metadata.path, neverCopy),
    conflicts: false,
    errors: [],
  };
}

export function getWorkspaceStatus(id: string, repoRoot = process.cwd()): WorkspaceStatus {
  if (!id) throw new Error("change id is required");
  const config = loadConfig(repoRoot);
  const rootChangePath = findChangeFile(changesRoot(repoRoot, config), id);
  const rootChangeId = rootChangePath ? String(parseFrontmatter(readFileSync(rootChangePath, "utf8")).frontmatter.id ?? id) : id;
  const metadata = readWorkspaceMetadataFromRoot(rootChangeId, repoRoot) ?? readWorkspaceMetadataFromRoot(id, repoRoot);
  const changeId = metadata?.changeId ?? rootChangeId;
  const rootStatus = String(changeStatus(changeId, repoRoot));
  const activeWorkspaceStatus = metadata ? workspaceChangeStatus(metadata) : null;
  const status = activeWorkspaceStatus ?? rootStatus;
  if (!metadata) {
    return {
      id: changeId,
      status,
      rootStatus,
      workspaceStatus: null,
      path: null,
      engine: null,
      name: null,
      exists: false,
      dirty: false,
      conflicts: false,
      landed: status === "merged",
      rootMismatch: false,
      errors: [`Workspace metadata not found for ${changeId}`],
      nextCommand: status === "merged" ? null : `cy start ${changeId}`,
      targetRef: null,
      baseCommitId: null,
      currentTargetCommitId: null,
      targetMoved: false,
      workspaceChangeId: null,
      workspaceCommitId: null,
      seedDescription: null,
      landingDescription: null,
      landingRevset: null,
      landingFiles: [],
      landingDescriptionValid: false,
      landingDescriptionError: null,
      finalDescriptionValid: false,
      finalDescriptionSummary: null,
      finalDescriptionErrors: [],
      remoteChecksSupported: false,
      remoteChecksState: null,
      remoteCheckBlockers: [],
      landable: false,
      landBlockers: status === "merged" ? [] : [`Workspace metadata not found for ${changeId}`],
      cleanupNeeded: false,
      cleanupErrors: [],
    };
  }

  const errors: string[] = [];
  const kind = repositoryKind(metadata.engine);
  if (kind) {
    const verification = verifyTaskWorkspace({ repositoryKind: kind, workspacePath: metadata.path, workspaceName: metadata.name });
    if (!verification.ok) errors.push(...verification.errors);
  } else if (!existsSync(metadata.path)) {
    errors.push(`Workspace path does not exist: ${metadata.path}`);
  }
  const dirtyState = inspectDirtyState(metadata, config.workspace.hydrate.neverCopy);
  errors.push(...dirtyState.errors);
  const rootMismatch = path.resolve(metadata.repoRoot) !== path.resolve(repoRoot);
  if (rootMismatch) errors.push(`Workspace repo root mismatch: expected ${repoRoot}, got ${metadata.repoRoot}`);
  const landed = status === "merged" && !dirtyState.dirty;
  const workspaceChangeId = metadata.workspaceChangeId ?? (metadata.engine === "jj" ? jjLogValue(metadata.path, "@", "change_id.short()") : null);
  const workspaceCommitId = metadata.workspaceCommitId ?? (metadata.engine === "jj" ? jjLogValue(metadata.path, "@", "commit_id") : null);
  let landingDescription = metadata.engine === "jj" && workspaceChangeId ? jjLogValue(metadata.path, workspaceChangeId, "description") : null;
  let landingRevset: string | null = null;
  let landingFiles: string[] = [];
  let currentWorkspaceChangeId: string | null = null;
  let finalDescriptionValid = metadata.engine !== "jj";
  let finalDescriptionSummary: string | null = null;
  let finalDescriptionErrors: string[] = [];
  let landingDescriptionErrors = metadata.engine === "jj"
    ? jjLandingDescriptionErrors(changeId, metadata, workspaceChangeId)
    : [];
  if (metadata.engine === "jj") {
    try {
      const target = metadata.targetRef ?? config.project.defaultBase;
      const context = getJjLandingContext(changeId, metadata, target, repoRoot);
      currentWorkspaceChangeId = context.currentWorkspaceChangeId;
      landingDescription = context.description;
      landingRevset = context.landingRevset;
      landingFiles = context.landingFiles;
      landingDescriptionErrors = context.descriptionValidation.errors;
      const changePath = resolveWorkspaceChangePath(metadata);
      const body = existsSync(changePath) ? parseFrontmatter(readFileSync(changePath, "utf8")).body : "";
      const finalValidation = validateFinalCommitDescription(changeId, context.description, body);
      finalDescriptionValid = finalValidation.valid;
      finalDescriptionSummary = finalValidation.summary;
      finalDescriptionErrors = finalValidation.errors;
    } catch (error) {
      errors.push(`Could not inspect JJ landing context: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const landingDescriptionError = landingDescriptionErrors.length > 0
    ? `JJ workspace commit descriptions must start with ${changeId}: ${landingDescriptionErrors.join("; ")}`
    : null;
  const currentTargetCommitId = metadata.engine === "jj" ? jjCurrentTargetCommit(repoRoot, metadata.targetRef) : null;
  const targetMoved = Boolean(metadata.baseCommitId && currentTargetCommitId && metadata.baseCommitId !== currentTargetCommitId);
  let remoteChecksSupported = false;
  let remoteChecksState: string | null = null;
  let remoteCheckBlockers: string[] = [];
  if (rootChangePath && ["ready_for_pr", "pr_open", "in_review", "changes_requested", "approved"].includes(status)) {
    const rootParsed = parseFrontmatter(readFileSync(rootChangePath, "utf8"));
    const gate = remoteCheckGate(changeId, repoRoot, rootParsed.frontmatter);
    remoteChecksSupported = gate.supported;
    remoteChecksState = gate.overallState;
    remoteCheckBlockers = gate.blockers;
  }
  const activeLandBlockers = [
    ...errors,
    ...(dirtyState.conflicts ? [`Workspace ${changeId} has conflicts`] : []),
    ...(metadata.engine === "jj" && !workspaceChangeId ? [`Workspace ${changeId} is missing workspaceChangeId metadata; recreate the workspace with cy start ${changeId}`] : []),
    ...(metadata.engine === "jj" && workspaceChangeId && currentWorkspaceChangeId && currentWorkspaceChangeId !== workspaceChangeId ? [`Workspace ${changeId} is editing ${currentWorkspaceChangeId}, expected ${workspaceChangeId}`] : []),
    ...landingDescriptionErrors,
    ...(status === "ready_for_pr" ? finalDescriptionErrors : []),
    ...(["ready_for_pr", "approved"].includes(status) ? remoteCheckBlockers : []),
  ];
  const cleanupNeeded = status === "merged" && Boolean(metadata);
  const cleanupErrors = cleanupNeeded ? errors : [];
  const landBlockers = status === "merged" ? [] : activeLandBlockers;

  return {
    id: changeId,
    status,
    rootStatus,
    workspaceStatus: activeWorkspaceStatus,
    path: metadata.path,
    engine: metadata.engine,
    name: metadata.name,
    exists: existsSync(metadata.path),
    dirty: dirtyState.dirty,
    conflicts: dirtyState.conflicts,
    landed,
    rootMismatch,
    errors,
    nextCommand: landed ? `cy workspace delete ${changeId}` : status === "ready_for_pr" ? `cy land ${changeId}` : status === "in_progress" ? `cd ${path.relative(repoRoot, metadata.path) || metadata.path} && cy verify ${changeId}` : null,
    targetRef: metadata.targetRef ?? null,
    baseCommitId: metadata.baseCommitId ?? null,
    currentTargetCommitId,
    targetMoved,
    workspaceChangeId,
    workspaceCommitId,
    seedDescription: metadata.seedDescription ?? null,
    landingDescription,
    landingRevset,
    landingFiles,
    landingDescriptionValid: !landingDescriptionError,
    landingDescriptionError,
    finalDescriptionValid,
    finalDescriptionSummary,
    finalDescriptionErrors,
    remoteChecksSupported,
    remoteChecksState,
    remoteCheckBlockers,
    landable: status === "ready_for_pr" && landBlockers.length === 0,
    landBlockers,
    cleanupNeeded,
    cleanupErrors,
  };
}

export function listWorkspaceStatuses(repoRoot = process.cwd()): WorkspaceStatus[] {
  const config = loadConfig(repoRoot);
  const root = workspacesRoot(repoRoot, config);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => existsSync(path.join(root, entry, "metadata.json")))
    .sort()
    .map((entry) => getWorkspaceStatus(entry, repoRoot));
}

function formatWorkspaceStatus(status: WorkspaceStatus): string {
  const lines = [
    `id: ${status.id}`,
    `status: ${status.status}`,
    `rootStatus: ${status.rootStatus}`,
    ...(status.workspaceStatus && status.workspaceStatus !== status.rootStatus ? [`workspaceStatus: ${status.workspaceStatus}`] : []),
    `workspacePath: ${status.path ?? "missing"}`,
    `engine: ${status.engine ?? "unknown"}`,
    `dirty: ${String(status.dirty)}`,
    `conflicts: ${String(status.conflicts)}`,
    `landed: ${String(status.landed)}`,
    `rootMismatch: ${String(status.rootMismatch)}`,
    `targetRef: ${status.targetRef ?? "unknown"}`,
    `targetMoved: ${String(status.targetMoved)}`,
    `workspaceChange: ${status.workspaceChangeId ?? "unknown"}`,
    `landingRevset: ${status.landingRevset ?? "unknown"}`,
    `landingFiles: ${status.landingFiles.length === 0 ? "none" : status.landingFiles.join(", ")}`,
    `landingDescription: ${status.landingDescriptionValid ? "ok" : status.landingDescriptionError ?? "unknown"}`,
    `finalDescriptionValid: ${String(status.finalDescriptionValid)}`,
    ...(status.finalDescriptionSummary ? [`finalDescriptionSummary: ${status.finalDescriptionSummary}`] : []),
    `remoteChecksSupported: ${String(status.remoteChecksSupported)}`,
    `remoteChecksState: ${status.remoteChecksState ?? "unknown"}`,
    `landable: ${String(status.landable)}`,
    `cleanupNeeded: ${String(status.cleanupNeeded)}`,
  ];
  if (status.landBlockers.length > 0) lines.push(`landBlockers: ${status.landBlockers.join("; ")}`);
  if (status.remoteCheckBlockers.length > 0) lines.push(`remoteCheckBlockers: ${status.remoteCheckBlockers.join("; ")}`);
  if (status.finalDescriptionErrors.length > 0) lines.push(`finalDescriptionErrors: ${status.finalDescriptionErrors.join("; ")}`);
  if (status.cleanupErrors.length > 0) lines.push(`cleanupErrors: ${status.cleanupErrors.join("; ")}`);
  if (status.errors.length > 0) lines.push(`errors: ${status.errors.join("; ")}`);
  if (status.nextCommand) lines.push(`Next: ${status.nextCommand}`);
  return lines.join("\n");
}

export function runWorkspaceStatus(id: string, repoRoot = process.cwd()): string {
  return formatWorkspaceStatus(getWorkspaceStatus(id, repoRoot));
}

export function runWorkspaceList(repoRoot = process.cwd()): string {
  const statuses = listWorkspaceStatuses(repoRoot);
  if (statuses.length === 0) return "No Changeyard workspaces found";
  return statuses
    .map((status) => `${status.id}\t${status.status}\t${status.engine ?? "unknown"}\t${status.dirty ? "dirty" : "clean"}\t${status.path ?? "missing"}`)
    .join("\n");
}

export function deleteWorkspace(id: string, options: WorkspaceDeleteOptions = {}, repoRoot = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const metadata = readWorkspaceMetadataFromRoot(id, repoRoot);
  const changeId = metadata?.changeId ?? id;
  if (!metadata) return `Workspace metadata not found for ${id}`;
  const status = getWorkspaceStatus(changeId, repoRoot);
  if ((status.dirty || status.conflicts) && status.status !== "merged" && !options.force) {
    throw new Error(`Workspace ${changeId} has dirty unlanded work; run cy land ${changeId}, or rerun with --force to delete it`);
  }

  const workspaceRoot = path.dirname(metadata.path);
  if (options.dryRun) return `Dry-run: would delete workspace ${changeId} at ${workspaceRoot}`;

  const kind = repositoryKind(metadata.engine);
  if (kind) {
    const result = deleteTaskWorkspace({ repositoryKind: kind, repoRoot, workspacePath: metadata.path, workspaceName: metadata.name });
    if (!result.ok) throw new Error(result.error ?? `Failed to delete workspace ${changeId}`);
  }
  rmSync(workspaceRoot, { recursive: true, force: true });
  return `Deleted workspace ${changeId}`;
}
