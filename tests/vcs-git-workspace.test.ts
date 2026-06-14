import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
	applyGitWorkspaceOperation,
	loadGitWorkspaceDiff,
	loadGitWorkspaceState,
	previewGitWorkspaceOperation,
} from "../src/vcs/git/workspace.js";
import type { VcsCommandRunner } from "../src/vcs/detect.js";
import { runVcsCommand } from "../src/vcs/process.js";

const execFile = promisify(execFileCallback);
const repoRoot = process.cwd();
const gitFixtureScript = path.join(repoRoot, "scripts/create-vcs-git-fixture.ts");

function ok(stdout = "") {
	return { ok: true, stdout, stderr: "", exitCode: 0 };
}

function fail(stderr = "not mocked") {
	return { ok: false, stdout: "", stderr, exitCode: 1 };
}

function createGitRunner(calls: string[] = []): VcsCommandRunner {
	return async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		calls.push(joined);
		switch (joined) {
			case "jj --version":
			case "jj workspace root":
				return fail("jj unavailable");
			case "git rev-parse --show-toplevel":
				return ok("/repo");
			case "git remote":
				return ok("origin");
			case "git remote get-url origin":
				return ok("https://github.com/acme/repo.git");
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return ok("origin/main");
			case "gh auth status --hostname github.com":
				return ok("Logged in");
			case "git rev-parse --verify HEAD":
				return ok("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
			case "git symbolic-ref --quiet --short HEAD":
				return ok("feature/api");
			case "git for-each-ref --format=%(refname:short)\u001f%(objectname)\u001f%(upstream:short) refs/heads/":
				return ok([
					"main\u001faaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\u001forigin/main",
					"feature/api\u001fbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\u001forigin/main",
				].join("\n"));
			case "git log --topo-order --date-order --reverse --format=\u001e%H\u001f%h\u001f%an\u001f%ae\u001f%aI\u001f%s\u001f%P origin/main..main":
				return ok("");
			case "git log --topo-order --date-order --reverse --format=\u001e%H\u001f%h\u001f%an\u001f%ae\u001f%aI\u001f%s\u001f%P origin/main..feature/api":
				return ok("\u001ebbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\u001fbbbbbbb\u001fAda\u001fada@example.com\u001f2026-06-14T09:00:00Z\u001fAPI change\u001faaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
			case "git status --porcelain=v1 -z --untracked-files=all":
				return ok(" M src/api.ts\0A  src/new.ts\0?? tmp.txt\0");
			case "git diff --name-status --find-renames":
				return ok("M\tsrc/api.ts\nA\tsrc/new.ts");
			case "git diff --patch --find-renames --diff-algorithm=histogram":
				return ok("diff --git a/src/api.ts b/src/api.ts\n+change");
			default:
				return fail(joined);
		}
	};
}

function createGitOperationRunner(
	calls: string[] = [],
	options: { dirty?: boolean; switchFails?: boolean; commitFails?: boolean } = {},
): VcsCommandRunner {
	const headHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const parentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
	return async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		calls.push(joined);
		switch (joined) {
			case "jj --version":
			case "jj workspace root":
				return fail("jj unavailable");
			case "git rev-parse --show-toplevel":
				return ok("/repo");
			case "git remote":
				return ok("origin");
			case "git remote get-url origin":
				return ok("https://github.com/acme/repo.git");
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return ok("origin/main");
			case "gh auth status --hostname github.com":
				return ok("Logged in");
			case "git status --porcelain=v1 -z --untracked-files=all":
				return ok(options.dirty ? " M src/api.ts\0" : "");
			case "git status --porcelain=v1 -z --untracked-files=all -- src/api.ts":
				return ok(" M src/api.ts\0");
			case "git status --porcelain=v1 -z --untracked-files=all -- tmp.txt":
				return ok("?? tmp.txt\0");
			case "git rev-parse --verify HEAD":
				return ok(headHash);
			case `git rev-parse --verify ${headHash}^{commit}`:
				return ok(headHash);
			case `git rev-parse --verify ${parentHash}^{commit}`:
				return ok(parentHash);
			case `git rev-parse --verify ${headHash}^`:
				return ok(parentHash);
			case "git diff --cached --quiet":
				return ok("");
			case "git log -1 --format=%B HEAD":
			case `git log -1 --format=%B ${headHash}`:
				return ok("API change");
			case `git diff-tree --no-commit-id --name-only -r ${headHash}`:
				return ok("package.json\nsrc/api.ts");
			case "git show-ref --verify --quiet refs/heads/feature/api":
			case "git show-ref --verify --quiet refs/heads/main":
				return ok("");
			case "git switch feature/api":
			case "git switch main":
				return options.switchFails ? fail("switch failed") : ok("");
			case "git commit --amend --no-edit":
			case "git add -- src/api.ts":
				return ok("");
			case "git commit --amend -m Refine API change":
				return options.commitFails ? fail("amend failed") : ok("");
			case "git reset --soft HEAD^":
			case "git restore --staged -- package.json":
			case "git restore --staged -- src/api.ts":
			case `git update-ref refs/changeyard/recovery/${headHash.slice(0, 12)} ${headHash}`:
				return ok("");
			case "git restore --staged --worktree -- src/api.ts":
			case "git add -- src/api.ts":
			case "git commit -m API change":
			case "git clean -f -- tmp.txt":
			case "git apply --reverse --whitespace=nowarn -":
				return ok("");
			case "git diff --patch --find-renames --diff-algorithm=histogram -- src/api.ts":
				return ok([
					"diff --git a/src/api.ts b/src/api.ts",
					"index 1111111..2222222 100644",
					"--- a/src/api.ts",
					"+++ b/src/api.ts",
					"@@ -1,2 +1,2 @@",
					" export function api() {",
					"-  return 'old';",
					"+  return 'new';",
					" }",
				].join("\n"));
			default:
				return fail(joined);
		}
	};
}

