import assert from "node:assert/strict";
import test from "node:test";
import { normalizeJjArgs } from "../packages/kanban/src/runtime-stack/workspace/jj-utils.js";

test("normalizeJjArgs forces color off for runtime jj commands", () => {
	assert.deepEqual(normalizeJjArgs(["diff", "--color=always", "--git"]), ["--color=never", "diff", "--git"]);
	assert.deepEqual(normalizeJjArgs(["log", "--color", "always", "-r", "@"]), ["--color=never", "log", "-r", "@"]);
	assert.deepEqual(normalizeJjArgs(["status"]), ["--color=never", "status"]);
});
