import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoFileUrl } from "./paths.js";
let tsxRegistered = false;

/** True when the CLI itself is running from compiled dist output. */
export function useBundledArtifacts(moduleUrl: URL | string = import.meta.url): boolean {
  if (process.env.CHANGEYARD_USE_DIST === "1") return true;
  if (process.env.CHANGEYARD_DEV === "1" || process.env.CHANGEYARD_USE_DIST === "0") return false;
  const file = fileURLToPath(moduleUrl);
  return file.includes(`${path.sep}dist${path.sep}`);
}

async function registerTsxLoader(): Promise<void> {
  if (tsxRegistered) return;
  const { register } = await import("tsx/esm/api");
  register();
  tsxRegistered = true;
}

export function resolveKanbanServerModuleUrl(fromModuleUrl: URL | string): URL {
  const bundled = repoFileUrl(fromModuleUrl, "packages/kanban/dist/server/index.js");
  const source = repoFileUrl(fromModuleUrl, "packages/kanban/src/server/index.js");
  return useBundledArtifacts(fromModuleUrl) ? bundled : source;
}

export function resolveUiServerModuleUrl(fromModuleUrl: URL | string): URL {
  return resolveKanbanServerModuleUrl(fromModuleUrl);
}

export type KanbanServerModule = {
  startChangeyardRuntime: (input: Record<string, unknown>) => Promise<{ url: string; close: () => Promise<void> }>;
  startChangeyardKanban: (input: Record<string, unknown>) => Promise<{ url: string; close: () => Promise<void> }>;
};

export async function importKanbanServer(fromModuleUrl: URL | string): Promise<KanbanServerModule> {
  const moduleUrl = resolveKanbanServerModuleUrl(fromModuleUrl);
  if (!useBundledArtifacts(fromModuleUrl)) {
    await registerTsxLoader();
  }
  const modulePath = fileURLToPath(moduleUrl);
  if (!existsSync(modulePath)) {
    throw new Error(
      useBundledArtifacts(fromModuleUrl)
        ? "Changeyard runtime was not found. Run npm run build before launching cy --kanban, cy --tui, cy --vcs, or cy server."
        : "Changeyard runtime source was not found. Expected packages/kanban/src/server/index.js.",
    );
  }
  return (await import(moduleUrl.href)) as KanbanServerModule;
}
