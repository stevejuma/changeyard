import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { workspacesRoot } from "../paths.js";
import { findRootChangePathForMetadata, materializeWorkspaceChangeDocument } from "../state/activeChangeDocument.js";
import { findWorkspaceId } from "../state/id.js";
import type { ChangeStatus, WorkspaceMetadata } from "../types.js";
import { findWorkspaceMarker } from "../workspace/marker.js";
import { shellCommandRunner, shellInspectionCommandRunner } from "../workspace/commandRunner.js";

type MutationOptions = {
  dryRun?: boolean;
  workspace?: boolean;
};

const changeStatuses = new Set<ChangeStatus>([
  "draft",
  "ready",
  "synced",
  "in_progress",
  "blocked",
  "ready_for_pr",
  "pr_open",
  "in_review",
  "changes_requested",
  "approved",
  "merged",
  "abandoned",
]);

function recoverStatusForRootStatus(status: string): ChangeStatus {
  if (status === "ready" || status === "synced") return "in_progress";
  return changeStatuses.has(status as ChangeStatus) ? status as ChangeStatus : "in_progress";
}

function commandResult(command: string, args: string[], cwd: string): { ok: true; output: string } | { ok: false; error: string } {
  try {
    return { ok: true, output: shellCommandRunner(command, args, cwd).trim() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function inspectionResult(command: string, args: string[], cwd: string): { ok: true; output: string } | { ok: false; error: string } {
  try {
    return { ok: true, output: shellInspectionCommandRunner(command, args, cwd).trim() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function jjValue(workspacePath: string, revision: string, template: string): string | null {
  const result = inspectionResult("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", revision, "--no-graph", "-T", template], workspacePath);
  return result.ok && result.output ? result.output : null;
}

function normalizeJjWorkspace(metadata: WorkspaceMetadata, mutationOptions: MutationOptions, fixes: string[]): WorkspaceMetadata {
  if (metadata.engine !== "jj") return metadata;
  const currentChangeId = jjValue(metadata.path, "@", "change_id.short()");
  if (!currentChangeId) return metadata;
  let nextMetadata = metadata;
  const recordedChangeId = metadata.workspaceChangeId ?? currentChangeId;
  if (!metadata.workspaceChangeId) {
    fixes.push(`backfilled workspaceChangeId ${recordedChangeId}`);
    nextMetadata = { ...nextMetadata, workspaceChangeId: recordedChangeId };
  }

  if (currentChangeId !== recordedChangeId) {
    const parentChangeId = jjValue(metadata.path, "@-", "change_id.short()");
    const currentDiff = inspectionResult("jj", ["diff", "--name-only"], metadata.path);
    const emptyCurrent = currentDiff.ok && currentDiff.output.trim().length === 0;
    if (parentChangeId === recordedChangeId && emptyCurrent) {
      fixes.push(`abandoned empty child ${currentChangeId} and edited ${recordedChangeId}`);
      if (!mutationOptions.dryRun) {
        const abandon = commandResult("jj", ["abandon", "@"], metadata.path);
        if (!abandon.ok) throw new Error(`Could not abandon empty JJ child ${currentChangeId}: ${abandon.error}`);
        const edit = commandResult("jj", ["edit", recordedChangeId], metadata.path);
        if (!edit.ok) throw new Error(`Could not edit recorded JJ workspace change ${recordedChangeId}: ${edit.error}`);
      }
    } else {
      throw new Error([
        `Workspace ${metadata.changeId} is editing ${currentChangeId}, but metadata records ${recordedChangeId}.`,
        "",
        "Recovery:",
        `- Run cd ${metadata.path} && jj edit ${recordedChangeId} if that is the intended task commit.`,
        `- Move or squash any unrelated current @ changes before re-running cy repair ${metadata.changeId} --workspace.`,
      ].join("\n"));
    }
  }

  const workspaceCommitId = jjValue(metadata.path, recordedChangeId, "commit_id");
  if (workspaceCommitId && workspaceCommitId !== nextMetadata.workspaceCommitId) {
    fixes.push(`updated workspaceCommitId ${workspaceCommitId}`);
    nextMetadata = { ...nextMetadata, workspaceCommitId };
  }
  return nextMetadata;
}

function repairHydrateMetadata(metadata: WorkspaceMetadata, mutationOptions: MutationOptions, fixes: string[]): void {
  const hydratePath = path.join(metadata.path, ".changeyard-hydrate.json");
  let current: Record<string, unknown> = {};
  if (existsSync(hydratePath)) {
    try {
      const parsed = JSON.parse(readFileSync(hydratePath, "utf8")) as Record<string, unknown>;
      current = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
    } catch {
      current = {};
    }
  }
  if (current.changeId === metadata.changeId) return;
  fixes.push(`wrote ${path.relative(metadata.path, hydratePath) || hydratePath}`);
  if (!mutationOptions.dryRun) {
    writeFileSync(hydratePath, `${JSON.stringify({
      ...current,
      changeId: metadata.changeId,
      repairedAt: new Date().toISOString(),
    }, null, 2)}\n`);
  }
}

function metadataRepoRootFromMarker(startDir: string): string | null {
  const markerPath = findWorkspaceMarker(startDir);
  if (!markerPath) return null;
  try {
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { metadataPath?: string };
    if (!marker.metadataPath || !existsSync(marker.metadataPath)) return null;
    const metadata = JSON.parse(readFileSync(marker.metadataPath, "utf8")) as WorkspaceMetadata;
    return metadata.repoRoot || null;
  } catch {
    return null;
  }
}

function repoRootFromWorkspacePath(startDir: string, id: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const parent = path.dirname(current);
    if (path.basename(current) === "repo") {
      const workspaceDir = path.dirname(current);
      const workspacesDir = path.dirname(workspaceDir);
      const storageDir = path.dirname(workspacesDir);
      if (path.basename(workspacesDir) === "workspaces" && path.basename(storageDir) === ".changeyard") {
        const root = path.dirname(storageDir);
        if (id === "all" || path.basename(workspaceDir) === id || path.basename(workspaceDir).endsWith(id.replace(/^CY-0*/u, ""))) {
          return root;
        }
        return root;
      }
    }
    if (parent === current) return null;
    current = parent;
  }
}

function repoRootHasRecoverableWorkspace(id: string, repoRoot: string): boolean {
  try {
    const config = loadConfig(repoRoot);
    const root = workspacesRoot(repoRoot, config);
    if (id === "all") {
      return existsSync(root);
    }
    const changeId = findWorkspaceId(root, id) ?? id;
    return existsSync(path.join(root, changeId, "metadata.json"));
  } catch {
    return false;
  }
}

export function resolveRecoveryRepoRoot(id: string, repoRoot: string, startDir = process.cwd()): string {
  if (repoRootHasRecoverableWorkspace(id, repoRoot)) {
    return repoRoot;
  }
  return metadataRepoRootFromMarker(startDir)
    ?? repoRootFromWorkspacePath(startDir, id)
    ?? repoRoot;
}

export function repairWorkspace(id: string, repoRoot: string, mutationOptions: MutationOptions = {}): string {
  const config = loadConfig(repoRoot);
  const root = workspacesRoot(repoRoot, config);
  const changeId = findWorkspaceId(root, id) ?? id;
  const metadataPath = path.join(root, changeId, "metadata.json");
  if (!existsSync(metadataPath)) throw new Error(`Workspace metadata not found for ${id}`);
  let metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as WorkspaceMetadata;
  if (!existsSync(metadata.path)) throw new Error(`Workspace path not found: ${metadata.path}`);
  const fixes: string[] = [];

  const markerPath = path.join(metadata.path, ".changeyard-workspace.json");
  const marker = `${JSON.stringify({ changeId: metadata.changeId, metadataPath }, null, 2)}\n`;
  if (!existsSync(markerPath) || readFileSync(markerPath, "utf8") !== marker) {
    fixes.push(`wrote ${path.relative(metadata.path, markerPath) || markerPath}`);
    if (!mutationOptions.dryRun) writeFileSync(markerPath, marker);
  }

  const rootChangePath = findRootChangePathForMetadata(metadata);
  const rootParsed = parseFrontmatter(readFileSync(rootChangePath, "utf8"));
  const materialized = materializeWorkspaceChangeDocument(metadata, {
    dryRun: mutationOptions.dryRun,
    status: recoverStatusForRootStatus(String(rootParsed.frontmatter.status ?? "")),
  });
  fixes.push(...materialized.fixes);
  repairHydrateMetadata(metadata, mutationOptions, fixes);
  const nextMetadata = normalizeJjWorkspace(metadata, mutationOptions, fixes);
  if (JSON.stringify(nextMetadata) !== JSON.stringify(metadata)) {
    metadata = nextMetadata;
    if (!mutationOptions.dryRun) writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  }

  const workspaceRelativePath = path.relative(repoRoot, metadata.path) || metadata.path;
  const lines = [
    mutationOptions.dryRun ? `Dry-run: would repair ${metadata.changeId}` : `Repaired ${metadata.changeId}`,
    fixes.length ? `Fixed: ${fixes.join("; ")}` : "Fixed: nothing; workspace state already repairable",
    `Workspace change file: ${path.relative(metadata.path, materialized.path) || materialized.path}`,
    `Next: cd ${workspaceRelativePath} && cy verify ${metadata.changeId}`,
  ];
  return lines.join("\n");
}

export function runRecover(id: string, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}, startDir = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const recoveryRoot = resolveRecoveryRepoRoot(id, repoRoot, startDir);
  if (id === "all") {
    const config = loadConfig(recoveryRoot);
    const root = workspacesRoot(recoveryRoot, config);
    if (!existsSync(root)) throw new Error(`Workspaces root not found: ${root}`);
    const recovered = readdirSync(root).filter((entry) => existsSync(path.join(root, entry, "metadata.json"))).map((entry) => repairWorkspace(entry, recoveryRoot, mutationOptions));
    return recovered.length ? recovered.join("\n") : "No recoverable workspaces found";
  }
  return repairWorkspace(id, recoveryRoot, mutationOptions);
}
