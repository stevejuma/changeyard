import { loadConfig } from "../config/loadConfig.js";
import { hydrateWorkspace } from "../hydrate/hydrateWorkspace.js";
import { readWorkspaceMetadata } from "../workspace/marker.js";

export function runHydrate(id: string, cwd = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const metadata = readWorkspaceMetadata(id, cwd);
  const config = loadConfig(metadata.repoRoot);
  const result = hydrateWorkspace(config, metadata);
  return `Hydrated ${id}: copied ${result.copied.length}, skipped ${result.skipped.length}`;
}
