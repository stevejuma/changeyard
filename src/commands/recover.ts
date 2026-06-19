import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { workspacesRoot } from "../paths.js";
import { findRootChangePathForMetadata, materializeWorkspaceChangeDocument } from "../state/activeChangeDocument.js";
import { findWorkspaceId } from "../state/id.js";
import type { ChangeStatus, WorkspaceMetadata } from "../types.js";

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

export function repairWorkspace(id: string, repoRoot: string, mutationOptions: MutationOptions = {}): string {
  const config = loadConfig(repoRoot);
  const root = workspacesRoot(repoRoot, config);
  const changeId = findWorkspaceId(root, id) ?? id;
  const metadataPath = path.join(root, changeId, "metadata.json");
  if (!existsSync(metadataPath)) throw new Error(`Workspace metadata not found for ${id}`);
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as WorkspaceMetadata;
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

  const workspaceRelativePath = path.relative(repoRoot, metadata.path) || metadata.path;
  const lines = [
    mutationOptions.dryRun ? `Dry-run: would repair ${metadata.changeId}` : `Repaired ${metadata.changeId}`,
    fixes.length ? `Fixed: ${fixes.join("; ")}` : "Fixed: nothing; workspace state already repairable",
    `Workspace change file: ${path.relative(metadata.path, materialized.path) || materialized.path}`,
    `Next: cd ${workspaceRelativePath} && cy verify ${metadata.changeId}`,
  ];
  return lines.join("\n");
}

export function runRecover(id: string, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!id) throw new Error("change id is required");
  if (id === "all") {
    const config = loadConfig(repoRoot);
    const root = workspacesRoot(repoRoot, config);
    if (!existsSync(root)) throw new Error(`Workspaces root not found: ${root}`);
    const recovered = readdirSync(root).filter((entry) => existsSync(path.join(root, entry, "metadata.json"))).map((entry) => repairWorkspace(entry, repoRoot, mutationOptions));
    return recovered.length ? recovered.join("\n") : "No recoverable workspaces found";
  }
  return repairWorkspace(id, repoRoot, mutationOptions);
}
