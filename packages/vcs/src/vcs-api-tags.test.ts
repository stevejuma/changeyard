import assert from "node:assert/strict";
import test from "node:test";

import {
	patchWorkspaceStateFromOperationResult,
	tagsForVcsEvent,
	VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS,
	type VcsApiTag,
} from "./runtime/vcs-api";
import type { VcsOperationResult, VcsWorkspaceCommit, VcsWorkspaceStack, VcsWorkspaceState } from "./vcs-workspace-contracts";

test("workspace operation apply invalidates every neutral VCS view tag", () => {
	const requiredTags: VcsApiTag[] = [
		"Stacks",
		"StackDetails",
		"WorktreeChanges",
		"BranchListing",
		"BranchDetails",
		"HeadSha",
		"BaseBranchData",
		"DivergentBookmarks",
		"Diff",
		"CommitChanges",
		"ConflictFile",
		"OperationHistory",
		"OperationDetails",
		"RepositoryLog",
	];
	const invalidationTags: readonly VcsApiTag[] = VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS;

	for (const tag of requiredTags) {
		assert.ok(invalidationTags.includes(tag), `missing ${tag}`);
	}
	assert.equal(new Set(VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS).size, VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS.length);
});

test("workspace watcher events invalidate neutral workspace cache tags", () => {
	const requiredByEvent = {
		worktree_changes: [
			"WorktreeChanges",
			"Diff",
			"CommitChanges",
			"ConflictFile",
			"Stacks",
			"StackDetails",
			"BranchListing",
			"BranchDetails",
			"RepositoryLog",
		],
		"vcs/head": [
			"HeadSha",
			"Stacks",
			"StackDetails",
			"BranchDetails",
			"Diff",
			"CommitChanges",
			"ConflictFile",
			"VcsDetection",
		],
		"vcs/activity": [
			"Stacks",
			"StackDetails",
			"BranchListing",
			"BranchDetails",
			"BaseBranchData",
			"DivergentBookmarks",
			"HeadSha",
			"ConflictFile",
			"OperationHistory",
			"OperationDetails",
			"RepositoryLog",
		],
		"vcs/fetch": [
			"BranchListing",
			"BaseBranchData",
			"DivergentBookmarks",
			"VcsDetection",
		],
	} satisfies Record<string, VcsApiTag[]>;

	for (const [eventKind, requiredTags] of Object.entries(requiredByEvent)) {
		const invalidationTags = tagsForVcsEvent(eventKind as Parameters<typeof tagsForVcsEvent>[0]);
		for (const tag of requiredTags) {
			assert.ok(invalidationTags.includes(tag), `${eventKind} missing ${tag}`);
		}
		assert.equal(new Set(invalidationTags).size, invalidationTags.length, `${eventKind} has duplicate tags`);
	}
});

function createTestCommit(overrides: Partial<VcsWorkspaceCommit> = {}): VcsWorkspaceCommit {
	return {
		commitId: "api222",
		displayId: "22222222",
		title: "API change",
		description: "Original body",
		authorName: "Bob",
		authorEmail: "bob@example.com",
		authorAvatarUrl: null,
		timestamp: "2026-01-01T11:00:00Z",
		parentCommitIds: ["root111"],
		stackIds: ["feature/api"],
		isHead: true,
		isCurrent: true,
		files: [],
		...overrides,
	};
}

function createTestStack(overrides: Partial<VcsWorkspaceStack> = {}): VcsWorkspaceStack {
	return {
		stackId: "feature/api",
		name: "feature/api",
		targetRef: null,
		baseRef: null,
		headCommitId: "api222",
		isApplied: true,
		isCurrent: true,
		commits: [createTestCommit()],
		...overrides,
	};
}

