import { existsSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeVcsCommandArgs, vcsNoColorEnv } from "../vcs/argv.js";
import { jjInspectionArgs } from "./commandRunner.js";

export type WorkspaceRepositoryKind = "git" | "jj";
export type DetectedWorkspaceEngineName = "git-worktree" | "jj";

export interface TaskWorkspaceCreateResult {
  ok: boolean;
  headCommit: string | null;
  error?: string;
}

export interface TaskWorkspaceDeleteResult {
  ok: boolean;
  error?: string;
}

export interface TaskWorkspaceHeadInfo {
  branch: string | null;
  jjChangeId: string | null;
  headCommit: string | null;
  isDetached: boolean;
}

export interface TaskWorkspaceVerifyResult {
  ok: boolean;
  errors: string[];
}

export interface TaskWorkspacePublishResult {
  ok: boolean;
  branch: string;
  remote: string | null;
  error?: string;
}

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function commandSucceeded(
  command: string,
  args: string[],
  cwd: string,
): boolean {
  const normalizedArgs = normalizeVcsCommandArgs(command, args);
  const result = spawnSync(command, normalizedArgs, {
    cwd,
    encoding: "utf8",
    env: vcsNoColorEnv(),
  });
  return result.status === 0;
}

function inspectionArgs(command: string, args: string[]): string[] {
  return command === "jj" ? jjInspectionArgs(args) : args;
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
): CommandResult {
  const normalizedArgs = normalizeVcsCommandArgs(command, args);
  const result = spawnSync(command, normalizedArgs, {
    cwd,
    encoding: "utf8",
    env: vcsNoColorEnv(),
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout ?? "").trim(),
    stderr: String(result.stderr ?? "").trim(),
  };
}

function runInspectionCommand(
  command: string,
  args: string[],
  cwd: string,
): CommandResult {
  return runCommand(command, inspectionArgs(command, args), cwd);
}

function parseJjBookmarkName(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  const match = /^([^\s:][^:]*)\s*:/.exec(trimmed);
  return match?.[1]?.trim() || null;
}

function resolveExistingRealPath(targetPath: string): string {
  return existsSync(targetPath) ? realpathSync(targetPath) : path.resolve(targetPath);
}

export function detectWorkspaceRepositoryKind(targetPath: string): WorkspaceRepositoryKind | null {
  if (runInspectionCommand("jj", ["workspace", "root"], targetPath).ok) {
    return "jj";
  }

  if (commandSucceeded("git", ["rev-parse", "--is-inside-work-tree"], targetPath)) {
    return "git";
  }

  return null;
}

export function hasWorkspaceRepository(targetPath: string): boolean {
  return detectWorkspaceRepositoryKind(targetPath) !== null;
}

export function resolveWorkspaceEngineNameFromRepositoryKind(
  repositoryKind: WorkspaceRepositoryKind,
): DetectedWorkspaceEngineName {
  return repositoryKind === "jj" ? "jj" : "git-worktree";
}

export function detectWorkspaceEngineName(targetPath: string): DetectedWorkspaceEngineName | null {
  const repositoryKind = detectWorkspaceRepositoryKind(targetPath);
  return repositoryKind ? resolveWorkspaceEngineNameFromRepositoryKind(repositoryKind) : null;
}

