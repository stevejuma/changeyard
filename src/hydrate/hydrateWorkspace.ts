import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ChangeyardConfig, WorkspaceMetadata } from "../types.js";
import { isDenied, pathInside } from "../workspace/patterns.js";

export type HydrateResult = {
  copied: string[];
  skipped: string[];
  metadataPath: string;
};

export function hydrateWorkspace(config: ChangeyardConfig, metadata: WorkspaceMetadata): HydrateResult {
  const copied: string[] = [];
  const skipped: string[] = [];
  for (const entry of config.workspace.hydrate.copy) {
    const source = path.resolve(metadata.repoRoot, entry);
    const relative = path.relative(metadata.repoRoot, source);
    if (!pathInside(source, metadata.repoRoot) || isDenied(relative, config.workspace.hydrate.neverCopy)) {
      skipped.push(entry);
      continue;
    }
    if (!existsSync(source)) {
      skipped.push(entry);
      continue;
    }
    const target = path.resolve(metadata.path, entry);
    if (!pathInside(target, metadata.path)) {
      skipped.push(entry);
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied.push(entry);
  }

  const metadataPath = path.resolve(metadata.path, ".changeyard-hydrate.json");
  writeFileSync(metadataPath, `${JSON.stringify({ changeId: metadata.changeId, copied, skipped, hydratedAt: new Date().toISOString() }, null, 2)}\n`);
  return { copied, skipped, metadataPath };
}
