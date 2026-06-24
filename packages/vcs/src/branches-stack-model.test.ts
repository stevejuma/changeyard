import assert from "node:assert/strict";
import test from "node:test";

import {
	applyWorkspaceStackId,
	createBranchSelectionFallbackStack,
	findApplicableStackForBranchSelection,
	findContainingStackForBranchSelection,
	findStackForBranchSelection,
	groupStackChangesByHead,
	normalizeAppliedStackIds,
	selectActiveAppliedStackIds,
	selectAppliedWorkspaceStacks,
	stackChangeMatchesSelection,
	selectStackChangeGroupsForBranchDetail,
	selectStackChangeGroupsForSelection,
	unapplyWorkspaceStackId,
	type BranchesStack,
} from "./branches-stack-model";
import type { VcsJjInventoryItem } from "./runtime/types";

function change(changeId: string, bookmarks: string[] = []): BranchesStack["changes"][number] {
	return {
		id: changeId,
		changeId,
		commitId: `${changeId}commit`,
		title: `${changeId} title`,
		description: `${changeId} title`,
		authorName: null,
		authorEmail: null,
		authorAvatarUrl: null,
		timestamp: null,
		bookmarks,
		remoteBookmarks: [],
		isCurrent: false,
		isHead: bookmarks.length > 0,
	};
}

function head(bookmarkName: string, changeId: string): BranchesStack["heads"][number] {
	return {
		id: bookmarkName,
		bookmarkName,
		changeId,
		commitId: `${changeId}commit`,
		title: `${bookmarkName} title`,
		isCheckedOut: false,
	};
}

function stack(id: string): BranchesStack {
	return {
		id,
		tip: "c4commit",
		base: "main",
		order: 0,
		isCheckedOut: false,
		heads: [head("feature/top", "c4"), head("feature/base", "c2")],
		changes: [
			change("c1"),
			change("c2", ["feature/base"]),
			change("c3"),
			change("c4", ["feature/top"]),
		],
	};
}

function item(input: Partial<VcsJjInventoryItem>): VcsJjInventoryItem {
	return {
		id: input.id ?? "bookmark:feature/top",
		name: input.name ?? "feature/top",
		type: input.type ?? "bookmark",
		group: input.group ?? "local",
		changeId: input.changeId ?? null,
		commitId: input.commitId ?? null,
		title: input.title ?? null,
		authorName: input.authorName ?? null,
		authorEmail: input.authorEmail ?? null,
		authorAvatarUrl: input.authorAvatarUrl ?? null,
		timestamp: input.timestamp ?? null,
		target: input.target ?? input.name ?? "feature/top",
		remoteName: input.remoteName ?? null,
		hasLocal: input.hasLocal ?? input.type !== "remote",
		remotes: input.remotes ?? [],
		synced: input.synced ?? false,
		tracked: input.tracked ?? false,
		isCurrent: input.isCurrent ?? false,
		pr: input.pr ?? null,
	};
}

test("findStackForBranchSelection matches top bookmark names", () => {
	const selected = findStackForBranchSelection([stack("feature/top")], {
		refName: "feature/top",
		item: item({ name: "feature/top" }),
	});

	assert.equal(selected?.id, "feature/top");
});

test("findStackForBranchSelection leaves inner bookmarks detached from stack rows", () => {
	const selected = findStackForBranchSelection([stack("feature/top")], {
		refName: "feature/base",
		item: item({ name: "feature/base", target: "feature/base" }),
	});

	assert.equal(selected, null);
});

test("findContainingStackForBranchSelection maps inner bookmarks to the containing stack", () => {
	const selected = findContainingStackForBranchSelection([stack("feature/top")], {
		refName: "feature/base",
		item: item({ name: "feature/base", target: "feature/base" }),
	});

	assert.equal(selected?.id, "feature/top");
});

test("findApplicableStackForBranchSelection maps inner bookmarks to canonical containing stack ids", () => {
	const selected = findApplicableStackForBranchSelection([stack("feature/top")], {
		refName: "feature/base",
		item: item({ name: "feature/base", target: "feature/base" }),
	});

	assert.equal(selected?.id, "feature/top");
});

test("findStackForBranchSelection does not map the current workspace target by change id", () => {
	const selected = findStackForBranchSelection([stack("feature/top")], {
		refName: "@",
		item: item({ id: "current:@", name: "Current change", type: "current", group: "current", target: "@", changeId: "c3" }),
	});

	assert.equal(selected, null);
});

