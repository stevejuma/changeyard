import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { taskIdMatches } from "../state/id.js";
import type { WorkspaceMetadata } from "../types.js";
import { shellCommandRunner } from "./commandRunner.js";

export type WorkspaceMarker = {
  changeId: string;
  metadataPath: string;
};

export function ensureWorkspaceMarkerExcludes(cwd: string): void {
  const excludePath = shellCommandRunner("git", ["rev-parse", "--git-path", "info/exclude"], cwd);
  const absoluteExcludePath = path.isAbsolute(excludePath) ? excludePath : path.join(cwd, excludePath);
  const current = existsSync(absoluteExcludePath) ? readFileSync(absoluteExcludePath, "utf8") : "";
  const entries = [".changeyard-workspace.json", ".changeyard-hydrate.json"];
  const missing = entries.filter((entry) => !new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "mu").test(current));
  if (missing.length > 0) writeFileSync(absoluteExcludePath, `${current.replace(/\s*$/u, "\n")}${missing.join("\n")}\n`);
}

export function findWorkspaceMarker(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    const markerPath = path.join(current, ".changeyard-workspace.json");
    if (existsSync(markerPath)) return markerPath;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function readWorkspaceMetadata(id: string, cwd: string): WorkspaceMetadata {
  const markerPath = findWorkspaceMarker(cwd);
  if (!markerPath) throw new Error("Current directory is not inside a Changeyard workspace");
  const marker = JSON.parse(readFileSync(markerPath, "utf8")) as WorkspaceMarker;
  if (!taskIdMatches(marker.changeId, id)) throw new Error(`Workspace marker is for ${marker.changeId}, not ${id}`);
  if (!existsSync(marker.metadataPath)) throw new Error(`Workspace metadata not found: ${marker.metadataPath}`);
  return JSON.parse(readFileSync(marker.metadataPath, "utf8")) as WorkspaceMetadata;
}

export function resolveWorkspaceChangePath(metadata: WorkspaceMetadata): string {
  return metadata.workspaceChangePath ?? path.join(metadata.path, path.relative(metadata.repoRoot, metadata.changePath));
}