export function createTaskWorkspace(options: {
  repositoryKind: WorkspaceRepositoryKind;
  repoRoot: string;
  workspacePath: string;
  revision: string;
  workspaceName?: string;
}): TaskWorkspaceCreateResult {
  mkdirSync(path.dirname(options.workspacePath), { recursive: true });

  if (options.repositoryKind === "jj") {
    if (!options.workspaceName) {
      return {
        ok: false,
        headCommit: null,
        error: "JJ task workspace creation requires a workspace name.",
      };
    }
    const addResult = runCommand(
      "jj",
      ["workspace", "add", "--name", options.workspaceName, "-r", options.revision, options.workspacePath],
      options.repoRoot,
    );
    if (!addResult.ok) {
      return {
        ok: false,
        headCommit: null,
        error: addResult.stderr || addResult.stdout || "Failed to create jj task workspace.",
      };
    }
    const headInfo = readTaskWorkspaceHead({
      repositoryKind: "jj",
      cwd: options.workspacePath,
    });
    return {
      ok: true,
      headCommit: headInfo.headCommit,
    };
  }

  const addResult = runCommand(
    "git",
    ["worktree", "add", "--detach", options.workspacePath, options.revision],
    options.repoRoot,
  );
  if (!addResult.ok) {
    return {
      ok: false,
      headCommit: null,
      error: addResult.stderr || addResult.stdout || "Failed to create git task workspace.",
    };
  }
  const headInfo = readTaskWorkspaceHead({
    repositoryKind: "git",
    cwd: options.workspacePath,
  });
  return {
    ok: true,
    headCommit: headInfo.headCommit,
  };
}

export function deleteTaskWorkspace(options: {
  repositoryKind: WorkspaceRepositoryKind;
  repoRoot: string;
  workspacePath: string;
  workspaceName?: string;
}): TaskWorkspaceDeleteResult {
  if (options.repositoryKind === "jj") {
    if (!options.workspaceName) {
      return {
        ok: true,
      };
    }
    const forgetResult = runCommand("jj", ["workspace", "forget", options.workspaceName], options.repoRoot);
    return forgetResult.ok
      ? { ok: true }
      : {
          ok: true,
          error: forgetResult.stderr || forgetResult.stdout || "Failed to forget jj task workspace.",
        };
  }

  const removeResult = runCommand("git", ["worktree", "remove", "--force", options.workspacePath], options.repoRoot);
  if (removeResult.ok) {
    return { ok: true };
  }
  const pruneResult = runCommand("git", ["worktree", "prune"], options.repoRoot);
  if (pruneResult.ok) {
    return {
      ok: true,
      error: removeResult.stderr || removeResult.stdout || undefined,
    };
  }
  return {
    ok: false,
    error:
      pruneResult.stderr ||
      pruneResult.stdout ||
      removeResult.stderr ||
      removeResult.stdout ||
      "Failed to remove git task workspace.",
  };
}