test("findContainingStackForBranchSelection can locate current work by change id", () => {
	const selected = findContainingStackForBranchSelection([stack("feature/top")], {
		refName: "@",
		item: item({ id: "current:@", name: "Current change", type: "current", group: "current", target: "@", changeId: "c3" }),
	});

	assert.equal(selected?.id, "feature/top");
});

test("findStackForBranchSelection does not map the configured workspace target into active stacks", () => {
	const selected = findStackForBranchSelection([stack("feature/top")], {
		refName: "origin/main",
		item: item({
			id: "workspace-target:origin/main",
			name: "origin/main",
			type: "workspace",
			group: "current",
			target: "main",
			changeId: "c1",
			commitId: "c1commit",
			remoteName: "origin",
		}),
	});

	assert.equal(selected, null);
});

test("findStackForBranchSelection leaves unknown remote refs unmatched", () => {
	const selected = findStackForBranchSelection([stack("feature/top")], {
		refName: "origin/unknown",
		item: item({ name: "origin/unknown", type: "remote", group: "remote", target: "origin/unknown", commitId: "zzzzzz" }),
	});

	assert.equal(selected, null);
});

test("createBranchSelectionFallbackStack renders the unbookmarked workspace target as one stack", () => {
	const fallback = createBranchSelectionFallbackStack({
		refName: "@",
		item: item({ id: "current:@", name: "Current change", type: "current", group: "current", target: "@", changeId: "abc123", commitId: "def456" }),
	});

	assert.deepEqual(
		fallback && {
			id: fallback.id,
			isCheckedOut: fallback.isCheckedOut,
			heads: fallback.heads.map((entry) => entry.bookmarkName),
			changes: fallback.changes.map((entry) => entry.commitId),
		},
		{
			id: "Current change",
			isCheckedOut: true,
			heads: ["Current change"],
			changes: ["def456"],
		},
	);
});

test("createBranchSelectionFallbackStack renders base bookmarks like main as read-only branch stacks", () => {
	const fallback = createBranchSelectionFallbackStack({
		refName: "main",
		item: item({ id: "bookmark:main", name: "main", type: "bookmark", group: "older", target: "main", changeId: "abc123", commitId: "def456" }),
	});

	assert.deepEqual(
		fallback && {
			id: fallback.id,
			base: fallback.base,
			isCheckedOut: fallback.isCheckedOut,
			heads: fallback.heads.map((entry) => entry.bookmarkName),
			changes: fallback.changes.map((entry) => ({ commitId: entry.commitId, bookmarks: entry.bookmarks })),
		},
		{
			id: "main",
			base: "repository",
			isCheckedOut: false,
			heads: ["main"],
			changes: [{ commitId: "def456", bookmarks: ["main"] }],
		},
	);
});

test("createBranchSelectionFallbackStack renders the configured workspace target as a read-only stack", () => {
	const fallback = createBranchSelectionFallbackStack({
		refName: "origin/main",
		item: item({
			id: "workspace-target:origin/main",
			name: "origin/main",
			type: "workspace",
			group: "current",
			target: "main",
			changeId: "abc123",
			commitId: "def456",
			remoteName: "origin",
		}),
	});

	assert.deepEqual(
		fallback && {
			id: fallback.id,
			base: fallback.base,
			heads: fallback.heads.map((entry) => entry.bookmarkName),
			remoteBookmarks: fallback.changes.flatMap((entry) => entry.remoteBookmarks),
		},
		{
			id: "origin/main",
			base: "repository",
			heads: ["origin/main"],
			remoteBookmarks: ["main@origin"],
		},
	);
});

test("createBranchSelectionFallbackStack renders local branches that only have a commit id", () => {
	const fallback = createBranchSelectionFallbackStack({
		refName: "local-only",
		item: item({ id: "branch:local-only", name: "local-only", type: "branch", group: "local", target: "local-only", commitId: "def456" }),
	});

	assert.deepEqual(fallback?.changes.map((entry) => ({ changeId: entry.changeId, commitId: entry.commitId })), [
		{ changeId: "def456", commitId: "def456" },
	]);
});

test("createBranchSelectionFallbackStack does not render remote refs as stacks", () => {
	const fallback = createBranchSelectionFallbackStack({
		refName: "origin/unknown",
		item: item({ name: "origin/unknown", type: "remote", group: "remote", target: "origin/unknown", commitId: "def456" }),
	});

	assert.equal(fallback, null);
});

