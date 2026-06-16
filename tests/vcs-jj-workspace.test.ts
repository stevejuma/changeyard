import assert from "node:assert/strict";
import test from "node:test";
import {
	applyJjWorkspaceOperation,
	loadJjWorkspaceState,
	previewJjWorkspaceOperation,
} from "../src/vcs/jj/workspace.js";
import type { VcsCommandRunner } from "../src/vcs/detect.js";
import type { NeutralOperationRequest } from "../src/vcs/workspace-types.js";

function ok(stdout = "") {
	return { ok: true, stdout, stderr: "", exitCode: 0 };
}

function fail(stderr = "not mocked") {
	return { ok: false, stdout: "", stderr, exitCode: 1 };
}

function createStateRunner(calls: string[] = []): VcsCommandRunner {
	return async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		calls.push(joined);
		if (
			joined.startsWith("jj bookmark list --all-remotes --ignore-working-copy --at-op=@ --revisions all() ~ ::main@origin --template ") ||
			joined.startsWith("jj bookmark list --all-remotes --ignore-working-copy --at-op=@ --revisions all() ~ ::trunk() --template ")
		) {
			return ok([
				"feature/api\t\tapi222\t22222222\t1\t0",
				"feature/api\tgit\tapi222\t22222222\t1\t1",
				"feature/api\torigin\tapi222\t22222222\t1\t1",
			].join("\n"));
		}
		if (joined.startsWith('jj log --ignore-working-copy --at-op=@ --revisions (::"feature/api")')) {
			return ok([
				"root111\t11111111\tMain\tAlice\talice@example.com\t2026-01-01T10:00:00Z\t\tmain\tmain@origin\t0",
				[
					"api222",
					"22222222",
					JSON.stringify("API change\n\nDetailed PR body\n- keeps markdown"),
					"Bob",
					"bob@example.com",
					"2026-01-01T11:00:00Z",
					"root111",
					"feature/api",
					"feature/api@origin",
					"1",
				].join("\t"),
			].join("\n"));
		}
		switch (joined) {
			case "jj --version":
				return ok("jj 0.39.0");
			case "jj workspace root":
				return ok("/repo");
			case "git rev-parse --show-toplevel":
				return ok("/repo");
			case "jj bookmark list --ignore-working-copy --at-op=@ -r @":
				return ok("feature/api: api222 22222222");
			case "jj log --ignore-working-copy --at-op=@ -r @ --no-graph -T change_id.short()":
				return ok("api222");
			case 'jj log --ignore-working-copy --no-graph -r @- -T change_id.short() ++ "\\n"':
				return ok("root111");
			case "jj log --ignore-working-copy --no-graph -r api222- -T change_id.short()":
				return ok("root111");
			case "git remote":
				return ok("origin");
			case "git remote get-url origin":
				return ok("https://github.com/acme/repo.git");
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return ok("origin/main");
			case "gh auth status --hostname github.com":
				return ok("Logged in");
			case 'jj bookmark list --ignore-working-copy --at-op=@ --revisions all() ~ ::main@origin --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
			case 'jj bookmark list --ignore-working-copy --at-op=@ --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return ok("feature/api\tapi222\t22222222\t1\t1");
			case "jj diff --ignore-working-copy --summary -r @":
				return ok("M src/api.ts\nA src/new.ts");
			case "jj diff --ignore-working-copy --git --color=never -- src/api.ts":
			case "jj diff --ignore-working-copy --git --color=never -r api222 -- src/api.ts":
			case "jj diff --ignore-working-copy --git --color=never -r root111 -- src/api.ts":
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

function createConflictStateRunner(calls: string[] = []): VcsCommandRunner {
	const baseRunner = createStateRunner(calls);
	return async (input) => {
		const joined = `${input.command} ${input.args.join(" ")}`;
		if (
			joined ===
			'jj log --ignore-working-copy --at-op=@ --revisions conflicts() & (::@ | ::"feature/api") --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\n"'
		) {
			calls.push(joined);
			return ok("api222\t22222222\tAPI change\n");
		}
		if (joined === "jj resolve --list" || joined === "jj resolve --list -r api222") {
			calls.push(joined);
			return ok("src/api.ts    2-sided conflict\nsrc/config.ts    2-sided conflict");
		}
		return await baseRunner(input);
	};
}

function createMultiStackStateRunner(calls: string[] = []): VcsCommandRunner {
	return async ({ command, args }) => {
		const joined = `${command} ${args.join(" ")}`;
		calls.push(joined);
			if (joined.startsWith("jj log --ignore-working-copy --at-op=@ --revisions (::(")) {
				return ok([
					"root111\t11111111\tMain\tAlice\talice@example.com\t2026-01-01T10:00:00Z\t\tmain\tmain@origin\t0",
					"api222\t22222222\tAPI change\tBob\tbob@example.com\t2026-01-01T11:00:00Z\troot111\tfeature/api\tfeature/api@origin\t1",
					"ui333\t33333333\tUI change\tBea\tbea@example.com\t2026-01-01T12:00:00Z\troot111\tfeature/ui\tfeature/ui@origin\t0",
				].join("\n"));
			}
			if (
				joined.startsWith("jj bookmark list --all-remotes --ignore-working-copy --at-op=@ --revisions all() ~ ::main@origin --template ") ||
				joined.startsWith("jj bookmark list --all-remotes --ignore-working-copy --at-op=@ --revisions all() ~ ::trunk() --template ")
			) {
				return ok([
					"feature/api\t\tapi222\t22222222\t1\t0",
					"feature/api\tgit\tapi222\t22222222\t1\t1",
					"feature/api\torigin\tapi222\t22222222\t1\t1",
					"feature/ui\t\tui333\t33333333\t1\t0",
					"feature/ui\tgit\tui333\t33333333\t1\t1",
					"feature/ui\torigin\tui333\t33333333\t1\t1",
				].join("\n"));
			}
			switch (joined) {
			case "jj --version":
				return ok("jj 0.39.0");
			case "jj workspace root":
				return ok("/repo");
			case "git rev-parse --show-toplevel":
				return ok("/repo");
			case "jj bookmark list --ignore-working-copy --at-op=@ -r @":
				return ok("feature/api: api222 22222222");
			case "jj log --ignore-working-copy --at-op=@ -r @ --no-graph -T change_id.short()":
				return ok("api222");
			case 'jj log --ignore-working-copy --no-graph -r @- -T change_id.short() ++ "\\n"':
				return ok("root111");
			case "git remote":
				return ok("origin");
			case "git remote get-url origin":
				return ok("https://github.com/acme/repo.git");
			case "git symbolic-ref --quiet --short refs/remotes/origin/HEAD":
				return ok("origin/main");
			case "gh auth status --hostname github.com":
				return ok("Logged in");
			case 'jj bookmark list --ignore-working-copy --at-op=@ --revisions all() ~ ::main@origin --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
			case 'jj bookmark list --ignore-working-copy --at-op=@ --revisions all() ~ ::trunk() --template name ++ "\\t" ++ self.normal_target().change_id().shortest(12) ++ "\\t" ++ self.normal_target().commit_id().shortest(12) ++ "\\t" ++ if(self.synced(), "1", "0") ++ "\\t" ++ if(self.tracked(), "1", "0") ++ "\\n"':
				return ok([
					"feature/api\tapi222\t22222222\t1\t1",
					"feature/ui\tui333\t33333333\t1\t1",
				].join("\n"));
			case "jj diff --ignore-working-copy --summary -r @":
				return ok("M src/api.ts");
			default:
				return fail(joined);
		}
	};
}

test("loadJjWorkspaceState maps JJ stacks and working copy into neutral state", async () => {
	const calls: string[] = [];
	const state = await loadJjWorkspaceState("/repo", createStateRunner(calls), {
		targetBranch: "origin/main",
		appliedStackIds: ["feature/api"],
	});

	assert.equal(state.provider, "jj");
	assert.equal(state.targetRef, "origin/main");
	assert.equal(state.headId, "api222");
	assert.equal(state.capabilities.supportsMultiAppliedWorkspace, true);
	assert.equal(state.capabilities.supportsMoveCommitAcrossStacks, true);
	assert.equal(state.capabilities.supportsMoveChangesAcrossCommits, true);
	assert.deepEqual(state.appliedStackIds, ["feature/api"]);
	assert.equal(state.stacks.length, 1);
	assert.equal(state.stacks[0]?.stackId, "feature/api");
	assert.equal(state.stacks[0]?.isApplied, true);
	assert.deepEqual(state.stacks[0]?.commits.map((commit) => commit.commitId), ["root111", "api222"]);
	assert.deepEqual(state.stacks[0]?.commits[1]?.parentCommitIds, ["root111"]);
	assert.equal(state.stacks[0]?.commits[1]?.timestamp, "2026-01-01T11:00:00Z");
	assert.equal(state.stacks[0]?.commits[1]?.title, "API change");
	assert.equal(state.stacks[0]?.commits[1]?.description, "Detailed PR body\n- keeps markdown");
	assert.equal(state.workingCopy.summary.modified, 1);
	assert.equal(state.workingCopy.summary.added, 1);
	assert.ok(calls.includes("jj diff --ignore-working-copy --summary -r @"));
});

test("loadJjWorkspaceState marks untracked remote JJ commits as immutable", async () => {
	const baseRunner = createStateRunner();
	const state = await loadJjWorkspaceState(
		"/repo",
		async (input) => {
				const joined = `${input.command} ${input.args.join(" ")}`;
				if (joined.includes('bookmark list --all-remotes --ignore-working-copy --at-op=@ --revisions all() ~ ::')) {
					return ok([
						"feature/api\t\tapi222\t22222222\t1\t0",
						"feature/api\tgit\tapi222\t22222222\t1\t1",
						"feature/api\torigin\tapi222\t22222222\t0\t0",
					].join("\n"));
				}
			if (joined.includes('jj log --ignore-working-copy --at-op=@ --revisions (::"feature/api")')) {
				return ok([
					"root111\t11111111\tMain\tAlice\talice@example.com\t2026-01-01T10:00:00Z\t\t\t\t0",
					"api222\t22222222\tAPI change\tBob\tbob@example.com\t2026-01-01T11:00:00Z\troot111\tfeature/api\tfeature/api@git|feature/api@origin\t1",
				].join("\n"));
			}
			return await baseRunner(input);
		},
		{
			targetBranch: "origin/main",
			appliedStackIds: ["feature/api"],
		},
	);

	const commit = state.stacks[0]?.commits.find((candidate) => candidate.commitId === "api222");
	assert.deepEqual(commit?.metadata?.untrackedRemoteBookmarks, ["feature/api@origin"]);
	assert.deepEqual(commit?.metadata?.trackedRemoteBookmarks, []);
	assert.match(String(commit?.metadata?.immutableReason), /Remote bookmark is not tracked/);

	const childCommit = state.stacks[0]?.commits.find((candidate) => candidate.commitId === "root111");
	assert.deepEqual(childCommit?.metadata?.untrackedRemoteBookmarks, ["feature/api@origin"]);
	assert.match(String(childCommit?.metadata?.immutableReason), /Remote bookmark is not tracked/);
});

test("loadJjWorkspaceState does not mark tracked remote JJ commits as immutable", async () => {
	const state = await loadJjWorkspaceState("/repo", createStateRunner(), {
		targetBranch: "origin/main",
		appliedStackIds: ["feature/api"],
	});

	const commit = state.stacks[0]?.commits.find((candidate) => candidate.commitId === "api222");
	assert.deepEqual(commit?.metadata?.trackedRemoteBookmarks, ["feature/api@origin"]);
	assert.deepEqual(commit?.metadata?.untrackedRemoteBookmarks, []);
	assert.equal(commit?.metadata?.immutableReason, null);
});

test("loadJjWorkspaceState surfaces JJ conflicts as neutral workspace conflicts", async () => {
	const calls: string[] = [];
	const state = await loadJjWorkspaceState("/repo", createConflictStateRunner(calls), {
		targetBranch: "origin/main",
		appliedStackIds: ["feature/api"],
	});

	assert.equal(state.mode, "conflicted");
	assert.equal(state.workingCopy.hasConflicts, true);
	assert.deepEqual(state.conflicts, [
		{
			id: "jj-conflict-api222-src/api.ts",
			path: "src/api.ts",
			message: "JJ conflict in src/api.ts in API change.",
			commitIds: ["api222"],
			stackIds: ["feature/api"],
		},
		{
			id: "jj-conflict-api222-src/config.ts",
			path: "src/config.ts",
			message: "JJ conflict in src/config.ts in API change.",
			commitIds: ["api222"],
			stackIds: ["feature/api"],
		},
	]);
	assert.deepEqual(state.workingCopy.files.map((file) => file.path), ["src/api.ts", "src/config.ts", "src/new.ts"]);
	assert.ok(calls.some((call) => call.includes("--revisions conflicts()")));
	assert.ok(calls.includes("jj resolve --list"));
});

test("loadJjWorkspaceState preserves multiple applied JJ workspace stacks", async () => {
	const state = await loadJjWorkspaceState("/repo", createMultiStackStateRunner(), {
		targetBranch: "origin/main",
		appliedStackIds: ["feature/api", "feature/ui"],
	});

	assert.equal(state.provider, "jj");
	assert.equal(state.capabilities.supportsMultiAppliedWorkspace, true);
	assert.deepEqual(state.appliedStackIds, ["feature/api", "feature/ui"]);
	assert.deepEqual(
		state.stacks.map((stack) => [stack.stackId, stack.isApplied, stack.isCurrent]),
		[
			["feature/api", true, true],
			["feature/ui", true, false],
		],
	);
	assert.deepEqual(
		state.stacks.map((stack) => stack.commits.map((commit) => commit.commitId)),
		[
			["root111", "api222"],
			["root111", "ui333"],
		],
	);
});

test("previewJjWorkspaceOperation translates neutral reword to JJ edit-message preview", async () => {
	const operation: NeutralOperationRequest = {
		operation: {
			kind: "reword_commit",
			commitId: "api222",
			message: "Refine API change",
		},
	};

	const preview = await previewJjWorkspaceOperation("/repo", operation, createStateRunner());

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "reword_commit");
	assert.equal(preview.disabledReason, null);
	assert.deepEqual(preview.affectedCommitIds, ["api222"]);
	assert.match(preview.summary, /Update api222 description/i);
});

test("applyJjWorkspaceOperation returns a targeted commit update for reword", async () => {
	const calls: string[] = [];
	let reworded = false;
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "reword_commit", commitId: "api222", message: "Refined API change\n\nUpdated body" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			if (joined.startsWith('jj log --ignore-working-copy --at-op=@ --revisions (::"feature/api")')) {
				calls.push(joined);
				return ok([
					"root111\t11111111\tMain\tAlice\talice@example.com\t2026-01-01T10:00:00Z\t\tmain\tmain@origin\t0",
					[
						"api222",
						"22222222",
						JSON.stringify(reworded ? "Refined API change\n\nUpdated body" : "API change\n\nDetailed PR body\n- keeps markdown"),
						"Bob",
						"bob@example.com",
						"2026-01-01T11:00:00Z",
						"root111",
						"feature/api",
						"feature/api@origin",
						"1",
					].join("\t"),
				].join("\n"));
			}
			calls.push(joined);
			if (joined === "jj describe -r api222 -m Refined API change\n\nUpdated body") {
				reworded = true;
				return ok("Working copy now at: api222");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "reword_commit");
	assert.equal(result.cacheUpdate, "commits");
	assert.deepEqual(result.invalidateTags, ["OperationHistory", "OperationDetails", "RepositoryLog"]);
	assert.equal(result.invalidateTags?.includes("Stacks"), false);
	assert.equal(result.cachePayload?.commits?.[0]?.commitId, "api222");
	assert.equal(result.cachePayload?.commits?.[0]?.title, "Refined API change");
	assert.equal(result.cachePayload?.commits?.[0]?.description, "Updated body");
	assert.ok(calls.includes("jj describe -r api222 -m Refined API change\n\nUpdated body"));
});

test("applyJjWorkspaceOperation fast reword patches cached commit without reloading workspace", async () => {
	const cachedState = await loadJjWorkspaceState("/repo", createStateRunner(), {
		appliedStackIds: ["feature/api"],
	});
	(cachedState as typeof cachedState & { stateVersion: number }).stateVersion = 7;
	const calls: string[] = [];
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: { kind: "reword_commit", commitId: "api222", message: "Fast reword\n\nCached body" },
			operationContext: {
				stateVersion: 7,
				stackId: "feature/api",
				headCommitId: "api222",
				orderedCommitIds: ["root111", "api222"],
				selectedCommitId: "api222",
				nextLowerCommitId: "root111",
			},
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj describe -r api222 -m Fast reword\n\nCached body") {
				return ok("Description updated");
			}
			return fail(joined);
		},
		cachedState,
	);

	assert.equal(result.ok, true);
	assert.equal(result.cacheUpdate, "commits");
	assert.equal(result.cachePayload?.commits?.[0]?.title, "Fast reword");
	assert.equal(result.cachePayload?.commits?.[0]?.description, "Cached body");
	assert.deepEqual(calls, ["jj describe -r api222 -m Fast reword\n\nCached body"]);
});

