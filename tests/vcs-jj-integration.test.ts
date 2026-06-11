import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyJjOperation } from "../src/vcs/jj/apply.js";
import { previewJjOperation } from "../src/vcs/jj/preview.js";
import { readJjBookmarks, readJjChangesForBookmark } from "../src/vcs/jj/read.js";
import { runVcsCommand } from "../src/vcs/process.js";

function tempRepo(): string {
	return mkdtempSync(path.join(os.tmpdir(), "changeyard-vcs-jj-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

function runCommand(command: string, args: string[], cwd: string): string {
	const nextArgs = command === "git"
		? [
			"-c",
			"commit.gpgsign=false",
			"-c",
			"tag.gpgsign=false",
			...(args[0] === "commit" ? ["commit", "--no-gpg-sign", ...args.slice(1)] : args),
		]
		: args;
	const result = spawnSync(command, nextArgs, { cwd, encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "command failed").toString().trim()}`);
	}
	return (result.stdout || "").trim();
}

function hasCommand(command: string): boolean {
	return spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0;
}

function configureTestGitIdentity(repo: string): void {
	runCommand("git", ["config", "user.name", "Changeyard Test"], repo);
	runCommand("git", ["config", "user.email", "changeyard-test@example.test"], repo);
	runCommand("git", ["config", "commit.gpgsign", "false"], repo);
	runCommand("git", ["config", "tag.gpgSign", "false"], repo);
}

function configureTestJjIdentity(repo: string): void {
	runCommand("jj", ["config", "set", "--repo", "user.name", "Changeyard Test"], repo);
	runCommand("jj", ["config", "set", "--repo", "user.email", "changeyard-test@example.test"], repo);
	runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
	runCommand("jj", ["config", "set", "--repo", "git.sign-on-push", "false"], repo);
}

function findBookmarkChangeId(bookmarks: Awaited<ReturnType<typeof readJjBookmarks>>, name: string): string {
	const bookmark = bookmarks.find((entry) => entry.name === name);
	assert.ok(bookmark, `Expected bookmark ${name} to exist`);
	return bookmark.changeId;
}

function findChangeDescription(changes: Awaited<ReturnType<typeof readJjChangesForBookmark>>, changeId: string): string {
	const change = changes.find((entry) => entry.changeId === changeId);
	assert.ok(change, `Expected change ${changeId} to exist`);
	return change.description;
}

function initJjRepo(): string {
	const repo = tempRepo();
	runCommand("git", ["init", "-b", "main"], repo);
	configureTestGitIdentity(repo);
	writeFileSync(path.join(repo, "README.md"), "# changeyard\n");
	runCommand("git", ["add", "README.md"], repo);
	runCommand("git", ["commit", "-m", "initial"], repo);
	runCommand("jj", ["git", "init", "--colocate"], repo);
	configureTestJjIdentity(repo);
	runCommand("jj", ["new", "-m", "API change"], repo);
	runCommand("jj", ["bookmark", "create", "feature/api", "-r", "@"], repo);
	return repo;
}

test("preview and apply create_bookmark against a real JJ repo", async () => {
	if (!hasCommand("git") || !hasCommand("jj")) return;
	const repo = initJjRepo();
	try {
		const sourceChangeId = findBookmarkChangeId(await readJjBookmarks(repo, runVcsCommand), "feature/api");
		const operation = {
			kind: "create_bookmark" as const,
			changeId: sourceChangeId,
			bookmarkName: "feature/new-api",
		};

		const preview = await previewJjOperation(repo, operation, runVcsCommand);
		assert.equal(preview.valid, true);
		assert.deepEqual(preview.commands[0], {
			command: "jj",
			args: ["bookmark", "create", "feature/new-api", "-r", sourceChangeId],
		});

		const applied = await applyJjOperation(repo, operation, runVcsCommand);
		assert.equal(applied.ok, true);

		const bookmarks = await readJjBookmarks(repo, runVcsCommand);
		assert.equal(findBookmarkChangeId(bookmarks, "feature/new-api"), sourceChangeId);
	} finally {
		cleanup(repo);
	}
});

test("preview and apply edit_message, undo_last, and redo_last against a real JJ repo", async () => {
	if (!hasCommand("git") || !hasCommand("jj")) return;
	const repo = initJjRepo();
	try {
		const sourceChangeId = findBookmarkChangeId(await readJjBookmarks(repo, runVcsCommand), "feature/api");
		const editOperation = {
			kind: "edit_message" as const,
			changeId: sourceChangeId,
			message: "API change updated",
		};

		const editPreview = await previewJjOperation(repo, editOperation, runVcsCommand);
		assert.equal(editPreview.valid, true);

		const editApplied = await applyJjOperation(repo, editOperation, runVcsCommand);
		assert.equal(editApplied.ok, true);
		assert.equal(
			findChangeDescription(await readJjChangesForBookmark(repo, "feature/api", runVcsCommand), sourceChangeId),
			"API change updated",
		);

		const undoOperation = { kind: "undo_last" as const };
		const undoPreview = await previewJjOperation(repo, undoOperation, runVcsCommand);
		assert.equal(undoPreview.valid, true);
		const undoApplied = await applyJjOperation(repo, undoOperation, runVcsCommand);
		assert.equal(undoApplied.ok, true);
		assert.equal(
			findChangeDescription(await readJjChangesForBookmark(repo, "feature/api", runVcsCommand), sourceChangeId),
			"API change",
		);

		const redoOperation = { kind: "redo_last" as const };
		const redoPreview = await previewJjOperation(repo, redoOperation, runVcsCommand);
		assert.equal(redoPreview.valid, true);
		const redoApplied = await applyJjOperation(repo, redoOperation, runVcsCommand);
		assert.equal(redoApplied.ok, true);
		assert.equal(
			findChangeDescription(await readJjChangesForBookmark(repo, "feature/api", runVcsCommand), sourceChangeId),
			"API change updated",
		);
	} finally {
		cleanup(repo);
	}
});

test("preview and apply restore_file against a real JJ repo", async () => {
	if (!hasCommand("git") || !hasCommand("jj")) return;
	const repo = initJjRepo();
	try {
		writeFileSync(path.join(repo, "README.md"), "# changed\n");
		const operation = {
			kind: "restore_file" as const,
			paths: ["README.md"],
		};

		const preview = await previewJjOperation(repo, operation, runVcsCommand);
		assert.equal(preview.valid, true);
		assert.deepEqual(preview.commands[0], {
			command: "jj",
			args: ["restore", "--", "README.md"],
		});

		const applied = await applyJjOperation(repo, operation, runVcsCommand);
		assert.equal(applied.ok, true);
		assert.equal(readFileSync(path.join(repo, "README.md"), "utf8"), "# changeyard\n");
	} finally {
		cleanup(repo);
	}
});

test("preview and apply create_change against a real JJ repo", async () => {
	if (!hasCommand("git") || !hasCommand("jj")) return;
	const repo = initJjRepo();
	try {
		const sourceChangeId = findBookmarkChangeId(await readJjBookmarks(repo, runVcsCommand), "feature/api");
		const operation = {
			kind: "create_change" as const,
			anchorChangeId: sourceChangeId,
			placement: "after" as const,
			message: "Follow-up change",
		};

		const preview = await previewJjOperation(repo, operation, runVcsCommand);
		assert.equal(preview.valid, true);

		const applied = await applyJjOperation(repo, operation, runVcsCommand);
		assert.equal(applied.ok, true);
	} finally {
		cleanup(repo);
	}
});

test("restore_file integration test leaves no added files behind", async () => {
	if (!hasCommand("git") || !hasCommand("jj")) return;
	const repo = initJjRepo();
	try {
		const scratchPath = path.join(repo, "scratch.txt");
		writeFileSync(scratchPath, "temporary\n");
		const operation = {
			kind: "restore_file" as const,
			paths: ["scratch.txt"],
		};

		const preview = await previewJjOperation(repo, operation, runVcsCommand);
		assert.equal(preview.valid, true);
		const applied = await applyJjOperation(repo, operation, runVcsCommand);
		assert.equal(applied.ok, true);
		assert.equal(existsSync(scratchPath), false);
	} finally {
		cleanup(repo);
	}
});
