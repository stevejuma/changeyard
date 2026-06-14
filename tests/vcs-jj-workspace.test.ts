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
			case 'jj log --ignore-working-copy --at-op=@ --revisions (::"feature/api") ~ ::main@origin --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
			case 'jj log --ignore-working-copy --at-op=@ --revisions (::"feature/api") ~ ::trunk() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.name().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\t" ++ author.email() ++ "\\t" ++ parents.map(|p| p.change_id().shortest(12)).join("|") ++ "\\t" ++ local_bookmarks.map(|b| b.name()).join("|") ++ "\\t" ++ remote_bookmarks.map(|b| separate("@", b.name(), b.remote())).join("|") ++ "\\t" ++ if(current_working_copy, "1", "0") ++ "\\n"':
				return ok([
					"root111\t11111111\tMain\tAlice\talice@example.com\t\tmain\tmain@origin\t0",
					"api222\t22222222\tAPI change\tBob\tbob@example.com\troot111\tfeature/api\tfeature/api@origin\t1",
				].join("\n"));
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
			'jj log --ignore-working-copy --at-op=@ --revisions conflicts() --no-graph --template change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\n"'
		) {
			calls.push(joined);
			return ok("api222\t22222222\tAPI change\n");
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
				"root111\t11111111\tMain\tAlice\talice@example.com\t\tmain\tmain@origin\t0",
				"api222\t22222222\tAPI change\tBob\tbob@example.com\troot111\tfeature/api\tfeature/api@origin\t1",
				"ui333\t33333333\tUI change\tBea\tbea@example.com\troot111\tfeature/ui\tfeature/ui@origin\t0",
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
	assert.equal(state.workingCopy.summary.modified, 1);
	assert.equal(state.workingCopy.summary.added, 1);
	assert.ok(calls.includes("jj diff --ignore-working-copy --summary -r @"));
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
			id: "jj-conflict-api222",
			path: null,
			message: "JJ conflict in API change.",
			commitIds: ["api222"],
			stackIds: ["feature/api"],
		},
	]);
	assert.ok(calls.some((call) => call.includes("--revisions conflicts()")));
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

test("applyJjWorkspaceOperation moves selected committed files through JJ squash", async () => {
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
			if (joined === "jj squash --from api222 --into root111 src/api.ts") {
				return ok("Squashed selected files into root111");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "move_changes");
	assert.deepEqual(result.affectedCommitIds, ["api222", "root111"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.equal(calls.at(-1), "jj squash --from api222 --into root111 src/api.ts");
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

test("applyJjWorkspaceOperation moves selected committed hunks through JJ squash diff editor", async () => {
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
			if (/^jj squash --from api222 --into root111 --interactive --tool .+ src\/api\.ts$/.test(joined)) {
				return ok("Squashed selected hunks into root111");
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
	assert.match(calls.at(-1) ?? "", /^jj squash --from api222 --into root111 --interactive --tool .+ src\/api\.ts$/);
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

test("applyJjWorkspaceOperation uncommits selected committed files through JJ squash into working copy", async () => {
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
			if (joined === "jj squash --from root111 --into @ src/api.ts") {
				return ok("Squashed selected files into the working copy");
			}
			calls.pop();
			return await baseRunner(input);
		},
	);

	assert.equal(result.ok, true);
	assert.equal(result.operation.kind, "uncommit_changes");
	assert.deepEqual(result.affectedCommitIds, ["root111", "api222"]);
	assert.deepEqual(result.affectedPaths, ["src/api.ts"]);
	assert.equal(calls.at(-1), "jj squash --from root111 --into @ src/api.ts");
});

test("applyJjWorkspaceOperation uncommits selected committed hunks through JJ squash diff editor", async () => {
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
			if (/^jj squash --from root111 --into @ --interactive --tool .+ src\/api\.ts$/.test(joined)) {
				return ok("Squashed selected hunks into the working copy");
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
	assert.match(calls.at(-1) ?? "", /^jj squash --from root111 --into @ --interactive --tool .+ src\/api\.ts$/);
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

test("previewJjWorkspaceOperation disables unsupported operations without running commands", async () => {
	const calls: string[] = [];
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "create_commit", stackId: "feature/api", message: "New API", selection: { source: "working_copy", paths: ["src/api.ts"] } } },
		async (input) => {
			calls.push(`${input.command} ${input.args.join(" ")}`);
			return fail();
		},
	);

	assert.equal(preview.valid, false);
	assert.equal(preview.operation.kind, "create_commit");
	assert.match(preview.disabledReason ?? "", /not implemented/i);
	assert.deepEqual(calls, []);
});

test("previewJjWorkspaceOperation blocks unsupported hunk amend while preserving selected paths", async () => {
	const calls: string[] = [];
	const preview = await previewJjWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "amend_commit",
				commitId: "api222",
				selection: {
					source: "working_copy",
					hunks: [{ path: "src/api.ts", hunkId: "src/api.ts:1:1:1:1" }],
				},
			},
		},
		async (input) => {
			calls.push(`${input.command} ${input.args.join(" ")}`);
			return fail();
		},
	);

	assert.equal(preview.valid, false);
	assert.match(preview.disabledReason ?? "", /hunk-level workspace operations/i);
	assert.deepEqual(preview.affectedPaths, ["src/api.ts"]);
	assert.deepEqual(calls, []);
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

test("applyJjWorkspaceOperation returns recovery instructions for unsupported operations", async () => {
	const calls: string[] = [];
	const result = await applyJjWorkspaceOperation(
		"/repo",
		{ operation: { kind: "create_commit", stackId: "feature/api", message: "New API", selection: { source: "working_copy", paths: ["src/api.ts"] } } },
		async (input) => {
			calls.push(`${input.command} ${input.args.join(" ")}`);
			return fail();
		},
	);

	assert.equal(result.ok, false);
	assert.equal(result.operation.kind, "create_commit");
	assert.match(result.summary, /not implemented/i);
	assert.match(result.recovery?.instructions.join("\n") ?? "", /No repository changes/);
	assert.deepEqual(calls, []);
});
