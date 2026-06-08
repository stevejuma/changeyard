import path from "node:path";
import type { ChangeyardConfig } from "./types.js";

export function storageRoot(repoRoot: string, config: ChangeyardConfig): string {
  return path.resolve(repoRoot, config.storage.root);
}

export function changesRoot(repoRoot: string, config: ChangeyardConfig): string {
  return path.join(storageRoot(repoRoot, config), config.storage.changesDir);
}

export function workspacesRoot(repoRoot: string, config: ChangeyardConfig): string {
  return path.join(storageRoot(repoRoot, config), config.storage.workspacesDir);
}

export function reviewsRoot(repoRoot: string, config: ChangeyardConfig): string {
  return path.join(storageRoot(repoRoot, config), config.storage.reviewsDir);
}