test("previewJjWorkspaceOperation translates neutral discard to JJ working-copy restore preview", async () => {
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "discard_changes",
				selection: { source: "working_copy", paths: ["src/api.ts"] },
			},
		},
		createStateRunner(),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "discard_changes");
	assert.deepEqual(preview.affectedPaths, ["src/api.ts"]);
	assert.match(preview.summary, /Restore src\/api\.ts from the parent/i);
});

test("previewJjWorkspaceOperation allows selected working-copy hunk restore", async () => {
	const calls: string[] = [];
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "discard_changes",
				selection: {
					source: "working_copy",
					hunks: [{ path: "src/api.ts", hunkId: "src/api.ts:1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		createStateRunner(calls),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "discard_changes");
	assert.deepEqual(preview.affectedPaths, ["src/api.ts"]);
	assert.match(preview.summary, /selected working-copy hunk/i);
	assert.ok(calls.includes("jj diff --ignore-working-copy --git --color=never -- src/api.ts"));
	assert.ok(!calls.includes("git apply --reverse --whitespace=nowarn -"));
});

test("applyJjWorkspaceOperation restores selected working-copy hunks with reverse patch apply", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "restore_changes",
				selection: {
					source: "working_copy",
					hunks: [{ path: "src/api.ts", hunkId: "1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "git apply --reverse --whitespace=nowarn -") {
				return ok("");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "restore_changes");
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("jj diff --ignore-working-copy --git --color=never -- src/api.ts"));
	assert.ok(calls.includes("git apply --reverse --whitespace=nowarn -"));
});

test("previewJjWorkspaceOperation translates neutral committed file move to JJ squash preview", async () => {
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "move_changes",
				targetCommitId: "root111",
				selection: { source: "commit", commitId: "api222", paths: ["src/api.ts"] },
			},
		},
		createStateRunner(),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "move_changes");
	assert.deepEqual(preview.affectedCommitIds, ["api222", "root111"]);
	assert.deepEqual(preview.affectedPaths, ["src/api.ts"]);
	assert.match(preview.summary, /Move src\/api\.ts from api222 into root111/i);
});

