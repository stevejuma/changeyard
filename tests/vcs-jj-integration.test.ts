import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyJjOperation } from "../src/vcs/jj/apply.js";
import { previewJjOperation } from "../src/vcs/jj/preview.js";
import { readJjBookmarks, readJjChangesForBookmark } from "../src/vcs/jj/read.js";
import { applyJjWorkspaceOperation } from "../src/vcs/jj/workspace.js";
import { runVcsCommand } from "../src/vcs/process.js";

function tempRepo(): string {
	return mkdtempSync(path.join(os.tmpdir(), "changeyard-vcs-jj-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

function runCommand(command: string, args: string[], cwd: string): string {
	const nextArgs = normalizeCommandArgs(command, args);
	const result = spawnSync(command, nextArgs, { cwd, encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "command failed").toString().trim()}`);
	}
	return (result.stdout || "").trim();
}

function normalizeCommandArgs(command: string, args: string[]): string[] {
	if (command === "git") {
		return [
			"-c",
			"commit.gpgsign=false",
			"-c",
			"tag.gpgsign=false",
			...(args[0] === "commit" ? ["commit", "--no-gpg-sign", ...args.slice(1)] : args),
		];
	}
	if (command !== "jj") {
		return args;
	}
	return ["--color=never", ...stripJjColorArgs(args)];
}

function stripJjColorArgs(args: string[]): string[] {
	const next: string[] = [];
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--color") {
			index++;
			continue;
		}
		if (arg.startsWith("--color=")) {
			continue;
		}
		next.push(arg);
	}
	return next;
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
			findChangeDescription(await readJjChangesForBookmark(repo, "feature/api", runVcsCommand), sourceChangeId).trimEnd(),
			"API change updated",
		);

		const undoOperation = { kind: "undo_last" as const };
		const undoPreview = await previewJjOperation(repo, undoOperation, runVcsCommand);
		assert.equal(undoPreview.valid, true);
		const undoApplied = await applyJjOperation(repo, undoOperation, runVcsCommand);
		assert.equal(undoApplied.ok, true);
		assert.equal(
			findChangeDescription(await readJjChangesForBookmark(repo, "feature/api", runVcsCommand), sourceChangeId).trimEnd(),
			"API change",
		);

		const redoOperation = { kind: "redo_last" as const };
		const redoPreview = await previewJjOperation(repo, redoOperation, runVcsCommand);
		assert.equal(redoPreview.valid, true);
		const redoApplied = await applyJjOperation(repo, redoOperation, runVcsCommand);
		assert.equal(redoApplied.ok, true);
		assert.equal(
			findChangeDescription(await readJjChangesForBookmark(repo, "feature/api", runVcsCommand), sourceChangeId).trimEnd(),
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

test("workspace hunk restore against a real JJ repo restores only the selected hunk", async () => {
	if (!hasCommand("git") || !hasCommand("jj")) return;
	const repo = tempRepo();
	try {
		runCommand("git", ["init", "-b", "main"], repo);
		configureTestGitIdentity(repo);
		const notesPath = path.join(repo, "notes.txt");
		const originalLines = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`);
		writeFileSync(notesPath, `${originalLines.join("\n")}\n`);
		runCommand("git", ["add", "notes.txt"], repo);
		runCommand("git", ["commit", "-m", "initial notes"], repo);
		runCommand("jj", ["git", "init", "--colocate"], repo);
		configureTestJjIdentity(repo);
		runCommand("jj", ["new", "-m", "working changes"], repo);
		const modifiedLines = [...originalLines];
		modifiedLines[1] = "line 2 changed";
		modifiedLines[19] = "line 20 changed";
		writeFileSync(notesPath, `${modifiedLines.join("\n")}\n`);

		const patch = runCommand("jj", ["diff", "--git", "--color=never", "--", "notes.txt"], repo);
		const firstHunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/m.exec(patch);
		assert.ok(firstHunk);
		const result = await applyJjWorkspaceOperation(
			repo,
			{
				operation: {
					kind: "restore_changes",
					selection: {
						source: "working_copy",
						hunks: [
							{
								path: "notes.txt",
								hunkId: `notes.txt:${firstHunk[1]}:${firstHunk[2] ?? "1"}:${firstHunk[3]}:${firstHunk[4] ?? "1"}`,
								oldStart: Number.parseInt(firstHunk[1] ?? "0", 10),
								oldLines: Number.parseInt(firstHunk[2] ?? "1", 10),
								newStart: Number.parseInt(firstHunk[3] ?? "0", 10),
								newLines: Number.parseInt(firstHunk[4] ?? "1", 10),
							},
						],
					},
				},
			},
			runVcsCommand,
		);

		assert.equal(result.ok, true);
		const content = readFileSync(notesPath, "utf8");
		assert.match(content, /line 2\n/);
		assert.match(content, /line 20 changed\n/);
	} finally {
		cleanup(repo);
	}
});

