import { testRender } from "@opentui/react/test-utils";
import { DialogProvider } from "@opentui-ui/dialog/react";
import type { RuntimeClient } from "../src/runtime-client";
import { App } from "../src/react/app";
import { createMockRuntimeClient, createMockRuntimeClientWithChanges } from "./mock-runtime-client";

const TEST_WIDTH = 100;
const TEST_HEIGHT = 32;
const originalConsoleError = console.error;

console.error = (...args: unknown[]) => {
  const message = String(args[0] ?? "");
  if (message.includes("was not wrapped in act")) return;
  originalConsoleError(...args);
};

type TestCase = {
  name: string;
  client?: RuntimeClient;
  run: (ctx: TuiTestSetup) => Promise<void>;
};

type TuiTestSetup = Awaited<ReturnType<typeof testRender>>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function mountApp(client: RuntimeClient = createMockRuntimeClient()): Promise<Awaited<ReturnType<typeof testRender>>> {
  const setup = await testRender(
    <DialogProvider size="medium">
      <App
        client={client}
        project="/tmp/changeyard-test"
        debug={false}
        smokeTest={false}
        smokeCreateAll={false}
      />
    </DialogProvider>,
    { width: TEST_WIDTH, height: TEST_HEIGHT },
  );
  for (let pass = 0; pass < 40; pass += 1) {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    if (frame.includes("runtime ok") || frame.includes("Runtime unavailable")) return setup;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return setup;
}

async function waitForFrame(
  setup: TuiTestSetup,
  predicate: (text: string) => boolean,
  options: { maxPasses?: number; delayMs?: number } = {},
): Promise<string> {
  const maxPasses = options.maxPasses ?? 40;
  const delayMs = options.delayMs ?? 10;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    await setup.renderOnce();
    const frame = setup.captureCharFrame();
    if (predicate(frame)) return frame;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  const frame = setup.captureCharFrame();
  throw new Error(`Timed out waiting for frame. Last frame:\n${frame}`);
}

const cases: TestCase[] = [
  {
    name: "renders Cline-style home with bottom composer",
    async run({ captureCharFrame }) {
      const frame = captureCharFrame();
      assert(frame.includes("@@@@@"), "expected tracked robot");
      assert(frame.includes("What can I do for you?"), "expected Cline-style home title");
      assert(frame.includes("Use / for slash commands, @ for file mentions, Ctrl+P for menu"), "expected helper hint");
      assert(frame.includes("jj @"), "expected bottom repository status");
      assert(frame.includes("Plan") && frame.includes("Act"), "expected bottom mode controls");
      assert(frame.includes("quick"), "expected configured template profile control");
      assert(!frame.includes("[vcs timing]"), "debug timing output must not appear in frame");
    },
  },
  {
    name: "cycles Plan Act and template profiles with Tab",
    async run(setup) {
      const { mockInput } = setup;
      mockInput.pressTab();
      let frame = await waitForFrame(setup, (text: string) => text.includes("● quick"), { maxPasses: 40 });
      assert(frame.includes("○ Plan") && frame.includes("○ Act"), "expected profile control to be active");
      mockInput.pressTab();
      frame = await waitForFrame(setup, (text: string) => text.includes("● feature"), { maxPasses: 40 });
      assert(frame.includes("Profile feature"), "expected template profile status");
      mockInput.pressTab();
      frame = await waitForFrame(setup, (text: string) => text.includes("● bug"), { maxPasses: 40 });
      assert(frame.includes("Profile bug"), "expected final template profile status");
      mockInput.pressTab();
      frame = await waitForFrame(setup, (text: string) => text.includes("● Plan"), { maxPasses: 40 });
      assert(frame.includes("○ Act") && frame.includes("○ bug"), "expected cycle back to plan after final profile");
    },
  },
  {
    name: "opens command palette near the upper third",
    async run(setup) {
      const { mockInput } = setup;
      mockInput.pressKey("p", { ctrl: true });
      const frame = await waitForFrame(setup, (text: string) => text.includes("Command Palette"), { maxPasses: 40 });
      const lines = frame.split("\n");
      const paletteLine = lines.findIndex((line) => line.includes("Command Palette"));
      const titleLine = lines.findIndex((line) => line.includes("What can I do for you?"));
      assert(paletteLine >= 0 && paletteLine <= Math.floor(TEST_HEIGHT * 0.35), "expected command palette to open higher on screen");
      assert(titleLine < 0 || paletteLine < titleLine, "expected command palette above the home title");
    },
  },
  {
    name: "shows slash autocomplete below composer",
    async run(setup) {
      const { mockInput } = setup;
      await mockInput.typeText("/con");
      const frame = await waitForFrame(setup, (text: string) => text.includes("/config"), { maxPasses: 40 });
      assert(frame.includes("Open Changeyard settings"), "expected config command description");
    },
  },
  {
    name: "executes selected slash autocomplete command on Enter",
    async run(setup) {
      const { mockInput } = setup;
      await mockInput.typeText("/he");
      let frame = await waitForFrame(setup, (text: string) => text.includes("/help"), { maxPasses: 40 });
      assert(frame.includes("Show the command surface"), "expected help command to be selected");
      mockInput.pressEnter();
      frame = await waitForFrame(setup, (text: string) => text.includes("Commands: /changes /config /debug /agent /stop-agent /refresh /home"), { maxPasses: 40 });
      assert(!frame.includes("Unknown command"), "expected selected autocomplete command to execute");
    },
  },
  {
    name: "opens editable config dialog from slash command",
    async run(setup) {
      const { mockInput } = setup;
      await mockInput.typeText("/config");
      mockInput.pressEnter();
      let frame = await waitForFrame(setup, (text: string) => text.includes("Changeyard Settings"), { maxPasses: 40 });
      assert(frame.includes("● Runtime") && frame.includes("○ Project") && frame.includes("○ Planning"), "expected tabbed config dialog");
      assert(frame.includes("Agent") && frame.includes("Codex"), "expected selected agent setting");
      assert(!frame.includes("Provider        noop"), "expected project settings to stay out of the runtime tab");
      mockInput.pressEnter();
      frame = await waitForFrame(setup, (text: string) => text.includes("Agent") && text.includes("Claude"), { maxPasses: 40 });
      assert(frame.includes("Claude") && frame.includes("claude"), "expected Enter to cycle and save selected agent");
      mockInput.pressTab();
      frame = await waitForFrame(setup, (text: string) => text.includes("○ Runtime") && text.includes("● Project"), { maxPasses: 40 });
      assert(frame.includes("Provider") && frame.includes("noop"), "expected Tab to switch to project settings");
      assert(!frame.includes("Changeyard Config"), "expected config not to be printed into chat");
    },
  },
  {
    name: "shows file mention autocomplete",
    async run(setup) {
      const { mockInput } = setup;
      await mockInput.typeText("Review @src");
      const frame = await waitForFrame(setup, (text: string) => text.includes("src/cli.ts"), { maxPasses: 40 });
      assert(frame.includes("workspace file") || frame.includes("changed"), "expected file mention metadata");
    },
  },
  {
    name: "starts an agent session from slash command",
    client: createMockRuntimeClientWithChanges([
      {
        id: "CY-MOCK-001",
        title: "Mock agent task",
        type: "quick",
        status: "in_progress",
        path: "changes/CY-MOCK-001.md",
        labels: [],
        planning: null,
      },
    ]),
    async run(setup) {
      const { mockInput } = setup;
      await mockInput.typeText("/agent");
      mockInput.pressEnter();
      const frame = await waitForFrame(setup, (text: string) => text.includes("Started Codex session") || text.includes("Starting Changeyard workflow"), {
        maxPasses: 40,
      });
      assert(frame.includes("Codex"), "expected configured agent session");
    },
  },
  {
    name: "creates a quick change from plain input",
    async run(setup) {
      const { mockInput } = setup;
      await mockInput.typeText("Fix onboarding copy");
      mockInput.pressEnter();
      const frame = await waitForFrame(setup, (text: string) => text.includes("CY-MOCK"), { maxPasses: 40 });
      assert(frame.includes("Fix onboarding copy"), "expected created change title");
    },
  },
];

let failed = 0;

for (const testCase of cases) {
  let setup: Awaited<ReturnType<typeof testRender>> | null = null;
  try {
    setup = await mountApp(testCase.client);
    await testCase.run(setup);
    process.stdout.write(`ok - ${testCase.name}\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`not ok - ${testCase.name}\n`);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  } finally {
    setup?.renderer.destroy();
  }
}

if (failed > 0) {
  process.stderr.write(`\n${failed}/${cases.length} tui interaction tests failed\n`);
  process.exit(1);
}

process.stdout.write(`\n${cases.length}/${cases.length} tui interaction tests passed\n`);
