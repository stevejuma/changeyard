import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { createChange } from "../src/commands/create.js";
import { loadConfig } from "../src/config/loadConfig.js";
import { updateLocalConfig } from "../src/config/localConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../src/documents/frontmatter.js";
import { changesRoot } from "../src/paths.js";
import type { PlanningSectionId } from "../src/planning/types.js";
import { setHttpTransportForTests, type HttpRequest } from "../src/providers/http.js";
import { replaceMarkedSection } from "../src/planning/sections.js";
import { findChangeFile } from "../src/state/id.js";
import { runInit } from "../src/commands/init.js";
import { createChangeyardUiApi } from "../src/commands/ui.js";

const { startChangeyardKanban, startChangeyardRuntime } = await import(pathToFileURL(path.join(process.cwd(), "packages/kanban/dist/server/index.js")).href);

function tempRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "changeyard-ui-server-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function restoreEnvFlag(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function runCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, normalizeCommandArgs(command, args), { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "command failed").toString().trim()}`);
  }
  return (result.stdout || "").trim();
}

function normalizeCommandArgs(command: string, args: string[]): string[] {
  if (command !== "jj") {
    return args;
  }
  return ["--color=never", ...stripJjColorArgs(args)];
}

function stripJjColorArgs(args: string[]): string[] {
  const next: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--color") {
      index++;
      continue;
    }
    if (arg.startsWith("--color=")) {
      continue;
    }
    next.push(arg);
  }
  return next;
}

function replacePlanningSection(repoRoot: string, changeId: string, sectionId: PlanningSectionId, content: string): void {
  const config = loadConfig(repoRoot);
  const filePath = findChangeFile(changesRoot(repoRoot, config), changeId);
  if (!filePath) {
    throw new Error(`Could not find change file for ${changeId}`);
  }
  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  const nextBody = replaceMarkedSection(parsed.body, sectionId, content);
  writeFileSync(filePath, writeFrontmatter(parsed.frontmatter, nextBody));
}

function extractAssetPaths(html: string, extension: "js" | "css"): string[] {
  return Array.from(html.matchAll(new RegExp(`(?:src|href)="([^"]*/assets/[^"]+\\.${extension}(?:\\?[^"]+)?)"`, "g")))
    .map((match) => match[1])
    .filter((path): path is string => Boolean(path));
}

async function assertUnifiedShell(origin: string, pathName: string): Promise<string> {
  const response = await fetch(`${origin}${pathName}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.match(html, /<title>Changeyard<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/);

  const scriptPaths = extractAssetPaths(html, "js");
  const stylePaths = extractAssetPaths(html, "css");
  assert.ok(scriptPaths.length > 0);
  assert.ok(stylePaths.length > 0);
  assert.ok(scriptPaths.every((assetPath) => assetPath.includes("?v=")));
  assert.ok(stylePaths.every((assetPath) => assetPath.includes("?v=")));

  return html;
}

async function fetchShellCss(origin: string, html: string): Promise<string> {
  const stylePaths = extractAssetPaths(html, "css");
  const cssParts = await Promise.all(
    stylePaths.map(async (assetPath) => {
      const response = await fetch(`${origin}${assetPath}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
      return await response.text();
    }),
  );
  return cssParts.join("\n");
}

function readPackagedVcsCss(): string {
  const assetsDir = path.join(process.cwd(), "packages/kanban/dist/web-ui/assets");
  const fileNames = readdirSync(assetsDir).filter((entry) => /^(?:vcs-shell|_virtual_changeyard-vcs-route)-.*\.css$/.test(entry));
  assert.ok(fileNames.length > 0);
  return fileNames.map((fileName) => readFileSync(path.join(assetsDir, fileName), "utf8")).join("\n");
}