test("applyJjWorkspaceOperation moves selected committed files through a temporary split", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "move_changes",
				targetCommitId: "root111",
				selection: { source: "commit", commitId: "api222", paths: ["src/api.ts"] },
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj split -r api222 --insert-after root111 -m changeyard move selected files -- src/api.ts") {
				return { ok: true, stdout: "Created new commit temp333 33333333 changeyard move selected files", stderr: "", exitCode: 0 };
			}
			if (joined === "jj squash --from temp333 --into root111") {
				return ok("Squashed selected files into root111");
			}
			if (joined === "jj abandon temp333") {
				return ok("Abandoned 0 commits");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "move_changes");
	assert.deepEqual(result.affectedCommitIds, ["api222", "root111"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("jj split -r api222 --insert-after root111 -m changeyard move selected files -- src/api.ts"));
	assert.ok(calls.includes("jj squash --from temp333 --into root111"));
});

test("previewJjWorkspaceOperation allows selected committed hunk movement", async () => {
	const calls: string[] = [];
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "move_changes",
				targetCommitId: "root111",
				selection: {
					source: "commit",
					commitId: "api222",
					hunks: [{ path: "src/api.ts", hunkId: "src/api.ts:1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		createStateRunner(calls),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "move_changes");
	assert.deepEqual(preview.affectedCommitIds, ["api222", "root111"]);
	assert.deepEqual(preview.affectedPaths, ["src/api.ts"]);
	assert.match(preview.summary, /selected hunk/i);
	assert.ok(calls.includes("jj diff --ignore-working-copy --git --color=never -r api222 -- src/api.ts"));
	assert.ok(!calls.some((call) => call.startsWith("jj squash --from api222 --into root111 --interactive")));
});

test("applyJjWorkspaceOperation moves selected committed hunks through a temporary split", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "move_changes",
				targetCommitId: "root111",
				selection: {
					source: "commit",
					commitId: "api222",
					hunks: [{ path: "src/api.ts", hunkId: "1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (/^jj split -r api222 --insert-after root111 -m changeyard move selected hunks --interactive --tool .+ src\/api\.ts$/.test(joined)) {
				return { ok: true, stdout: "Created new commit temp333 33333333 changeyard move selected hunks", stderr: "", exitCode: 0 };
			}
			if (joined === "jj squash --from temp333 --into root111") {
				return ok("Squashed selected hunks into root111");
			}
			if (joined === "jj abandon temp333") {
				return ok("Abandoned 0 commits");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "move_changes");
	assert.deepEqual(result.affectedCommitIds, ["api222", "root111"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("jj diff --ignore-working-copy --git --color=never -r api222 -- src/api.ts"));
	assert.ok(calls.some((call) => /^jj split -r api222 --insert-after root111 -m changeyard move selected hunks --interactive --tool .+ src\/api\.ts$/.test(call)));
	assert.ok(calls.includes("jj squash --from temp333 --into root111"));
});

test("previewJjWorkspaceOperation allows selected committed hunk discard", async () => {
	const calls: string[] = [];
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "discard_changes",
				selection: {
					source: "commit",
					commitId: "api222",
					hunks: [{ path: "src/api.ts", hunkId: "src/api.ts:1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		createStateRunner(calls),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "discard_changes");
	assert.equal(preview.risk, "high");
	assert.deepEqual(preview.affectedCommitIds, ["api222"]);
	assert.deepEqual(preview.affectedPaths, ["src/api.ts"]);
	assert.match(preview.summary, /Remove 1 selected hunk/);
	assert.ok(calls.includes("jj log --ignore-working-copy --no-graph -r api222- -T change_id.short()"));
	assert.ok(calls.includes("jj diff --ignore-working-copy --git --color=never -r api222 -- src/api.ts"));
	assert.ok(!calls.some((call) => call.startsWith("jj new --no-edit root111")));
	assert.ok(!calls.some((call) => call.startsWith("jj squash --from api222")));
});

test("applyJjWorkspaceOperation discards selected committed hunks through a temporary JJ change", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "discard_changes",
				selection: {
					source: "commit",
					commitId: "api222",
					hunks: [{ path: "src/api.ts", hunkId: "1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj new --no-edit root111 -m changeyard discard selected hunks") {
				return { ok: true, stdout: "", stderr: "Created new commit temp333 33333333 (empty) changeyard discard selected hunks", exitCode: 0 };
			}
			if (/^jj squash --from api222 --into temp333 --interactive --tool .+ src\/api\.ts$/.test(joined)) {
				return ok("Squashed selected hunks into temp333");
			}
			if (joined === "jj abandon temp333") {
				return ok("Abandoned 1 commits");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "discard_changes");
	assert.deepEqual(result.affectedCommitIds, ["api222"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("jj log --ignore-working-copy --no-graph -r api222- -T change_id.short()"));
	assert.ok(calls.includes("jj diff --ignore-working-copy --git --color=never -r api222 -- src/api.ts"));
	assert.ok(calls.includes("jj new --no-edit root111 -m changeyard discard selected hunks"));
	assert.ok(calls.some((call) => /^jj squash --from api222 --into temp333 --interactive --tool .+ src\/api\.ts$/.test(call)));
	assert.equal(calls.filter((call) => call === "jj abandon temp333").length, 1);
});

test("previewJjWorkspaceOperation translates neutral uncommit to JJ squash into working copy", async () => {
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "uncommit_changes",
				selection: { source: "commit", commitId: "root111", paths: ["src/api.ts"] },
			},
		},
		createStateRunner(),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "uncommit_changes");
	assert.deepEqual(preview.affectedCommitIds, ["root111", "api222"]);
	assert.deepEqual(preview.affectedPaths, ["src/api.ts"]);
	assert.match(preview.summary, /Move src\/api\.ts from root111 into @/i);
});

test("applyJjWorkspaceOperation uncommits selected committed files through a temporary split into working copy", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "uncommit_changes",
				selection: { source: "commit", commitId: "root111", paths: ["src/api.ts"] },
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj split -r root111 --insert-after @ -m changeyard move selected files -- src/api.ts") {
				return { ok: true, stdout: "Created new commit temp333 33333333 changeyard move selected files", stderr: "", exitCode: 0 };
			}
			if (joined === "jj squash --from temp333 --into @") {
				return ok("Squashed selected files into the working copy");
			}
			if (joined === "jj abandon temp333") {
				return ok("Abandoned 0 commits");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "uncommit_changes");
	assert.deepEqual(result.affectedCommitIds, ["root111"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("jj split -r root111 --insert-after @ -m changeyard move selected files -- src/api.ts"));
	assert.ok(calls.includes("jj squash --from temp333 --into @"));
});

test("applyJjWorkspaceOperation uncommits selected committed hunks through a temporary split into working copy", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "uncommit_changes",
				selection: {
					source: "commit",
					commitId: "root111",
					hunks: [{ path: "src/api.ts", hunkId: "1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (/^jj split -r root111 --insert-after @ -m changeyard move selected hunks --interactive --tool .+ src\/api\.ts$/.test(joined)) {
				return { ok: true, stdout: "Created new commit temp333 33333333 changeyard move selected hunks", stderr: "", exitCode: 0 };
			}
			if (joined === "jj squash --from temp333 --into @") {
				return ok("Squashed selected hunks into the working copy");
			}
			if (joined === "jj abandon temp333") {
				return ok("Abandoned 0 commits");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "uncommit_changes");
	assert.deepEqual(result.affectedCommitIds, ["root111"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("jj diff --ignore-working-copy --git --color=never -r root111 -- src/api.ts"));
	assert.ok(calls.some((call) => /^jj split -r root111 --insert-after @ -m changeyard move selected hunks --interactive --tool .+ src\/api\.ts$/.test(call)));
	assert.ok(calls.includes("jj squash --from temp333 --into @"));
});

test("previewJjWorkspaceOperation translates neutral move commit to JJ reorder preview", async () => {
	const calls: string[] = [];
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "move_commit",
				commitId: "api222",
				targetStackId: "feature/api",
				position: { relativeToCommitId: "root111", placement: "after" },
			},
		},
		createStateRunner(calls),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "move_commit");
	assert.deepEqual(preview.affectedStackIds, ["feature/api"]);
	assert.deepEqual(preview.affectedCommitIds, ["api222", "root111"]);
	assert.match(preview.summary, /Rebase api222 onto root111/i);
	assert.ok(!calls.some((call) => call.startsWith("jj rebase ")));
});

test("applyJjWorkspaceOperation moves commits through JJ rebase", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "move_commit",
				commitId: "api222",
				targetStackId: "feature/api",
				position: { relativeToCommitId: "root111", placement: "after" },
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj rebase -s api222 -d root111") {
				return ok("Rebased api222 onto root111");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "move_commit");
	assert.deepEqual(result.affectedCommitIds, ["api222", "root111"]);
	assert.equal(calls.at(-1), "jj rebase -s api222 -d root111");
});

test("previewJjWorkspaceOperation translates neutral split to JJ split preview", async () => {
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "split_commit",
				commitId: "api222",
				message: "Extract API file",
				selection: { source: "commit", commitId: "api222", paths: ["src/api.ts"] },
			},
		},
		createStateRunner(),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "split_commit");
	assert.deepEqual(preview.affectedCommitIds, ["api222"]);
	assert.deepEqual(preview.affectedPaths, ["src/api.ts"]);
	assert.match(preview.summary, /Split src\/api\.ts out of api222/i);
});

