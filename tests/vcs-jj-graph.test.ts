import assert from "node:assert/strict";
import test from "node:test";
import { buildJjStacks } from "../src/vcs/jj/graph.js";
import type { VcsJjBookmark, VcsJjChange } from "../src/vcs/types.js";

function change(
	changeId: string,
	parentChangeIds: string[],
	description = changeId,
	bookmarks: string[] = [],
	isCurrent = false,
): VcsJjChange {
	return {
		changeId,
		commitId: `k-${changeId}`,
		description,
		parentChangeIds,
		bookmarks,
		remoteBookmarks: [],
		isCurrent,
	};
}

function bookmark(name: string, changeId: string): VcsJjBookmark {
	return { name, changeId, commitId: `k-${changeId}`, synced: true, tracked: false };
}

test("buildJjStacks groups dependent bookmarks into one newest-to-oldest stack", () => {
	const bookmarks = [bookmark("feature/base", "c1"), bookmark("feature/top", "c2")];
	const changes = [
		change("main", [], "main", ["main"]),
		change("c1", ["main"], "base", ["feature/base"]),
		change("c2", ["c1"], "top", ["feature/top"], true),
	];

	const result = buildJjStacks(bookmarks, changes, { base: "main" });

	assert.equal(result.diagnostics.length, 0);
	assert.deepEqual(
		result.stacks.map((stack) => ({
			id: stack.id,
			tip: stack.tip,
			base: stack.base,
			isCheckedOut: stack.isCheckedOut,
			heads: stack.heads.map((head) => head.bookmarkName),
			changes: stack.changes.map((stackChange) => stackChange.changeId),
		})),
		[
			{
				id: "feature/top",
				tip: "k-c2",
				base: "main",
				isCheckedOut: true,
				heads: ["feature/top", "feature/base"],
				changes: ["main", "c1", "c2"],
			},
		],
	);
});

test("buildJjStacks keeps sibling top-level bookmarks as separate stacks", () => {
	const bookmarks = [bookmark("feature/api", "c1"), bookmark("feature/ui", "c2")];
	const changes = [
		change("main", [], "main", ["main"]),
		change("shared", ["main"], "shared"),
		change("c1", ["shared"], "api", ["feature/api"]),
		change("c2", ["shared"], "ui", ["feature/ui"]),
	];

	const result = buildJjStacks(bookmarks, changes, { base: "main" });

	assert.deepEqual(
		result.stacks.map((stack) => ({
			id: stack.id,
			heads: stack.heads.map((head) => head.bookmarkName),
			changes: stack.changes.map((stackChange) => stackChange.changeId),
		})),
		[
			{ id: "feature/api", heads: ["feature/api"], changes: ["main", "shared", "c1"] },
			{ id: "feature/ui", heads: ["feature/ui"], changes: ["main", "shared", "c2"] },
		],
	);
});

test("buildJjStacks omits base and internal bookmarks", () => {
	const bookmarks = [
		bookmark("main", "main"),
		bookmark("changeyard/internal", "c1"),
		bookmark("feature/top", "c2"),
	];
	const changes = [
		change("main", [], "main", ["main"]),
		change("c1", ["main"], "internal", ["changeyard/internal"]),
		change("c2", ["c1"], "top", ["feature/top"]),
	];

	const result = buildJjStacks(bookmarks, changes, { base: "main" });

	assert.deepEqual(result.stacks.map((stack) => stack.id), ["feature/top"]);
	assert.deepEqual(result.stacks[0]?.heads.map((head) => head.bookmarkName), ["feature/top"]);
});