function assertVcsLayoutUtilities(css: string): void {
  assert.match(css, /\.h-screen\s*\{/);
  assert.match(css, /\.lg\\:flex\s*\{/);
  assert.match(css, /\.lg\\:hidden\s*\{/);
  assert.match(css, /\.before\\:bg-accent/);
  assert.match(css, /\.grid-cols-\\\[72px_24px_minmax/);
}

async function trpcQuery<T>(origin: string, procedurePath: string, input?: unknown, workspaceId?: string): Promise<T> {
  const searchParams = new URLSearchParams();
  if (input === undefined) {
    searchParams.set("batch", "1");
    searchParams.set("input", "{}");
  } else {
    searchParams.set("input", JSON.stringify(input));
  }
  const response = await fetch(`${origin}/api/trpc/${procedurePath}?${searchParams.toString()}`, {
    headers: workspaceId ? { "x-kanban-workspace-id": workspaceId } : undefined,
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as
    | { result?: { data?: T } }
    | Array<{ result?: { data?: T } }>;
  if (Array.isArray(payload)) {
    return payload[0]?.result?.data as T;
  }
  return payload.result?.data as T;
}

async function trpcMutation<T>(origin: string, procedurePath: string, input: unknown, workspaceId?: string): Promise<T> {
  const response = await fetch(`${origin}/api/trpc/${procedurePath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(workspaceId ? { "x-kanban-workspace-id": workspaceId } : {}),
    },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 200);
  const payload = await response.json() as { result?: { data?: T } };
  return payload.result?.data as T;
}

async function trpcMutationError(origin: string, procedurePath: string, input: unknown, workspaceId?: string): Promise<{
  status: number;
  message: string;
  conflictUpdatedAt?: string | null;
}> {
  const response = await fetch(`${origin}/api/trpc/${procedurePath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(workspaceId ? { "x-kanban-workspace-id": workspaceId } : {}),
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as {
    error?: {
      message?: string;
      data?: {
        conflictUpdatedAt?: string | null;
      };
    };
  };
  return {
    status: response.status,
    message: payload.error?.message ?? "",
    conflictUpdatedAt: payload.error?.data?.conflictUpdatedAt ?? null,
  };
}

test("ui server serves health, manifest, and the current shell entrypoint", async () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const healthResponse = await fetch(`${origin}/api/health`);
      assert.equal(healthResponse.status, 200);
      assert.deepEqual(await healthResponse.json(), { ok: true });

      const manifestResponse = await fetch(`${origin}/manifest.json`);
      assert.equal(manifestResponse.status, 200);
      const manifest = await manifestResponse.json() as { name: string; short_name: string };
      assert.equal(manifest.name, "ChangeYard");
      assert.equal(manifest.short_name, "ChangeYard");

      const shellResponse = await fetch(server.url);
      assert.equal(shellResponse.status, 200);
      assert.equal(shellResponse.headers.get("cache-control"), "no-store");
      const shellHtml = await shellResponse.text();
      assert.match(shellHtml, /<!doctype html>/i);
      assert.match(shellHtml, /<div id="root"><\/div>/);
      const assetPath = extractAssetPaths(shellHtml, "js")[0];
      assert.ok(assetPath);
      const assetResponse = await fetch(`${origin}${assetPath}`);
      assert.equal(assetResponse.status, 200);
      assert.equal(assetResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
      const etag = assetResponse.headers.get("etag");
      assert.ok(etag);
      const cachedAssetResponse = await fetch(`${origin}${assetPath}`, {
        headers: { "if-none-match": etag },
      });
      assert.equal(cachedAssetResponse.status, 304);
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui server serves the VCS shell from the dashboard runtime by default", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    delete process.env.CHANGEYARD_VCS;
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      await assertUnifiedShell(origin, "/vcs");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server serves VCS routes from the unified dashboard shell", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      for (const route of ["/", "/vcs", "/vcs/jj", "/vcs/jj/branches", "/vcs/jj/history"]) {
        await assertUnifiedShell(origin, route);
      }
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("unified dashboard shell emits VCS layout utilities", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const html = await assertUnifiedShell(origin, "/vcs/jj/history");
      const css = await fetchShellCss(origin, html);
      assertVcsLayoutUtilities(css);
      assertVcsLayoutUtilities(readPackagedVcsCss());
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server exposes vcs.detect through the runtime tRPC boundary", async () => {
	const repo = tempRepo();
	const originalFlag = process.env.CHANGEYARD_VCS;
	try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    runCommand("git", ["remote", "add", "origin", "https://github.com/example/changeyard.git"], repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        repository: { kind: string; root: string | null };
        git: { remoteName: string | null; provider: string; remoteUrl: string | null };
      }>(origin, "vcs.detect");
      assert.equal(response.repository.kind, "git");
      assert.ok(response.repository.root);
      assert.equal(path.basename(response.repository.root), path.basename(repo));
      assert.equal(response.git.remoteName, "origin");
      assert.equal(response.git.provider, "github");
      assert.equal(response.git.remoteUrl, "https://github.com/example/changeyard.git");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
	}
});

test("ui server exposes scoped JJ inventory and operations through the runtime tRPC boundary", async (t) => {
	const repo = tempRepo();
	const originalFlag = process.env.CHANGEYARD_VCS;
	try {
		process.env.CHANGEYARD_VCS = "1";
		if (spawnSync("jj", normalizeCommandArgs("jj", ["--version"]), { encoding: "utf8" }).status !== 0) {
			t.skip("jj is required for JJ inventory and operations server coverage");
			return;
		}

		runCommand("git", ["init", "-b", "main"], repo);
		runInit(repo);
		writeFileSync(path.join(repo, "README.md"), "# changeyard\n");
		runCommand("git", ["config", "user.name", "ChangeYard Test"], repo);
		runCommand("git", ["config", "user.email", "test@example.com"], repo);
		runCommand("git", ["config", "commit.gpgsign", "false"], repo);
		runCommand("git", ["add", "README.md"], repo);
		runCommand("git", ["commit", "-m", "initial"], repo);
		runCommand("jj", ["git", "init", "--colocate"], repo);
		runCommand("jj", ["config", "set", "--repo", "user.name", "ChangeYard Test"], repo);
		runCommand("jj", ["config", "set", "--repo", "user.email", "test@example.com"], repo);
		runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
		runCommand("jj", ["new", "-m", "Feature work"], repo);
		runCommand("jj", ["bookmark", "create", "feature/scoped-inventory", "-r", "@"], repo);

		const server = await startChangeyardKanban({
			repoRoot: repo,
			open: false,
			port: "auto",
			changeyardApi: createChangeyardUiApi(),
		});
		const origin = new URL(server.url).origin;

		try {
			const projects = await trpcQuery<{
				currentProjectId: string | null;
				projects: Array<{ id: string; path: string }>;
			}>(origin, "projects.list");
			const workspaceId = projects.currentProjectId;
			assert.ok(workspaceId);

			const inventory = await trpcQuery<{
				repository: { kind: string };
				items: Array<{ name: string; type: string; target: string | null }>;
			}>(origin, "vcs.jjInventory", undefined, workspaceId);
			assert.equal(inventory.repository.kind, "jj");
			assert.ok(inventory.items.some((item) => item.name === "feature/scoped-inventory"));

			const operations = await trpcQuery<{
				operations: Array<{ id: string; description: string; restoreEligible: boolean }>;
				diagnostics: Array<{ code: string }>;
			}>(origin, "vcs.jjOperations", { limit: 5 }, workspaceId);
			assert.ok(operations.operations.length > 0);
			assert.equal(operations.operations[0]?.restoreEligible, true);

			const operationId = operations.operations[0]?.id;
			assert.ok(operationId);
			const operationDiff = await trpcQuery<{
				operationId: string;
				summary: string;
				patch: string;
				diagnostics: Array<{ code: string }>;
			}>(origin, "vcs.jjOperationDiff", { operationId }, workspaceId);
			assert.equal(operationDiff.operationId, operationId);
			assert.equal(Array.isArray(operationDiff.diagnostics), true);
		} finally {
			await server.close();
		}
	} finally {
		restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
		cleanup(repo);
	}
});

test("ui server exposes vcs.previewOperation through the runtime tRPC boundary", async () => {
	const repo = tempRepo();
	const originalFlag = process.env.CHANGEYARD_VCS;
	try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "reorder_change",
        sourceChangeId: "aaa111",
        targetChangeId: "bbb222",
        placement: "after",
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server exposes vcs.submitStackPreview through the runtime tRPC boundary", async (t) => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  const originalToken = process.env.TEST_GITHUB_TOKEN;
  try {
    process.env.CHANGEYARD_VCS = "1";
    process.env.TEST_GITHUB_TOKEN = "test-token";
    if (spawnSync("jj", normalizeCommandArgs("jj", ["--version"]), { encoding: "utf8" }).status !== 0) {
      t.skip("jj is required for submit stack preview server coverage");
      return;
    }

    runCommand("git", ["init", "-b", "main"], repo);
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
    runCommand("git", ["config", "user.name", "ChangeYard Test"], repo);
    runCommand("git", ["config", "user.email", "test@example.com"], repo);
    runCommand("git", ["config", "commit.gpgsign", "false"], repo);
    runCommand("git", ["add", "README.md"], repo);
    runCommand("git", ["commit", "-m", "initial"], repo);
    runCommand("git", ["remote", "add", "origin", "https://github.com/example/changeyard.git"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.name", "ChangeYard Test"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.email", "test@example.com"], repo);
    runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
    runCommand("jj", ["new", "-m", "Base change"], repo);
    runCommand("jj", ["bookmark", "create", "feature/base", "-r", "@"], repo);
    runCommand("jj", ["new", "-m", "Top change"], repo);
    runCommand("jj", ["bookmark", "create", "feature/top", "-r", "@"], repo);

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

    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        available: boolean;
        targetBookmark: string | null;
        items: Array<{ bookmarkName: string; action: string; baseBranch: string }>;
      }>(origin, "vcs.submitStackPreview", { targetBookmark: "feature/top" });
      assert.equal(response.available, true);
      assert.equal(response.targetBookmark, "feature/top");
      assert.deepEqual(
        response.items.map((item) => ({
          bookmarkName: item.bookmarkName,
          action: item.action,
          baseBranch: item.baseBranch,
        })),
        [
          { bookmarkName: "feature/base", action: "create_pr", baseBranch: "main" },
          { bookmarkName: "feature/top", action: "update_pr_base", baseBranch: "feature/base" },
        ],
      );
    } finally {
      setHttpTransportForTests(undefined);
      await server.close();
    }
  } finally {
    if (originalToken === undefined) {
      delete process.env.TEST_GITHUB_TOKEN;
    } else {
      process.env.TEST_GITHUB_TOKEN = originalToken;
    }
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server exposes vcs.submitStack through the runtime tRPC boundary", async (t) => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  const originalToken = process.env.TEST_GITHUB_TOKEN;
  try {
    process.env.CHANGEYARD_VCS = "1";
    process.env.TEST_GITHUB_TOKEN = "test-token";
    if (spawnSync("jj", normalizeCommandArgs("jj", ["--version"]), { encoding: "utf8" }).status !== 0) {
      t.skip("jj is required for submit stack server coverage");
      return;
    }

    runCommand("git", ["init", "-b", "main"], repo);
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
    runCommand("git", ["config", "user.name", "ChangeYard Test"], repo);
    runCommand("git", ["config", "user.email", "test@example.com"], repo);
    runCommand("git", ["config", "commit.gpgsign", "false"], repo);
    runCommand("git", ["add", "README.md"], repo);
    runCommand("git", ["commit", "-m", "initial"], repo);
    runCommand("git", ["remote", "add", "origin", "https://github.com/example/changeyard.git"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.name", "ChangeYard Test"], repo);
    runCommand("jj", ["config", "set", "--repo", "user.email", "test@example.com"], repo);
    runCommand("jj", ["config", "set", "--repo", "signing.behavior", "drop"], repo);
    runCommand("jj", ["new", "-m", "Base change"], repo);
    runCommand("jj", ["bookmark", "create", "feature/base", "-r", "@"], repo);
    runCommand("jj", ["new", "-m", "Top change"], repo);
    runCommand("jj", ["bookmark", "create", "feature/top", "-r", "@"], repo);

    setHttpTransportForTests((request: HttpRequest) => {
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
        return { status: 200, body: JSON.stringify({ id: 101 }) };
      }
      if (request.method === "PATCH" && request.url.endsWith("/issues/comments/91")) {
        return { status: 200, body: JSON.stringify({ id: 91 }) };
      }
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    });

    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcMutation<{
        ok: boolean;
        items: Array<{ bookmarkName: string; completed: boolean; resultPr: { number: number } | null }>;
      }>(origin, "vcs.submitStack", { targetBookmark: "feature/top" });
      assert.equal(response.ok, true);
      assert.deepEqual(
        response.items.map((item) => ({
          bookmarkName: item.bookmarkName,
          completed: item.completed,
          resultPr: item.resultPr?.number ?? null,
        })),
        [
          { bookmarkName: "feature/base", completed: true, resultPr: 30 },
          { bookmarkName: "feature/top", completed: true, resultPr: 12 },
        ],
      );
    } finally {
      setHttpTransportForTests(undefined);
      await server.close();
    }
  } finally {
    if (originalToken === undefined) {
      delete process.env.TEST_GITHUB_TOKEN;
    } else {
      process.env.TEST_GITHUB_TOKEN = originalToken;
    }
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server exposes vcs.applyOperation through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcMutation<{
        ok: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.applyOperation", {
        kind: "reorder_change",
        sourceChangeId: "aaa111",
        targetChangeId: "bbb222",
        placement: "after",
      });
      assert.equal(response.ok, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server accepts create_bookmark previews through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "create_bookmark",
        changeId: "aaa111",
        bookmarkName: "feature/new-api",
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server accepts edit_message previews through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "edit_message",
        changeId: "aaa111",
        message: "Refine API layer",
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server accepts create_change previews through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "create_change",
        anchorChangeId: "aaa111",
        placement: "after",
        message: "Follow-up change",
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server accepts move_bookmark previews through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "move_bookmark",
        bookmarkName: "feature/api",
        targetChangeId: "bbb222",
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server accepts abandon_change previews through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "abandon_change",
        changeId: "aaa111",
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server accepts squash_change previews through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "squash_change",
        sourceChangeId: "aaa111",
        targetChangeId: "bbb222",
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server accepts absorb_file previews through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "absorb_file",
        targetChangeId: "aaa111",
        paths: ["src/app.ts"],
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server accepts restore_file previews through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "restore_file",
        paths: ["src/app.ts"],
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server accepts undo_last previews through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "undo_last",
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server accepts redo_last previews through the runtime tRPC boundary", async () => {
  const repo = tempRepo();
  const originalFlag = process.env.CHANGEYARD_VCS;
  try {
    process.env.CHANGEYARD_VCS = "1";
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await trpcQuery<{
        valid: boolean;
        diagnostics: Array<{ code: string; message: string }>;
      }>(origin, "vcs.previewOperation", {
        kind: "redo_last",
      });
      assert.equal(response.valid, false);
      assert.equal(response.diagnostics[0]?.code, "jj_repo_required");
    } finally {
      await server.close();
    }
  } finally {
    restoreEnvFlag("CHANGEYARD_VCS", originalFlag);
    cleanup(repo);
  }
});

test("ui server exposes the current project through the projects.list tRPC route", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const response = await fetch(`${origin}/api/trpc/projects.list?batch=1&input=%7B%7D`);
      assert.equal(response.status, 200);
      const payload = await response.json() as Array<{
        result?: {
          data?: {
            currentProjectId?: string | null;
            projects?: Array<{
              id: string;
              path: string;
              name: string;
              taskCounts: Record<string, number>;
            }>;
          };
        };
      }>;

      const data = payload[0]?.result?.data;
      assert.ok(data);
      assert.equal(typeof data?.currentProjectId, "string");

      const currentProject = data?.projects?.find((entry) => entry.id === data?.currentProjectId);
      assert.ok(currentProject);

      const project = data?.projects?.find((entry) => entry.name === path.basename(repo));
      assert.ok(project);
      assert.equal(project?.name, path.basename(repo));
      assert.deepEqual(project?.taskCounts, {
        backlog: 0,
        in_progress: 0,
        review: 0,
        trash: 0,
      });
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("headless runtime serves API health without browser assets", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardRuntime({
      repoRoot: repo,
      openBrowser: false,
      port: "auto",
      mode: "headless",
      serveWebAssets: false,
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const healthResponse = await fetch(`${origin}/api/health`);
      assert.equal(healthResponse.status, 200);
      assert.deepEqual(await healthResponse.json(), { ok: true });

      const manifestResponse = await fetch(`${origin}/manifest.json`);
      assert.equal(manifestResponse.status, 404);

      const projects = await trpcQuery<{
        currentProjectId: string | null;
        projects: Array<{ id: string; name: string }>;
      }>(origin, "projects.list");
      assert.equal(typeof projects.currentProjectId, "string");
      assert.ok(projects.projects.some((project) => project.name === path.basename(repo)));
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("changes project config routes expose and persist core changeyard settings", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const projects = await trpcQuery<{
        currentProjectId: string | null;
        projects: Array<{ id: string; name: string; path: string }>;
      }>(origin, "projects.list");
      const project = projects.projects.find((entry) => entry.path === repo || entry.name === path.basename(repo));
      assert.ok(project);
      const workspaceId = project.id;

      const current = await trpcQuery<{
        initialized: boolean;
        providerType: string;
        vcsEngine: string;
        vcsFallback: string;
        vcsAppliedStacks?: string[];
        projectDefaultBase: string;
        planningDefaultProfile?: string;
        planningDefaultStrictness?: string;
        planningAllowQuickChanges?: boolean;
        planningQuickChangeCheckProfile?: string;
      }>(origin, "changes.getProjectConfig", undefined, workspaceId);
      assert.equal(current.initialized, true);
      assert.equal(current.vcsEngine, "git-worktree");
      assert.equal(current.projectDefaultBase, "main");
      assert.deepEqual(current.vcsAppliedStacks, []);

      const updated = await trpcMutation<{
        initialized: boolean;
        providerType: string;
        vcsEngine: string;
        vcsFallback: string;
        vcsAppliedStacks?: string[];
        projectDefaultBase: string;
        planningDefaultProfile?: string;
        planningDefaultStrictness?: string;
        planningAllowQuickChanges?: boolean;
        planningQuickChangeCheckProfile?: string;
      }>(
        origin,
        "changes.updateProjectConfig",
        {
          providerType: "noop",
          vcsEngine: "jj",
          vcsFallback: "jj",
          vcsAppliedStacks: [" feature/top ", "feature/base", "feature/top"],
          projectDefaultBase: "trunk",
          planningDefaultProfile: "openspec-lite",
          planningDefaultStrictness: "strict",
          planningAllowQuickChanges: false,
          planningQuickChangeCheckProfile: "full",
        },
        workspaceId,
      );

      assert.equal(updated.providerType, "noop");
      assert.equal(updated.vcsEngine, "jj");
      assert.equal(updated.vcsFallback, "jj");
      assert.deepEqual(updated.vcsAppliedStacks, ["feature/top", "feature/base"]);
      assert.equal(updated.projectDefaultBase, "trunk");
      assert.equal(updated.planningDefaultProfile, "openspec-lite");
      assert.equal(updated.planningDefaultStrictness, "strict");
      assert.equal(updated.planningAllowQuickChanges, false);
      assert.equal(updated.planningQuickChangeCheckProfile, "full");

      const localConfig = JSON.parse(readFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), "utf8")) as {
        provider?: { type?: string };
        vcs?: { engine?: string; fallback?: string; appliedStacks?: string[] };
        project?: { defaultBase?: string };
        planning?: {
          defaultProfile?: string;
          defaultStrictness?: string;
          allowQuickChanges?: boolean;
          quickChangeCheckProfile?: string;
        };
      };
      assert.equal(localConfig.provider?.type, "noop");
      assert.equal(localConfig.vcs?.engine, "jj");
      assert.equal(localConfig.vcs?.fallback, "jj");
      assert.deepEqual(localConfig.vcs?.appliedStacks, ["feature/top", "feature/base"]);
      assert.equal(localConfig.project?.defaultBase, "trunk");
      assert.equal(localConfig.planning?.defaultProfile, "openspec-lite");
      assert.equal(localConfig.planning?.defaultStrictness, "strict");
      assert.equal(localConfig.planning?.allowQuickChanges, false);
      assert.equal(localConfig.planning?.quickChangeCheckProfile, "full");
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("cy --tui reports missing Bun without requiring runtime startup", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const result = spawnSync(process.execPath, [
      path.join(process.cwd(), "dist/src/cli.js"),
      "--tui",
      "--project",
      repo,
    ], {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: "",
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cy --tui requires Bun/);
    assert.match(result.stderr, /Node-only commands/);
  } finally {
    cleanup(repo);
  }
});

test("ui server exposes markdown-backed planned and unplanned changes through the changeyard tRPC routes", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const planned = createChange({
      template: "feature",
      title: "Add planning summary panel",
      planning: "openspec-lite",
    }, repo);
    const unplanned = createChange({
      template: "bug",
      title: "Fix stale toast dismissal",
      noPlanning: true,
    }, repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const projects = await trpcQuery<{
        currentProjectId: string | null;
        projects: Array<{ id: string }>;
      }>(origin, "projects.list");
      assert.equal(typeof projects.currentProjectId, "string");
      const workspaceId = projects.currentProjectId as string;
      const changes = await trpcQuery<{
        changes: Array<{
          id: string;
          planning: {
            model: string;
            phase: string;
            gateSummary: { pending: number };
          } | null;
        }>;
      }>(origin, "changes.list", undefined, workspaceId);
      assert.equal(changes.changes.length, 2);

      const plannedChange = changes.changes.find((change) => change.id === planned.id);
      assert.ok(plannedChange);
      assert.equal(plannedChange?.planning?.model, "openspec-lite");
      assert.equal(plannedChange?.planning?.phase, "draft");
      assert.equal(plannedChange?.planning?.gateSummary.pending, 5);

      const unplannedChange = changes.changes.find((change) => change.id === unplanned.id);
      assert.ok(unplannedChange);
      assert.equal(unplannedChange?.planning, null);

      const plannedDetail = await trpcQuery<{
        id: string;
        sections: Array<{ id: string }>;
      } | null>(origin, "changes.get", { id: planned.id }, workspaceId);
      assert.ok(plannedDetail);
      assert.equal(plannedDetail?.id, planned.id);
      assert.ok(plannedDetail?.sections.some((section) => section.id === "proposal"));
      assert.ok(plannedDetail?.sections.some((section) => section.id === "verification"));

      const unplannedDetail = await trpcQuery<{
        planning: null;
        sections: unknown[];
      } | null>(origin, "changes.get", { id: unplanned.id }, workspaceId);
      assert.ok(unplannedDetail);
      assert.equal(unplannedDetail?.planning, null);
      assert.deepEqual(unplannedDetail?.sections, []);
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui changeyard mutations create planned changes and surface planning gate failures before sync/start", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const projects = await trpcQuery<{
        currentProjectId: string | null;
      }>(origin, "projects.list");
      assert.equal(typeof projects.currentProjectId, "string");
      const workspaceId = projects.currentProjectId as string;

      const created = await trpcMutation<{
        id: string;
        planning: { model: string; strictness: string } | null;
        sections: Array<{ id: string }>;
      }>(origin, "changes.create", {
        template: "feature",
        title: "Launch planned UI flow",
        planning: "openspec-lite",
        strict: true,
      }, workspaceId);
      assert.equal(created.planning?.model, "openspec-lite");
      assert.equal(created.planning?.strictness, "strict");
      assert.ok(created.sections.some((section) => section.id === "clarifications"));
      assert.ok(created.sections.some((section) => section.id === "analysis"));

      const validationFailure = await trpcMutationError(origin, "changes.validate", { id: created.id }, workspaceId);
      assert.equal(validationFailure.status, 500);
      assert.match(validationFailure.message, /Sync Gate:/);
      assert.match(validationFailure.message, /Start Gate:/);
      assert.match(validationFailure.message, /Complete Gate:/);
      assert.match(validationFailure.message, /<!-- cy:proposal:start -->/);

      const syncFailure = await trpcMutationError(origin, "changes.sync", { id: created.id }, workspaceId);
      assert.equal(syncFailure.status, 500);
      assert.match(syncFailure.message, /<!-- cy:proposal:start -->/);

      const startFailure = await trpcMutationError(origin, "changes.start", { id: created.id }, workspaceId);
      assert.equal(startFailure.status, 500);
      assert.match(startFailure.message, /<!-- cy:proposal:start -->/);
      assert.match(startFailure.message, /<!-- cy:design:start -->/);
      assert.match(startFailure.message, /<!-- cy:clarifications:start -->/);
      assert.match(startFailure.message, /<!-- cy:requirements-checklist:start -->/);

      replacePlanningSection(repo, created.id, "proposal", "Concrete proposal for the UI flow.");
      replacePlanningSection(repo, created.id, "spec-deltas", "No behavior change");
      replacePlanningSection(repo, created.id, "design", "Use the existing injected changeyardApi mutation path.");
      replacePlanningSection(repo, created.id, "tasks", "- [x] Create planned issue\n- [ ] Start work");
      replacePlanningSection(repo, created.id, "clarifications", "No clarifications required.");
      replacePlanningSection(repo, created.id, "requirements-checklist", "- [x] Mutation path uses root CLI-core logic");

      const synced = await trpcMutation<{
        id: string;
        status: string;
        planning: { model: string } | null;
      }>(origin, "changes.sync", { id: created.id }, workspaceId);
      assert.equal(synced.id, created.id);
      assert.equal(synced.status, "synced");
      assert.equal(synced.planning?.model, "openspec-lite");

      const started = await trpcMutation<{
        id: string;
        status: string;
        workspace?: { path?: string };
      }>(origin, "changes.start", { id: created.id }, workspaceId);
      assert.equal(started.id, created.id);
      assert.equal(started.status, "in_progress");
      assert.equal(typeof started.workspace?.path, "string");
      assert.ok(started.workspace?.path?.includes(".changeyard/workspaces"));
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui changeyard change dependency mutations link and unlink canonical changes", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const first = createChange({ template: "agent-task", title: "First dependency change" }, repo);
    const second = createChange({ template: "agent-task", title: "Second dependency change" }, repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const projects = await trpcQuery<{ currentProjectId: string | null }>(origin, "projects.list");
      assert.equal(typeof projects.currentProjectId, "string");
      const workspaceId = projects.currentProjectId as string;

      const linked = await trpcMutation<{
        id: string;
        dependencies: { blockedBy: string[]; blocks: string[] };
      }>(origin, "changes.link", { changeId: second.id, blockedByChangeId: first.id }, workspaceId);
      assert.equal(linked.id, second.id);
      assert.deepEqual(linked.dependencies.blockedBy, [first.id]);

      const list = await trpcQuery<{
        changes: Array<{ id: string; dependencies: { blockedBy: string[]; blocks: string[] } }>;
      }>(origin, "changes.list", undefined, workspaceId);
      const source = list.changes.find((change) => change.id === first.id);
      const target = list.changes.find((change) => change.id === second.id);
      assert.deepEqual(source?.dependencies.blocks, [second.id]);
      assert.deepEqual(target?.dependencies.blockedBy, [first.id]);

      const unlinked = await trpcMutation<{
        id: string;
        dependencies: { blockedBy: string[]; blocks: string[] };
      }>(origin, "changes.unlink", { changeId: second.id, blockedByChangeId: first.id }, workspaceId);
      assert.deepEqual(unlinked.dependencies.blockedBy, []);
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui changeyard planning section updates are marker-scoped and reject stale writes", async () => {
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runInit(repo);
    const created = createChange({
      template: "feature",
      title: "Inline planning editor",
      planning: "openspec-lite",
    }, repo);
    const server = await startChangeyardKanban({
      repoRoot: repo,
      open: false,
      port: "auto",
      changeyardApi: createChangeyardUiApi(),
    });
    const origin = new URL(server.url).origin;

    try {
      const projects = await trpcQuery<{ currentProjectId: string | null }>(origin, "projects.list");
      const workspaceId = projects.currentProjectId as string;
      const initial = await trpcQuery<{
        id: string;
        updatedAt?: string;
        sections: Array<{ id: string; content: string }>;
      }>(origin, "changes.get", { id: created.id }, workspaceId);
      assert.equal(initial.id, created.id);
      const initialUpdatedAt = initial.updatedAt ?? null;
      const initialVerification = initial.sections.find((section) => section.id === "verification");
      const initialVerificationContent = initialVerification?.content ?? "";

      const saved = await trpcMutation<{
        updatedAt?: string;
        sections: Array<{ id: string; content: string }>;
      }>(origin, "changes.updatePlanningSection", {
        id: created.id,
        sectionId: "proposal",
        content: "## Summary\n\nShip the inline planning editor.",
        expectedUpdatedAt: initialUpdatedAt,
      }, workspaceId);
      const savedProposal = saved.sections.find((section) => section.id === "proposal");
      assert.match(savedProposal?.content ?? "", /inline planning editor/);
      const savedVerification = saved.sections.find((section) => section.id === "verification");
      assert.equal(savedVerification?.content ?? "", initialVerificationContent);
      assert.notEqual(saved.updatedAt ?? null, initialUpdatedAt);

      const stale = await trpcMutationError(origin, "changes.updatePlanningSection", {
        id: created.id,
        sectionId: "design",
        content: "Add a stale write that should fail.",
        expectedUpdatedAt: initialUpdatedAt,
      }, workspaceId);
      assert.equal(stale.status, 409);
      assert.match(stale.message, /updated elsewhere/i);
      assert.equal(stale.conflictUpdatedAt, saved.updatedAt ?? null);

      const latest = await trpcQuery<{
        sections: Array<{ id: string; content: string }>;
      }>(origin, "changes.get", { id: created.id }, workspaceId);
      const latestProposal = latest.sections.find((section) => section.id === "proposal");
      const latestDesign = latest.sections.find((section) => section.id === "design");
      const initialDesign = initial.sections.find((section) => section.id === "design");
      assert.match(latestProposal?.content ?? "", /inline planning editor/);
      assert.equal(latestDesign?.content ?? "", initialDesign?.content ?? "");
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});