test("applyJjWorkspaceOperation splits selected committed files through JJ split", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "split_commit",
				commitId: "api222",
				message: "Extract API file",
				selection: { source: "commit", commitId: "api222", paths: ["src/api.ts"] },
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj split -r api222 -m Extract API file -- src/api.ts") {
				return ok("Split api222");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "split_commit");
	assert.deepEqual(result.affectedCommitIds, ["api222"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.equal(calls.at(-1), "jj split -r api222 -m Extract API file -- src/api.ts");
});

test("applyJjWorkspaceOperation splits selected committed hunks through JJ split diff editor", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "split_commit",
				commitId: "api222",
				message: "Extract API hunk",
				selection: {
					source: "commit",
					commitId: "api222",
					hunks: [{ path: "src/api.ts", hunkId: "1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (/^jj split -r api222 -m Extract API hunk --tool .+ src\/api\.ts$/.test(joined)) {
				return ok("Split selected hunks from api222");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "split_commit");
	assert.deepEqual(result.affectedCommitIds, ["api222"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("jj diff --ignore-working-copy --git --color=never -r api222 -- src/api.ts"));
	assert.match(calls.at(-1) ?? "", /^jj split -r api222 -m Extract API hunk --tool .+ src\/api\.ts$/);
});

test("previewJjWorkspaceOperation previews selected working-copy files as a new stack commit", async () => {
	const calls: string[] = [];
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "create_commit", stackId: "feature/api", message: "New API", selection: { source: "working_copy", paths: ["src/api.ts"] } } },
		createStateRunner(calls),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "create_commit");
	assert.equal(preview.disabledReason, null);
	assert.deepEqual(preview.affectedStackIds, ["feature/api"]);
	assert.deepEqual(preview.affectedCommitIds, ["api222"]);
	assert.deepEqual(preview.affectedPaths, ["src/api.ts"]);
	assert.match(preview.summary, /Create new commit at top of feature\/api/i);
});