const realGitRunner: VcsCommandRunner = async ({ command, args, cwd }) => {
	try {
		const result = await execFile(command, args, {
			cwd,
			encoding: "utf8",
			maxBuffer: 10 * 1024 * 1024,
			env: {
				...process.env,
				GIT_TERMINAL_PROMPT: "0",
			},
		});
		return {
			ok: true,
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: 0,
		};
	} catch (error) {
		const failure = error as Error & { stdout?: string; stderr?: string; code?: number };
		return {
			ok: false,
			stdout: failure.stdout ?? "",
			stderr: failure.stderr ?? failure.message,
			exitCode: typeof failure.code === "number" ? failure.code : 1,
		};
	}
};

async function createRealGitFixture(options: { clean?: boolean } = {}) {
	const tempDir = await mkdtemp(path.join(tmpdir(), "changeyard-vcs-git-"));
	const repoPath = path.join(tempDir, "repo");
	const args = ["--import", "tsx", gitFixtureScript, repoPath, "--force", "--json"];
	if (options.clean) {
		args.push("--clean");
	}
	const result = await execFile("node", args, {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});
	const fixture = JSON.parse(result.stdout) as { repoPath: string; targetBranch: string };
	return { tempDir, fixture };
}

test("loadGitWorkspaceState maps local branches into neutral stacks", async () => {
	const calls: string[] = [];
	const state = await loadGitWorkspaceState("/repo", createGitRunner(calls), {
		targetBranch: "origin/main",
	});

	assert.equal(state.provider, "git");
	assert.equal(state.targetRef, "origin/main");
	assert.equal(state.headId, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
	assert.deepEqual(state.appliedStackIds, ["feature/api"]);
	assert.equal(state.stacks.length, 2);
	const featureStack = state.stacks.find((stack) => stack.stackId === "feature/api");
	assert.ok(featureStack);
	assert.equal(featureStack.isApplied, true);
	assert.equal(featureStack.isCurrent, true);
	assert.equal(featureStack.commits.length, 1);
	assert.equal(featureStack.commits[0]?.commitId, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
	assert.deepEqual(featureStack.commits[0]?.parentCommitIds, ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]);
	assert.equal(state.workingCopy.summary.modified, 1);
	assert.equal(state.workingCopy.summary.added, 1);
	assert.equal(state.workingCopy.summary.unknown, 1);
	assert.deepEqual(state.workingCopy.files.map((file) => [file.path, file.status]), [
		["src/api.ts", "modified"],
		["src/new.ts", "added"],
		["tmp.txt", "unknown"],
	]);
	assert.ok(calls.includes("git status --porcelain=v1 -z --untracked-files=all"));
});

test("loadGitWorkspaceState reports Git conflict mode from unmerged porcelain status", async () => {
	const calls: string[] = [];
	const runner = createGitRunner(calls);
	const state = await loadGitWorkspaceState(
		"/repo",
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			if (joined === "git status --porcelain=v1 -z --untracked-files=all") {
				return ok("UU src/api.ts\0");
			}
			return runner(input);
		},
		{ targetBranch: "origin/main" },
	);

	assert.equal(state.mode, "conflicted");
	assert.equal(state.workingCopy.hasConflicts, true);
	assert.deepEqual(state.workingCopy.files.map((file) => [file.path, file.status]), [["src/api.ts", "unknown"]]);
	assert.equal(state.conflicts.length, 1);
	assert.equal(state.conflicts[0]?.path, "src/api.ts");
	assert.match(state.conflicts[0]?.message ?? "", /UU conflict/);
});

