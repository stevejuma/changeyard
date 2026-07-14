import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import type { RuntimeChangeyardChangeDetail } from "../core/api-contract.js";
import { createChangesApi, type RuntimeChangeyardApiAdapter } from "../trpc/changes-api.js";

const execFileAsync = promisify(execFile);

async function runJj(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("jj", ["--color=never", ...args], {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			NO_COLOR: "1",
			CLICOLOR: "0",
			CLICOLOR_FORCE: "0",
			FORCE_COLOR: "0",
		},
	});
	return String(stdout ?? "").trim();
}

function createChange(overrides: Partial<RuntimeChangeyardChangeDetail>): RuntimeChangeyardChangeDetail {
	const id = overrides.id ?? "CY-0001";
	return {
		id,
		title: overrides.title ?? "Board change",
		type: "feature",
		status: overrides.status ?? "in_progress",
		path: `.changeyard/changes/${id}.md`,
		base: { revision: "main" },
		labels: [],
		updatedAt: "2026-06-23T12:00:00.000Z",
		planning: null,
		dependencies: { blockedBy: [], blocks: [] },
		workspace: { path: `.changeyard/workspaces/${id}/repo`, branch: `cy/${id}` },
		body: "",
		sections: [],
		...overrides,
	};
}

function createApi(change: RuntimeChangeyardChangeDetail) {
	return createChangesApi({
		changeyardApi: {
			getChange: async (_repoRoot: string, input: { id: string }) => (input.id === change.id ? change : null),
		} as RuntimeChangeyardApiAdapter,
	});
}

test("change board reads merged changes from landed JJ metadata", async () => {
	const repoRoot = await mkdtemp(path.join(tmpdir(), "change-board-api-"));
	try {
		await runJj(repoRoot, ["git", "init", "--colocate"]);
		await runJj(repoRoot, ["config", "set", "--repo", "user.name", "Test User"]);
		await runJj(repoRoot, ["config", "set", "--repo", "user.email", "test@example.com"]);
		await runJj(repoRoot, ["config", "set", "--repo", "signing.behavior", "drop"]);
		await writeFile(path.join(repoRoot, ".gitignore"), ".changeyard/\n", "utf8");
		await writeFile(path.join(repoRoot, "note.txt"), "one\n", "utf8");
		await runJj(repoRoot, ["file", "track", ".gitignore", "note.txt"]);
		await runJj(repoRoot, ["describe", "-m", "base commit"]);
		await runJj(repoRoot, ["new"]);
		await writeFile(path.join(repoRoot, "note.txt"), "two\n", "utf8");
		await runJj(repoRoot, ["describe", "-m", "landed change"]);

		const baseCommitId = await runJj(repoRoot, ["log", "--ignore-working-copy", "--at-op=@", "-r", "@-", "--no-graph", "-T", "commit_id"]);
		const workspaceChangeId = await runJj(repoRoot, [
			"log",
			"--ignore-working-copy",
			"--at-op=@",
			"-r",
			"@",
			"--no-graph",
			"-T",
			"change_id.short()",
		]);
		const workspacePath = path.join(repoRoot, ".changeyard/workspaces/CY-0001");
		await mkdir(workspacePath, { recursive: true });
		await writeFile(
			path.join(workspacePath, "metadata.json"),
			JSON.stringify({
				changeId: "CY-0001",
				engine: "jj",
				path: ".changeyard/workspaces/CY-0001/repo",
				repoRoot,
				baseCommitId,
				workspaceChangeId,
			}),
			"utf8",
		);

		const api = createApi(createChange({ status: "merged" }));

		const summary = await api.loadChangeBoardSummary(repoRoot, { id: "CY-0001" });
		assert.equal(summary.ok, true);
		assert.equal(summary.error, undefined);
		assert.equal(summary.source?.kind, "landed");
		assert.equal(summary.files.count, 1);
		assert.equal(summary.files.additions, 1);
		assert.equal(summary.files.deletions, 1);
		assert.equal(summary.commits.length, 1);
		assert.equal(summary.commits[0]?.message, "landed change");

		const files = await api.loadChangeBoardFiles(repoRoot, { id: "CY-0001", scope: "all" });
		assert.equal(files.ok, true);
		assert.deepEqual(files.files, [
			{ path: "note.txt", previousPath: undefined, status: "modified", additions: 1, deletions: 1 },
		]);

		const diff = await api.loadChangeBoardFileDiff(repoRoot, { id: "CY-0001", scope: "all", path: "note.txt" });
		assert.equal(diff.ok, true);
		assert.equal(diff.file?.oldText, null);
		assert.equal(diff.file?.newText, null);
		assert.match(diff.patch ?? "", /-one/);
		assert.match(diff.patch ?? "", /\+two/);
	} finally {
		await rm(repoRoot, { recursive: true, force: true });
	}
});

test("change board returns a quiet source for missing active workspaces", async () => {
	const repoRoot = await mkdtemp(path.join(tmpdir(), "change-board-missing-workspace-"));
	try {
		const api = createApi(createChange({ id: "CY-0002", workspace: { path: ".changeyard/workspaces/CY-0002/repo", branch: "cy/CY-0002" } }));

		const summary = await api.loadChangeBoardSummary(repoRoot, { id: "CY-0002" });
		assert.equal(summary.ok, true);
		assert.equal(summary.error, undefined);
		assert.equal(summary.source?.kind, "workspace_deleted");
		assert.deepEqual(summary.files, { count: 0, additions: 0, deletions: 0 });
		assert.deepEqual(summary.commits, []);

		const files = await api.loadChangeBoardFiles(repoRoot, { id: "CY-0002", scope: "all" });
		assert.equal(files.ok, true);
		assert.equal(files.error, undefined);
		assert.deepEqual(files.files, []);
	} finally {
		await rm(repoRoot, { recursive: true, force: true });
	}
});
