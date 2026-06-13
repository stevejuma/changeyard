import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
	classifyVcsWatchPath,
	shouldIgnoreVcsWatchPath,
} from "./vcs-project-watcher.js";

test("classifies targeted JJ and working-tree watcher paths", () => {
	assert.equal(classifyVcsWatchPath(".jj/repo/op_heads"), "vcs/activity");
	assert.equal(classifyVcsWatchPath(".jj/working_copy"), "vcs/head");
	assert.equal(classifyVcsWatchPath(".jj/working_copy/state"), "vcs/head");
	assert.equal(classifyVcsWatchPath(".git/FETCH_HEAD"), "vcs/fetch");
	assert.equal(classifyVcsWatchPath(".git/refs/remotes/origin/main"), "vcs/fetch");
	assert.equal(classifyVcsWatchPath("src/main.ts"), "worktree_changes");
});

test("ignores cache directories and non-targeted VCS metadata", () => {
	const root = "/repo";
	assert.equal(shouldIgnoreVcsWatchPath(root, path.join(root, "node_modules/pkg/index.js")), true);
	assert.equal(shouldIgnoreVcsWatchPath(root, path.join(root, "dist/app.js")), true);
	assert.equal(shouldIgnoreVcsWatchPath(root, path.join(root, ".jj/repo/store/data")), true);
	assert.equal(shouldIgnoreVcsWatchPath(root, path.join(root, ".git/objects/aa/bb")), true);
	assert.equal(shouldIgnoreVcsWatchPath(root, path.join(root, ".jj/repo/op_heads")), false);
	assert.equal(shouldIgnoreVcsWatchPath(root, path.join(root, ".jj/working_copy/state")), false);
	assert.equal(shouldIgnoreVcsWatchPath(root, path.join(root, ".git/refs/remotes/origin/main")), false);
});
