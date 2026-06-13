import { testRender } from "@opentui/solid";
import type { TestRendererSetup } from "@opentui/core/testing";
import { App } from "../src/app";
import { createMockRuntimeClient } from "./mock-runtime-client";

const TEST_WIDTH = 100;
const TEST_HEIGHT = 32;

type TestCase = {
  name: string;
  run: (ctx: TestRendererSetup) => Promise<void>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function mountHomeApp(): Promise<TestRendererSetup> {
  const setup = await testRender(
    () => (
      <App
        client={createMockRuntimeClient()}
        project="/tmp/changeyard-test"
        smokeTest={false}
        smokeCreateAll={false}
      />
    ),
    { width: TEST_WIDTH, height: TEST_HEIGHT },
  );
  await setup.flush();
  return setup;
}

async function mountConfigApp(): Promise<TestRendererSetup> {
  const setup = await testRender(
    () => (
      <App
        client={createMockRuntimeClient()}
        project="/tmp/changeyard-test"
        mode="config"
        smokeTest={false}
        smokeCreateAll={false}
      />
    ),
    { width: TEST_WIDTH, height: TEST_HEIGHT },
  );
  await setup.flush();
  return setup;
}

const cases: TestCase[] = [
  {
    name: "renders home screen with composer",
    async run({ captureCharFrame }) {
      const frame = captureCharFrame();
      assert(frame.includes("Type a change title"), "expected composer placeholder");
      assert(frame.includes("ctrl+p"), "expected command palette hint");
    },
  },
  {
    name: "opens command palette with ctrl+p from focused composer",
    async run({ mockInput, waitForFrame }) {
      mockInput.pressKey("p", { ctrl: true });
      const frame = await waitForFrame((text) => text.includes("Commands"), { maxPasses: 40 });
      assert(frame.includes("Create change"), "expected create command in palette");
    },
  },
  {
    name: "opens help dialog via /help slash command",
    async run({ mockInput, waitForFrame, flush }) {
      await mockInput.typeText("/help");
      mockInput.pressEnter();
      await flush();
      mockInput.pressEnter();
      const frame = await waitForFrame((text) => text.includes("Help"), { maxPasses: 40 });
      assert(frame.includes("Press ctrl+p"), "expected help body text");
    },
  },
  {
    name: "runs command selected from command palette",
    async run({ mockInput, waitForFrame, flush }) {
      mockInput.pressKey("p", { ctrl: true });
      await waitForFrame((text) => text.includes("Commands"), { maxPasses: 40 });
      await flush();
      mockInput.pressEnter();
      const frame = await waitForFrame((text) => text.includes("Help") && !text.includes("Commands"), {
        maxPasses: 40,
      });
      assert(frame.includes("Press ctrl+p"), "expected help after selecting from command palette");
    },
  },
  {
    name: "closes command palette",
    async run({ mockInput, mockMouse, waitForFrame, flush }) {
      mockInput.pressKey("p", { ctrl: true });
      await waitForFrame((text) => text.includes("Commands"), { maxPasses: 40 });
      await flush();
      await mockMouse.click(88, 11);
      await waitForFrame((text) => !text.includes("Commands"), { maxPasses: 40 });
    },
  },
  {
    name: "autocomplete enter completes slash without executing",
    async run({ mockInput, waitForFrame, flush }) {
      await mockInput.typeText("/he");
      mockInput.pressEnter();
      await flush();
      const frame = await waitForFrame((text) => !text.includes("Press ctrl+p") && !text.includes("esc/enter"), {
        maxPasses: 40,
      });
      assert(frame.includes("/help") || frame.includes("/he"), "expected completed slash in composer");
    },
  },
  {
    name: "closes help dialog with enter",
    async run({ mockInput, waitForFrame, flush, captureCharFrame }) {
      await mockInput.typeText("/help");
      mockInput.pressEnter();
      await flush();
      mockInput.pressEnter();
      await waitForFrame((text) => text.includes("Help"), { maxPasses: 40 });
      await flush();
      mockInput.pressEnter();
      await waitForFrame((text) => !text.includes("esc/enter"), { maxPasses: 40 });
      const frame = captureCharFrame();
      assert(frame.includes("Type a change title"), "expected composer after closing help");
    },
  },
  {
    name: "shows composer status bar with profile and agent",
    async run({ waitForFrame }) {
      const frame = await waitForFrame((text) => text.includes("profiles") && text.includes(" · "), {
        maxPasses: 40,
      });
      assert(/Quick change|Planned feature|Strict planned feature|Legacy unplanned task/.test(frame), "expected profile label");
    },
  },
  {
    name: "creates change from plain title using selected profile",
    async run({ mockInput, waitForFrame, flush }) {
      await mockInput.typeText("Fix onboarding copy");
      mockInput.pressEnter();
      await flush();
      const frame = await waitForFrame((text) => text.includes("Fix onboarding copy") || text.includes("Created chg-mock-001"), {
        maxPasses: 40,
      });
      assert(frame.includes("Fix onboarding copy"), "expected created change title in sidebar");
    },
  },
  {
    name: "opens config view via /config slash command",
    async run({ mockInput, waitForFrame, flush }) {
      await mockInput.typeText("/config");
      mockInput.pressEnter();
      await flush();
      mockInput.pressEnter();
      const frame = await waitForFrame((text) => text.includes("Changeyard Config") && text.includes("Provider"), {
        maxPasses: 40,
      });
      assert(frame.includes("Planning"), "expected config tabs");
    },
  },
  {
    name: "opens agent tab via /agents slash command",
    async run({ mockInput, waitForFrame, flush }) {
      await mockInput.typeText("/agents");
      mockInput.pressEnter();
      await flush();
      mockInput.pressEnter();
      const frame = await waitForFrame((text) => text.includes("Changeyard Config") && text.includes("Launch agent"), {
        maxPasses: 40,
      });
      assert(frame.includes("Claude"), "expected selected agent label");
    },
  },
  {
    name: "opens appearance tab via /themes slash command",
    async run({ mockInput, waitForFrame, flush }) {
      await mockInput.typeText("/themes");
      mockInput.pressEnter();
      await flush();
      mockInput.pressEnter();
      const frame = await waitForFrame((text) => text.includes("Changeyard Config") && text.includes("Theme"), {
        maxPasses: 40,
      });
      assert(frame.includes("Create preset"), "expected appearance settings");
    },
  },
  {
    name: "autocomplete lists slash commands while typing",
    async run({ mockInput, waitForFrame }) {
      await mockInput.typeText("/cre");
      const frame = await waitForFrame((text) => /create|Create/i.test(text), { maxPasses: 40 });
      assert(/create|Create/i.test(frame), "expected create slash suggestion");
    },
  },
];

let failed = 0;

const standaloneCases: TestCase[] = [
  {
    name: "renders standalone config mode with project tab",
    async run({ captureCharFrame }) {
      const frame = captureCharFrame();
      assert(frame.includes("Changeyard Config"), "expected config header");
      assert(frame.includes("Provider"), "expected provider row");
      assert(frame.includes("VCS engine"), "expected vcs row");
    },
  },
];

for (const testCase of standaloneCases) {
  let setup: TestRendererSetup | null = null;
  try {
    setup = await mountConfigApp();
    await testCase.run(setup);
    process.stdout.write(`ok - ${testCase.name}\n`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`not ok - ${testCase.name}\n${message}\n`);
  } finally {
    setup?.renderer.destroy();
  }
}

for (const testCase of cases) {
  let setup: TestRendererSetup | null = null;
  try {
    setup = await mountHomeApp();
    await testCase.run(setup);
    process.stdout.write(`ok - ${testCase.name}\n`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`not ok - ${testCase.name}\n${message}\n`);
  } finally {
    setup?.renderer.destroy();
  }
}

if (failed > 0) {
  process.exitCode = 1;
  process.stderr.write(`\n${failed}/${cases.length} tui interaction tests failed\n`);
} else {
  process.stdout.write(`\n${cases.length}/${cases.length} tui interaction tests passed\n`);
}
