import { loadConfig } from "../config/loadConfig.js";
import { hydrateWorkspace } from "../hydrate/hydrateWorkspace.js";
import { readWorkspaceMetadata } from "../workspace/marker.js";

type MutationOptions = {
  dryRun?: boolean;
};

export function runHydrate(id: string, cwd = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!id) throw new Error("change id is required");
  const metadata = readWorkspaceMetadata(id, cwd);
  const changeId = metadata.changeId;
  const config = loadConfig(metadata.repoRoot);
  if (mutationOptions.dryRun) {
    return `Dry-run: would hydrate ${changeId}`;
  }
  const result = hydrateWorkspace(config, metadata);
  return `Hydrated ${changeId}: copied ${result.copied.length}, skipped ${result.skipped.length}`;
}
