import assert from "node:assert/strict";
import test from "node:test";
import { buildJjStackLanes } from "../src/vcs/jj/graph.js";
import type { VcsJjBookmark, VcsJjChange } from "../src/vcs/types.js";

test("buildJjStackLanes constructs sibling stacks from a shared parent", () => {
	const bookmarks: VcsJjBookmark[] = [
		{ name: "bookmark1", changeId: "c1", commitId: "k1", synced: true, tracked: false },
		{ name: "bookmark2", changeId: "c2", commitId: "k2", synced: true, tracked: false },
		{ name: "bookmark3", changeId: "c3", commitId: "k3", synced: true, tracked: false },
	];
	const changes: VcsJjChange[] = [
		{
			changeId: "trunk",
			commitId: "root",
			description: "trunk",
			parentChangeIds: [],
			bookmarks: [],
			remoteBookmarks: [],
			isCurrent: false,
		},
		{
			changeId: "c3",
			commitId: "k3",
			description: "shared",
			parentChangeIds: ["trunk"],
			bookmarks: ["bookmark3"],
			remoteBookmarks: [],
			isCurrent: false,
		},
		{
			changeId: "c1",
			commitId: "k1",
			description: "branch one",
			parentChangeIds: ["c3"],
			bookmarks: ["bookmark1"],
			remoteBookmarks: [],
			isCurrent: false,
		},
		{
			changeId: "c2",
			commitId: "k2",
			description: "branch two",
			parentChangeIds: ["c3"],
			bookmarks: ["bookmark2"],
			remoteBookmarks: [],
			isCurrent: false,
		},
	];

	const result = buildJjStackLanes(bookmarks, changes);

	assert.equal(result.diagnostics.length, 0);
	assert.deepEqual(
		result.lanes.map((lane) => ({ head: lane.headBookmark, changes: lane.segments.map((segment) => segment.changeId) })),
		[
			{ head: "bookmark1", changes: ["trunk", "c3", "c1"] },
			{ head: "bookmark2", changes: ["trunk", "c3", "c2"] },
			{ head: "bookmark3", changes: ["trunk", "c3"] },
		],
	);
});

test("buildJjStackLanes preserves deeper branch paths", () => {
	const bookmarks: VcsJjBookmark[] = [
		{ name: "bookmark3", changeId: "c3", commitId: "k3", synced: true, tracked: false },
		{ name: "bookmark5", changeId: "c5", commitId: "k5", synced: true, tracked: false },
		{ name: "bookmark6", changeId: "c6", commitId: "k6", synced: true, tracked: false },
	];
	const changes: VcsJjChange[] = [
		{ changeId: "c1", commitId: "k1", description: "one", parentChangeIds: [], bookmarks: [], remoteBookmarks: [], isCurrent: false },
		{ changeId: "c2", commitId: "k2", description: "two", parentChangeIds: ["c1"], bookmarks: [], remoteBookmarks: [], isCurrent: false },
		{ changeId: "c3", commitId: "k3", description: "three", parentChangeIds: ["c2"], bookmarks: ["bookmark3"], remoteBookmarks: [], isCurrent: false },
		{ changeId: "c4", commitId: "k4", description: "four", parentChangeIds: ["c2"], bookmarks: [], remoteBookmarks: [], isCurrent: false },
		{ changeId: "c5", commitId: "k5", description: "five", parentChangeIds: ["c4"], bookmarks: ["bookmark5"], remoteBookmarks: [], isCurrent: false },
		{ changeId: "c6", commitId: "k6", description: "six", parentChangeIds: ["c4"], bookmarks: ["bookmark6"], remoteBookmarks: [], isCurrent: false },
	];

	const result = buildJjStackLanes(bookmarks, changes);

	assert.deepEqual(
		result.lanes.map((lane) => ({ head: lane.headBookmark, changes: lane.segments.map((segment) => segment.changeId) })),
		[
			{ head: "bookmark5", changes: ["c1", "c2", "c4", "c5"] },
			{ head: "bookmark6", changes: ["c1", "c2", "c4", "c6"] },
			{ head: "bookmark3", changes: ["c1", "c2", "c3"] },
		],
	);
});
