import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findRepoRoot } from "../config/loadConfig.js";
import { createChangeyardUiApi, importKanbanServerModule } from "./ui.js";
import { repoFileUrl } from "../dev/paths.js";

export type TuiMode = "board" | "config";

export type TuiOptions = {
  connect?: string;
  host?: string;
  port?: number | "auto";
  project?: string;
  debug?: boolean;
  smokeTest?: boolean;
  smokeCreateAll?: boolean;
  mode?: TuiMode;
  configTab?: string;
};

function resolveTuiEntrypoint(): string {
  const candidates = [
    repoFileUrl(import.meta.url, "packages/tui/src/index.tsx"),
    repoFileUrl(import.meta.url, "packages/tui/dist/index.js"),
  ].map((url) => fileURLToPath(url));
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("Changeyard TUI assets were not found. Run npm run build:tui or reinstall the package.");
  }
  return found;
}

function assertBunAvailable(): void {
  const result = spawnSync("bun", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error([
      "cy tui requires Bun because OpenTUI's renderer runs through Bun for this client.",
      "Install Bun from https://bun.sh, then retry `cy tui`.",
      "Node-only commands such as `cy`, `cy ui`, and `cy server` do not require Bun.",
    ].join("\n"));
  }
}

async function startEmbeddedRuntime(options: TuiOptions, repoRoot: string): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const loaded = await importKanbanServerModule();

  return await loaded.startChangeyardRuntime({
    repoRoot,
    host: options.host ?? "127.0.0.1",
    port: options.port ?? "auto",
    mode: "tui",
    openBrowser: false,
    serveWebAssets: false,
    changeyardApi: createChangeyardUiApi(),
  });
}

function runBunTui(input: {
  entrypoint: string;
  runtimeUrl: string;
  projectRoot: string;
  debug?: boolean;
  smokeTest?: boolean;
  smokeCreateAll?: boolean;
  mode?: TuiMode;
  configTab?: string;
}): Promise<number> {
  return awaitableChild("bun", [
    "--preload",
    "@opentui/solid/preload",
    input.entrypoint,
    "--connect",
    input.runtimeUrl,
    "--project",
    input.projectRoot,
    ...(input.mode === "config" ? ["--mode", "config"] : []),
    ...(input.configTab ? ["--config-tab", input.configTab] : []),
    ...(input.debug ? ["--debug"] : []),
    ...(input.smokeTest ? ["--smoke-test"] : []),
    ...(input.smokeCreateAll ? ["--smoke-create-all"] : []),
  ]);
}

function awaitableChild(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(typeof code === "number" ? code : 1));
  });
}

export async function runTui(options: TuiOptions = {}, cwd = process.cwd()): Promise<string> {
  assertBunAvailable();
  const repoRoot = findRepoRoot(options.project ?? cwd);
  const entrypoint = resolveTuiEntrypoint();
  const embedded = options.connect ? null : await startEmbeddedRuntime(options, repoRoot);
  const runtimeUrl = options.connect ?? embedded?.url;
  if (!runtimeUrl) {
    throw new Error("Missing runtime URL for cy tui.");
  }

  try {
    const code = await runBunTui({
      entrypoint,
      runtimeUrl,
      projectRoot: path.resolve(repoRoot),
      debug: options.debug,
      smokeTest: options.smokeTest,
      smokeCreateAll: options.smokeCreateAll,
      mode: options.mode,
      configTab: options.configTab,
    });
    if (code !== 0) {
      throw new Error([
        `OpenTUI exited with status ${code}.`,
        "Fallback options:",
        "- retry with `cy tui --debug`",
        "- launch the browser UI with `cy ui`",
        "- inspect changes with `cy list` and `cy status <id>`",
      ].join("\n"));
    }
    return options.mode === "config" ? "Changeyard config closed." : "Changeyard TUI closed.";
  } finally {
    if (embedded) {
      await embedded.close();
    }
  }
}
