import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { WorkspaceMetadata } from "../types.js";

export type WorkspaceMarker = {
  changeId: string;
  metadataPath: string;
};

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
  if (marker.changeId !== id) throw new Error(`Workspace marker is for ${marker.changeId}, not ${id}`);
  if (!existsSync(marker.metadataPath)) throw new Error(`Workspace metadata not found: ${marker.metadataPath}`);
  return JSON.parse(readFileSync(marker.metadataPath, "utf8")) as WorkspaceMetadata;
}
