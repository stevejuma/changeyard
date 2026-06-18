import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getGitSyncSummary, runGitSyncAction } from "../packages/kanban/src/runtime-stack/workspace/git-sync.js";

function hasCommand(command: string): boolean {
	return spawnSync(command, normalizeCommandArgs(command, ["--version"]), { encoding: "utf8" }).status === 0;
}

function runCommand(command: string, args: string[], cwd: string): string {
	const result = spawnSync(command, normalizeCommandArgs(command, args), {
		cwd,
		encoding: "utf8",
		maxBuffer: 20 * 1024 * 1024,
	});
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "command failed").trim()}`);
	}
	return (result.stdout || "").trim();
}

function normalizeCommandArgs(command: string, args: string[]): string[] {
	if (command === "git") {
		return [
			"-c",
			"commit.gpgsign=false",
			"-c",
			"tag.gpgsign=false",
			...(args[0] === "commit" ? ["commit", "--no-gpg-sign", ...args.slice(1)] : args),
		];
	}
	if (command !== "jj") {
		return args;
	}
	return ["--color=never", ...args.filter((arg) => !arg.startsWith("--color"))];
}

function configureTestGitIdentity(repo: string): void {
	runCommand("git", ["config", "user.name", "Changeyard Test"], repo);
	runCommand("git", ["config", "user.email", "changeyard-test@example.test"], repo);
	runCommand("git", ["config", "commit.gpgsign", "false"], repo);
	runCommand("git", ["config", "tag.gpgSign", "false"], repo);
}

function configureTestJjIdentity(repo: string): void {
	runCommand("jj", ["config", "set", "--repo", "user.name", "Changeyard Test"], repo);
	runCommand("jj", ["config", "set", "--repo", "user.email", "changeyard-test@example.test"], repo);
	runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
	runCommand("jj", ["config", "set", "--repo", "git.sign-on-push", "false"], repo);
}

function createJjRepoWithRemote(): { root: string; repo: string; remote: string } {
	const root = mkdtempSync(path.join(os.tmpdir(), "changeyard-kanban-git-sync-"));
	const repo = path.join(root, "repo");
	const remote = path.join(root, "origin.git");
	mkdirSync(repo, { recursive: true });
	runCommand("git", ["init", "-b", "main"], repo);
	configureTestGitIdentity(repo);
	writeFileSync(path.join(repo, "README.md"), "# changeyard\n");
	runCommand("git", ["add", "README.md"], repo);
	runCommand("git", ["commit", "-m", "initial"], repo);
	runCommand("git", ["init", "--bare", remote], repo);
	runCommand("git", ["remote", "add", "origin", remote], repo);
	runCommand("jj", ["git", "init", "--colocate"], repo);
	configureTestJjIdentity(repo);
	runCommand("jj", ["git", "push", "--bookmark", "main"], repo);
	return { root, repo, remote };
}

function remoteHead(remote: string): string {
	return runCommand("git", ["--git-dir", remote, "rev-parse", "refs/heads/main"], remote);
}

test(
	"Kanban JJ sync pushes configured base bookmark and treats pull as fetch",
	{ skip: !hasCommand("git") || !hasCommand("jj") },
	async () => {
		const { root, repo, remote } = createJjRepoWithRemote();
		try {
			const initialRemoteHead = remoteHead(remote);
			runCommand("jj", ["new", "main", "-m", "local main update"], repo);
			writeFileSync(path.join(repo, "README.md"), "# changeyard\n\nlocal main update\n");
			runCommand("jj", ["bookmark", "set", "main", "-r", "@"], repo);
			runCommand("jj", ["new", "main", "-m", "second local main update"], repo);
			writeFileSync(path.join(repo, "README.md"), "# changeyard\n\nlocal main update\n\nsecond local main update\n");
			runCommand("jj", ["bookmark", "set", "main", "-r", "@"], repo);
			const localMainHead = runCommand("jj", ["log", "-r", "main", "--no-graph", "-T", "commit_id"], repo);
			runCommand("jj", ["new", "main", "-m", "empty child"], repo);
			assert.equal(runCommand("jj", ["bookmark", "list", "-r", "@"], repo), "");
			const aheadSummary = await getGitSyncSummary(repo);
			assert.equal(aheadSummary.currentBranch, null);
			assert.equal(aheadSummary.aheadCount, 2);
			assert.equal(aheadSummary.behindCount, 0);

			const missing = await runGitSyncAction({ cwd: repo, action: "push", targetRef: "missing-target-bookmark" });
			assert.equal(missing.ok, false);
			assert.match(missing.error ?? "", /Push target bookmark "missing-target-bookmark" was not found/);
			assert.equal(runCommand("jj", ["bookmark", "list", "missing-target-bookmark"], repo), "");
			assert.equal(remoteHead(remote), initialRemoteHead);

			const push = await runGitSyncAction({ cwd: repo, action: "push", targetRef: "main" });
			assert.equal(push.ok, true);
			assert.equal(push.action, "push");
			assert.equal(remoteHead(remote), localMainHead);

			const clone = path.join(root, "remote-work");
			runCommand("git", ["clone", remote, clone], root);
			configureTestGitIdentity(clone);
			runCommand("git", ["checkout", "-B", "main", "origin/main"], clone);
			writeFileSync(path.join(clone, "README.md"), "# changeyard\n\nremote update\n");
			runCommand("git", ["add", "README.md"], clone);
			runCommand("git", ["commit", "-m", "remote update"], clone);
			runCommand("git", ["push", "origin", "HEAD:main"], clone);
			const updatedRemoteHead = remoteHead(remote);

			const pull = await runGitSyncAction({ cwd: repo, action: "pull" });
			assert.equal(pull.ok, true);
			assert.equal(pull.action, "pull");
			assert.equal(pull.summary.aheadCount, 0);
			assert.equal(pull.summary.behindCount, 0);
			assert.equal(runCommand("jj", ["log", "-r", "main@origin", "--no-graph", "-T", "commit_id"], repo), updatedRemoteHead);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
);
