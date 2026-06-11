import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findRepoRoot, loadConfig } from "../config/loadConfig.js";
import { installCliShutdownHandlers } from "./gracefulShutdown.js";
import { createChangeyardUiApi, importKanbanServerModule, resolveUiServerModuleUrl } from "./ui.js";

export type ServerOptions = {
  host?: string;
  port?: number | "auto";
  project?: string;
};

export function assertServerNodeVersion(): void {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) throw new Error("cy server requires Node.js 22 or newer.");
}

export async function startRuntimeServer(options: ServerOptions = {}, cwd = process.cwd()): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  assertServerNodeVersion();
  const repoRoot = findRepoRoot(options.project ?? cwd);
  const config = loadConfig(repoRoot);
  const moduleUrl = resolveUiServerModuleUrl();
  if (!existsSync(fileURLToPath(moduleUrl))) {
    throw new Error("Changeyard runtime was not found. Run npm run build or set CHANGEYARD_DEV=1.");
  }

  const loaded = await importKanbanServerModule();

  return await loaded.startChangeyardRuntime({
    repoRoot,
    host: options.host ?? config.ui?.host ?? "127.0.0.1",
    port: options.port ?? config.ui?.port ?? "auto",
    mode: "headless",
    openBrowser: false,
    serveWebAssets: false,
    changeyardApi: createChangeyardUiApi(),
  });
}

export async function runServer(options: ServerOptions = {}, cwd = process.cwd()): Promise<string> {
  const server = await startRuntimeServer(options, cwd);
  const runtimeProcess = process as typeof process & {
    stderr: { write: (text: string) => void };
  };
  installCliShutdownHandlers({
    close: () => server.close(),
    onError: (signal, error) => {
      const message = error instanceof Error ? error.message : String(error);
      runtimeProcess.stderr.write(`Failed to shut down Changeyard runtime cleanly after ${signal}: ${message}\n`);
    },
    onTimeout: (signal) => {
      runtimeProcess.stderr.write(`Timed out shutting down Changeyard runtime after ${signal ?? "shutdown"}.\n`);
    },
  });

  return `Changeyard runtime running at ${server.url}`;
}