test("applyJjWorkspaceOperation creates a selected working-copy file commit at the top of the stack", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "create_commit", stackId: "feature/api", message: "New API", selection: { source: "working_copy", paths: ["src/api.ts"] } } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj split -r @ --insert-after api222 -m New API -- src/api.ts") {
				return ok("Created new commit selected123");
			}
			if (joined === "jj bookmark set feature/api -r selected123") {
				return ok("Moved bookmark");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "create_commit");
	assert.equal(result.cacheUpdate, "stacks");
	assert.deepEqual(result.affectedStackIds, ["feature/api"]);
	assert.deepEqual(result.affectedCommitIds, ["selected123", "api222"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.equal(result.cachePayload?.stacks?.[0]?.stackId, "feature/api");
	assert.equal(result.invalidateTags?.includes("Stacks"), false);
	assert.ok(calls.includes("jj split -r @ --insert-after api222 -m New API -- src/api.ts"));
	assert.ok(calls.includes("jj bookmark set feature/api -r selected123"));
});

test("applyJjWorkspaceOperation creates an empty commit at the top of the stack", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "create_commit", stackId: "feature/api", message: "Empty API commit" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj new --no-edit --insert-after api222 -m Empty API commit") {
				return ok("Created new commit empty123");
			}
			if (joined === "jj bookmark set feature/api -r empty123") {
				return ok("Moved bookmark");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "create_commit");
	assert.equal(result.cacheUpdate, "stacks");
	assert.deepEqual(result.affectedStackIds, ["feature/api"]);
	assert.deepEqual(result.affectedCommitIds, ["empty123", "api222"]);
	assert.equal(result.cachePayload?.stacks?.[0]?.stackId, "feature/api");
	assert.equal(result.invalidateTags?.includes("Stacks"), false);
	assert.ok(calls.includes("jj new --no-edit --insert-after api222 -m Empty API commit"));
	assert.ok(calls.includes("jj bookmark set feature/api -r empty123"));
});

test("applyJjWorkspaceOperation fast creates an empty top commit from cached stack context", async () => {
	const cachedState = await loadJjWorkspaceState("/repo", createStateRunner(), {
		appliedStackIds: ["feature/api"],
	});
	(cachedState as typeof cachedState & { stateVersion: number }).stateVersion = 9;
	const calls: string[] = [];
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: { kind: "create_commit", stackId: "feature/api", message: "Fast empty commit" },
			operationContext: {
				stateVersion: 9,
				stackId: "feature/api",
				headCommitId: "api222",
				orderedCommitIds: ["root111", "api222"],
				selectedCommitId: "api222",
				nextLowerCommitId: "root111",
			},
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj new --no-edit --insert-after api222 -m Fast empty commit") {
				return ok("Created new commit empty-fast");
			}
			if (joined === "jj bookmark set feature/api -r empty-fast") {
				return ok("Moved bookmark");
			}
			return fail(joined);
		},
		cachedState,
	);

	assert.equal(result.ok, true);
	assert.equal(result.cacheUpdate, "stacks");
	assert.deepEqual(result.cachePayload?.stacks?.[0]?.commits.map((commit) => commit.commitId), [
		"root111",
		"api222",
		"empty-fast",
	]);
	assert.equal(result.cachePayload?.stacks?.[0]?.headCommitId, "empty-fast");
	assert.deepEqual(calls, [
		"jj new --no-edit --insert-after api222 -m Fast empty commit",
		"jj bookmark set feature/api -r empty-fast",
	]);
});

