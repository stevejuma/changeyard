import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getVcsPullRequestChecks, getVcsPullRequestDetails, updateVcsPullRequestDetails } from "../src/vcs/pr-actions.js";
import { listGitHubCliPullRequests } from "../src/vcs/github-cli-pr.js";

function tempDir(): string {
	return mkdtempSync(path.join(os.tmpdir(), "changeyard-gh-cli-pr-"));
}

function installFakeGh(binDir: string, logPath: string): void {
	const script = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const pullRequest = {
  number: 5,
  url: "https://github.com/example/repo/pull/5",
  title: "Add JSON export mode",
  body: "Adds serializable task output.",
  headRefName: "feature/export-json",
  baseRefName: "trunk",
  state: "OPEN",
  isDraft: false,
  author: { login: "steve" },
  updatedAt: "2026-06-24T10:00:00Z",
  statusCheckRollup: [
    { databaseId: 101, name: "build", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: "https://checks.example/build" },
    { context: "lint", state: "FAILURE", targetUrl: "https://checks.example/lint" }
  ]
};
function json(value) {
  process.stdout.write(JSON.stringify(value));
}
if (args[0] === "pr" && args[1] === "list") {
  json([pullRequest]);
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "view" && (args[2] === "5" || args[2] === "feature/export-json")) {
  json(pullRequest);
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "edit" && args[2] === "5") {
  fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(args));
  process.exit(0);
}
process.stderr.write("unexpected gh args: " + args.join(" "));
process.exit(1);
`;
	const filePath = path.join(binDir, "gh");
	writeFileSync(filePath, script);
	chmodSync(filePath, 0o755);
}

test("GitHub CLI fallback discovers PR details and checks for noop VCS repos", () => {
	const repo = tempDir();
	const bin = tempDir();
	const logPath = path.join(repo, "gh-edit.json");
	const originalPath = process.env.PATH;
	installFakeGh(bin, logPath);
	process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ""}`;

	try {
		const discovered = listGitHubCliPullRequests(repo);
		assert.equal(discovered[0]?.pullRequestNumber, 5);
		assert.equal(discovered[0]?.headBranch, "feature/export-json");

		const details = getVcsPullRequestDetails(repo, { headBranch: "feature/export-json" });
		assert.equal(details.pullRequestNumber, 5);
		assert.equal(details.title, "Add JSON export mode");
		assert.equal(details.body, "Adds serializable task output.");
		assert.equal(details.baseBranch, "trunk");

		const checks = getVcsPullRequestChecks(repo, { number: 5 });
		assert.equal(checks.supported, true);
		assert.equal(checks.overallState, "failed");
		assert.equal(checks.summary.passed, 1);
		assert.equal(checks.summary.failed, 1);

		const updated = updateVcsPullRequestDetails(repo, { number: 5, title: "Updated title", body: "Updated body" });
		assert.equal(updated.title, "Add JSON export mode");
		assert.deepEqual(JSON.parse(readFileSync(logPath, "utf8")), ["pr", "edit", "5", "--title", "Updated title", "--body", "Updated body"]);
	} finally {
		process.env.PATH = originalPath;
		rmSync(repo, { recursive: true, force: true });
		rmSync(bin, { recursive: true, force: true });
	}
});
