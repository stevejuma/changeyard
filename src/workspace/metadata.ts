import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { workspacesRoot } from "../paths.js";
import { findWorkspaceId } from "../state/id.js";
import type { WorkspaceMetadata } from "../types.js";

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
  const root = workspacesRoot(repoRoot, config);
  const workspaceId = findWorkspaceId(root, id) ?? id;
  return path.join(root, workspaceId, "metadata.json");
}

export function readWorkspaceMetadataFromRoot(id: string, repoRoot: string): WorkspaceMetadata | null {
  const metadataPath = workspaceMetadataPath(id, repoRoot);
  if (!existsSync(metadataPath)) return null;
  return asWorkspaceMetadata(JSON.parse(readFileSync(metadataPath, "utf8")));
}
