import assert from "node:assert/strict";
import test from "node:test";

import { parseJjOperationFiles } from "../src/vcs/jj/operations.js";

test("parseJjOperationFiles parses concise summary entries", () => {
	const files = parseJjOperationFiles("M src/app.ts\nA README.md\nD old.txt\n");

	assert.deepEqual(files, [
		{ status: "modified", path: "src/app.ts" },
		{ status: "added", path: "README.md" },
		{ status: "deleted", path: "old.txt" },
	]);
});

test("parseJjOperationFiles parses verbose operation patch headings", () => {
	const files = parseJjOperationFiles(
		[
			"Modified regular file src/query.rs:",
			"Added regular file Makefile:",
			"Deleted regular file old.rs:",
		].join("\n"),
	);

	assert.deepEqual(files, [
		{ status: "modified", path: "src/query.rs" },
		{ status: "added", path: "Makefile" },
		{ status: "deleted", path: "old.rs" },
	]);
});