test("previewJjWorkspaceOperation previews deleting a commit", async () => {
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "abandon_commit", commitId: "api222" } },
		createStateRunner(),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "abandon_commit");
	assert.equal(preview.title, "Delete commit");
	assert.match(preview.summary, /Abandon api222 and rebase descendants/i);
	assert.deepEqual(preview.affectedCommitIds, ["api222"]);
});

test("applyJjWorkspaceOperation abandons non-head commits normally", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "abandon_commit", commitId: "root111" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj abandon root111") {
				return ok("Abandoned");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "abandon_commit");
	assert.equal(result.cacheUpdate, "stacks");
	assert.deepEqual(result.affectedStackIds, ["feature/api"]);
	assert.deepEqual(result.affectedCommitIds, ["root111"]);
	assert.equal(result.cachePayload?.stacks?.[0]?.stackId, "feature/api");
	assert.equal(result.invalidateTags?.includes("Stacks"), false);
	assert.ok(calls.includes("jj abandon root111"));
});

test("applyJjWorkspaceOperation moves stack bookmark before abandoning a stack head", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "abandon_commit", commitId: "api222" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj bookmark set --allow-backwards feature/api -r root111") {
				return ok("Moved bookmark");
			}
			if (joined === "jj abandon api222") {
				return ok("Abandoned");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "abandon_commit");
	assert.equal(result.cacheUpdate, "stacks");
	assert.deepEqual(result.affectedStackIds, ["feature/api"]);
	assert.deepEqual(result.affectedCommitIds, ["api222", "root111"]);
	assert.equal(result.cachePayload?.stacks?.[0]?.stackId, "feature/api");
	assert.equal(result.invalidateTags?.includes("Stacks"), false);
	assert.ok(calls.includes("jj bookmark set --allow-backwards feature/api -r root111"));
	assert.ok(calls.includes("jj abandon api222"));
});

