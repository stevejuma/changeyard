import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { workspacesRoot } from "../paths.js";
import { findWorkspaceId } from "../state/id.js";
import type { WorkspaceMetadata } from "../types.js";

type MutationOptions = {
  dryRun?: boolean;
};

function recoverOne(id: string, repoRoot: string, mutationOptions: MutationOptions = {}): string {
  const config = loadConfig(repoRoot);
  const root = workspacesRoot(repoRoot, config);
  const changeId = findWorkspaceId(root, id) ?? id;
  const metadataPath = path.join(root, changeId, "metadata.json");
  if (!existsSync(metadataPath)) throw new Error(`Workspace metadata not found for ${id}`);
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as WorkspaceMetadata;
  if (!existsSync(metadata.path)) throw new Error(`Workspace path not found: ${metadata.path}`);
  if (mutationOptions.dryRun) return `Dry-run: would recover ${metadata.changeId}`;
  const markerPath = path.join(metadata.path, ".changeyard-workspace.json");
  writeFileSync(markerPath, `${JSON.stringify({ changeId: metadata.changeId, metadataPath }, null, 2)}\n`);
  return `Recovered ${metadata.changeId}: ${markerPath}`;
}

export function runRecover(id: string, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!id) throw new Error("change id is required");
  if (id === "all") {
    const config = loadConfig(repoRoot);
    const root = workspacesRoot(repoRoot, config);
    if (!existsSync(root)) throw new Error(`Workspaces root not found: ${root}`);
    const recovered = readdirSync(root).filter((entry) => existsSync(path.join(root, entry, "metadata.json"))).map((entry) => recoverOne(entry, repoRoot, mutationOptions));
    return recovered.length ? recovered.join("\n") : "No recoverable workspaces found";
  }
  return recoverOne(id, repoRoot, mutationOptions);
}