test("workspace stack membership against a real JJ repo rebases working-copy parents", async () => {
	if (!hasCommand("git") || !hasCommand("jj")) return;
	const repo = tempRepo();
	try {
		runCommand("git", ["init", "-b", "main"], repo);
		configureTestGitIdentity(repo);
		runCommand("jj", ["git", "init", "--colocate"], repo);
		configureTestJjIdentity(repo);
		writeFileSync(path.join(repo, "base.txt"), "base\n");
		runCommand("jj", ["file", "track", "base.txt"], repo);
		runCommand("jj", ["commit", "-m", "base"], repo);
		runCommand("jj", ["new", "-m", "feature stack"], repo);
		writeFileSync(path.join(repo, "feature.txt"), "feature\n");
		runCommand("jj", ["file", "track", "feature.txt"], repo);
		runCommand("jj", ["commit", "-m", "feature stack"], repo);
		const featureChangeId = runCommand("jj", ["log", "-r", "@-", "--no-graph", "-T", "change_id.short()"], repo);
		runCommand("jj", ["bookmark", "create", "feature/stack", "-r", featureChangeId], repo);
		runCommand("jj", ["edit", "@--"], repo);
		writeFileSync(path.join(repo, "wip.txt"), "wip\n");
		runCommand("jj", ["file", "track", "wip.txt"], repo);
		const workingCopyChangeId = runCommand("jj", ["log", "-r", "@", "--no-graph", "-T", "change_id.short()"], repo);

		const applyResult = await applyJjWorkspaceOperation(
			repo,
			{ operation: { kind: "apply_stack", stackId: "feature/stack" } },
			runVcsCommand,
		);

		assert.equal(applyResult.ok, true);
		assert.deepEqual(applyResult.affectedCommitIds, [featureChangeId]);
		assert.equal(runCommand("jj", ["log", "-r", "@", "--no-graph", "-T", "change_id.short()"], repo), workingCopyChangeId);
		const appliedParents = runCommand("jj", ["log", "-r", "@-", "--no-graph", "-T", "change_id.short() ++ \"\\n\""], repo);
		assert.match(appliedParents, new RegExp(featureChangeId));
		assert.equal(readFileSync(path.join(repo, "feature.txt"), "utf8"), "feature\n");
		assert.equal(readFileSync(path.join(repo, "wip.txt"), "utf8"), "wip\n");

		const unapplyResult = await applyJjWorkspaceOperation(
			repo,
			{ operation: { kind: "unapply_stack", stackId: "feature/stack" } },
			runVcsCommand,
		);

		assert.equal(unapplyResult.ok, true);
		assert.deepEqual(unapplyResult.affectedCommitIds, [featureChangeId]);
		assert.equal(runCommand("jj", ["log", "-r", "@", "--no-graph", "-T", "change_id.short()"], repo), workingCopyChangeId);
		const unappliedParents = runCommand("jj", ["log", "-r", "@-", "--no-graph", "-T", "change_id.short() ++ \"\\n\""], repo);
		assert.doesNotMatch(unappliedParents, new RegExp(featureChangeId));
		assert.equal(existsSync(path.join(repo, "feature.txt")), false);
		assert.equal(readFileSync(path.join(repo, "wip.txt"), "utf8"), "wip\n");
	} finally {
		cleanup(repo);
	}
});