test("loadGitWorkspaceDiff returns neutral patch and file summary", async () => {
	const diff = await loadGitWorkspaceDiff("/repo", createGitRunner());

	assert.equal(diff.ok, true);
	assert.match(diff.patch, /diff --git/);
	assert.deepEqual(diff.files.map((file) => [file.path, file.status]), [
		["src/api.ts", "modified"],
		["src/new.ts", "added"],
	]);
});

test("previewGitWorkspaceOperation blocks Git stack checkout with dirty worktree", async () => {
	const preview = await previewGitWorkspaceOperation(
		"/repo",
		{ operation: { kind: "apply_stack", stackId: "feature/api" } },
		createGitOperationRunner([], { dirty: true }),
		{ targetBranch: "origin/main" },
	);

	assert.equal(preview.valid, false);
	assert.match(preview.disabledReason ?? "", /commit or stash/i);
});

test("previewGitWorkspaceOperation allows rewording the current Git HEAD commit", async () => {
	const headHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const preview = await previewGitWorkspaceOperation(
		"/repo",
		{ operation: { kind: "reword_commit", commitId: headHash, message: "Refine API change" } },
		createGitOperationRunner(),
		{ targetBranch: "origin/main" },
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "reword_commit");
	assert.deepEqual(preview.affectedCommitIds, [headHash]);
});

test("previewGitWorkspaceOperation rejects non-HEAD Git commit edits", async () => {
	const parentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
	const preview = await previewGitWorkspaceOperation(
		"/repo",
		{ operation: { kind: "reword_commit", commitId: parentHash, message: "Refine parent" } },
		createGitOperationRunner(),
		{ targetBranch: "origin/main" },
	);

	assert.equal(preview.valid, false);
	assert.match(preview.disabledReason ?? "", /HEAD commit only/i);
	assert.deepEqual(preview.affectedCommitIds, [parentHash]);
});

test("previewGitWorkspaceOperation validates clean checkout without switching branches", async () => {
	const calls: string[] = [];
	const preview = await previewGitWorkspaceOperation(
		"/repo",
		{ operation: { kind: "apply_stack", stackId: "feature/api" } },
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "apply_stack");
	assert.ok(calls.includes("git show-ref --verify --quiet refs/heads/feature/api"));
	assert.ok(!calls.some((call) => call.startsWith("git switch ")));
	assert.ok(!calls.some((call) => call.startsWith("git restore ")));
});

test("applyGitWorkspaceOperation switches to a local branch stack when clean", async () => {
	const calls: string[] = [];
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{ operation: { kind: "apply_stack", stackId: "feature/api" } },
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "apply_stack");
	assert.ok(calls.includes("git switch feature/api"));
});

test("applyGitWorkspaceOperation rewords the current Git HEAD commit", async () => {
	const calls: string[] = [];
	const headHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{ operation: { kind: "reword_commit", commitId: headHash, message: "Refine API change" } },
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "reword_commit");
	assert.deepEqual(result.affectedCommitIds, [headHash]);
	assert.ok(calls.includes("git diff --cached --quiet"));
	assert.ok(calls.includes("git commit --amend -m Refine API change"));
});

