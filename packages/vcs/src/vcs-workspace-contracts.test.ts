import assert from "node:assert/strict";
import test from "node:test";

import {
	areVcsWorkspaceOperationsEqual,
	isLowRiskVcsWorkspaceOperation,
	unsupportedWorkspaceCapabilities,
	validateVcsWorkspaceOperation,
	type VcsWorkspaceCapabilities,
	type VcsWorkspaceOperation,
} from "@/vcs-workspace-contracts";

const fullCapabilities: VcsWorkspaceCapabilities = {
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
};

test("validateVcsWorkspaceOperation accepts a supported neutral operation", () => {
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "create_commit",
				stackId: "feature/workspace",
				message: "Add workspace contract",
				selection: { source: "working_copy", paths: ["src/workspace.ts"] },
			},
			fullCapabilities,
		),
		{ valid: true, reason: null },
	);
});

test("validateVcsWorkspaceOperation rejects missing operation fields", () => {
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "create_commit",
				stackId: "",
				message: "Add workspace contract",
				selection: { source: "working_copy", paths: ["src/workspace.ts"] },
			},
			fullCapabilities,
		),
		{ valid: false, reason: "Choose a target stack." },
	);

	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "move_changes",
				selection: { source: "commit", paths: ["src/workspace.ts"] },
				targetCommitId: "target",
			},
			fullCapabilities,
		),
		{ valid: false, reason: "Choose a source commit." },
	);
});

test("validateVcsWorkspaceOperation rejects empty selections", () => {
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "discard_changes",
				selection: { source: "working_copy", paths: [], hunks: [] },
			},
			fullCapabilities,
		),
		{ valid: false, reason: "Choose at least one file or hunk." },
	);
});

test("validateVcsWorkspaceOperation gates commit rewrite operations by capability", () => {
	const operation: VcsWorkspaceOperation = {
		kind: "reword_commit",
		commitId: "commit-1",
		message: "New message",
	};

	assert.deepEqual(validateVcsWorkspaceOperation(operation, unsupportedWorkspaceCapabilities), {
		valid: false,
		reason: "This provider does not support commit rewrite operations.",
	});
});

test("validateVcsWorkspaceOperation gates stack creation by capability", () => {
	const operation: VcsWorkspaceOperation = {
		kind: "create_stack",
		name: "feature/new-work",
		selection: { source: "working_copy", paths: ["README.md"] },
	};

	assert.deepEqual(validateVcsWorkspaceOperation(operation, unsupportedWorkspaceCapabilities), {
		valid: false,
		reason: "This provider does not support creating stacks from selected changes.",
	});
	assert.deepEqual(
		validateVcsWorkspaceOperation(operation, { ...unsupportedWorkspaceCapabilities, supportsCreateStack: true }),
		{ valid: true, reason: null },
	);
});

