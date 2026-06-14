import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { changesRoot, workspacesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import type { ChangeStatus, WorkspaceMetadata } from "../types.js";
import { shellCommandRunner } from "../workspace/commandRunner.js";
import { deleteTaskWorkspace, verifyTaskWorkspace, type WorkspaceRepositoryKind } from "../workspace/runtimeBridge.js";
import { isDenied } from "../workspace/patterns.js";

export type WorkspaceStatus = {
  id: string;
  status: string;
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
};

export type WorkspaceDeleteOptions = {
  dryRun?: boolean;
  force?: boolean;
};

function asWorkspaceMetadata(value: unknown): WorkspaceMetadata {
  const record = typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const required = ["changeId", "engine", "name", "path", "repoRoot", "changePath", "createdAt"];
  for (const key of required) {
    if (typeof record[key] !== "string" || record[key] === "") {
      throw new Error(`Workspace metadata is missing ${key}`);
    }
  }
  return record as WorkspaceMetadata;
}

export function workspaceMetadataPath(id: string, repoRoot: string): string {
  const config = loadConfig(repoRoot);
  return path.join(workspacesRoot(repoRoot, config), id, "metadata.json");
}

export function readWorkspaceMetadataFromRoot(id: string, repoRoot: string): WorkspaceMetadata | null {
  const metadataPath = workspaceMetadataPath(id, repoRoot);
  if (!existsSync(metadataPath)) return null;
  return asWorkspaceMetadata(JSON.parse(readFileSync(metadataPath, "utf8")));
}

function changeStatus(id: string, repoRoot: string): ChangeStatus | string {
  const config = loadConfig(repoRoot);
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!changePath) return "unknown";
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  return String(parsed.frontmatter.status ?? "unknown");
}

function commandOutput(command: string, args: string[], cwd: string): string {
  try {
    return shellCommandRunner(command, args, cwd);
  } catch {
    return "";
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
    const status = commandOutput("jj", ["status"], metadata.path);
    return {
      dirty: !status.includes("The working copy has no changes."),
      conflicts: /conflict/i.test(status),
      errors: status ? [] : ["Could not inspect jj workspace status"],
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
  const metadata = readWorkspaceMetadataFromRoot(id, repoRoot);
  const status = changeStatus(id, repoRoot);
  if (!metadata) {
    return {
      id,
      status,
      path: null,
      engine: null,
      name: null,
      exists: false,
      dirty: false,
      conflicts: false,
      landed: status === "merged",
      rootMismatch: false,
      errors: [`Workspace metadata not found for ${id}`],
      nextCommand: status === "merged" ? null : `cy start ${id}`,
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

  return {
    id,
    status,
    path: metadata.path,
    engine: metadata.engine,
    name: metadata.name,
    exists: existsSync(metadata.path),
    dirty: dirtyState.dirty,
    conflicts: dirtyState.conflicts,
    landed,
    rootMismatch,
    errors,
    nextCommand: landed ? `cy workspace delete ${id}` : status === "ready_for_pr" ? `cy land ${id}` : status === "in_progress" ? `cd ${path.relative(repoRoot, metadata.path) || metadata.path} && cy verify ${id}` : null,
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
    `workspacePath: ${status.path ?? "missing"}`,
    `engine: ${status.engine ?? "unknown"}`,
    `dirty: ${String(status.dirty)}`,
    `conflicts: ${String(status.conflicts)}`,
    `landed: ${String(status.landed)}`,
    `rootMismatch: ${String(status.rootMismatch)}`,
  ];
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
  if (!metadata) return `Workspace metadata not found for ${id}`;
  const status = getWorkspaceStatus(id, repoRoot);
  if ((status.dirty || status.conflicts) && status.status !== "merged" && !options.force) {
    throw new Error(`Workspace ${id} has dirty unlanded work; run cy land ${id}, or rerun with --force to delete it`);
  }

  const workspaceRoot = path.dirname(metadata.path);
  if (options.dryRun) return `Dry-run: would delete workspace ${id} at ${workspaceRoot}`;

  const kind = repositoryKind(metadata.engine);
  if (kind) {
    const result = deleteTaskWorkspace({ repositoryKind: kind, repoRoot, workspacePath: metadata.path, workspaceName: metadata.name });
    if (!result.ok) throw new Error(result.error ?? `Failed to delete workspace ${id}`);
  }
  rmSync(workspaceRoot, { recursive: true, force: true });
  return `Deleted workspace ${id}`;
}