test("applyGitWorkspaceOperation returns recovery instructions when Git reword fails", async () => {
	const headHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{ operation: { kind: "reword_commit", commitId: headHash, message: "Refine API change" } },
		createGitOperationRunner([], { commitFails: true }),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, false);
	assert.equal(result.operation.kind, "reword_commit");
	assert.match(result.summary, /amend failed/i);
	assert.match(result.recovery?.instructions.join("\n") ?? "", /retry the workspace operation/i);
});

test("applyGitWorkspaceOperation amends selected paths into the current Git HEAD commit", async () => {
	const calls: string[] = [];
	const headHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "amend_commit",
				commitId: headHash,
				selection: { source: "working_copy", paths: ["src/api.ts"] },
			},
		},
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "amend_commit");
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("git add -- src/api.ts"));
	assert.ok(calls.includes("git commit --amend --no-edit"));
});

test("applyGitWorkspaceOperation uncommits selected paths from the current Git HEAD commit", async () => {
	const calls: string[] = [];
	const headHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "uncommit_changes",
				selection: { source: "commit", commitId: headHash, paths: ["package.json"] },
			},
		},
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "uncommit_changes");
	assert.deepEqual(result.affectedPaths, ["package.json"]);
	assert.match(result.recovery?.instructions.join("\n") ?? "", new RegExp(`refs/changeyard/recovery/${headHash.slice(0, 12)}`));
	assert.ok(calls.includes(`git update-ref refs/changeyard/recovery/${headHash.slice(0, 12)} ${headHash}`));
	assert.ok(calls.includes("git reset --soft HEAD^"));
	assert.ok(calls.includes("git restore --staged -- package.json"));
});

test("previewGitWorkspaceOperation allows moving selected HEAD paths into the direct parent", async () => {
	const headHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const parentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
	const preview = await previewGitWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "move_changes",
				targetCommitId: parentHash,
				selection: { source: "commit", commitId: headHash, paths: ["package.json"] },
			},
		},
		createGitOperationRunner(),
		{ targetBranch: "origin/main" },
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "move_changes");
	assert.deepEqual(preview.affectedCommitIds, [headHash, parentHash]);
	assert.deepEqual(preview.affectedPaths, ["package.json"]);
	assert.match(preview.summary, /Move 1 selected path/i);
});

test("applyGitWorkspaceOperation moves selected HEAD paths into the direct parent", async () => {
	const calls: string[] = [];
	const headHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
	const parentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "move_changes",
				targetCommitId: parentHash,
				selection: { source: "commit", commitId: headHash, paths: ["package.json"] },
			},
		},
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "move_changes");
	assert.deepEqual(result.affectedPaths, ["package.json"]);
	assert.match(result.recovery?.instructions.join("\n") ?? "", new RegExp(`refs/changeyard/recovery/${headHash.slice(0, 12)}`));
	assert.ok(calls.includes(`git update-ref refs/changeyard/recovery/${headHash.slice(0, 12)} ${headHash}`));
	assert.ok(calls.includes("git reset --soft HEAD^"));
	assert.ok(calls.includes("git restore --staged -- src/api.ts"));
	assert.ok(calls.includes("git commit --amend --no-edit"));
	assert.ok(calls.includes("git add -- src/api.ts"));
	assert.ok(calls.includes("git commit -m API change"));
});

test("applyGitWorkspaceOperation returns recovery instructions when branch switch fails", async () => {
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{ operation: { kind: "apply_stack", stackId: "feature/api" } },
		createGitOperationRunner([], { switchFails: true }),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, false);
	assert.equal(result.operation.kind, "apply_stack");
	assert.match(result.summary, /switch failed/i);
	assert.match(result.recovery?.instructions.join("\n") ?? "", /retry the workspace operation/i);
});

test("applyGitWorkspaceOperation unapplies to the local target branch", async () => {
	const calls: string[] = [];
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{ operation: { kind: "unapply_stack", stackId: "feature/api" } },
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "unapply_stack");
	assert.ok(calls.includes("git show-ref --verify --quiet refs/heads/main"));
	assert.ok(calls.includes("git switch main"));
});

test("applyGitWorkspaceOperation restores selected tracked working-copy paths", async () => {
	const calls: string[] = [];
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "restore_changes",
				selection: { source: "working_copy", paths: ["src/api.ts"] },
			},
		},
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, true);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("git restore --staged --worktree -- src/api.ts"));
});

