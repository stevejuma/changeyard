import { testRender } from "@opentui/react/test-utils";
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
  run: (ctx: Awaited<ReturnType<typeof testRender>>) => Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function mountApp(client: RuntimeClient = createMockRuntimeClient()): Promise<Awaited<ReturnType<typeof testRender>>> {
  const setup = await testRender(
    <App
      client={client}
      project="/tmp/changeyard-test"
      debug={false}
      smokeTest={false}
      smokeCreateAll={false}
    />,
    { width: TEST_WIDTH, height: TEST_HEIGHT },
  );
  await setup.flush();
  return setup;
}

const cases: TestCase[] = [
  {
    name: "renders Cline-style home with bottom composer",
    async run({ captureCharFrame }) {
      const frame = captureCharFrame();
      assert(frame.includes("Changeyard"), "expected product label");
      assert(frame.includes("What change should move next?"), "expected composer placeholder");
      assert(frame.includes("jj @"), "expected repository status");
    },
  },
  {
    name: "shows slash autocomplete below composer",
    async run({ mockInput, waitForFrame }) {
      await mockInput.typeText("/con");
      const frame = await waitForFrame((text) => text.includes("/config"), { maxPasses: 40 });
      assert(frame.includes("Open the control panel"), "expected config command description");
    },
  },
  {
    name: "opens config panel from slash command",
    async run({ mockInput, waitForFrame, flush }) {
      await mockInput.typeText("/config");
      mockInput.pressEnter();
      await flush();
      const frame = await waitForFrame((text) => text.includes("Changeyard Config"), { maxPasses: 40 });
      assert(frame.includes("Agent / Runtime") && frame.includes("Codex"), "expected agent config block");
    },
  },
  {
    name: "shows file mention autocomplete",
    async run({ mockInput, waitForFrame }) {
      await mockInput.typeText("Review @src");
      const frame = await waitForFrame((text) => text.includes("src/cli.ts"), { maxPasses: 40 });
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
    async run({ mockInput, waitForFrame, flush }) {
      await mockInput.typeText("/agent");
      mockInput.pressEnter();
      await flush();
      const frame = await waitForFrame((text) => text.includes("Agent Session") && text.includes("running"), {
        maxPasses: 40,
      });
      assert(frame.includes("Codex"), "expected configured agent session");
    },
  },
  {
    name: "creates a quick change from plain input",
    async run({ mockInput, waitForFrame, flush }) {
      await mockInput.typeText("Fix onboarding copy");
      mockInput.pressEnter();
      await flush();
      const frame = await waitForFrame((text) => text.includes("Fix onboarding copy"), { maxPasses: 40 });
      assert(frame.includes("CY-MOCK"), "expected created change id");
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
