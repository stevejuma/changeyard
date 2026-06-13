import assert from "node:assert/strict";
import test from "node:test";

import { parsePatchToHunks, parsePatchToRows } from "./components/shared/diff-renderer";

test("parsePatchToHunks preserves hunk metadata and rows", () => {
	const patch = [
		"diff --git a/src/app.ts b/src/app.ts",
		"index 1111111..2222222 100644",
		"--- a/src/app.ts",
		"+++ b/src/app.ts",
		"@@ -2,2 +2,3 @@ export function app() {",
		" const value = 1;",
		"-return value;",
		"+const next = value + 1;",
		"+return next;",
		"@@ -9 +10 @@ export function other() {",
		"-return false;",
		"+return true;",
	].join("\n");

	const hunks = parsePatchToHunks(patch);

	assert.equal(hunks.length, 2);
	assert.deepEqual(
		hunks.map((hunk) => ({
			id: hunk.id,
			header: hunk.header,
			oldStart: hunk.oldStart,
			oldLines: hunk.oldLines,
			newStart: hunk.newStart,
			newLines: hunk.newLines,
			rows: hunk.rows.length,
		})),
		[
			{
				id: "2:2:2:3",
				header: "@@ -2,2 +2,3 @@ export function app() {",
				oldStart: 2,
				oldLines: 2,
				newStart: 2,
				newLines: 3,
				rows: 4,
			},
			{
				id: "9:1:10:1",
				header: "@@ -9 +10 @@ export function other() {",
				oldStart: 9,
				oldLines: 1,
				newStart: 10,
				newLines: 1,
				rows: 2,
			},
		],
	);
	assert.equal(parsePatchToRows(patch).length, 6);
	assert.match(hunks[0]?.patch ?? "", /const next = value/);
});
