import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ChangeyardConfig, WorkspaceMetadata } from "../types.js";
import { shellCommandRunner } from "./commandRunner.js";
import { jjLandingFiles } from "./jjLandingContext.js";
import { isDenied } from "./patterns.js";

export type WorkspaceChangeInspection = {
  workingFiles: string[];
  landingFiles: string[];
};

function uniqSorted(files: string[]): string[] {
  return [...new Set(files.map((file) => file.trim()).filter(Boolean))].sort();
}

function isLocalMarker(file: string): boolean {
  return file === ".changeyard-workspace.json" || file === ".changeyard-hydrate.json";
}

function workflowDocumentPath(metadata: WorkspaceMetadata): string {
  const workspacePath = metadata.workspaceChangePath ?? path.join(metadata.path, path.relative(metadata.repoRoot, metadata.changePath));
  return path.relative(metadata.path, workspacePath).split(path.sep).join("/");
}

function outputLines(output: string): string[] {
  return output.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function parseGitStatus(output: string): string[] {
  return uniqSorted(output.split(/\r?\n/u)
    .map((line) => {
      const pathOffset = line[2] === " " ? 3 : line[1] === " " ? 2 : 3;
      return line.slice(pathOffset).trim().replace(/.* -> /u, "");
    })
    .filter((file) => file && !isLocalMarker(file)));
}

function gitBaseCommit(metadata: WorkspaceMetadata, config: ChangeyardConfig): string {
  if (metadata.baseCommitId) return metadata.baseCommitId;
  const target = metadata.targetRef ?? config.project.defaultBase;
  return shellCommandRunner("git", ["merge-base", "HEAD", target], metadata.path);
}

function inspectGit(metadata: WorkspaceMetadata, config: ChangeyardConfig): WorkspaceChangeInspection {
  const workflowDocument = workflowDocumentPath(metadata);
  const workingFiles = parseGitStatus(shellCommandRunner("git", ["status", "--porcelain", "--untracked-files=all"], metadata.path))
    .filter((file) => file !== workflowDocument);
  const baseCommit = gitBaseCommit(metadata, config);
  const committedFiles = outputLines(shellCommandRunner("git", ["diff", "--name-only", baseCommit, "HEAD"], metadata.path));
  return {
    workingFiles,
    landingFiles: uniqSorted([...committedFiles, ...workingFiles].filter((file) => !isLocalMarker(file))),
  };
}

function inspectJj(metadata: WorkspaceMetadata): WorkspaceChangeInspection {
  const workspaceChangeId = metadata.workspaceChangeId
    ?? shellCommandRunner("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "change_id.short()"], metadata.path);
  const workingFiles = outputLines(shellCommandRunner("jj", ["diff", "--name-only", "-r", "@"], metadata.path))
    .filter((file) => !isLocalMarker(file) && file !== workflowDocumentPath(metadata));
  return {
    workingFiles: uniqSorted(workingFiles),
    landingFiles: uniqSorted(jjLandingFiles(metadata.path, metadata, workspaceChangeId).filter((file) => !isLocalMarker(file))),
  };
}

function comparableFiles(root: string, neverCopy: string[], prefix = ""): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const relative = prefix ? `${prefix}/${entry}` : entry;
    if (isLocalMarker(relative) || isDenied(relative, [".git", ".jj", ".changeyard", ...neverCopy])) continue;
    const fullPath = path.join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) files.push(...comparableFiles(fullPath, neverCopy, relative));
    else if (stats.isFile()) files.push(relative);
  }
  return files.sort();
}

function inspectPlainCopy(metadata: WorkspaceMetadata, config: ChangeyardConfig): WorkspaceChangeInspection {
  const neverCopy = config.workspace.hydrate.neverCopy;
  const rootFiles = new Set(comparableFiles(metadata.repoRoot, neverCopy));
  const workspaceFiles = new Set(comparableFiles(metadata.path, neverCopy));
  const changed: string[] = [];
  for (const file of new Set([...rootFiles, ...workspaceFiles])) {
    if (!rootFiles.has(file) || !workspaceFiles.has(file)) {
      changed.push(file);
      continue;
    }
    if (!readFileSync(path.join(metadata.repoRoot, file)).equals(readFileSync(path.join(metadata.path, file)))) {
      changed.push(file);
    }
  }
  const files = uniqSorted(changed);
  return { workingFiles: files, landingFiles: files };
}

export function inspectWorkspaceChanges(metadata: WorkspaceMetadata, config: ChangeyardConfig): WorkspaceChangeInspection {
  if (metadata.engine === "jj") return inspectJj(metadata);
  if (metadata.engine === "git-worktree") return inspectGit(metadata, config);
  if (metadata.engine === "plain-copy") return inspectPlainCopy(metadata, config);
  throw new Error(`Unsupported workspace engine for change inspection: ${metadata.engine}`);
}
