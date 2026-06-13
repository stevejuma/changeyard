import { render } from "@opentui/solid";
import { RuntimeClient, RuntimeClientError } from "./runtime-client";
import { App, type AppArgs, type AppMode } from "./app";
import { resolveConfigTabId, type ConfigTabId } from "./views/config-data";

type Args = {
  connect: string;
  project?: string;
  mode: AppMode;
  configTab?: ConfigTabId;
  debug: boolean;
  smokeTest: boolean;
  smokeCreateAll: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { connect: "", mode: "board", debug: false, smokeTest: false, smokeCreateAll: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--debug") {
      args.debug = true;
      continue;
    }
    if (arg === "--smoke-test") {
      args.smokeTest = true;
      continue;
    }
    if (arg === "--smoke-create-all") {
      args.smokeCreateAll = true;
      continue;
    }
    if (arg === "--mode") {
      const mode = argv[++index];
      if (mode === "config" || mode === "board") {
        args.mode = mode;
      }
      continue;
    }
    if (arg === "--config-tab") {
      args.configTab = resolveConfigTabId(argv[++index]);
      continue;
    }
    if (arg === "--connect") {
      args.connect = argv[++index] ?? "";
      continue;
    }
    if (arg === "--project") {
      args.project = argv[++index] ?? "";
    }
  }
  if (!args.connect) {
    throw new Error("Missing --connect <runtime-url>.");
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = new RuntimeClient(args.connect);
  const appArgs: AppArgs = {
    client,
    project: args.project,
    mode: args.mode,
    configTab: args.configTab,
    smokeTest: args.smokeTest,
    smokeCreateAll: args.smokeCreateAll,
  };

  await render(() => <App {...appArgs} />, {
    exitOnCtrlC: true,
    targetFps: 30,
  });
}

main().catch((error) => {
  const message = error instanceof RuntimeClientError || error instanceof Error ? error.message : String(error);
  process.stderr.write(
    [
      "OpenTUI could not start.",
      message,
      "",
      "Fallback options:",
      "- retry with `cy tui --debug`",
      "- launch the browser UI with `cy ui`",
      "- inspect changes with `cy list` and `cy status <id>`",
      "",
    ].join("\n"),
  );
  process.exitCode = 1;
});
