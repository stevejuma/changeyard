import assert from "node:assert/strict";
import test from "node:test";

import { resolveVcsRoute } from "./routes";

test("resolveVcsRoute distinguishes the standalone VCS screens", () => {
	assert.deepEqual(resolveVcsRoute("/vcs"), { kind: "landing" });
	assert.deepEqual(resolveVcsRoute("/vcs/jj"), { kind: "jj-board" });
	assert.deepEqual(resolveVcsRoute("/vcs/jj/branches"), { kind: "jj-branches" });
	assert.deepEqual(resolveVcsRoute("/vcs/jj/history"), { kind: "jj-history" });
	assert.deepEqual(resolveVcsRoute("/vcs/settings"), { kind: "settings" });
});
