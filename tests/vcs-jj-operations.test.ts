import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";

import { advanceCommitCursorFrontier, loadJjOperationDiff, parseJjOperationFiles } from "../src/vcs/jj/operations.js";
import type { RunVcsCommandInput, VcsCommandResult } from "../src/vcs/process.js";

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

test("advanceCommitCursorFrontier keeps unvisited sibling heads and adds emitted parents", () => {
	const next = advanceCommitCursorFrontier(["head-a", "head-b"], [
		{ hash: "head-a", parentHashes: ["parent-a", "shared-parent"] },
		{ hash: "parent-a", parentHashes: ["grandparent-a"] },
	]);

	assert.deepEqual(next, ["head-b", "shared-parent", "grandparent-a"]);
});

test("loadJjOperationDiff cursor pages do not rerun operation summary and patch commands", async () => {
	const commands: string[] = [];
	const atOp = "a".repeat(64);
	const head = "b".repeat(40);
	const parent = "c".repeat(40);
	const cursor = Buffer.from(
		JSON.stringify({
			kind: "operation-commits",
			atOp,
			scopeKey: `operation:${atOp}:all`,
			frontierCommitIds: [head],
			totalCount: 2,
		}),
		"utf8",
	).toString("base64url");
	const runner = async (input: RunVcsCommandInput): Promise<VcsCommandResult> => {
		commands.push([input.command, ...input.args].join(" "));
		if (input.command === "jj" && input.args[0] === "--version") {
			return { ok: true, stdout: "jj 0.42.0", stderr: "", exitCode: 0 };
		}
		if (input.command === "git" && input.args[0] === "rev-parse") {
			return { ok: false, stdout: "", stderr: "", exitCode: 1 };
		}
		if (input.command === "jj" && input.args.join(" ") === "workspace root") {
			return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
		}
		if (input.command === "jj" && input.args[0] === "op" && input.args[1] === "log") {
			return { ok: true, stdout: `${atOp}\n`, stderr: "", exitCode: 0 };
		}
		if (input.command === "jj" && input.args[0] === "log") {
			return {
				ok: true,
				stdout: [
					[
						"zzzzzzzz",
						"zzzz",
						head.slice(0, 12),
						head,
						"cursor page",
						"Steve Juma",
						"steve@example.com",
						"2026-06-13T10:00:00Z",
						parent,
						"",
						"",
						"",
						"",
						"",
						"",
					].join("\t"),
					"",
				].join("\n"),
				stderr: "",
				exitCode: 0,
			};
		}
		return { ok: false, stdout: "", stderr: `Unexpected command ${input.command} ${input.args.join(" ")}`, exitCode: 1 };
	};

	const result = await loadJjOperationDiff("/repo", runner, atOp, { cursor, pageSize: 1 });

	assert.equal(result.commits.length, 1);
	assert.equal(result.summary, "");
	assert.equal(result.patch, "");
	assert.equal(commands.some((command) => command.includes("op show") && command.includes("--summary")), false);
	assert.equal(commands.some((command) => command.includes("op show") && command.includes("--patch")), false);
});
