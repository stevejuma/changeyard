import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { changesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import { assertTransition } from "../state/transitions.js";
import type { Frontmatter } from "../types.js";
import { shellCommandRunner } from "../workspace/commandRunner.js";
import { deleteWorkspace, getWorkspaceStatus, readWorkspaceMetadataFromRoot } from "./workspace.js";

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

function changedFiles(repoRoot: string): string[] {
  const output = commandOutput("jj", ["diff", "--name-only"], repoRoot);
  return output.split("\n").map((line) => line.trim()).filter(Boolean).sort();
}

function assertRootCleanEnough(repoRoot: string, changePath: string, id: string, keepWorkspace: boolean | undefined): void {
  const allowed = path.relative(repoRoot, changePath);
  const workspacePrefix = `.changeyard/workspaces/${id}/`;
  const changed = changedFiles(repoRoot);
  const visibleWorkspaceFiles = changed.filter((file) => file.startsWith(workspacePrefix));
  if (keepWorkspace && visibleWorkspaceFiles.length > 0) {
    throw new Error(`Workspace metadata is visible to VCS: ${visibleWorkspaceFiles.join(", ")}. Rerun without --keep-workspace or ignore .changeyard/workspaces/.`);
  }
  const unrelated = changed.filter((file) => file !== allowed && !file.startsWith(workspacePrefix));
  if (unrelated.length > 0) {
    throw new Error(`Root workspace has unrelated changes: ${unrelated.join(", ")}. Commit, land, or move them before running cy land.`);
  }
}

function jjWorkspaceChangeId(workspacePath: string): string {
  commandOutput("jj", ["status"], workspacePath);
  return commandOutput("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", "@", "--no-graph", "-T", "change_id.short()"], workspacePath);
}

function jjWorkspaceChangedFiles(workspacePath: string): string[] {
  const output = commandOutput("jj", ["diff", "--name-only"], workspacePath);
  return output.split("\n").map((line) => line.trim()).filter(Boolean).sort();
}

function updateMergedChangeFile(changePath: string, body: string, frontmatter: Frontmatter): void {
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
  writeFileSync(changePath, writeFrontmatter(nextFrontmatter, body));
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

  const workspaceStatus = getWorkspaceStatus(id, repoRoot);
  if (workspaceStatus.conflicts) throw new Error(`Workspace ${id} has conflicts; resolve them before landing`);
  if (workspaceStatus.rootMismatch) throw new Error(`Workspace ${id} belongs to ${metadata.repoRoot}, not ${repoRoot}`);
  if (workspaceStatus.errors.length > 0) throw new Error(workspaceStatus.errors.join("\n"));

  assertRootCleanEnough(repoRoot, changePath, id, options.keepWorkspace);
  const workspaceChangeId = jjWorkspaceChangeId(metadata.path);
  const workspaceFiles = jjWorkspaceChangedFiles(metadata.path);
  const title = String(parsed.frontmatter.title ?? id);
  const commitMessage = `${id}: ${title}`;

  if (options.dryRun) {
    const lines = [
      `Dry-run: would land ${id} into ${target}`,
      `workspaceChange: ${workspaceChangeId}`,
      `workspaceFiles: ${workspaceFiles.length === 0 ? "none" : workspaceFiles.join(", ")}`,
      `commitMessage: ${commitMessage}`,
    ];
    if (!options.keepWorkspace) lines.push(`cleanup: would delete workspace ${id}`);
    return lines.join("\n");
  }

  if (workspaceFiles.length > 0) {
    commandOutput("jj", ["squash", "--from", workspaceChangeId, "--into", "@", "--use-destination-message"], repoRoot);
  }
  updateMergedChangeFile(changePath, parsed.body, parsed.frontmatter);
  const cleanupMessage = options.keepWorkspace ? null : deleteWorkspace(id, { force: true }, repoRoot);
  commandOutput("jj", ["commit", "-m", commitMessage], repoRoot);
  commandOutput("jj", ["bookmark", "set", target, "-r", "@-"], repoRoot);

  const lines = [`Landed ${id} into ${target}`, `Commit: ${commitMessage}`];
  if (options.keepWorkspace) {
    lines.push(`Next: cy workspace delete ${id}`);
  } else if (cleanupMessage) {
    lines.push(cleanupMessage);
  }
  return lines.join("\n");
}
