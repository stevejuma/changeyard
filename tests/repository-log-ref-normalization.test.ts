import assert from "node:assert/strict";
import test from "node:test";
import { normalizeJjRemoteRef } from "../packages/kanban/src/runtime-stack/workspace/git-history.js";

test("normalizeJjRemoteRef converts remote slash refs to JJ bookmark remote syntax", () => {
	const remotes = new Set(["origin", "upstream"]);

	assert.equal(normalizeJjRemoteRef("origin/master", remotes), "master@origin");
	assert.equal(normalizeJjRemoteRef("upstream/feature/query-filtering", remotes), "feature/query-filtering@upstream");
	assert.equal(normalizeJjRemoteRef("refs/remotes/origin/feature/export-json", remotes), "feature/export-json@origin");
});

test("normalizeJjRemoteRef leaves local slash bookmarks and normalized refs unchanged", () => {
	const remotes = new Set(["origin"]);

	assert.equal(normalizeJjRemoteRef("feature/cloud-runner", remotes), "feature/cloud-runner");
	assert.equal(normalizeJjRemoteRef("master@origin", remotes), "master@origin");
	assert.equal(normalizeJjRemoteRef("main", remotes), "main");
	assert.equal(normalizeJjRemoteRef("missing/main", remotes), "missing/main");
});