test("normalizeAppliedStackIds trims and deduplicates persisted stack ids", () => {
	assert.deepEqual(normalizeAppliedStackIds([" feature/top ", "", "feature/base", "feature/top"]), [
		"feature/top",
		"feature/base",
	]);
});

test("applyWorkspaceStackId appends a stack id once and preserves order", () => {
	assert.deepEqual(applyWorkspaceStackId(["feature/base"], "feature/top"), ["feature/base", "feature/top"]);
	assert.deepEqual(applyWorkspaceStackId(["feature/top"], "feature/top"), ["feature/top"]);
});

test("unapplyWorkspaceStackId removes only the selected stack id", () => {
	assert.deepEqual(unapplyWorkspaceStackId(["feature/base", "feature/top", "feature/other"], "feature/top"), [
		"feature/base",
		"feature/other",
	]);
});

test("selectAppliedWorkspaceStacks preserves applied order and ignores missing stack ids", () => {
	const first = stack("feature/first");
	const second = stack("feature/second");

	assert.deepEqual(selectAppliedWorkspaceStacks([first, second], ["missing", "feature/second", "feature/first"]).map((entry) => entry.id), [
		"feature/second",
		"feature/first",
	]);
});

test("selectAppliedWorkspaceStacks preserves stack pull request metadata", () => {
	const first: BranchesStack = {
		...stack("feature/first"),
		pr: {
			number: 7,
			url: "https://example.test/pull/7",
			baseBranch: "main",
			headBranch: "feature/first",
			title: "Feature first",
			state: "open",
		},
	};
	const [selected] = selectAppliedWorkspaceStacks([first], ["feature/first"]);

	assert.equal(selected?.pr?.number, 7);
	assert.equal(selected?.pr?.title, "Feature first");
});

test("selectActiveAppliedStackIds prefers edit mode snapshot over configured and provider stacks", () => {
	assert.deepEqual(selectActiveAppliedStackIds(["configured"], ["provider"], ["editing"]), ["editing"]);
	assert.deepEqual(selectActiveAppliedStackIds(["configured"], ["provider"], []), ["configured"]);
	assert.deepEqual(selectActiveAppliedStackIds([], ["provider"], null), ["provider"]);
});

test("stackChangeMatchesSelection accepts stable change ids and rewritten commit ids", () => {
	const candidate = change("change123456", ["feature/top"]);
	assert.equal(stackChangeMatchesSelection(candidate, "change123456"), true);
	assert.equal(stackChangeMatchesSelection(candidate, "change123"), true);
	assert.equal(stackChangeMatchesSelection(candidate, "change123456commit"), true);
	assert.equal(stackChangeMatchesSelection(candidate, "other123456"), false);
});

test("groupStackChangesByHead slices root-to-tip changes into newest-to-oldest head groups", () => {
	const groups = groupStackChangesByHead(stack("feature/top"));

	assert.deepEqual(
		groups.map((group) => ({
			head: group.head.bookmarkName,
			changes: group.changes.map((entry) => entry.changeId),
		})),
		[
			{ head: "feature/top", changes: ["c4", "c3"] },
			{ head: "feature/base", changes: ["c2", "c1"] },
		],
	);
});

test("selectStackChangeGroupsForSelection scopes an inner bookmark to its own commits", () => {
	const groups = selectStackChangeGroupsForSelection(stack("feature/top"), {
		refName: "feature/base",
		item: item({ name: "feature/base", target: "feature/base", changeId: "c2", commitId: "c2commit" }),
	});

	assert.deepEqual(
		groups.map((group) => ({
			head: group.head.bookmarkName,
			changes: group.changes.map((entry) => entry.changeId),
		})),
		[{ head: "feature/base", changes: ["c2", "c1"] }],
	);
});

test("selectStackChangeGroupsForBranchDetail shows children without selected branch parents", () => {
	const groups = selectStackChangeGroupsForBranchDetail(stack("feature/top"), {
		refName: "feature/base",
		item: item({ name: "feature/base", target: "feature/base", changeId: "c2", commitId: "c2commit" }),
	});

	assert.deepEqual(
		groups.map((group) => ({
			head: group.head.bookmarkName,
			changes: group.changes.map((entry) => entry.changeId),
		})),
		[
			{ head: "feature/top", changes: ["c4", "c3"] },
			{ head: "feature/base", changes: ["c2"] },
		],
	);
});
