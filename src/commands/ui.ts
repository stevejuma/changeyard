import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findRepoRoot, loadConfig } from "../config/loadConfig.js";

export type UiOptions = {
  host?: string;
  port?: number | "auto";
  open?: boolean;
};

export function assertUiNodeVersion(): void {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) throw new Error("cy ui requires Node.js 22 or newer.");
}

function resolveUiServerModuleUrl(): URL {
  return new URL("../../../packages/kanban/dist/server/index.js", import.meta.url);
}

export async function runUi(options: UiOptions = {}, cwd = process.cwd()): Promise<string> {
  assertUiNodeVersion();
  const repoRoot = findRepoRoot(cwd);
  const config = loadConfig(repoRoot);
  const moduleUrl = resolveUiServerModuleUrl();
  if (!existsSync(fileURLToPath(moduleUrl))) {
    throw new Error("Changeyard UI assets were not found. Run npm run build before launching cy ui.");
  }

  const loaded = await import(moduleUrl.href) as {
    startChangeyardKanban: (input: {
      repoRoot: string;
      host?: string;
      port?: number | "auto";
      open?: boolean;
    }) => Promise<{ url: string; close: () => Promise<void> }>;
  };
  const server = await loaded.startChangeyardKanban({
    repoRoot,
    host: options.host ?? config.ui?.host ?? "127.0.0.1",
    port: options.port ?? config.ui?.port ?? "auto",
    open: options.open ?? config.ui?.open ?? true,
  });
  const runtimeProcess = process as typeof process & {
    once: (event: string, listener: () => void) => void;
    stderr: { write: (text: string) => void };
    exit: (code?: number) => never;
  };

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    void server.close()
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        runtimeProcess.stderr.write(`Failed to shut down Changeyard UI cleanly after ${signal}: ${message}\n`);
        runtimeProcess.exitCode = 1;
      })
      .finally(() => {
        runtimeProcess.exit();
      });
  };

  runtimeProcess.once("SIGINT", () => shutdown("SIGINT"));
  runtimeProcess.once("SIGTERM", () => shutdown("SIGTERM"));

  return `Changeyard UI running at ${server.url}`;
}
