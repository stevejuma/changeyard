import assert from "node:assert/strict";
import test from "node:test";

import {
	createVcsWorkspaceCreateCommitOperationFromDrop,
	createVcsWorkspaceOperationFromDrop,
	createValidatedVcsWorkspaceOperationFromDrop,
	describeVcsWorkspaceDropTarget,
	parseVcsWorkspaceDragPayload,
	serializeVcsWorkspaceDragPayload,
	type VcsWorkspaceDragPayload,
} from "./vcs-workspace-dnd";
import { unsupportedWorkspaceCapabilities } from "./vcs-workspace-contracts";

test("parseVcsWorkspaceDragPayload round-trips a stack payload", () => {
	const payload: VcsWorkspaceDragPayload = { kind: "stack", stackId: "feature/api" };

	assert.deepEqual(parseVcsWorkspaceDragPayload(serializeVcsWorkspaceDragPayload(payload)), payload);
	assert.equal(parseVcsWorkspaceDragPayload("{"), null);
	assert.equal(parseVcsWorkspaceDragPayload(JSON.stringify({ kind: "stack", stackId: "" })), null);
});

test("createVcsWorkspaceOperationFromDrop applies stacks to the workspace", () => {
	assert.deepEqual(
		createVcsWorkspaceOperationFromDrop(
			{ kind: "stack", stackId: "feature/api" },
			{ kind: "workspace" },
		),
		{ valid: true, operation: { kind: "apply_stack", stackId: "feature/api" } },
	);
});

test("createVcsWorkspaceOperationFromDrop maps commit drops to move_commit", () => {
	assert.deepEqual(
		createVcsWorkspaceOperationFromDrop(
			{ kind: "commit", commitId: "abc123", stackId: "feature/api" },
			{ kind: "stack", stackId: "feature/ui" },
		),
		{
			valid: true,
			operation: {
				kind: "move_commit",
				commitId: "abc123",
				targetStackId: "feature/ui",
			},
		},
	);
});

test("createVcsWorkspaceOperationFromDrop maps commit-to-commit drops to squash_commits", () => {
	assert.deepEqual(
		createVcsWorkspaceOperationFromDrop(
			{ kind: "commit", commitId: "abc123", stackId: "feature/api" },
			{ kind: "commit", commitId: "def456" },
		),
		{
			valid: true,
			operation: {
				kind: "squash_commits",
				sourceCommitId: "abc123",
				targetCommitId: "def456",
			},
		},
	);
	assert.deepEqual(
		createVcsWorkspaceOperationFromDrop(
			{ kind: "commit", commitId: "abc123", stackId: "feature/api" },
			{ kind: "commit", commitId: "abc123" },
		),
		{ valid: false, reason: "Choose a different target commit." },
	);
});

test("createVcsWorkspaceOperationFromDrop maps working-copy files to amend_commit", () => {
	assert.deepEqual(
		createVcsWorkspaceOperationFromDrop(
			{ kind: "file", source: "working_copy", path: "src/api.ts" },
			{ kind: "commit", commitId: "abc123" },
		),
		{
			valid: true,
			operation: {
				kind: "amend_commit",
				commitId: "abc123",
				selection: { source: "working_copy", paths: ["src/api.ts"] },
			},
		},
	);
});

test("createVcsWorkspaceCreateCommitOperationFromDrop maps working-copy selections to create_commit", () => {
	assert.deepEqual(
		createVcsWorkspaceCreateCommitOperationFromDrop(
			{ kind: "file", source: "working_copy", path: "README.md" },
			"feature/api",
			"Add README",
		),
		{
			valid: true,
			operation: {
				kind: "create_commit",
				stackId: "feature/api",
				message: "Add README",
				selection: { source: "working_copy", paths: ["README.md"] },
			},
		},
	);
	assert.deepEqual(
		createVcsWorkspaceCreateCommitOperationFromDrop(
			{ kind: "file", source: "commit", commitId: "abc123", path: "README.md" },
			"feature/api",
			"Add README",
		),
		{
			valid: true,
			operation: {
				kind: "create_commit",
				stackId: "feature/api",
				message: "Add README",
				selection: { source: "commit", commitId: "abc123", paths: ["README.md"] },
			},
		},
	);
});

