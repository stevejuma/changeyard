import assert from "node:assert/strict";
import test from "node:test";
import { readJjChangesForBookmarks } from "../src/vcs/jj/read.js";

test("readJjChangesForBookmarks batches large candidate bookmark sets", async () => {
	const bookmarkNames = Array.from({ length: 61 }, (_value, index) => `feature/${index}`);
	const calls: string[] = [];

	const result = await readJjChangesForBookmarks("/repo", bookmarkNames, "trunk()", async ({ command, args }) => {
		calls.push(`${command} ${args.join(" ")}`);
		return { ok: true, stdout: "", stderr: "", exitCode: 0 };
	});

	assert.equal(result.ok, true);
	assert.equal(result.changes.length, 0);
	assert.equal(calls.filter((call) => call.startsWith("jj log --revisions connected(")).length, 2);
});

test("readJjChangesForBookmarks skips malformed template rows with diagnostics", async () => {
	const result = await readJjChangesForBookmarks("/repo", ["feature/api"], "trunk()", async () => ({
		ok: true,
		stdout: ["malformed-row", "abc123\tdef456\tAPI change\ttrunk\tfeature/api\tfeature/api@origin\t1"].join("\n"),
		stderr: "",
		exitCode: 0,
	}));

	assert.equal(result.ok, true);
	assert.deepEqual(result.changes.map((change) => change.changeId), ["abc123"]);
	assert.equal(result.diagnostics[0]?.code, "jj_log_row_skipped");
});
