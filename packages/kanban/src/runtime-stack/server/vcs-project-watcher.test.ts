import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
	classifyVcsWatchPath,
	createChokidarVcsProjectWatcher,
	type VcsProjectEvent,
	type VcsProjectEventKind,
	shouldIgnoreVcsWatchPath,
} from "./vcs-project-watcher.js";

test("classifies targeted JJ and working-tree watcher paths", () => {
	assert.equal(classifyVcsWatchPath(".jj/repo/op_heads"), "vcs/activity");
	assert.equal(classifyVcsWatchPath(".jj/repo/op_heads/heads/abc123"), "vcs/activity");
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
	assert.equal(shouldIgnoreVcsWatchPath(root, path.join(root, ".jj/repo/op_heads/heads/abc123")), false);
	assert.equal(shouldIgnoreVcsWatchPath(root, path.join(root, ".jj/working_copy/state")), false);
	assert.equal(shouldIgnoreVcsWatchPath(root, path.join(root, ".git/refs/remotes/origin/main")), false);
});

function waitForWatcherEvent(
	events: VcsProjectEvent[],
	kind: VcsProjectEventKind,
	timeoutMs = 4_000,
): Promise<VcsProjectEvent> {
	const existing = events.find((event) => event.kind === kind);
	if (existing) {
		return Promise.resolve(existing);
	}
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${kind}.`)), timeoutMs);
		const interval = setInterval(() => {
			const event = events.find((candidate) => candidate.kind === kind);
			if (!event) {
				return;
			}
			clearTimeout(timeout);
			clearInterval(interval);
			resolve(event);
		}, 25);
		timeout.unref();
		interval.unref();
	});
}

test("chokidar watcher emits semantic worktree and JJ metadata events", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "vcs-project-watcher-"));
	const watcher = createChokidarVcsProjectWatcher();
	const events: VcsProjectEvent[] = [];
	const unsubscribe = watcher.onEvent((event) => {
		events.push(event);
	});
	try {
		await mkdir(path.join(root, ".jj/repo/op_heads/heads"), { recursive: true });
		await mkdir(path.join(root, ".jj/working_copy"), { recursive: true });
		await writeFile(path.join(root, ".jj/repo/op_heads/heads/initial"), "initial\n");
		await writeFile(path.join(root, ".jj/working_copy/state"), "initial\n");
		await watcher.start("project", root);
		await new Promise((resolve) => setTimeout(resolve, 1_200));

		await writeFile(path.join(root, "README.md"), "hello\n");
		const worktreeEvent = await waitForWatcherEvent(events, "worktree_changes");
		assert.deepEqual(worktreeEvent.paths, ["README.md"]);

		await writeFile(path.join(root, ".jj/repo/op_heads/heads/updated"), "updated\n");
		const activityEvent = await waitForWatcherEvent(events, "vcs/activity");
		assert.ok(
			activityEvent.paths.includes(".jj/repo/op_heads/heads/updated") ||
				activityEvent.paths.includes("watcher-fallback:polling"),
		);

		await writeFile(path.join(root, ".jj/working_copy/state"), "updated\n");
		const headEvent = await waitForWatcherEvent(events, "vcs/head");
		assert.deepEqual(headEvent.paths, [".jj/working_copy/state"]);
	} finally {
		unsubscribe();
		await watcher.close();
		await rm(root, { recursive: true, force: true });
	}
});