test("createVcsWorkspaceOperationFromDrop maps selected changes outside lanes to create_stack", () => {
	assert.deepEqual(
		createVcsWorkspaceOperationFromDrop(
			{ kind: "file", source: "working_copy", path: "README.md" },
			{ kind: "workspace" },
		),
		{
			valid: true,
			operation: {
				kind: "create_stack",
				name: "workspace/selection",
				selection: { source: "working_copy", paths: ["README.md"] },
			},
		},
	);
});

test("createVcsWorkspaceOperationFromDrop maps committed hunks to move_changes and uncommit_changes", () => {
	const payload: VcsWorkspaceDragPayload = {
		kind: "hunk",
		source: "commit",
		commitId: "abc123",
		hunk: {
			path: "src/api.ts",
			hunkId: "src/api.ts:1",
			oldStart: 1,
			oldLines: 2,
			newStart: 1,
			newLines: 3,
		},
	};

	assert.deepEqual(createVcsWorkspaceOperationFromDrop(payload, { kind: "commit", commitId: "def456" }), {
		valid: true,
		operation: {
			kind: "move_changes",
			targetCommitId: "def456",
			selection: { source: "commit", commitId: "abc123", hunks: [payload.hunk] },
		},
	});
	assert.deepEqual(createVcsWorkspaceOperationFromDrop(payload, { kind: "working_copy" }), {
		valid: true,
		operation: {
			kind: "uncommit_changes",
			selection: { source: "commit", commitId: "abc123", hunks: [payload.hunk] },
		},
	});
	assert.deepEqual(createVcsWorkspaceOperationFromDrop(payload, { kind: "stack_header", stackId: "feature/api" }), {
		valid: true,
		operation: {
			kind: "create_commit",
			stackId: "feature/api",
			message: "New commit",
			selection: { source: "commit", commitId: "abc123", hunks: [payload.hunk] },
		},
	});
});

test("createValidatedVcsWorkspaceOperationFromDrop rejects unsupported provider operations", () => {
	assert.deepEqual(
		createValidatedVcsWorkspaceOperationFromDrop(
			{ kind: "commit", commitId: "abc123", stackId: "feature/api" },
			{ kind: "stack", stackId: "feature/ui" },
			unsupportedWorkspaceCapabilities,
		),
		{
			valid: false,
			reason: "This provider does not support moving commits across stacks.",
		},
	);
});

test("createValidatedVcsWorkspaceOperationFromDrop allows committed hunk movement with committed hunk capability", () => {
	const hunk = {
		path: "src/api.ts",
		hunkId: "src/api.ts:1",
		oldStart: 1,
		oldLines: 2,
		newStart: 1,
		newLines: 3,
	};

	assert.deepEqual(
		createValidatedVcsWorkspaceOperationFromDrop(
			{ kind: "hunk", source: "commit", commitId: "abc123", hunk },
			{ kind: "commit", commitId: "def456" },
			{
				...unsupportedWorkspaceCapabilities,
				supportsMoveChangesAcrossCommits: true,
				supportsCommittedHunkSelection: true,
			},
		),
		{
			valid: true,
			operation: {
				kind: "move_changes",
				targetCommitId: "def456",
				selection: { source: "commit", commitId: "abc123", hunks: [hunk] },
			},
		},
	);
});

test("describeVcsWorkspaceDropTarget reports valid and invalid target feedback", () => {
	assert.deepEqual(
		describeVcsWorkspaceDropTarget(
			{ kind: "file", source: "working_copy", path: "README.md" },
			{ kind: "commit", commitId: "abc123" },
			{ ...unsupportedWorkspaceCapabilities, supportsCommitRewrite: true },
		),
		{
			state: "valid",
			operation: {
				kind: "amend_commit",
				commitId: "abc123",
				selection: { source: "working_copy", paths: ["README.md"] },
			},
		},
	);

	assert.deepEqual(
		describeVcsWorkspaceDropTarget(
			{ kind: "file", source: "working_copy", path: "README.md" },
			{ kind: "working_copy" },
			{ ...unsupportedWorkspaceCapabilities, supportsCommitRewrite: true },
		),
		{
			state: "invalid",
			reason: "Only committed changes can be moved back to the working copy.",
		},
	);

	assert.deepEqual(
		describeVcsWorkspaceDropTarget(
			{ kind: "file", source: "working_copy", path: "README.md" },
			{ kind: "workspace" },
			{ ...unsupportedWorkspaceCapabilities, supportsCreateStack: true },
		),
		{
			state: "valid",
			operation: {
				kind: "create_stack",
				name: "workspace/selection",
				selection: { source: "working_copy", paths: ["README.md"] },
			},
		},
	);
});