test("workspace committed hunk move against a real JJ repo moves only the selected hunk", async () => {
	if (!hasCommand("git") || !hasCommand("jj")) return;
	const repo = tempRepo();
	try {
		runCommand("git", ["init", "-b", "main"], repo);
		configureTestGitIdentity(repo);
		runCommand("jj", ["git", "init", "--colocate"], repo);
		configureTestJjIdentity(repo);
		const notesPath = path.join(repo, "notes.txt");
		const originalLines = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`);
		writeFileSync(notesPath, `${originalLines.join("\n")}\n`);
		runCommand("jj", ["file", "track", "notes.txt"], repo);
		runCommand("jj", ["commit", "-m", "base notes"], repo);
		const modifiedLines = [...originalLines];
		modifiedLines[1] = "line 2 changed";
		modifiedLines[19] = "line 20 changed";
		writeFileSync(notesPath, `${modifiedLines.join("\n")}\n`);
		runCommand("jj", ["commit", "-m", "source hunks"], repo);
		const sourceChangeId = runCommand("jj", ["log", "-r", "@-", "--no-graph", "-T", "change_id.short()"], repo);
		const targetChangeId = runCommand("jj", ["log", "-r", "@--", "--no-graph", "-T", "change_id.short()"], repo);
		runCommand("jj", ["bookmark", "create", "feature/source-hunks", "-r", sourceChangeId], repo);

		const patch = runCommand("jj", ["diff", "--git", "--color=never", "-r", sourceChangeId, "--", "notes.txt"], repo);
		const firstHunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/m.exec(patch);
		assert.ok(firstHunk);
		const result = await applyJjWorkspaceOperation(
			repo,
			{
				operation: {
					kind: "move_changes",
					targetCommitId: targetChangeId,
					selection: {
						source: "commit",
						commitId: sourceChangeId,
						hunks: [
							{
								path: "notes.txt",
								hunkId: `notes.txt:${firstHunk[1]}:${firstHunk[2] ?? "1"}:${firstHunk[3]}:${firstHunk[4] ?? "1"}`,
								oldStart: Number.parseInt(firstHunk[1] ?? "0", 10),
								oldLines: Number.parseInt(firstHunk[2] ?? "1", 10),
								newStart: Number.parseInt(firstHunk[3] ?? "0", 10),
								newLines: Number.parseInt(firstHunk[4] ?? "1", 10),
							},
						],
					},
				},
			},
			runVcsCommand,
		);

		assert.equal(result.ok, true);
		const targetContent = runCommand("jj", ["file", "show", "-r", targetChangeId, "notes.txt"], repo);
		assert.match(targetContent, /line 2 changed/);
		assert.match(targetContent, /line 20\n/);
		const remainingSourceDiff = runCommand("jj", ["diff", "--git", "--color=never", "-r", sourceChangeId, "--", "notes.txt"], repo);
		assert.doesNotMatch(remainingSourceDiff, /line 2 changed/);
		assert.match(remainingSourceDiff, /line 20 changed/);
	} finally {
		cleanup(repo);
	}
});

test("workspace committed hunk discard against a real JJ repo removes only the selected hunk", async () => {
	if (!hasCommand("git") || !hasCommand("jj")) return;
	const repo = tempRepo();
	try {
		runCommand("git", ["init", "-b", "main"], repo);
		configureTestGitIdentity(repo);
		runCommand("jj", ["git", "init", "--colocate"], repo);
		configureTestJjIdentity(repo);
		const notesPath = path.join(repo, "notes.txt");
		const originalLines = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`);
		writeFileSync(notesPath, `${originalLines.join("\n")}\n`);
		runCommand("jj", ["file", "track", "notes.txt"], repo);
		runCommand("jj", ["commit", "-m", "base notes"], repo);
		const modifiedLines = [...originalLines];
		modifiedLines[1] = "line 2 changed";
		modifiedLines[19] = "line 20 changed";
		writeFileSync(notesPath, `${modifiedLines.join("\n")}\n`);
		runCommand("jj", ["commit", "-m", "source hunks"], repo);
		const sourceChangeId = runCommand("jj", ["log", "-r", "@-", "--no-graph", "-T", "change_id.short()"], repo);
		runCommand("jj", ["bookmark", "create", "feature/source-hunks", "-r", sourceChangeId], repo);

		const patch = runCommand("jj", ["diff", "--git", "--color=never", "-r", sourceChangeId, "--", "notes.txt"], repo);
		const firstHunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/m.exec(patch);
		assert.ok(firstHunk);
		const result = await applyJjWorkspaceOperation(
			repo,
			{
				operation: {
					kind: "discard_changes",
					selection: {
						source: "commit",
						commitId: sourceChangeId,
						hunks: [
							{
								path: "notes.txt",
								hunkId: `notes.txt:${firstHunk[1]}:${firstHunk[2] ?? "1"}:${firstHunk[3]}:${firstHunk[4] ?? "1"}`,
								oldStart: Number.parseInt(firstHunk[1] ?? "0", 10),
								oldLines: Number.parseInt(firstHunk[2] ?? "1", 10),
								newStart: Number.parseInt(firstHunk[3] ?? "0", 10),
								newLines: Number.parseInt(firstHunk[4] ?? "1", 10),
							},
						],
					},
				},
			},
			runVcsCommand,
		);

		assert.equal(result.ok, true);
		const remainingSourceDiff = runCommand("jj", ["diff", "--git", "--color=never", "-r", sourceChangeId, "--", "notes.txt"], repo);
		assert.doesNotMatch(remainingSourceDiff, /line 2 changed/);
		assert.match(remainingSourceDiff, /line 20 changed/);
		const visibleDescriptions = runCommand("jj", ["log", "--no-graph", "-T", "description.first_line() ++ \"\\n\""], repo);
		assert.doesNotMatch(visibleDescriptions, /changeyard discard selected hunks/);
	} finally {
		cleanup(repo);
	}
});
