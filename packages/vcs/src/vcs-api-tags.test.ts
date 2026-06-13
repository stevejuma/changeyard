import assert from "node:assert/strict";
import test from "node:test";

import { tagsForVcsEvent, VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS, type VcsApiTag } from "./runtime/vcs-api";

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
