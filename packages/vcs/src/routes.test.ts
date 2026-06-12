import assert from "node:assert/strict";
import test from "node:test";

import { resolveVcsRoute } from "./routes";
import { isVcsNavItemActive } from "./utils/vcs-navigation";

test("resolveVcsRoute distinguishes the standalone VCS screens", () => {
	assert.deepEqual(resolveVcsRoute("/vcs"), { kind: "landing" });
	assert.deepEqual(resolveVcsRoute("/vcs/jj"), { kind: "jj-board" });
	assert.deepEqual(resolveVcsRoute("/vcs/jj/branches"), { kind: "jj-branches" });
	assert.deepEqual(resolveVcsRoute("/vcs/jj/history"), { kind: "jj-history" });
	assert.deepEqual(resolveVcsRoute("/vcs/settings"), { kind: "settings" });
});

test("isVcsNavItemActive only highlights exact VCS screens", () => {
	assert.equal(isVcsNavItemActive("/vcs/", "/vcs"), true);
	assert.equal(isVcsNavItemActive("/vcs/jj", "/vcs/jj"), true);
	assert.equal(isVcsNavItemActive("/vcs/jj", "/vcs/jj/branches"), false);
	assert.equal(isVcsNavItemActive("/vcs/jj", "/vcs/jj/history"), false);
	assert.equal(isVcsNavItemActive("/vcs/jj/branches", "/vcs/jj/branches"), true);
	assert.equal(isVcsNavItemActive("/vcs/jj/history", "/vcs/jj/history"), true);
});