test("validateVcsWorkspaceOperation gates hunk selections by capability", () => {
	const operation: VcsWorkspaceOperation = {
		kind: "discard_changes",
		selection: {
			source: "working_copy",
			hunks: [{ path: "src/workspace.ts", hunkId: "hunk-1" }],
		},
	};

	assert.deepEqual(validateVcsWorkspaceOperation(operation, unsupportedWorkspaceCapabilities), {
		valid: false,
		reason: "This provider does not support hunk-level workspace operations.",
	});
	assert.deepEqual(
		validateVcsWorkspaceOperation(operation, { ...unsupportedWorkspaceCapabilities, supportsHunkRestoreDiscard: true }),
		{ valid: true, reason: null },
	);
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "amend_commit",
				commitId: "commit-1",
				selection: {
					source: "working_copy",
					hunks: [{ path: "src/workspace.ts", hunkId: "hunk-1" }],
				},
			},
			{ ...unsupportedWorkspaceCapabilities, supportsHunkRestoreDiscard: true, supportsCommitRewrite: true },
		),
		{ valid: true, reason: null },
	);
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "create_commit",
				stackId: "feature/workspace",
				message: "Add workspace contract",
				selection: {
					source: "commit",
					commitId: "commit-1",
					hunks: [{ path: "src/workspace.ts", hunkId: "hunk-1" }],
				},
			},
			{ ...unsupportedWorkspaceCapabilities, supportsCommittedHunkSelection: true, supportsMoveChangesAcrossCommits: true },
		),
		{ valid: true, reason: null },
	);
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "create_commit",
				stackId: "feature/workspace",
				message: "Add workspace contract",
				selection: {
					source: "working_copy",
					hunks: [{ path: "src/workspace.ts", hunkId: "hunk-1" }],
				},
			},
			{ ...unsupportedWorkspaceCapabilities, supportsWorkingCopyCommit: true },
		),
		{ valid: true, reason: null },
	);
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "move_changes",
				targetCommitId: "commit-2",
				selection: {
					source: "commit",
					commitId: "commit-1",
					hunks: [{ path: "src/workspace.ts", hunkId: "hunk-1" }],
				},
			},
			{ ...unsupportedWorkspaceCapabilities, supportsCommittedHunkSelection: true, supportsMoveChangesAcrossCommits: true },
		),
		{ valid: true, reason: null },
	);
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "discard_changes",
				selection: {
					source: "commit",
					commitId: "commit-1",
					hunks: [{ path: "src/workspace.ts", hunkId: "hunk-1" }],
				},
			},
			{ ...unsupportedWorkspaceCapabilities, supportsHunkRestoreDiscard: true },
		),
		{
			valid: false,
			reason: "This provider does not support hunk-level workspace operations.",
		},
	);
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "discard_changes",
				selection: {
					source: "commit",
					commitId: "commit-1",
					hunks: [{ path: "src/workspace.ts", hunkId: "hunk-1" }],
				},
			},
			{ ...unsupportedWorkspaceCapabilities, supportsCommittedHunkSelection: true },
		),
		{ valid: true, reason: null },
	);
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "amend_commit",
				commitId: "commit-1",
				selection: {
					source: "working_copy",
					hunks: [{ path: "src/workspace.ts", hunkId: "hunk-1" }],
				},
			},
			{ ...unsupportedWorkspaceCapabilities, supportsCommittedHunkSelection: true, supportsCommitRewrite: true },
		),
		{ valid: true, reason: null },
	);
});

test("validateVcsWorkspaceOperation rejects same-source squash operations", () => {
	assert.deepEqual(
		validateVcsWorkspaceOperation(
			{
				kind: "squash_commits",
				sourceCommitId: "same",
				targetCommitId: "same",
			},
			fullCapabilities,
		),
		{ valid: false, reason: "Choose two different commits." },
	);
});

test("isLowRiskVcsWorkspaceOperation requires previews for repository mutations", () => {
	assert.equal(isLowRiskVcsWorkspaceOperation({ kind: "apply_stack", stackId: "feature/api" }, "jj"), false);
	assert.equal(isLowRiskVcsWorkspaceOperation({ kind: "unapply_stack", stackId: "feature/api" }, "jj"), false);
	assert.equal(isLowRiskVcsWorkspaceOperation({ kind: "apply_stack", stackId: "feature/api" }, "git"), false);
	assert.equal(
		isLowRiskVcsWorkspaceOperation(
			{ kind: "reword_commit", commitId: "commit-1", message: "New message" },
			"jj",
		),
		false,
	);
});

test("areVcsWorkspaceOperationsEqual detects stale preview operations", () => {
	const operation: VcsWorkspaceOperation = {
		kind: "amend_commit",
		commitId: "commit-1",
		selection: { source: "working_copy", paths: ["src/api.ts"] },
	};

	assert.equal(areVcsWorkspaceOperationsEqual(operation, { ...operation }), true);
	assert.equal(
		areVcsWorkspaceOperationsEqual(operation, {
			kind: "amend_commit",
			commitId: "commit-2",
			selection: { source: "working_copy", paths: ["src/api.ts"] },
		}),
		false,
	);
});
