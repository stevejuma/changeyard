import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { DialogProvider } from "@opentui-ui/dialog/react";
import { RuntimeClient, RuntimeClientError } from "./runtime-client";
import { App } from "./react/app";
import { installTuiStdioCapture } from "./stdio-capture";

type Args = {
  connect: string;
  project?: string;
  debug: boolean;
  smokeTest: boolean;
  smokeCreateAll: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { connect: "", debug: false, smokeTest: false, smokeCreateAll: false };
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
  process.env.OPENTUI_GRAPHICS = "0";
  const args = parseArgs(process.argv.slice(2));
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    autoFocus: true,
    enableMouseMovement: true,
    targetFps: 30,
  });
  const restoreStdio = installTuiStdioCapture();
  const root = createRoot(renderer);
  renderer.on("destroy", () => {
    root.unmount();
    restoreStdio();
  });
  try {
    root.render(
      <DialogProvider size="medium">
        <App
          client={new RuntimeClient(args.connect)}
          project={args.project}
          debug={args.debug}
          smokeTest={args.smokeTest}
          smokeCreateAll={args.smokeCreateAll}
        />
      </DialogProvider>,
    );
  } catch (error) {
    restoreStdio();
    renderer.destroy();
    throw error;
  }
}

main().catch((error) => {
  const message = error instanceof RuntimeClientError || error instanceof Error ? error.message : String(error);
  process.stderr.write(
    [
      "OpenTUI could not start.",
      message,
      "",
      "Fallback options:",
      "- retry with `cy --tui --debug`",
      "- launch the browser UI with `cy --kanban`",
      "- inspect changes with `cy list` and `cy status <id>`",
      "",
    ].join("\n"),
  );
  process.exitCode = 1;
});
