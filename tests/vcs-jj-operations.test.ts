import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";

import {
	advanceCommitCursorFrontier,
	createJjOperationSnapshot,
	loadJjOperationDiff,
	loadJjOperations,
	parseJjOperationFiles,
	revertJjOperation,
} from "../src/vcs/jj/operations.js";
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

test("loadJjOperations includes parent operation ids", async () => {
	const op = "a".repeat(64);
	const parent = "b".repeat(64);
	const runner = async (input: RunVcsCommandInput): Promise<VcsCommandResult> => {
		if (input.command === "jj" && input.args[0] === "--version") {
			return { ok: true, stdout: "jj 0.42.0", stderr: "", exitCode: 0 };
		}
		if (input.command === "git" && input.args[0] === "rev-parse") {
			return { ok: false, stdout: "", stderr: "", exitCode: 1 };
		}
		if (input.command === "jj" && input.args.join(" ") === "workspace root") {
			return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
		}
		if (
			input.command === "jj" &&
			input.args[0] === "op" &&
			input.args[1] === "log" &&
			input.args.includes("--at-op=@")
		) {
			return { ok: true, stdout: `${op}\n`, stderr: "", exitCode: 0 };
		}
		if (input.command === "jj" && input.args[0] === "op" && input.args[1] === "log") {
			return {
				ok: true,
				stdout: `${op}\tDescribe commit\tSteve Juma\t2026-06-13T10:00:00Z\t${parent}\n`,
				stderr: "",
				exitCode: 0,
			};
		}
		if (input.command === "jj" && input.args[0] === "op" && input.args[1] === "show") {
			return { ok: true, stdout: "M src/app.ts\n", stderr: "", exitCode: 0 };
		}
		return { ok: false, stdout: "", stderr: `Unexpected command ${input.command} ${input.args.join(" ")}`, exitCode: 1 };
	};

	const result = await loadJjOperations("/repo", runner, { pageSize: 1 });

	assert.equal(result.operations.length, 1);
	assert.deepEqual(result.operations[0]?.parentOperationIds, [parent]);
});

test("createJjOperationSnapshot snapshots the working copy without ignore-working-copy", async () => {
	const commands: string[] = [];
	const beforeOp = "c".repeat(64);
	const afterOp = "d".repeat(64);
	let operationReadCount = 0;
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
		if (input.command === "jj" && input.args.join(" ") === "--color=never status --no-pager") {
			return { ok: true, stdout: "Working copy changes:\n", stderr: "", exitCode: 0 };
		}
		if (input.command === "jj" && input.args[0] === "op" && input.args[1] === "log") {
			operationReadCount += 1;
			return { ok: true, stdout: `${operationReadCount === 1 ? beforeOp : afterOp}\n`, stderr: "", exitCode: 0 };
		}
		return { ok: false, stdout: "", stderr: `Unexpected command ${input.command} ${input.args.join(" ")}`, exitCode: 1 };
	};

	const result = await createJjOperationSnapshot("/repo", runner);
	const statusCommand = commands.find((command) => command.startsWith("jj --color=never status "));

	assert.equal(result.ok, true);
	assert.equal(result.operationId, afterOp);
	assert.equal(result.changed, true);
	assert.equal(statusCommand, "jj --color=never status --no-pager");
	assert.equal(statusCommand?.includes("--ignore-working-copy"), false);
});

test("createJjOperationSnapshot reports unchanged state when JJ does not create a new operation", async () => {
	const op = "c".repeat(64);
	const runner = async (input: RunVcsCommandInput): Promise<VcsCommandResult> => {
		if (input.command === "jj" && input.args[0] === "--version") {
			return { ok: true, stdout: "jj 0.42.0", stderr: "", exitCode: 0 };
		}
		if (input.command === "git" && input.args[0] === "rev-parse") {
			return { ok: false, stdout: "", stderr: "", exitCode: 1 };
		}
		if (input.command === "jj" && input.args.join(" ") === "workspace root") {
			return { ok: true, stdout: "/repo", stderr: "", exitCode: 0 };
		}
		if (input.command === "jj" && input.args.join(" ") === "--color=never status --no-pager") {
			return { ok: true, stdout: "The working copy is clean\n", stderr: "", exitCode: 0 };
		}
		if (input.command === "jj" && input.args[0] === "op" && input.args[1] === "log") {
			return { ok: true, stdout: `${op}\n`, stderr: "", exitCode: 0 };
		}
		return { ok: false, stdout: "", stderr: `Unexpected command ${input.command} ${input.args.join(" ")}`, exitCode: 1 };
	};

	const result = await createJjOperationSnapshot("/repo", runner);

	assert.equal(result.ok, true);
	assert.equal(result.changed, false);
	assert.equal(result.title, "No snapshot changes");
	assert.equal(result.summary, "No repository state changes were available to snapshot.");
});

test("revertJjOperation restores the first parent operation", async () => {
	const commands: string[] = [];
	const op = "d".repeat(64);
	const parent = "e".repeat(64);
	const current = "f".repeat(64);
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
		if (
			input.command === "jj" &&
			input.args[0] === "op" &&
			input.args[1] === "log" &&
			input.args.some((arg) => arg === `--at-op=${op}`)
		) {
			return { ok: true, stdout: `${parent}\n`, stderr: "", exitCode: 0 };
		}
		if (input.command === "jj" && input.args.join(" ") === `--color=never op restore ${parent} --no-pager`) {
			return { ok: true, stdout: "", stderr: "", exitCode: 0 };
		}
		if (
			input.command === "jj" &&
			input.args[0] === "op" &&
			input.args[1] === "log" &&
			input.args.includes("--at-op=@")
		) {
			return { ok: true, stdout: `${current}\n`, stderr: "", exitCode: 0 };
		}
		return { ok: false, stdout: "", stderr: `Unexpected command ${input.command} ${input.args.join(" ")}`, exitCode: 1 };
	};

	const result = await revertJjOperation("/repo", runner, op);

	assert.equal(result.ok, true);
	assert.equal(result.operationId, current);
	assert(commands.includes(`jj --color=never op restore ${parent} --no-pager`));
});

test("revertJjOperation reports operations without parents as unavailable", async () => {
	const op = "1".repeat(64);
	const runner = async (input: RunVcsCommandInput): Promise<VcsCommandResult> => {
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
			return { ok: true, stdout: "\n", stderr: "", exitCode: 0 };
		}
		return { ok: false, stdout: "", stderr: `Unexpected command ${input.command} ${input.args.join(" ")}`, exitCode: 1 };
	};

	const result = await revertJjOperation("/repo", runner, op);

	assert.equal(result.ok, false);
	assert.equal(result.summary, "This operation cannot be reverted because it has no parent operation.");
});
