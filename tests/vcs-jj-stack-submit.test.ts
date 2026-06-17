import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { updateLocalConfig } from "../src/config/localConfig.js";
import { runInit } from "../src/commands/init.js";
import { setHttpTransportForTests, type HttpRequest } from "../src/providers/http.js";
import { getJjInventory } from "../src/vcs/adapter.js";
import { previewJjStackSubmit, submitJjStack } from "../src/vcs/jj/stack-submit.js";
import { upsertVcsPullRequestCacheEntry } from "../src/vcs/pr-cache.js";
import { runVcsCommand } from "../src/vcs/process.js";

function tempRepo(): string {
	return mkdtempSync(path.join(os.tmpdir(), "changeyard-vcs-submit-"));
}

function cleanup(dir: string): void {
	rmSync(dir, { recursive: true, force: true });
}

function runCommand(command: string, args: string[], cwd: string): string {
	const result = spawnSync(command, args, { cwd, encoding: "utf8" });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "command failed").trim()}`);
	}
	return (result.stdout || "").trim();
}

function hasCommand(command: string): boolean {
	const result = spawnSync(command, ["--version"], { encoding: "utf8" });
	return result.status === 0;
}

function configureTestGitIdentity(repo: string): void {
	runCommand("git", ["config", "user.name", "ChangeYard Test"], repo);
	runCommand("git", ["config", "user.email", "test@example.com"], repo);
	runCommand("git", ["config", "commit.gpgsign", "false"], repo);
}

function configureTestJjIdentity(repo: string): void {
	runCommand("jj", ["config", "set", "--repo", "user.name", "ChangeYard Test"], repo);
	runCommand("jj", ["config", "set", "--repo", "user.email", "test@example.com"], repo);
	runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
}

function initJjRepo(): string {
	const repo = tempRepo();
	runCommand("git", ["init", "-b", "main"], repo);
	configureTestGitIdentity(repo);
	runInit(repo);
	updateLocalConfig(repo, {
		provider: {
			type: "github",
			owner: "example",
			repo: "changeyard",
			auth: { tokenEnv: "TEST_GITHUB_TOKEN" },
		},
	});
	writeFileSync(path.join(repo, "README.md"), "# changeyard\n");
	runCommand("git", ["add", "README.md"], repo);
	runCommand("git", ["commit", "-m", "initial"], repo);
	runCommand("git", ["remote", "add", "origin", "https://github.com/example/changeyard.git"], repo);
	runCommand("jj", ["git", "init", "--colocate"], repo);
	configureTestJjIdentity(repo);
	runCommand("jj", ["new", "-m", "Base change"], repo);
	runCommand("jj", ["bookmark", "create", "feature/base", "-r", "@"], repo);
	runCommand("jj", ["new", "-m", "Top change"], repo);
	runCommand("jj", ["bookmark", "create", "feature/top", "-r", "@"], repo);
	return repo;
}

function decodeStackCommentBody(body: string): { metadata: { version: number; stack: Array<{ bookmarkName: string; prUrl: string; prNumber: number }> } | null } {
	const [firstLine] = body.trim().split("\n");
	const prefix = "<!--- CHANGEYARD_VCS_STACK: ";
	const postfix = " --->";
	if (!firstLine.startsWith(prefix) || !firstLine.endsWith(postfix)) {
		return { metadata: null };
	}
	const encoded = firstLine.slice(prefix.length, -postfix.length);
	return {
		metadata: JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
			version: number;
			stack: Array<{ bookmarkName: string; prUrl: string; prNumber: number }>;
		},
	};
}

function readVcsPrCache(repo: string): Array<{ provider: string; repository: string; head: string; base: string | null; number: number; url: string | null; state: string }> {
	const parsed = JSON.parse(readFileSync(path.join(repo, ".changeyard", "cache", "vcs-prs.json"), "utf8")) as {
		pullRequests?: Array<{ provider: string; repository: string; head: string; base: string | null; number: number; url: string | null; state: string }>;
	};
	return parsed.pullRequests ?? [];
}

test("previewJjStackSubmit creates an ordered stacked PR plan", async (t) => {
	if (!hasCommand("jj")) {
		t.skip("jj is required for stacked submit integration tests");
		return;
	}

	const repo = initJjRepo();
	const originalToken = process.env.TEST_GITHUB_TOKEN;
	process.env.TEST_GITHUB_TOKEN = "test-token";
	setHttpTransportForTests((request: HttpRequest) => {
		if (request.url.includes("head=example%3Afeature%2Fbase")) {
			return { status: 200, body: "[]" };
		}
		if (request.url.includes("head=example%3Afeature%2Ftop")) {
			return {
				status: 200,
				body: JSON.stringify([
					{
						number: 12,
						html_url: "https://github.com/example/changeyard/pull/12",
						base: { ref: "main" },
					},
				]),
			};
		}
		throw new Error(`Unexpected request: ${request.url}`);
	});

	try {
		const preview = await previewJjStackSubmit(repo, { targetBookmark: "feature/top" }, runVcsCommand);
		assert.equal(preview.available, true);
		assert.equal(preview.remoteName, "origin");
		assert.equal(preview.repoOwner, "example");
		assert.equal(preview.repoName, "changeyard");
		assert.deepEqual(
			preview.items.map((item) => ({
				bookmarkName: item.bookmarkName,
				baseBranch: item.baseBranch,
				action: item.action,
				needsPush: item.needsPush,
				existingPr: item.existingPr?.number ?? null,
			})),
			[
				{
					bookmarkName: "feature/base",
					baseBranch: "main",
					action: "create_pr",
					needsPush: false,
					existingPr: null,
				},
				{
					bookmarkName: "feature/top",
					baseBranch: "feature/base",
					action: "update_pr_base",
					needsPush: false,
					existingPr: 12,
				},
			],
		);
		assert.deepEqual(preview.commands.map((command) => command.args), []);
		assert.deepEqual(
			readVcsPrCache(repo).map((entry) => ({ head: entry.head, base: entry.base, number: entry.number, state: entry.state })),
			[{ head: "feature/top", base: "main", number: 12, state: "open" }],
		);
	} finally {
		setHttpTransportForTests(undefined);
		if (originalToken === undefined) {
			delete process.env.TEST_GITHUB_TOKEN;
		} else {
			process.env.TEST_GITHUB_TOKEN = originalToken;
		}
		cleanup(repo);
	}
});

test("previewJjStackSubmit and inventory use cached pull requests without provider lookup", async (t) => {
	if (!hasCommand("jj")) {
		t.skip("jj is required for stacked submit integration tests");
		return;
	}

	const repo = initJjRepo();
	const originalToken = process.env.TEST_GITHUB_TOKEN;
	delete process.env.TEST_GITHUB_TOKEN;
	upsertVcsPullRequestCacheEntry(path.join(repo, ".changeyard"), {
		provider: "github",
		repository: "example/changeyard",
		head: "feature/base",
		base: "main",
		number: 30,
		url: "https://github.com/example/changeyard/pull/30",
		state: "open",
	});
	upsertVcsPullRequestCacheEntry(path.join(repo, ".changeyard"), {
		provider: "github",
		repository: "example/changeyard",
		head: "feature/top",
		base: "feature/base",
		number: 12,
		url: "https://github.com/example/changeyard/pull/12",
		state: "open",
	});
	setHttpTransportForTests((request: HttpRequest) => {
		throw new Error(`Unexpected provider lookup: ${request.method} ${request.url}`);
	});

	try {
		const preview = await previewJjStackSubmit(repo, { targetBookmark: "feature/top" }, runVcsCommand);
		assert.equal(preview.available, true);
		assert.deepEqual(
			preview.items.map((item) => ({
				bookmarkName: item.bookmarkName,
				action: item.action,
				existingPr: item.existingPr?.number ?? null,
			})),
			[
				{ bookmarkName: "feature/base", action: "none", existingPr: 30 },
				{ bookmarkName: "feature/top", action: "none", existingPr: 12 },
			],
		);

		const inventory = await getJjInventory(repo);
		const top = inventory.items.find((item) => item.name === "feature/top");
		assert.equal(top?.pr?.number, 12);
		assert.equal(top?.pr?.baseBranch, "feature/base");
	} finally {
		setHttpTransportForTests(undefined);
		if (originalToken === undefined) {
			delete process.env.TEST_GITHUB_TOKEN;
		} else {
			process.env.TEST_GITHUB_TOKEN = originalToken;
		}
		cleanup(repo);
	}
});

test("previewJjStackSubmit stays unavailable when provider lacks PR support", async (t) => {
	if (!hasCommand("jj")) {
		t.skip("jj is required for stacked submit integration tests");
		return;
	}

	const repo = initJjRepo();
	updateLocalConfig(repo, {
		provider: {
			type: "noop",
		},
	});

	try {
		const preview = await previewJjStackSubmit(repo, { targetBookmark: "feature/top" }, runVcsCommand);
		assert.equal(preview.available, false);
		assert.match(
			preview.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
			/provider noop does not support stacked pull request operations/i,
		);
	} finally {
		cleanup(repo);
	}
});

test("previewJjStackSubmit stays unavailable when GitHub auth is missing", async (t) => {
	if (!hasCommand("jj")) {
		t.skip("jj is required for stacked submit integration tests");
		return;
	}

	const repo = initJjRepo();
	const originalToken = process.env.TEST_GITHUB_TOKEN;
	delete process.env.TEST_GITHUB_TOKEN;

	try {
		const preview = await previewJjStackSubmit(repo, { targetBookmark: "feature/top" }, runVcsCommand);
		assert.equal(preview.available, false);
		assert.match(
			preview.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
			/Failed to look up existing PR for feature\/base: GitHub provider requires owner, repo, and TEST_GITHUB_TOKEN/i,
		);
	} finally {
		if (originalToken === undefined) {
			delete process.env.TEST_GITHUB_TOKEN;
		} else {
			process.env.TEST_GITHUB_TOKEN = originalToken;
		}
		cleanup(repo);
	}
});

test("submitJjStack creates and updates pull requests from the previewed stack", async (t) => {
	if (!hasCommand("jj")) {
		t.skip("jj is required for stacked submit integration tests");
		return;
	}

	const repo = initJjRepo();
	const originalToken = process.env.TEST_GITHUB_TOKEN;
	process.env.TEST_GITHUB_TOKEN = "test-token";
	const requests: string[] = [];
	const createdCommentBodies: string[] = [];
	const updatedCommentBodies: string[] = [];
	setHttpTransportForTests((request: HttpRequest) => {
		requests.push(`${request.method} ${request.url}`);
		if (request.method === "GET" && request.url.includes("head=example%3Afeature%2Fbase")) {
			return { status: 200, body: "[]" };
		}
		if (request.method === "GET" && request.url.includes("head=example%3Afeature%2Ftop")) {
			return {
				status: 200,
				body: JSON.stringify([
					{
						number: 12,
						html_url: "https://github.com/example/changeyard/pull/12",
						base: { ref: "main" },
					},
				]),
			};
		}
		if (request.method === "POST" && request.url.endsWith("/repos/example/changeyard/pulls")) {
			assert.equal((request.payload as { head?: string }).head, "feature/base");
			assert.equal((request.payload as { base?: string }).base, "main");
			return {
				status: 200,
				body: JSON.stringify({
					number: 30,
					html_url: "https://github.com/example/changeyard/pull/30",
					base: { ref: "main" },
				}),
			};
		}
		if (request.method === "PATCH" && request.url.endsWith("/repos/example/changeyard/pulls/12")) {
			assert.equal((request.payload as { base?: string }).base, "feature/base");
			return {
				status: 200,
				body: JSON.stringify({
					number: 12,
					html_url: "https://github.com/example/changeyard/pull/12",
					base: { ref: "feature/base" },
				}),
			};
		}
		if (request.method === "GET" && request.url.endsWith("/issues/30/comments?per_page=100")) {
			return { status: 200, body: "[]" };
		}
		if (request.method === "GET" && request.url.endsWith("/issues/12/comments?per_page=100")) {
			return {
				status: 200,
				body: JSON.stringify([
					{
						id: 91,
						body: "<!--- CHANGEYARD_VCS_STACK: eyJ2ZXJzaW9uIjowLCJzdGFjayI6W119 --->\nold\n\n---\n*Created with Changeyard VCS*",
					},
				]),
			};
		}
		if (request.method === "POST" && request.url.endsWith("/issues/30/comments")) {
			const body = String((request.payload as { body?: string }).body ?? "");
			createdCommentBodies.push(body);
			return { status: 200, body: JSON.stringify({ id: 101, body }) };
		}
		if (request.method === "PATCH" && request.url.endsWith("/issues/comments/91")) {
			const body = String((request.payload as { body?: string }).body ?? "");
			updatedCommentBodies.push(body);
			return { status: 200, body: JSON.stringify({ id: 91, body }) };
		}
		throw new Error(`Unexpected request: ${request.method} ${request.url}`);
	});

	try {
		const result = await submitJjStack(repo, { targetBookmark: "feature/top" }, runVcsCommand);
		assert.equal(result.ok, true);
		assert.deepEqual(
			result.items.map((item) => ({
				bookmarkName: item.bookmarkName,
				action: item.action,
				completed: item.completed,
				resultPr: item.resultPr?.number ?? null,
				baseBranch: item.resultPr?.baseBranch ?? item.baseBranch,
			})),
			[
				{
					bookmarkName: "feature/base",
					action: "create_pr",
					completed: true,
					resultPr: 30,
					baseBranch: "main",
				},
				{
					bookmarkName: "feature/top",
					action: "update_pr_base",
					completed: true,
					resultPr: 12,
					baseBranch: "feature/base",
				},
			],
		);
		assert.deepEqual(
			requests,
			[
				"GET https://api.github.com/repos/example/changeyard/pulls?head=example%3Afeature%2Fbase&state=open&per_page=1",
				"GET https://api.github.com/repos/example/changeyard/pulls?head=example%3Afeature%2Ftop&state=open&per_page=1",
				"POST https://api.github.com/repos/example/changeyard/pulls",
				"PATCH https://api.github.com/repos/example/changeyard/pulls/12",
				"GET https://api.github.com/repos/example/changeyard/issues/30/comments?per_page=100",
				"POST https://api.github.com/repos/example/changeyard/issues/30/comments",
				"GET https://api.github.com/repos/example/changeyard/issues/12/comments?per_page=100",
				"PATCH https://api.github.com/repos/example/changeyard/issues/comments/91",
			],
		);
		assert.equal(createdCommentBodies.length, 1);
		assert.equal(updatedCommentBodies.length, 1);
		for (const body of [...createdCommentBodies, ...updatedCommentBodies]) {
			assert.match(body, /This PR is part of a stack of 2 bookmarks/i);
			assert.match(body, /\*Created with Changeyard VCS\*/);
			const metadata = decodeStackCommentBody(body).metadata;
			assert.deepEqual(
				metadata?.stack.map((item) => item.bookmarkName),
				["feature/base", "feature/top"],
			);
		}
		assert.deepEqual(
			readVcsPrCache(repo).map((entry) => ({ head: entry.head, base: entry.base, number: entry.number, state: entry.state })),
			[
				{ head: "feature/base", base: "main", number: 30, state: "open" },
				{ head: "feature/top", base: "feature/base", number: 12, state: "open" },
			],
		);
	} finally {
		setHttpTransportForTests(undefined);
		if (originalToken === undefined) {
			delete process.env.TEST_GITHUB_TOKEN;
		} else {
			process.env.TEST_GITHUB_TOKEN = originalToken;
		}
		cleanup(repo);
	}
});
