import assert from "node:assert/strict";
import test from "node:test";
import {
	loadGitWorkspaceState,
	previewGitWorkspaceOperation,
} from "../src/vcs/git/workspace.js";
import {
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

function createJjRunner(calls: string[] = []): VcsCommandRunner {
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
			case "jj diff --summary -r @":
				return ok("M src/api.ts");
			default:
				return fail(joined);
		}
	};
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
			case "git status --porcelain=v1 --untracked-files=all":
				return ok("");
			default:
				return fail(joined);
		}
	};
}

const capabilityGatedOperations: NeutralOperationRequest[] = [
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
	{
		operation: {
			kind: "create_commit",
			stackId: "feature/api",
			message: "Commit selected change",
			selection: {
				source: "working_copy",
				paths: ["src/api.ts"],
			},
		},
	},
	{
		operation: {
			kind: "create_stack",
			name: "feature/new-selection",
			selection: {
				source: "working_copy",
				paths: ["src/api.ts"],
			},
		},
	},
];

test("JJ and Git neutral workspace previews reject capability-gated operations before provider commands", async () => {
	const providers = [
		{
			name: "jj",
			createRunner: createJjRunner,
			loadState: loadJjWorkspaceState,
			preview: previewJjWorkspaceOperation,
		},
		{
			name: "git",
			createRunner: createGitRunner,
			loadState: loadGitWorkspaceState,
			preview: previewGitWorkspaceOperation,
		},
	];

	for (const provider of providers) {
		const calls: string[] = [];
		const runner = provider.createRunner(calls);
		const state = await provider.loadState("/repo", runner, {
			targetBranch: "origin/main",
			appliedStackIds: ["feature/api"],
		});
		assert.equal(state.capabilities.supportsHunkSelection, false, `${provider.name} hunk support`);
		assert.equal(
			state.capabilities.supportsHunkRestoreDiscard,
			true,
			`${provider.name} hunk restore support`,
		);
		assert.equal(
			state.capabilities.supportsCommittedHunkSelection,
			provider.name === "jj",
			`${provider.name} committed hunk support`,
		);
		assert.equal(
			state.capabilities.supportsMoveChangesAcrossCommits,
			true,
			`${provider.name} move changes support`,
		);
		assert.equal(state.capabilities.supportsCreateStack, false, `${provider.name} create stack support`);
		assert.equal(state.capabilities.supportsWorkingCopyCommit, false, `${provider.name} working-copy commit support`);

		for (const operation of capabilityGatedOperations) {
			const beforePreviewCalls = calls.length;
			const preview = await provider.preview("/repo", operation, runner, {
				targetBranch: "origin/main",
				appliedStackIds: ["feature/api"],
			});
			assert.equal(preview.valid, false, `${provider.name} ${operation.operation.kind} validity`);
			assert.ok(preview.disabledReason, `${provider.name} ${operation.operation.kind} disabled reason`);
			assert.deepEqual(calls.slice(beforePreviewCalls), [], `${provider.name} ${operation.operation.kind} commands`);
		}
	}
});

test("Git rejects unsupported committed file moves before mutation commands", async () => {
	const calls: string[] = [];
	const runner = createGitRunner(calls);
	await loadGitWorkspaceState("/repo", runner, {
		targetBranch: "origin/main",
		appliedStackIds: ["feature/api"],
	});
	const beforePreviewCalls = calls.length;
	const preview = await previewGitWorkspaceOperation(
		"/repo",
		{
			operation: {
				kind: "move_changes",
				targetCommitId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				selection: {
					source: "commit",
					commitId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					paths: ["src/api.ts"],
				},
			},
		},
		runner,
		{
			targetBranch: "origin/main",
			appliedStackIds: ["feature/api"],
		},
	);

	assert.equal(preview.valid, false);
	assert.ok(preview.disabledReason);
	assert.ok(
		calls
			.slice(beforePreviewCalls)
			.every(
				(call) =>
					!call.startsWith("git update-ref ") &&
					!call.startsWith("git reset ") &&
					!call.startsWith("git restore ") &&
					!call.startsWith("git add ") &&
					!call.startsWith("git commit "),
			),
	);
});