test("previewGitWorkspaceOperation allows selected working-copy hunk restore", async () => {
	const calls: string[] = [];
	const preview = await previewGitWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "restore_changes",
				selection: {
					source: "working_copy",
					hunks: [{ path: "src/api.ts", hunkId: "src/api.ts:1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(preview.valid, true);
	assert.deepEqual(preview.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("git diff --patch --find-renames --diff-algorithm=histogram -- src/api.ts"));
	assert.ok(!calls.includes("git apply --reverse --whitespace=nowarn -"));
});

test("applyGitWorkspaceOperation restores selected working-copy hunks with reverse patch apply", async () => {
	const calls: string[] = [];
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "discard_changes",
				selection: {
					source: "working_copy",
					hunks: [{ path: "src/api.ts", hunkId: "1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, true);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("git diff --patch --find-renames --diff-algorithm=histogram -- src/api.ts"));
	assert.ok(calls.includes("git apply --reverse --whitespace=nowarn -"));
});

test("previewGitWorkspaceOperation rejects untracked-file restore", async () => {
	const preview = await previewGitWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "restore_changes",
				selection: { source: "working_copy", paths: ["tmp.txt"] },
			},
		},
		createGitOperationRunner(),
		{ targetBranch: "origin/main" },
	);

	assert.equal(preview.valid, false);
	assert.match(preview.disabledReason ?? "", /untracked files/i);
});

test("applyGitWorkspaceOperation discards selected untracked Git files", async () => {
	const calls: string[] = [];
	const result = await applyGitWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "discard_changes",
				selection: { source: "working_copy", paths: ["tmp.txt"] },
			},
		},
		createGitOperationRunner(calls),
		{ targetBranch: "origin/main" },
	);

	assert.equal(result.ok, true);
	assert.deepEqual(result.affectedPaths, ["tmp.txt"]);
	assert.ok(calls.includes("git clean -f -- tmp.txt"));
});

