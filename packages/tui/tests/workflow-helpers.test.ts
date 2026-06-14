import assert from "node:assert/strict";
import { filterCommandItems, scoreCommandItem } from "../src/utils/command-search";
import { buildActivityItems } from "../src/utils/activity";
import {
  getHistoryNavigationAction,
  normalizePromptHistory,
  prependPromptHistoryEntry,
  resolvePromptHistoryEntry,
} from "../src/utils/prompt-history";
import { formatStatusRows } from "../src/utils/status-format";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const commands = [
  { title: "Run doctor", description: "Inspect local health", category: "Setup", keywords: ["/doctor"] },
  { title: "Create change", description: "Create a task", category: "Change", keywords: ["/create", "/new"] },
  { title: "Show activity", description: "Recent lifecycle events", category: "Diagnostics", keywords: ["/history"] },
];

assert(scoreCommandItem(commands[0], "doctor") > scoreCommandItem(commands[0], "health"), "title match should outrank description match");
assertEqual(filterCommandItems(commands, "new")[0]?.title, "Create change", "alias search");
assertEqual(filterCommandItems(commands, "diagnostics history")[0]?.title, "Show activity", "multi-token keyword search");

assertEqual(
  getHistoryNavigationAction({
    direction: "up",
    cursorOffset: 4,
    textLength: 12,
    visualRow: 0,
    height: 3,
    virtualLineCount: 2,
  }),
  "move-to-boundary",
  "up at first visual row moves cursor before recall",
);
assertEqual(
  getHistoryNavigationAction({
    direction: "down",
    cursorOffset: 12,
    textLength: 12,
    visualRow: 1,
    height: 3,
    virtualLineCount: 2,
  }),
  "navigate",
  "down at end recalls newer history",
);
assert.deepEqual(normalizePromptHistory(["/help", "", 2, "Fix copy"]), ["/help", "Fix copy"], "history normalization");
assert.deepEqual(prependPromptHistoryEntry(["/help", "Fix copy"], "/help"), ["/help", "Fix copy"], "history de-dupes");
assertEqual(resolvePromptHistoryEntry({ history: ["a", "b"], index: -1, direction: "up" }), 0, "first recall");
assertEqual(resolvePromptHistoryEntry({ history: ["a", "b"], index: 0, direction: "down" }), -1, "return to draft");

const rows = formatStatusRows({
  selected: {
    id: "CY-0001",
    title: "Test",
    type: "feature",
    status: "in_progress",
    path: ".changeyard/changes/CY-0001.md",
    labels: [],
    planning: {
      model: "openspec-lite",
      strictness: "normal",
      phase: "draft",
      gateSummary: { pass: 1, pending: 2, fail: 0, skipped: 0, warning: 0 },
      nextAction: "Complete pending gate",
    },
  },
  detail: {
    id: "CY-0001",
    title: "Test",
    type: "feature",
    status: "in_progress",
    path: ".changeyard/changes/CY-0001.md",
    labels: [],
    body: "",
    sections: [],
    planning: {
      model: "openspec-lite",
      strictness: "normal",
      phase: "draft",
      gateSummary: { pass: 1, pending: 2, fail: 0, skipped: 0, warning: 0 },
      nextAction: "Complete pending gate",
    },
    workspace: { engine: "jj", name: "cy-CY-0001", path: ".changeyard/workspaces/CY-0001/repo", branch: "cy/CY-0001" },
  },
  status: "Ready",
  error: null,
  projectConfig: {
    initialized: true,
    providerType: "noop",
    vcsEngine: "jj",
    vcsFallback: "jj",
    projectDefaultBase: "main",
  },
  runtimeHealthy: true,
  width: 70,
});
assert(rows[0].includes("CY-0001"), "status row includes selected change");
assert(rows[1].includes("noop | jj"), "status row includes provider and vcs");

const activity = buildActivityItems({
  changes: [{
    id: "CY-0002",
    title: "Activity item",
    type: "quick",
    status: "ready",
    path: ".changeyard/changes/CY-0002.md",
    labels: [],
    planning: null,
  }],
  doctor: { ok: ["provider: noop"], warnings: ["missing metadata"], notes: [] },
});
assertEqual(activity.length, 3, "activity includes changes and doctor rows");
assertEqual(activity[1]?.severity, "warning", "doctor warnings are highlighted");

process.stdout.write("ok - workflow helper tests\n");
