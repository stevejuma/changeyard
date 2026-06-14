import assert from "node:assert/strict";
import { filterCommandItems, scoreCommandItem } from "../src/utils/command-search";
import { buildActivityItems } from "../src/utils/activity";
import { normalizeActivityEvents, prependActivityEvent } from "../src/utils/activity-events";
import { buildDiagnosticsRows } from "../src/utils/diagnostics";
import {
  buildDiagnosticBundle,
  diagnosticBundleFileExtension,
  diagnosticBundleFormatFromArg,
} from "../src/utils/diagnostic-bundle";
import {
  getHistoryNavigationAction,
  normalizePromptHistory,
  prependPromptHistoryEntry,
  resolvePromptHistoryEntry,
} from "../src/utils/prompt-history";
import { isRefreshRelevantRuntimeEvent, runtimeEventLabel } from "../src/utils/runtime-events";
import { buildSetupChecklist } from "../src/utils/setup-guide";
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
  events: prependActivityEvent([], {
    kind: "lifecycle",
    status: "success",
    title: "Validated CY-0002",
    description: "Activity item",
    changeId: "CY-0002",
  }),
});
assertEqual(activity.length, 4, "activity includes persisted events, changes, and doctor rows");
assertEqual(activity[0]?.severity, "success", "successful persisted events are highlighted");
assertEqual(activity[2]?.severity, "warning", "doctor warnings are highlighted");

const normalizedEvents = normalizeActivityEvents([
  {
    id: "event:1",
    kind: "doctor",
    status: "success",
    title: "Doctor completed",
    description: "1 ok",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  { id: "bad" },
]);
assertEqual(normalizedEvents.length, 1, "activity event normalization filters malformed rows");

const diagnostics = buildDiagnosticsRows({
  runtimeUrl: "http://127.0.0.1:6174",
  workspaceId: "workspace-1",
  runtimeHealthy: true,
  eventRefreshMode: "events",
  lastRefreshAt: "2026-01-01T00:00:00.000Z",
  lastRefreshError: null,
  projectConfig: {
    initialized: true,
    providerType: "github",
    vcsEngine: "jj",
    vcsFallback: "plain-copy",
    projectDefaultBase: "main",
  },
  runtimeConfig: {
    selectedAgentId: "codex",
    agents: [{
      id: "codex",
      label: "Codex",
      binary: "codex",
      command: "codex",
      defaultArgs: [],
      installed: true,
      configured: true,
    }],
  },
  selectedAgent: {
    id: "codex",
    label: "Codex",
    binary: "codex",
    command: "codex",
    defaultArgs: [],
    installed: true,
    configured: true,
  },
  doctor: { ok: ["config"], warnings: [], notes: [] },
});
assert(diagnostics.some((row) => row.id === "runtime:events" && row.value === "events"), "diagnostics includes refresh mode");
assert(diagnostics.some((row) => row.id === "agent:state" && row.severity === "success"), "diagnostics includes agent state");

const checklist = buildSetupChecklist({
  projectConfig: {
    initialized: false,
    providerType: "noop",
    vcsEngine: "plain-copy",
    vcsFallback: "plain-copy",
    projectDefaultBase: "",
  },
  runtimeConfig: { selectedAgentId: "codex", agents: [] },
  selectedAgent: null,
});
assertEqual(checklist[0]?.status, "todo", "setup checklist identifies missing initialization");
assert(checklist.some((item) => item.command === "/agents" && item.status === "todo"), "setup checklist points to agent setup");

assertEqual(
  isRefreshRelevantRuntimeEvent({ type: "vcs_project_event", workspaceId: "workspace-1", kind: "worktree_changes" }, "workspace-1"),
  true,
  "runtime VCS event refreshes active workspace",
);
assertEqual(
  isRefreshRelevantRuntimeEvent({ type: "vcs_project_event", workspaceId: "other" }, "workspace-1"),
  false,
  "runtime events from another workspace are ignored",
);
assertEqual(runtimeEventLabel({ type: "vcs_project_event", kind: "vcs/head" }), "vcs_project_event vcs/head", "runtime event label includes kind");

const bundleInput = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  runtimeUrl: "http://127.0.0.1:6174",
  workspaceId: "workspace-1",
  runtimeHealthy: true,
  eventRefreshMode: "events" as const,
  lastRefreshAt: "2026-01-01T00:00:00.000Z",
  lastRefreshError: null,
  status: "Ready",
  error: null,
  selected: null,
  detail: null,
  changes: [],
  doctor: { ok: ["config"], warnings: [], notes: [] },
  projectConfig: {
    initialized: true,
    providerType: "noop" as const,
    vcsEngine: "jj" as const,
    vcsFallback: "jj" as const,
    projectDefaultBase: "main",
  },
  runtimeConfig: {
    selectedAgentId: "codex",
    agents: [],
  },
  selectedAgent: null,
  activityEvents: [],
};
assertEqual(diagnosticBundleFormatFromArg("json"), "json", "json export arg");
assertEqual(diagnosticBundleFormatFromArg(undefined), "markdown", "default export format");
assertEqual(diagnosticBundleFileExtension("markdown"), "md", "markdown extension");
assert(buildDiagnosticBundle(bundleInput, "markdown").includes("# Changeyard TUI Diagnostic Bundle"), "markdown bundle heading");
assert(JSON.parse(buildDiagnosticBundle(bundleInput, "json")).runtime.workspaceId === "workspace-1", "json bundle runtime data");

process.stdout.write("ok - workflow helper tests\n");