test("normal Git fixture loads state and safely switches stacks", async () => {
	const dirtyFixture = await createRealGitFixture();
	try {
		const dirtyState = await loadGitWorkspaceState(dirtyFixture.fixture.repoPath, realGitRunner, {
			targetBranch: dirtyFixture.fixture.targetBranch,
		});
		assert.equal(dirtyState.provider, "git");
		assert.equal(dirtyState.targetRef, "origin/main");
		assert.deepEqual(dirtyState.appliedStackIds, ["main"]);
		assert.ok(dirtyState.stacks.some((stack) => stack.stackId === "feature/export-json"));
		assert.ok(dirtyState.workingCopy.files.some((file) => file.path === "README.md" && file.status === "modified"));

		const blockedPreview = await previewGitWorkspaceOperation(
			dirtyFixture.fixture.repoPath,
			{ operation: { kind: "apply_stack", stackId: "feature/export-json" } },
			realGitRunner,
			{ targetBranch: dirtyFixture.fixture.targetBranch },
		);
		assert.equal(blockedPreview.valid, false);
		assert.match(blockedPreview.disabledReason ?? "", /commit or stash/i);
	} finally {
		await rm(dirtyFixture.tempDir, { recursive: true, force: true });
	}

	const cleanFixture = await createRealGitFixture({ clean: true });
	try {
		const applyResult = await applyGitWorkspaceOperation(
			cleanFixture.fixture.repoPath,
			{ operation: { kind: "apply_stack", stackId: "feature/export-json" } },
			realGitRunner,
			{ targetBranch: cleanFixture.fixture.targetBranch },
		);
		assert.equal(applyResult.ok, true);
		const appliedState = await loadGitWorkspaceState(cleanFixture.fixture.repoPath, realGitRunner, {
			targetBranch: cleanFixture.fixture.targetBranch,
		});
		assert.deepEqual(appliedState.appliedStackIds, ["feature/export-json"]);
		const appliedStack = appliedState.stacks.find((stack) => stack.stackId === "feature/export-json");
		const headCommit = appliedStack?.commits.at(-1);
		assert.ok(headCommit);
		const rewordResult = await applyGitWorkspaceOperation(
			cleanFixture.fixture.repoPath,
			{ operation: { kind: "reword_commit", commitId: headCommit.commitId, message: "add serde task serialization updated" } },
			realGitRunner,
			{ targetBranch: cleanFixture.fixture.targetBranch },
		);
		assert.equal(rewordResult.ok, true);
		const rewordedState = await loadGitWorkspaceState(cleanFixture.fixture.repoPath, realGitRunner, {
			targetBranch: cleanFixture.fixture.targetBranch,
		});
		assert.equal(
			rewordedState.stacks.find((stack) => stack.stackId === "feature/export-json")?.commits.at(-1)?.title,
			"add serde task serialization updated",
		);

		const unapplyResult = await applyGitWorkspaceOperation(
			cleanFixture.fixture.repoPath,
			{ operation: { kind: "unapply_stack", stackId: "feature/export-json" } },
			realGitRunner,
			{ targetBranch: cleanFixture.fixture.targetBranch },
		);
		assert.equal(unapplyResult.ok, true);
			const unappliedState = await loadGitWorkspaceState(cleanFixture.fixture.repoPath, realGitRunner, {
				targetBranch: cleanFixture.fixture.targetBranch,
			});
			assert.deepEqual(unappliedState.appliedStackIds, ["main"]);

			const reapplyResult = await applyGitWorkspaceOperation(
				cleanFixture.fixture.repoPath,
				{ operation: { kind: "apply_stack", stackId: "feature/export-json" } },
				realGitRunner,
				{ targetBranch: cleanFixture.fixture.targetBranch },
			);
			assert.equal(reapplyResult.ok, true);
			const reappliedState = await loadGitWorkspaceState(cleanFixture.fixture.repoPath, realGitRunner, {
				targetBranch: cleanFixture.fixture.targetBranch,
			});
			const reappliedHead = reappliedState.stacks.find((stack) => stack.stackId === "feature/export-json")?.commits.at(-1);
			assert.ok(reappliedHead);
			const uncommitResult = await applyGitWorkspaceOperation(
				cleanFixture.fixture.repoPath,
				{
					operation: {
						kind: "uncommit_changes",
						selection: { source: "commit", commitId: reappliedHead.commitId, paths: ["package.json"] },
					},
				},
				realGitRunner,
				{ targetBranch: cleanFixture.fixture.targetBranch },
			);
			assert.equal(uncommitResult.ok, true);
			const uncommittedState = await loadGitWorkspaceState(cleanFixture.fixture.repoPath, realGitRunner, {
				targetBranch: cleanFixture.fixture.targetBranch,
			});
			assert.ok(uncommittedState.workingCopy.files.some((file) => file.path === "package.json"));
		} finally {
			await rm(cleanFixture.tempDir, { recursive: true, force: true });
		}
});

test("real Git hunk discard restores only the selected working-copy hunk", async () => {
	const tempDir = await mkdtemp(path.join(tmpdir(), "changeyard-vcs-git-hunk-"));
	try {
		await execFile("git", ["init"], { cwd: tempDir });
		await execFile("git", ["config", "user.name", "Ada"], { cwd: tempDir });
		await execFile("git", ["config", "user.email", "ada@example.com"], { cwd: tempDir });
		await execFile("git", ["config", "commit.gpgsign", "false"], { cwd: tempDir });
		const filePath = path.join(tempDir, "notes.txt");
		const originalLines = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`);
		await writeFile(filePath, `${originalLines.join("\n")}\n`, "utf8");
		await execFile("git", ["add", "notes.txt"], { cwd: tempDir });
		await execFile("git", ["commit", "-m", "initial notes"], { cwd: tempDir });
		const modifiedLines = [...originalLines];
		modifiedLines[1] = "line 2 changed";
		modifiedLines[19] = "line 20 changed";
		await writeFile(filePath, `${modifiedLines.join("\n")}\n`, "utf8");
		const diff = await execFile("git", ["diff", "--patch", "--find-renames", "--diff-algorithm=histogram", "--", "notes.txt"], {
			cwd: tempDir,
			encoding: "utf8",
		});
		const firstHunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/m.exec(diff.stdout);
		assert.ok(firstHunk);
		const result = await applyGitWorkspaceOperation(
			tempDir,
			{
				operation: {
					kind: "discard_changes",
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
			{ targetBranch: "main" },
		);
		assert.equal(result.ok, true);
		const content = await readFile(filePath, "utf8");
		assert.match(content, /line 2\n/);
		assert.match(content, /line 20 changed\n/);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
});
