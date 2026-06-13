import assert from "node:assert/strict";
import test from "node:test";

import { resolveVcsRoute } from "./routes";
import { isVcsNavItemActive } from "./utils/vcs-navigation";
import {
	formatVcsLocation,
	readVcsQueryParam,
	resolveVcsLocation,
	setVcsLocationQueryParam,
	type VcsLocation,
} from "./utils/vcs-router";

test("resolveVcsRoute distinguishes the standalone VCS screens", () => {
	assert.deepEqual(resolveVcsRoute("/vcs"), { kind: "jj-board" });
	assert.deepEqual(resolveVcsRoute("/vcs/jj"), { kind: "jj-board" });
	assert.deepEqual(resolveVcsRoute("/vcs/jj/branches"), { kind: "jj-branches" });
	assert.deepEqual(resolveVcsRoute("/vcs/jj/history"), { kind: "jj-history" });
	assert.deepEqual(resolveVcsRoute("/vcs/settings"), { kind: "settings" });
});

test("isVcsNavItemActive only highlights exact VCS screens", () => {
	assert.equal(isVcsNavItemActive("/vcs/jj", "/vcs/jj"), true);
	assert.equal(isVcsNavItemActive("/vcs/jj", "/vcs"), true);
	assert.equal(isVcsNavItemActive("/vcs/jj", "/vcs/jj/branches"), false);
	assert.equal(isVcsNavItemActive("/vcs/jj", "/vcs/jj/history"), false);
	assert.equal(isVcsNavItemActive("/vcs/jj/branches", "/vcs/jj/branches"), true);
	assert.equal(isVcsNavItemActive("/vcs/jj/history", "/vcs/jj/history"), true);
});

test("resolveVcsLocation resolves absolute and relative app URLs", () => {
	const current: VcsLocation = {
		pathname: "/vcs/jj/history",
		search: "?workspaceId=fixture&operation=abc",
		hash: "",
	};

	assert.deepEqual(resolveVcsLocation("/vcs/jj/branches?workspaceId=fixture", current), {
		pathname: "/vcs/jj/branches",
		search: "?workspaceId=fixture",
		hash: "",
	});
	assert.deepEqual(resolveVcsLocation("?workspaceId=fixture&commit=123#details", current), {
		pathname: "/vcs/jj/history",
		search: "?workspaceId=fixture&commit=123",
		hash: "#details",
	});
});

test("setVcsLocationQueryParam preserves path and unrelated params", () => {
	const current: VcsLocation = {
		pathname: "/vcs/jj",
		search: "?workspaceId=fixture&commit=old",
		hash: "#files",
	};
	const withFile = setVcsLocationQueryParam(current, "file", "src/main.rs");
	assert.equal(formatVcsLocation(withFile), "/vcs/jj?workspaceId=fixture&commit=old&file=src%2Fmain.rs#files");
	assert.equal(readVcsQueryParam(withFile.search, "file"), "src/main.rs");

	const withoutCommit = setVcsLocationQueryParam(withFile, "commit", null);
	assert.equal(formatVcsLocation(withoutCommit), "/vcs/jj?workspaceId=fixture&file=src%2Fmain.rs#files");
});
