import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { runCreate } from "../src/commands/create.js";
import { runInit } from "../src/commands/init.js";

const { startChangeyardKanban } = await import(pathToFileURL(path.join(process.cwd(), "packages/kanban/src/server/index.js")).href);

function tempRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "changeyard-ui-server-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function runCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "command failed").toString().trim()}`);
  }
  return (result.stdout || "").trim();
}

function hasCommand(command: string): boolean {
  try {
    return runCommand(command, ["--version"], process.cwd()).length > 0;
  } catch {
    return false;
  }
}

test("ui server exposes board and card endpoints from changeyard state", async () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Serve board card" }, repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    try {
      const boardResponse = await fetch(`${server.url}/api/board`);
      assert.equal(boardResponse.status, 200);
      const board = await boardResponse.json() as { columns: Array<{ id: string; cards: Array<{ id: string }> }> };
      const readyColumn = board.columns.find((column) => column.id === "ready");
      assert.ok(readyColumn?.cards.some((card) => card.id === "CY-0001"));

      const cardResponse = await fetch(`${server.url}/api/cards/CY-0001`);
      assert.equal(cardResponse.status, 200);
      const card = await cardResponse.json() as { id: string; title: string };
      assert.equal(card.id, "CY-0001");
      assert.equal(card.title, "Serve board card");
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui start action writes the same changeyard workspace metadata as CLI start", async () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".env.example"), "SAFE=1\n");
    runCreate({ template: "agent-task", title: "Start via ui server" }, repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    try {
      const response = await fetch(`${server.url}/api/cards/CY-0001/start`, { method: "POST" });
      assert.equal(response.status, 200);
      const body = await response.json() as { status: string; workspace?: { engine?: string } };
      assert.equal(body.status, "in_progress");
      assert.equal(body.workspace?.engine, "plain-copy");

      const metadataPath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "metadata.json");
      assert.equal(existsSync(metadataPath), true);
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as { changeId: string; engine: string };
      assert.equal(metadata.changeId, "CY-0001");
      assert.equal(metadata.engine, "plain-copy");

      const workspaceViewResponse = await fetch(`${server.url}/api/cards/CY-0001/workspace-view`);
      assert.equal(workspaceViewResponse.status, 200);
      const workspaceView = await workspaceViewResponse.json() as { engine: string; commands: string[]; diffOutput: string };
      assert.equal(workspaceView.engine, "plain-copy");
      assert.ok(workspaceView.commands.includes("ls"));
      assert.match(workspaceView.diffOutput, /No workspace changes detected\./);

      const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-start-via-ui-server.md");
      const change = readFileSync(changePath, "utf8");
      assert.match(change, /status: in_progress/);
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui create action creates a real changeyard markdown change", async () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    try {
      const response = await fetch(`${server.url}/api/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Create through ui" }),
      });
      assert.equal(response.status, 200);
      const card = await response.json() as { id: string; title: string; path: string };
      assert.equal(card.id, "CY-0001");
      assert.equal(card.title, "Create through ui");
      assert.equal(existsSync(path.join(repo, card.path)), true);
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui metadata edit action updates the underlying markdown frontmatter", async () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Original title" }, repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    try {
      const response = await fetch(`${server.url}/api/cards/CY-0001`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Updated title",
          priority: "high",
          labels: ["ui", "edited"],
        }),
      });
      assert.equal(response.status, 200);
      const card = await response.json() as { title: string; priority?: string; labels: string[] };
      assert.equal(card.title, "Updated title");
      assert.equal(card.priority, "high");
      assert.deepEqual(card.labels, ["ui", "edited"]);

      const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-original-title.md");
      const change = readFileSync(changePath, "utf8");
      assert.match(change, /title: Updated title/);
      assert.match(change, /priority: high/);
      assert.match(change, /labels:\n  - ui\n  - edited/);
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui section edit action updates the underlying markdown body", async () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Original sections" }, repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    try {
      const response = await fetch(`${server.url}/api/cards/CY-0001/sections/Summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Updated summary from the UI server.",
        }),
      });
      assert.equal(response.status, 200);
      const card = await response.json() as { sections?: Record<string, string> };
      assert.equal(card.sections?.Summary, "Updated summary from the UI server.");

      const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-original-sections.md");
      const change = readFileSync(changePath, "utf8");
      assert.match(change, /# Summary\n\nUpdated summary from the UI server\./);
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui complete action runs changeyard completion and updates status", async () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".env.example"), "SAFE=1\n");
    runCreate({ template: "agent-task", title: "Complete via ui server" }, repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    try {
      await fetch(`${server.url}/api/cards/CY-0001/start`, { method: "POST" });
      const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
      writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
      const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-complete-via-ui-server.md");
      const change = readFileSync(changePath, "utf8").replace(
        "Summarize what changed, what checks ran, and what risks remain.",
        "Implemented via the UI server completion flow.",
      );
      writeFileSync(changePath, change);

      const response = await fetch(`${server.url}/api/cards/CY-0001/complete`, { method: "POST" });
      assert.equal(response.status, 200);
      const card = await response.json() as { status: string };
      assert.equal(card.status, "ready_for_pr");
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui review actions create and complete changeyard reviews", async () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Review via ui server" }, repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-review-via-ui-server.md");
    const change = readFileSync(changePath, "utf8").replace("status: ready", "status: ready_for_pr");
    writeFileSync(changePath, change);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    try {
      const startResponse = await fetch(`${server.url}/api/cards/CY-0001/review/start`, { method: "POST" });
      assert.equal(startResponse.status, 200);
      assert.equal(existsSync(path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md")), true);

      const completeResponse = await fetch(`${server.url}/api/cards/CY-0001/review/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      assert.equal(completeResponse.status, 200);
      const card = await completeResponse.json() as { status: string };
      assert.equal(card.status, "approved");
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui workspace behavior reflects git-worktree metadata and verification", async () => {
  if (!hasCommand("git")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("git", ["config", "user.name", "Changeyard Test"], repo);
    runCommand("git", ["config", "user.email", "changeyard-test@example.test"], repo);
    writeFileSync(path.join(repo, "README.md"), "# changeyard\n");
    runCommand("git", ["add", "README.md"], repo);
    runCommand("git", ["commit", "-m", "initial"], repo);

    runInit(repo);
    writeFileSync(
      path.join(repo, ".changeyard", "config.local.jsonc"),
      JSON.stringify({ vcs: { engine: "git-worktree", fallback: "git-worktree" } }, null, 2) + "\n",
    );
    runCreate({ template: "agent-task", title: "Git worktree ui" }, repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    try {
      const startResponse = await fetch(`${server.url}/api/cards/CY-0001/start`, { method: "POST" });
      assert.equal(startResponse.status, 200);
      const started = await startResponse.json() as {
        workspace?: { engine?: string; verification?: { valid: boolean } };
      };
      assert.equal(started.workspace?.engine, "git-worktree");
      assert.equal(started.workspace?.verification?.valid, true);

      const boardResponse = await fetch(`${server.url}/api/board`);
      assert.equal(boardResponse.status, 200);
      const board = await boardResponse.json() as {
        workspaceEngine: string;
        columns: Array<{ cards: Array<{ id: string; workspace?: { engine?: string } }> }>;
      };
      assert.equal(board.workspaceEngine, "git-worktree");
      const card = board.columns.flatMap((column) => column.cards).find((entry) => entry.id === "CY-0001");
      assert.equal(card?.workspace?.engine, "git-worktree");

      const workspaceViewResponse = await fetch(`${server.url}/api/cards/CY-0001/workspace-view`);
      assert.equal(workspaceViewResponse.status, 200);
      const workspaceView = await workspaceViewResponse.json() as { engine: string; commands: string[] };
      assert.equal(workspaceView.engine, "git-worktree");
      assert.ok(workspaceView.commands.includes("git status --short"));
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui workspace behavior reflects jj metadata and verification", async () => {
  if (!hasCommand("git") || !hasCommand("jj")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("git", ["config", "user.name", "Changeyard Test"], repo);
    runCommand("git", ["config", "user.email", "changeyard-test@example.test"], repo);
    writeFileSync(path.join(repo, "README.md"), "# changeyard\n");
    runCommand("git", ["add", "README.md"], repo);
    runCommand("git", ["commit", "-m", "initial"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);

    runInit(repo);
    writeFileSync(
      path.join(repo, ".changeyard", "config.local.jsonc"),
      JSON.stringify({ vcs: { engine: "jj", fallback: "jj" } }, null, 2) + "\n",
    );
    runCreate({ template: "agent-task", title: "Jj ui" }, repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    try {
      const startResponse = await fetch(`${server.url}/api/cards/CY-0001/start`, { method: "POST" });
      assert.equal(startResponse.status, 200);
      const started = await startResponse.json() as {
        workspace?: { engine?: string; verification?: { valid: boolean } };
      };
      assert.equal(started.workspace?.engine, "jj");
      assert.equal(started.workspace?.verification?.valid, true);

      const boardResponse = await fetch(`${server.url}/api/board`);
      assert.equal(boardResponse.status, 200);
      const board = await boardResponse.json() as {
        workspaceEngine: string;
        columns: Array<{ cards: Array<{ id: string; workspace?: { engine?: string } }> }>;
      };
      assert.equal(board.workspaceEngine, "jj");
      const card = board.columns.flatMap((column) => column.cards).find((entry) => entry.id === "CY-0001");
      assert.equal(card?.workspace?.engine, "jj");

      const workspaceViewResponse = await fetch(`${server.url}/api/cards/CY-0001/workspace-view`);
      assert.equal(workspaceViewResponse.status, 200);
      const workspaceView = await workspaceViewResponse.json() as { engine: string; commands: string[] };
      assert.equal(workspaceView.engine, "jj");
      assert.ok(workspaceView.commands.includes("jj status"));
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});

test("ui provider actions publish local-folder PRs and reviews", async () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(
      path.join(repo, ".changeyard", "config.local.jsonc"),
      JSON.stringify({
        provider: { type: "local-folder" },
        checks: { standard: ["node -v"] },
      }, null, 2) + "\n",
    );
    writeFileSync(path.join(repo, ".env.example"), "SAFE=1\n");
    runCreate({ template: "agent-task", title: "Provider flow ui" }, repo);
    const server = await startChangeyardKanban({ repoRoot: repo, open: false, port: "auto" });
    try {
      const startResponse = await fetch(`${server.url}/api/cards/CY-0001/start`, { method: "POST" });
      assert.equal(startResponse.status, 200);

      const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
      writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
      const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-provider-flow-ui.md");
      writeFileSync(
        changePath,
        readFileSync(changePath, "utf8").replace(
          "Summarize what changed, what checks ran, and what risks remain.",
          "Published provider artifacts through the UI server.",
        ),
      );

      const completeResponse = await fetch(`${server.url}/api/cards/CY-0001/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withPr: true }),
      });
      assert.equal(completeResponse.status, 200);
      const completed = await completeResponse.json() as { status: string; provider?: { pullRequestUrl?: string } };
      assert.equal(completed.status, "pr_open");
      assert.equal(
        existsSync(path.join(repo, ".changeyard", "cache", "local-folder", "pull-requests", "0001-CY-0001.md")),
        true,
      );
      assert.match(String(completed.provider?.pullRequestUrl ?? ""), /^file:\/\//);

      const reviewStartResponse = await fetch(`${server.url}/api/cards/CY-0001/review/start`, { method: "POST" });
      assert.equal(reviewStartResponse.status, 200);

      const reviewCompleteResponse = await fetch(`${server.url}/api/cards/CY-0001/review/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      assert.equal(reviewCompleteResponse.status, 200);
      const reviewed = await reviewCompleteResponse.json() as { status: string };
      assert.equal(reviewed.status, "approved");
      assert.equal(
        existsSync(path.join(repo, ".changeyard", "cache", "local-folder", "reviews", "0002-CY-0001.md")),
        true,
      );
    } finally {
      await server.close();
    }
  } finally {
    cleanup(repo);
  }
});
