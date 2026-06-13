import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getConfigJson } from "../src/commands/config.js";
import { runInit } from "../src/commands/init.js";

function tempRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "changeyard-config-test-"));
}

test("getConfigJson returns merged project config and paths", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const payload = getConfigJson(repo);
    assert.equal(payload.project.initialized, true);
    assert.equal(payload.project.providerType, "noop");
    assert.equal(payload.project.vcsEngine, "plain-copy");
    assert.equal(payload.project.projectDefaultBase, "main");
    assert.equal(payload.paths.base, path.join(repo, ".changeyard", "config.jsonc"));
    assert.equal(payload.paths.local, path.join(repo, ".changeyard", "config.local.jsonc"));
    assert.equal(payload.paths.schema, path.join(repo, ".changeyard", "schema.json"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("getConfigJson fails when Changeyard is not initialized", () => {
  const repo = tempRepo();
  try {
    assert.throws(() => getConfigJson(repo), /not initialized/i);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