export function readTaskWorkspaceHead(options: {
  repositoryKind: WorkspaceRepositoryKind;
  cwd: string;
}): TaskWorkspaceHeadInfo {
  if (options.repositoryKind === "jj") {
    const headResult = runCommand("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "commit_id"], options.cwd);
    const changeIdResult = runCommand("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "change_id.short()"], options.cwd);
    const bookmarkResult = runCommand("jj", ["bookmark", "list", "--ignore-working-copy", "--at-op=@", "-r", "@"], options.cwd);
    let branch: string | null = null;
    if (bookmarkResult.ok) {
      for (const line of bookmarkResult.stdout.split("\n")) {
        const parsed = parseJjBookmarkName(line);
        if (parsed) {
          branch = parsed;
          break;
        }
      }
    }
    return {
      branch,
      jjChangeId: changeIdResult.ok ? changeIdResult.stdout : null,
      headCommit: headResult.ok ? headResult.stdout : null,
      isDetached: false,
    };
  }

  const headResult = runCommand("git", ["rev-parse", "--verify", "HEAD"], options.cwd);
  const branchResult = runCommand("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], options.cwd);
  return {
    branch: branchResult.ok ? branchResult.stdout : null,
    jjChangeId: null,
    headCommit: headResult.ok ? headResult.stdout : null,
    isDetached: headResult.ok && !branchResult.ok,
  };
}

export function verifyTaskWorkspace(options: {
  repositoryKind: WorkspaceRepositoryKind;
  workspacePath: string;
  workspaceName?: string;
}): TaskWorkspaceVerifyResult {
  const expectedPath = path.resolve(options.workspacePath);
  const errors: string[] = [];

  if (!existsSync(expectedPath)) {
    errors.push(`Workspace path does not exist: ${expectedPath}`);
    return {
      ok: false,
      errors,
    };
  }

  if (options.repositoryKind === "jj") {
    const rootResult = runInspectionCommand("jj", ["workspace", "root"], expectedPath);
    if (!rootResult.ok || !rootResult.stdout) {
      errors.push(rootResult.stderr || rootResult.stdout || "Could not resolve jj workspace root.");
    } else if (resolveExistingRealPath(rootResult.stdout) !== resolveExistingRealPath(expectedPath)) {
      errors.push(`jj workspace root mismatch: expected ${expectedPath}, got ${rootResult.stdout}`);
    }

    if (options.workspaceName) {
      const listResult = runInspectionCommand("jj", ["workspace", "list"], expectedPath);
      if (!listResult.ok) {
        errors.push(listResult.stderr || listResult.stdout || "Could not inspect jj workspace list.");
      } else if (!listResult.stdout.includes(options.workspaceName)) {
        errors.push(`jj workspace list does not include ${options.workspaceName}`);
      }
    }

    const statusResult = runInspectionCommand("jj", ["status"], expectedPath);
    if (!statusResult.ok) {
      errors.push(statusResult.stderr || statusResult.stdout || "Could not inspect jj workspace status.");
    }
    const conflictsResult = runInspectionCommand("jj", ["resolve", "--list"], expectedPath);
    const conflictOutput = conflictsResult.stderr || conflictsResult.stdout;
    const noConflicts = !conflictsResult.ok && conflictOutput.includes("No conflicts found");
    if (!conflictsResult.ok && !noConflicts) {
      errors.push(conflictsResult.stderr || conflictsResult.stdout || "Could not inspect jj workspace conflicts.");
    } else if (conflictsResult.ok && conflictsResult.stdout.trim()) {
      errors.push("jj workspace reports conflicts");
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  }

  const rootResult = runCommand("git", ["rev-parse", "--show-toplevel"], expectedPath);
  if (!rootResult.ok || !rootResult.stdout) {
    errors.push(rootResult.stderr || rootResult.stdout || "Could not resolve git workspace root.");
  } else if (resolveExistingRealPath(rootResult.stdout) !== resolveExistingRealPath(expectedPath)) {
    errors.push(`Git root mismatch: expected ${expectedPath}, got ${rootResult.stdout}`);
  }

  const statusResult = runCommand("git", ["status", "--porcelain"], expectedPath);
  if (!statusResult.ok) {
    errors.push(statusResult.stderr || statusResult.stdout || "Could not inspect git workspace status.");
  } else if (statusResult.stdout.includes("UU ")) {
    errors.push("Git workspace has unresolved conflicts");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function publishTaskWorkspace(options: {
  repositoryKind: WorkspaceRepositoryKind;
  cwd: string;
  branch: string;
}): TaskWorkspacePublishResult {
  const branch = options.branch.trim();
  if (!branch) {
    return {
      ok: false,
      branch: "",
      remote: null,
      error: "Publish requires a branch or bookmark name.",
    };
  }

  if (options.repositoryKind === "jj") {
    const bookmarkResult = runCommand("jj", ["bookmark", "set", branch, "-r", "@"], options.cwd);
    if (!bookmarkResult.ok) {
      return {
        ok: false,
        branch,
        remote: null,
        error: bookmarkResult.stderr || bookmarkResult.stdout || "Failed to set jj bookmark before publish.",
      };
    }
    const pushResult = runCommand("jj", ["git", "push", "--bookmark", branch], options.cwd);
    return pushResult.ok
      ? {
          ok: true,
          branch,
          remote: "origin",
        }
      : {
          ok: false,
          branch,
          remote: null,
          error: pushResult.stderr || pushResult.stdout || "Failed to publish jj workspace.",
        };
  }

  const pushResult = runCommand("git", ["push", "-u", "origin", branch], options.cwd);
  return pushResult.ok
    ? {
        ok: true,
        branch,
        remote: "origin",
      }
    : {
        ok: false,
        branch,
        remote: null,
        error: pushResult.stderr || pushResult.stdout || "Failed to publish git workspace.",
      };
}