function createTestWorkspace(overrides: Partial<VcsWorkspaceState> = {}): VcsWorkspaceState {
	return {
		projectId: "/repo",
		provider: "jj",
		targetRef: "main",
		headId: "api222",
		mode: "normal",
		capabilities: {
			supportsMultiAppliedWorkspace: true,
			supportsHunkSelection: true,
			supportsHunkRestoreDiscard: true,
			supportsCommittedHunkSelection: true,
			supportsCommitRewrite: true,
			supportsMoveCommitAcrossStacks: true,
			supportsMoveChangesAcrossCommits: true,
			supportsUndoRedo: true,
			supportsSyntheticWorkspaceMerge: true,
			supportsCreateStack: true,
			supportsWorkingCopyCommit: true,
		},
		stacks: [createTestStack()],
		appliedStackIds: ["feature/api"],
		workingCopy: {
			files: [],
			hasConflicts: false,
			summary: {
				modified: 0,
				added: 0,
				deleted: 0,
				renamed: 0,
				copied: 0,
				unknown: 0,
			},
		},
		conflicts: [],
		...overrides,
	};
}

function createOperationResult(overrides: Partial<VcsOperationResult>): VcsOperationResult {
	return {
		ok: true,
		operation: { kind: "reword_commit", commitId: "api222", message: "Refined API change" },
		title: "Operation applied",
		summary: "Updated api222.",
		affectedStackIds: ["feature/api"],
		affectedCommitIds: ["api222"],
		affectedPaths: [],
		recovery: null,
		diagnostics: [],
		...overrides,
	};
}

test("workspace operation cache patch updates commit metadata without replacing stacks", () => {
	const workspace = createTestWorkspace();
	const originalStack = workspace.stacks[0];
	const patched = patchWorkspaceStateFromOperationResult(
		workspace,
		createOperationResult({
			cacheUpdate: "commits",
			cachePayload: {
				commits: [
					createTestCommit({
						title: "Refined API change",
						description: "Updated markdown body",
						stackIds: [],
					}),
				],
			},
			invalidateTags: ["OperationHistory", "OperationDetails", "RepositoryLog"],
		}),
	);

	assert.equal(patched, true);
	assert.equal(workspace.stacks[0], originalStack);
	assert.equal(workspace.stacks[0]?.commits[0]?.title, "Refined API change");
	assert.equal(workspace.stacks[0]?.commits[0]?.description, "Updated markdown body");
	assert.deepEqual(workspace.stacks[0]?.commits[0]?.stackIds, ["feature/api"]);
});

test("workspace operation cache patch replaces affected stacks and removes deleted stacks", () => {
	const workspace = createTestWorkspace({
		stacks: [
			createTestStack(),
			createTestStack({
				stackId: "feature/ui",
				name: "feature/ui",
				headCommitId: "ui333",
				isApplied: true,
				isCurrent: false,
				commits: [createTestCommit({ commitId: "ui333", displayId: "33333333", title: "UI change", stackIds: ["feature/ui"] })],
			}),
		],
		appliedStackIds: ["feature/api", "feature/ui"],
	});
	const patched = patchWorkspaceStateFromOperationResult(
		workspace,
		createOperationResult({
			cacheUpdate: "stacks",
			cachePayload: {
				stacks: [
					createTestStack({
						headCommitId: "new444",
						commits: [
							createTestCommit({ commitId: "new444", displayId: "44444444", title: "New API head", stackIds: ["feature/api"] }),
							createTestCommit(),
						],
					}),
				],
				removedStackIds: ["feature/ui"],
			},
			invalidateTags: ["BranchListing"],
		}),
	);

	assert.equal(patched, true);
	assert.deepEqual(workspace.stacks.map((stack) => stack.stackId), ["feature/api"]);
	assert.deepEqual(workspace.appliedStackIds, ["feature/api"]);
	assert.equal(workspace.stacks[0]?.headCommitId, "new444");
	assert.deepEqual(workspace.stacks[0]?.commits.map((commit) => commit.commitId), ["new444", "api222"]);
});
