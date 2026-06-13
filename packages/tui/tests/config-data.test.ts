import assert from "node:assert/strict";
import {
  CONFIG_TABS,
  planningRows,
  projectRows,
  resolveConfigTabId,
} from "../src/views/config-data";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(resolveConfigTabId("planning"), "planning", "planning tab");
assertEqual(resolveConfigTabId("unknown"), "project", "unknown tab fallback");
assertEqual(CONFIG_TABS.length, 5, "tab count");

const rows = projectRows({
  initialized: true,
  providerType: "github",
  vcsEngine: "jj",
  vcsFallback: "jj",
  projectDefaultBase: "main",
});
assertEqual(rows[0]?.value, "github", "provider row");
assertEqual(rows[1]?.value, "jj", "vcs row");

const planning = planningRows({
  initialized: true,
  providerType: "noop",
  vcsEngine: "plain-copy",
  vcsFallback: "plain-copy",
  projectDefaultBase: "main",
  planningDefaultProfile: "openspec-lite",
  planningDefaultStrictness: "strict",
  planningAllowQuickChanges: false,
});
assertEqual(planning[0]?.value, "openspec-lite", "planning profile");
assertEqual(planning[1]?.value, "strict", "planning strictness");
assertEqual(planning[2]?.value, "off", "quick changes off");

process.stdout.write("ok - config-data helpers\n");