test("applyJjWorkspaceOperation fast abandons a stack head from cached stack context", async () => {
	const cachedState = await loadJjWorkspaceState("/repo", createStateRunner(), {
		appliedStackIds: ["feature/api"],
	});
	(cachedState as typeof cachedState & { stateVersion: number }).stateVersion = 10;
	const calls: string[] = [];
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: { kind: "abandon_commit", commitId: "api222" },
			operationContext: {
				stateVersion: 10,
				stackId: "feature/api",
				headCommitId: "api222",
				orderedCommitIds: ["root111", "api222"],
				selectedCommitId: "api222",
				nextLowerCommitId: "root111",
			},
		},
		async ({ command, args }) => {
			const joined = `${command} ${args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj bookmark set --allow-backwards feature/api -r root111") {
				return ok("Moved bookmark");
			}
			if (joined === "jj abandon api222") {
				return ok("Abandoned");
			}
			return fail(joined);
		},
		cachedState,
	);

	assert.equal(result.ok, true);
	assert.equal(result.cacheUpdate, "stacks");
	assert.deepEqual(result.cachePayload?.stacks?.[0]?.commits.map((commit) => commit.commitId), ["root111"]);
	assert.equal(result.cachePayload?.stacks?.[0]?.headCommitId, "root111");
	assert.deepEqual(calls, [
		"jj bookmark set --allow-backwards feature/api -r root111",
		"jj abandon api222",
	]);
});

test("applyJjWorkspaceOperation retains bookmarks when abandoning a one-commit stack head", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "abandon_commit", commitId: "api222" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined.startsWith('jj log --ignore-working-copy --at-op=@ --revisions (::"feature/api")')) {
				return ok("api222\t22222222\tAPI change\tBob\tbob@example.com\t2026-01-01T11:00:00Z\t\tfeature/api\tfeature/api@origin\t1");
			}
			if (joined === "jj abandon --retain-bookmarks api222") {
				return ok("Abandoned");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "abandon_commit");
	assert.equal(result.cacheUpdate, "stacks");
	assert.deepEqual(result.affectedStackIds, ["feature/api"]);
	assert.deepEqual(result.affectedCommitIds, ["api222"]);
	assert.equal(result.cachePayload?.stacks?.[0]?.stackId, "feature/api");
	assert.equal(result.invalidateTags?.includes("Stacks"), false);
	assert.ok(calls.includes("jj abandon --retain-bookmarks api222"));
});

test("applyJjWorkspaceOperation creates an empty commit relative to a target commit", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "add_empty_commit", targetCommitId: "api222", placement: "before", message: "Prep API commit" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj new --insert-before api222 --no-edit -m Prep API commit") {
				return ok("Created new commit prep123");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "add_empty_commit");
	assert.equal(result.cacheUpdate, "stacks");
	assert.equal(result.cachePayload?.stacks?.[0]?.stackId, "feature/api");
	assert.equal(result.invalidateTags?.includes("Stacks"), false);
	assert.ok(calls.includes("jj new --insert-before api222 --no-edit -m Prep API commit"));
});

test("applyJjWorkspaceOperation creates a bookmark at the target commit", async () => {
	const calls: string[] = [];
	let created = false;
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "create_bookmark", targetCommitId: "api222", bookmarkName: "feature/new-api" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (
				created &&
				(
					joined.startsWith("jj bookmark list --all-remotes --ignore-working-copy --at-op=@ --revisions all() ~ ::main@origin --template ") ||
					joined.startsWith("jj bookmark list --all-remotes --ignore-working-copy --at-op=@ --revisions all() ~ ::trunk() --template ")
				)
			) {
				return ok([
					"feature/api\t\tapi222\t22222222\t1\t0",
					"feature/api\tgit\tapi222\t22222222\t1\t1",
					"feature/api\torigin\tapi222\t22222222\t1\t1",
					"feature/new-api\t\tapi222\t22222222\t1\t0",
				].join("\n"));
			}
			if (created && joined.startsWith("jj log --ignore-working-copy --at-op=@ --revisions (::(")) {
				return ok([
					"root111\t11111111\tMain\tAlice\talice@example.com\t2026-01-01T10:00:00Z\t\tmain\tmain@origin\t0",
					"api222\t22222222\tAPI change\tBob\tbob@example.com\t2026-01-01T11:00:00Z\troot111\tfeature/api|feature/new-api\tfeature/api@origin\t1",
				].join("\n"));
			}
			if (created && joined.startsWith('jj log --ignore-working-copy --at-op=@ --revisions (::"feature/new-api")')) {
				return ok([
					"root111\t11111111\tMain\tAlice\talice@example.com\t2026-01-01T10:00:00Z\t\tmain\tmain@origin\t0",
					"api222\t22222222\tAPI change\tBob\tbob@example.com\t2026-01-01T11:00:00Z\troot111\tfeature/api feature/new-api\tfeature/api@origin\t1",
				].join("\n"));
			}
			if (joined === "jj bookmark create feature/new-api -r api222") {
				created = true;
				return ok("Created 1 bookmarks");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "create_bookmark");
	assert.equal(result.cacheUpdate, "stacks");
	assert.equal(result.cachePayload?.stacks?.[0]?.stackId, "feature/new-api");
	assert.equal(result.invalidateTags?.includes("Stacks"), false);
	assert.ok(calls.includes("jj bookmark create feature/new-api -r api222"));
});

test("applyJjWorkspaceOperation renames and deletes stack bookmarks", async () => {
	const renameCalls: string[] = [];
	const renameBaseRunner = createStateRunner(renameCalls);
	const renameResult = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "rename_stack", stackId: "feature/api", name: "feature/api-v2" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			renameCalls.push(joined);
			if (joined === "jj bookmark rename feature/api feature/api-v2") {
				return ok("Renamed");
			}
			renameCalls.pop();
			return await renameBaseRunner(input);
		},
	);
	assert.equal(renameResult.ok, true);
	assert.equal(renameResult.cacheUpdate, "stacks");
	assert.deepEqual(renameResult.cachePayload?.removedStackIds, ["feature/api"]);
	assert.equal(renameResult.invalidateTags?.includes("Stacks"), false);
	assert.ok(renameCalls.includes("jj bookmark rename feature/api feature/api-v2"));

	const deleteCalls: string[] = [];
	const deleteBaseRunner = createStateRunner(deleteCalls);
	const deleteResult = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "delete_stack", stackId: "feature/api" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			deleteCalls.push(joined);
			if (joined === "jj bookmark delete feature/api") {
				return ok("Deleted");
			}
			deleteCalls.pop();
			return await deleteBaseRunner(input);
		},
	);
	assert.equal(deleteResult.ok, true);
	assert.equal(deleteResult.cacheUpdate, "stacks");
	assert.deepEqual(deleteResult.cachePayload?.removedStackIds, ["feature/api"]);
	assert.equal(deleteResult.invalidateTags?.includes("Stacks"), false);
	assert.ok(deleteCalls.includes("jj bookmark delete feature/api"));
	assert.equal(deleteCalls.some((call) => call.includes("abandon")), false);
});

test("applyJjWorkspaceOperation squashes stack commits into the head", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "squash_stack", stackId: "feature/api" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj squash --from root111 --into api222 --use-destination-message") {
				return ok("Squashed");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "squash_stack");
	assert.equal(result.cacheUpdate, "stacks");
	assert.equal(result.cachePayload?.stacks?.[0]?.stackId, "feature/api");
	assert.equal(result.invalidateTags?.includes("Stacks"), false);
	assert.ok(calls.includes("jj squash --from root111 --into api222 --use-destination-message"));
});

test("previewJjWorkspaceOperation previews commit edit mode", async () => {
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "begin_edit_commit", targetCommitId: "api222", message: "Edit API change" } },
		createStateRunner(),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "begin_edit_commit");
	assert.deepEqual(preview.affectedCommitIds, ["api222"]);
	assert.match(preview.summary, /Create a temporary edit commit above api222/i);
	assert.match(preview.warnings[0]?.message ?? "", /Do not create additional commits/i);
});

test("previewJjWorkspaceOperation previews tracking a remote bookmark", async () => {
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "track_remote_bookmark", bookmarkName: "feature/api", remoteName: "origin" } },
		createStateRunner(),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "track_remote_bookmark");
	assert.equal(preview.risk, "medium");
	assert.deepEqual(preview.affectedStackIds, ["feature/api"]);
	assert.match(preview.summary, /feature\/api@origin/);
});

test("previewJjWorkspaceOperation previews untracking a remote bookmark", async () => {
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "untrack_remote_bookmark", bookmarkName: "feature/api", remoteName: "origin" } },
		createStateRunner(),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "untrack_remote_bookmark");
	assert.equal(preview.risk, "medium");
	assert.deepEqual(preview.affectedStackIds, ["feature/api"]);
	assert.match(preview.summary, /Stop tracking feature\/api@origin/);
	assert.equal(preview.warnings[0]?.code, "jj_remote_bookmark_untrack");
});

test("applyJjWorkspaceOperation tracks a remote bookmark", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "track_remote_bookmark", bookmarkName: "feature/api", remoteName: "origin" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj bookmark track --remote origin feature/api") {
				return ok("Started tracking 1 remote bookmarks.");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "track_remote_bookmark");
	assert.deepEqual(result.affectedStackIds, ["feature/api"]);
	assert.equal(calls.at(-1), "jj bookmark track --remote origin feature/api");
});

test("applyJjWorkspaceOperation untracks a remote bookmark", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "untrack_remote_bookmark", bookmarkName: "feature/api", remoteName: "origin" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj bookmark untrack --remote origin feature/api") {
				return ok("Stopped tracking 1 remote bookmarks.");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "untrack_remote_bookmark");
	assert.deepEqual(result.affectedStackIds, ["feature/api"]);
	assert.equal(calls.at(-1), "jj bookmark untrack --remote origin feature/api");
});

test("applyJjWorkspaceOperation begins commit edit mode with a temporary commit", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "begin_edit_commit", targetCommitId: "api222", message: "Edit API change" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj new --insert-after api222 -m Edit API change") {
				return ok("Working copy now at the new edit commit");
			}
			if (joined === "jj log --ignore-working-copy --no-graph -r @ -T change_id.short()") {
				return ok("edit333");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "begin_edit_commit");
	assert.deepEqual(result.affectedCommitIds, ["edit333", "api222"]);
	assert.equal(calls.at(-1), "jj log --ignore-working-copy --no-graph -r @ -T change_id.short()");
});

test("applyJjWorkspaceOperation saves commit edit mode by squashing into the target", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "save_edit_commit", editCommitId: "edit333", targetCommitId: "api222" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj squash --from edit333 --into api222 --use-destination-message") {
				return ok("Squashed edit333 into api222");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "save_edit_commit");
	assert.deepEqual(result.affectedCommitIds, ["edit333", "api222"]);
	assert.equal(calls.at(-1), "jj squash --from edit333 --into api222 --use-destination-message");
});

test("applyJjWorkspaceOperation returns to the original workspace commit after saving edit mode", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "save_edit_commit",
				editCommitId: "edit333",
				targetCommitId: "api222",
				returnToCommitId: "workspace444",
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj squash --from edit333 --into api222 --use-destination-message") {
				return ok("Squashed edit333 into api222");
			}
			if (joined === "jj edit workspace444") {
				return ok("Working copy now edits workspace444");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "save_edit_commit");
	assert.deepEqual(result.affectedCommitIds, ["edit333", "api222", "workspace444"]);
	assert.deepEqual(calls.slice(-2), [
		"jj squash --from edit333 --into api222 --use-destination-message",
		"jj edit workspace444",
	]);
});

test("applyJjWorkspaceOperation reports recovery guidance when returning after save fails", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "save_edit_commit",
				editCommitId: "edit333",
				targetCommitId: "api222",
				returnToCommitId: "workspace444",
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj squash --from edit333 --into api222 --use-destination-message") {
				return ok("Squashed edit333 into api222");
			}
			if (joined === "jj edit workspace444") {
				return fail("workspace444 is not available");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, false);
	assert.match(result.summary, /workspace444 is not available/);
	assert.match(result.recovery?.instructions.join("\n") ?? "", /jj edit workspace444/);
});

test("applyJjWorkspaceOperation aborts commit edit mode by abandoning the temporary commit", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "abort_edit_commit", editCommitId: "edit333" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj abandon edit333") {
				return ok("Abandoned edit333");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "abort_edit_commit");
	assert.deepEqual(result.affectedCommitIds, ["edit333"]);
	assert.equal(calls.at(-1), "jj abandon edit333");
});

test("applyJjWorkspaceOperation returns to the original workspace commit after aborting edit mode", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "abort_edit_commit", editCommitId: "edit333", returnToCommitId: "workspace444" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj abandon edit333") {
				return ok("Abandoned edit333");
			}
			if (joined === "jj edit workspace444") {
				return ok("Working copy now edits workspace444");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "abort_edit_commit");
	assert.deepEqual(result.affectedCommitIds, ["edit333", "workspace444"]);
	assert.deepEqual(calls.slice(-2), ["jj abandon edit333", "jj edit workspace444"]);
});

test("previewJjWorkspaceOperation previews checkout commit as JJ edit", async () => {
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "checkout_commit", commitId: "api222" } },
		createStateRunner(),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.operation.kind, "checkout_commit");
	assert.equal(preview.risk, "low");
	assert.match(preview.summary, /api222/);
	assert.deepEqual(preview.affectedCommitIds, ["api222"]);
});

test("applyJjWorkspaceOperation checks out a commit with JJ edit", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "checkout_commit", commitId: "api222" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj edit api222") {
				return ok("Working copy now at api222");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "checkout_commit");
	assert.deepEqual(result.affectedCommitIds, ["api222"]);
	assert.equal(calls.at(-1), "jj edit api222");
});

test("applyJjWorkspaceOperation amends working-copy files through JJ squash", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "amend_commit",
				commitId: "root111",
				selection: { source: "working_copy", paths: ["src/api.ts"] },
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj squash --from @ --into root111 src/api.ts") {
				return ok("Squashed working-copy file into root111");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "amend_commit");
	assert.deepEqual(result.affectedCommitIds, ["api222", "root111"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.equal(calls.at(-1), "jj squash --from @ --into root111 src/api.ts");
});

test("applyJjWorkspaceOperation amends working-copy hunks through JJ squash editor", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "amend_commit",
				commitId: "root111",
				selection: {
					source: "working_copy",
					hunks: [{ path: "src/api.ts", hunkId: "1:2:1:2", oldStart: 1, oldLines: 2, newStart: 1, newLines: 2 }],
				},
			},
		},
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (/^jj squash --from @ --into root111 --interactive --tool .+ src\/api\.ts$/.test(joined)) {
				return ok("Squashed selected working-copy hunks into root111");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "amend_commit");
	assert.deepEqual(result.affectedCommitIds, ["root111"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.ok(calls.includes("jj diff --ignore-working-copy --git --color=never -- src/api.ts"));
	assert.match(calls.at(-1) ?? "", /^jj squash --from @ --into root111 --interactive --tool .+ src\/api\.ts$/);
});

test("previewJjWorkspaceOperation previews JJ workspace stack application through parent rebase", async () => {
	const calls: string[] = [];
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "apply_stack", stackId: "feature/ui" } },
		createMultiStackStateRunner(calls),
	);

	assert.equal(preview.valid, true);
	assert.equal(preview.risk, "medium");
	assert.equal(preview.disabledReason, null);
	assert.deepEqual(preview.affectedStackIds, ["feature/ui"]);
	assert.deepEqual(preview.affectedCommitIds, ["ui333"]);
	assert.match(preview.summary, /rebasing the working-copy change onto root111, ui333/i);
	assert.ok(calls.includes('jj log --ignore-working-copy --no-graph -r @- -T change_id.short() ++ "\\n"'));
	assert.ok(!calls.some((call) => call.startsWith("jj rebase ")));
});

test("applyJjWorkspaceOperation applies JJ workspace stacks by rebasing working-copy parents", async () => {
	const calls: string[] = [];
	const baseRunner = createMultiStackStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "apply_stack", stackId: "feature/ui" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj rebase -r @ -o root111 -o ui333") {
				return ok("Rebased 1 commits to destination");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "apply_stack");
	assert.equal(result.recovery, null);
	assert.deepEqual(result.affectedStackIds, ["feature/ui"]);
	assert.deepEqual(result.affectedCommitIds, ["ui333"]);
	assert.equal(calls.at(-1), "jj rebase -r @ -o root111 -o ui333");
});

test("applyJjWorkspaceOperation unapplies JJ workspace stacks by removing the stack parent", async () => {
	const calls: string[] = [];
	const baseRunner = createMultiStackStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "unapply_stack", stackId: "feature/ui" } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === 'jj log --ignore-working-copy --no-graph -r @- -T change_id.short() ++ "\\n"') {
				return ok("root111\nui333\n");
			}
			if (joined === "jj rebase -r @ -o root111") {
				return ok("Rebased 1 commits to destination");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "unapply_stack");
	assert.equal(result.recovery, null);
	assert.deepEqual(result.affectedStackIds, ["feature/ui"]);
	assert.deepEqual(result.affectedCommitIds, ["ui333"]);
	assert.equal(calls.at(-1), "jj rebase -r @ -o root111");
});

test("applyJjWorkspaceOperation returns recovery instructions when create commit fails", async () => {
	const calls: string[] = [];
	const baseRunner = createStateRunner(calls);
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "create_commit", stackId: "feature/api", message: "New API", selection: { source: "working_copy", paths: ["src/api.ts"] } } },
		async (input) => {
			const joined = `${input.command} ${input.args.join(" ")}`;
			calls.push(joined);
			if (joined === "jj split -r @ --insert-after api222 -m New API -- src/api.ts") {
				return fail("split failed");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, false);
	assert.equal(result.operation.kind, "create_commit");
	assert.match(result.summary, /split failed/i);
	assert.match(result.recovery?.instructions.join("\n") ?? "", /jj op log/);
	assert.equal(calls.at(-1), "jj split -r @ --insert-after api222 -m New API -- src/api.ts");
});
