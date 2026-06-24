import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getCommitDiff } from "../packages/kanban/src/runtime-stack/workspace/git-history.js";

function tempDir(): string {
	return mkdtempSync(path.join(os.tmpdir(), "changeyard-git-history-"));
}

function git(repo: string, args: string[]): void {
	const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
}

test("repository commit diff returns file text only when requested", async () => {
	const repo = tempDir();
	try {
		git(repo, ["init"]);
		git(repo, ["config", "user.name", "Ada"]);
		git(repo, ["config", "user.email", "ada@example.test"]);
		writeFileSync(path.join(repo, "feature.ts"), "export const value = 1;\n");
		git(repo, ["add", "feature.ts"]);
		git(repo, ["commit", "-m", "base"]);
		writeFileSync(path.join(repo, "feature.ts"), "export const value = 2;\n");
		git(repo, ["commit", "-am", "change"]);

		const summary = await getCommitDiff({ cwd: repo, commitHash: "HEAD", baseCommitHash: "HEAD^" });
		assert.equal(summary.ok, true);
		assert.equal(summary.files[0]?.path, "feature.ts");
		assert.equal(summary.files[0]?.oldText, undefined);
		assert.equal(summary.files[0]?.newText, undefined);

		const detailed = await getCommitDiff({
			cwd: repo,
			commitHash: "HEAD",
			baseCommitHash: "HEAD^",
			includeFileText: true,
		});
		assert.equal(detailed.ok, true);
		assert.equal(detailed.files[0]?.oldText, "export const value = 1;\n");
		assert.equal(detailed.files[0]?.newText, "export const value = 2;\n");
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
