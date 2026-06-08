import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCompletions } from "../src/commands/completions.js";
import { runComplete } from "../src/commands/complete.js";
import { doctorReport, runDoctor } from "../src/commands/doctor.js";
import { runCreate } from "../src/commands/create.js";
import { runHydrate } from "../src/commands/hydrate.js";
import { runInit } from "../src/commands/init.js";
import { listChanges, runList } from "../src/commands/list.js";
import { runRecover } from "../src/commands/recover.js";
import { runReviewComplete, runReviewStart } from "../src/commands/review.js";
import { runStart } from "../src/commands/start.js";
import { getStatus, runStatus } from "../src/commands/status.js";
import { runSync } from "../src/commands/sync.js";
import { runValidate } from "../src/commands/validate.js";
import { runVerify } from "../src/commands/verify.js";
import { loadConfig } from "../src/config/loadConfig.js";
import { parseFrontmatter } from "../src/documents/frontmatter.js";
import { validateChangeFile } from "../src/documents/validateDocument.js";
import { createProvider } from "../src/providers/index.js";
import { ForgejoProvider } from "../src/providers/ForgejoProvider.js";
import { GitHubProvider } from "../src/providers/GitHubProvider.js";
import { GitLabProvider } from "../src/providers/GitLabProvider.js";
import { curlJson, setHttpTransportForTests, type HttpRequest } from "../src/providers/http.js";
import { GitWorktreeEngine } from "../src/workspace/GitWorktreeEngine.js";
import { JjWorkspaceEngine } from "../src/workspace/JjWorkspaceEngine.js";

function tempRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "changeyard-test-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

test("init creates config, templates, and storage directories", () => {
  const repo = tempRepo();
  try {
    const output = runInit(repo);
    assert.match(output, /Initialized Changeyard/);
    assert.doesNotThrow(() => readFileSync(path.join(repo, ".changeyard", "config.jsonc"), "utf8"));
    const schema = JSON.parse(readFileSync(path.join(repo, ".changeyard", "schema.json"), "utf8"));
    assert.equal(schema["$schema"], "https://json-schema.org/draft/2020-12/schema");
    assert.deepEqual(schema.properties.provider.properties.type.enum, ["noop", "local-folder", "forgejo", "github", "gitlab"]);
    assert.deepEqual(schema.properties.vcs.properties.engine.enum, ["plain-copy", "jj", "git-worktree"]);
    assert.equal(schema.properties.workspace.properties.hydrate.properties.warmupCommand.type, "string");
    assert.doesNotThrow(() => readFileSync(path.join(repo, ".changeyard", "templates", "agent-task.md"), "utf8"));
  } finally {
    cleanup(repo);
  }
});

test("create allocates a valid markdown change", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const output = runCreate({ template: "agent-task", title: "Add workspace verification" }, repo);
    assert.match(output, /Created CY-0001/);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-add-workspace-verification.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.id, "CY-0001");
    assert.equal(parsed.frontmatter.status, "ready");
    assert.equal(parsed.frontmatter.title, "Add workspace verification");
    assert.equal(runValidate("CY-0001", repo), "Valid change: .changeyard/changes/CY-0001-add-workspace-verification.md");
  } finally {
    cleanup(repo);
  }
});

test("validate reports missing sections and invalid status", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-broken.md");
    writeFileSync(changePath, `---\nid: CY-0001\ntitle: Broken\ntype: agent-task\nstatus: nope\npriority: medium\nlabels:\n  - agent-ready\n---\n\n# Summary\n\nOnly summary.\n`);
    const result = validateChangeFile(changePath, path.join(repo, ".changeyard"));
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("Unknown status value: nope"));
    assert.ok(result.errors.includes("Missing required section: Motivation"));
  } finally {
    cleanup(repo);
  }
});

test("sync with noop updates local change status and remote provider", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Sync noop change" }, repo);
    const output = runSync("CY-0001", repo);
    assert.match(output, /Synced CY-0001 with noop/);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-sync-noop-change.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "synced");
    assert.deepEqual(parsed.frontmatter.remote, {
      provider: "noop",
      issueNumber: null,
      issueUrl: null,
      pullRequestNumber: null,
      pullRequestUrl: null,
    });
  } finally {
    cleanup(repo);
  }
});

test("sync with local-folder writes a remote-like issue and provider cache", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"}}
`);
    runCreate({ template: "feature", title: "Add local provider" }, repo);
    const output = runSync("CY-0001", repo);
    assert.match(output, /Synced CY-0001 with local-folder -> file:\/\//);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-add-local-provider.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "synced");
    assert.deepEqual(parsed.frontmatter.remote, {
      provider: "local-folder",
      issueNumber: 1,
      issueUrl: pathToFileUrl(path.join(repo, ".changeyard", "cache", "local-folder", "issues", "0001-CY-0001.md")),
      pullRequestNumber: null,
      pullRequestUrl: null,
    });

    const issue = readFileSync(path.join(repo, ".changeyard", "cache", "local-folder", "issues", "0001-CY-0001.md"), "utf8");
    assert.match(issue, /sourceChange: CY-0001/);
    assert.match(issue, /status: synced/);
    assert.match(issue, /# Summary/);
    const second = runSync("CY-0001", repo);
    assert.match(second, /Synced CY-0001 with local-folder/);
    const state = readFileSync(path.join(repo, ".changeyard", "cache", "provider-state.json"), "utf8");
    assert.match(state, /"CY-0001": 1/);
    assert.doesNotMatch(state, /"nextIssueNumber": 3/);
  } finally {
    cleanup(repo);
  }
});

test("start creates a plain-copy workspace and verify enforces the workspace directory", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Start workspace" }, repo);
    const output = runStart("CY-0001", repo);
    assert.match(output, /Started CY-0001 in \.changeyard\/workspaces\/CY-0001\/repo/);

    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-start-workspace.md");
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "in_progress");
    assert.deepEqual(parsed.frontmatter.workspace, {
      engine: "plain-copy",
      name: "cy-CY-0001",
      path: ".changeyard/workspaces/CY-0001/repo",
    });

    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const metadata = readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "metadata.json"), "utf8");
    assert.match(metadata, /"engine": "plain-copy"/);
    assert.match(readFileSync(path.join(workspacePath, ".changeyard-workspace.json"), "utf8"), /metadataPath/);
    assert.equal(runVerify("CY-0001", workspacePath), "Verified CY-0001 in .changeyard/workspaces/CY-0001/repo");
    assert.throws(() => runVerify("CY-0001", repo), /not inside a Changeyard workspace/);
  } finally {
    cleanup(repo);
  }
});

test("hydrate copies allowlisted files and skips denied secrets", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".env.example"), "SAFE=1\n");
    writeFileSync(path.join(repo, ".env"), "SECRET=1\n");
    runCreate({ template: "agent-task", title: "Hydrate workspace" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    assert.equal(runHydrate("CY-0001", workspacePath), "Hydrated CY-0001: copied 1, skipped 1");
    assert.equal(readFileSync(path.join(workspacePath, ".env.example"), "utf8"), "SAFE=1\n");
    assert.throws(() => readFileSync(path.join(workspacePath, ".env"), "utf8"));
  } finally {
    cleanup(repo);
  }
});

test("complete runs checks and updates ready_for_pr", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"checks":{"standard":["node -v"]}}\n`);
    runCreate({ template: "agent-task", title: "Complete workspace" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-complete-workspace.md");
    const change = readFileSync(changePath, "utf8").replace("Summarize what changed, what checks ran, and what risks remain.", "Implemented workspace changes and ran checks.");
    writeFileSync(changePath, change);
    assert.match(runComplete("CY-0001", { noPr: true }, workspacePath), /Completed CY-0001: 1 checks passed/);
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "ready_for_pr");
    assert.match(readFileSync(path.join(repo, ".changeyard", "workspaces", "CY-0001", "logs", "checks.log"), "utf8"), /node -v/);
  } finally {
    cleanup(repo);
  }
});

test("complete can create a local-folder pull request when PRs are enabled", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"},"checks":{"standard":["node -v"]}}
`);
    runCreate({ template: "agent-task", title: "Open local PR" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    writeFileSync(path.join(workspacePath, "implementation.txt"), "done\n");
    const changePath = path.join(repo, ".changeyard", "changes", "CY-0001-open-local-pr.md");
    writeFileSync(changePath, readFileSync(changePath, "utf8").replace("Summarize what changed, what checks ran, and what risks remain.", "Implemented PR creation and ran checks."));
    assert.match(runComplete("CY-0001", {}, workspacePath), /status pr_open/);
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    assert.equal(parsed.frontmatter.status, "pr_open");
    const pr = readFileSync(path.join(repo, ".changeyard", "cache", "local-folder", "pull-requests", "0001-CY-0001.md"), "utf8");
    assert.match(pr, /draft: true/);
    assert.match(pr, /base: main/);
  } finally {
    cleanup(repo);
  }
});

test("doctor reports configured provider and recover rewrites workspace marker", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Recover workspace" }, repo);
    runStart("CY-0001", repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    rmSync(path.join(workspacePath, ".changeyard-workspace.json"), { force: true });
    assert.match(runDoctor(repo), /provider: noop/);
    assert.deepEqual(doctorReport(repo).warnings, ["CY-0001: missing workspace marker; run cy recover CY-0001"]);
    assert.match(runRecover("CY-0001", repo), /Recovered CY-0001/);
    assert.deepEqual(doctorReport(repo).warnings, []);
    assert.match(readFileSync(path.join(workspacePath, ".changeyard-workspace.json"), "utf8"), /metadataPath/);
  } finally {
    cleanup(repo);
  }
});

test("review start and complete update review and change status", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Review workflow" }, repo);
    assert.match(runReviewStart("CY-0001", repo), /Started review 1/);
    assert.equal(runReviewComplete("CY-0001", "approve", repo), "Completed review for CY-0001: approved");
    const review = readFileSync(path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md"), "utf8");
    assert.match(review, /status: approved/);
    const change = parseFrontmatter(readFileSync(path.join(repo, ".changeyard", "changes", "CY-0001-review-workflow.md"), "utf8"));
    assert.equal(change.frontmatter.status, "approved");
  } finally {
    cleanup(repo);
  }
});

function pathToFileUrl(filePath: string): string {
  return `file://${filePath}`;
}

test("local-folder provider publishes completed markdown reviews", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"local-folder"}}
`);
    runCreate({ template: "agent-task", title: "Publish review" }, repo);
    runReviewStart("CY-0001", repo);
    const reviewPath = path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md");
    writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").replace("Add inline comments as bullets: - path/to/file.ts:42: Comment text.", "- src/example.ts:42: Tighten this assertion."));
    assert.equal(runReviewComplete("CY-0001", "approve", repo), "Completed review for CY-0001: approved");
    const review = readFileSync(path.join(repo, ".changeyard", "reviews", "CY-0001", "review-001.md"), "utf8");
    assert.match(review, /reviewUrl: file:\/\//);
    const published = readFileSync(path.join(repo, ".changeyard", "cache", "local-folder", "reviews", "0001-CY-0001.md"), "utf8");
    assert.match(published, /decision: approved/);
    assert.match(published, /inlineCommentCount: 1/);
    assert.match(published, /src\/example.ts:42: Tighten this assertion/);
    assert.match(published, /sourceReview: .changeyard\/reviews\/CY-0001\/review-001.md/);
  } finally {
    cleanup(repo);
  }
});

test("github and gitlab providers are registered with PR capabilities", () => {
  const baseConfig: any = {
    project: { idPrefix: "CY", defaultBase: "main" },
    storage: { root: ".changeyard", changesDir: "changes", workspacesDir: "workspaces", reviewsDir: "reviews" },
    provider: { type: "github", owner: "example", repo: "repo" },
    vcs: { engine: "plain-copy", fallback: "plain-copy" },
    workspace: { pathPattern: "{id}/repo", namePattern: "cy-{id}", branchPattern: "cy/{id}", hydrate: { installCommand: "", copy: [], link: [], neverCopy: [] } },
    checks: { standard: [] },
  };
  assert.equal(createProvider("github", baseConfig).capabilities().pullRequests, true);
  assert.equal(createProvider("github", baseConfig).capabilities().reviews, true);
  assert.equal(createProvider("gitlab", { ...baseConfig, provider: { type: "gitlab", owner: "example", repo: "repo" } }).capabilities().pullRequests, true);
});

test("shell completions include core commands", () => {
  const completions = runCompletions();
  assert.match(completions, /complete -F _cy_complete cy changeyard/);
  assert.match(completions, /doctor recover/);
});

test("jj workspace engine creates and verifies expected jj workspace", () => {
  const repo = tempRepo();
  try {
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    mkdirSync(workspacePath, { recursive: true });
    const calls: string[] = [];
    const engine = new JjWorkspaceEngine((command, args, cwd) => {
      calls.push(`${cwd}: ${command} ${args.join(" ")}`);
      if (args.join(" ") === "workspace root") return workspacePath;
      if (args.join(" ") === "workspace list") return "cy-CY-0001 abc123";
      if (args.join(" ") === "status") return "The working copy is clean";
      return "";
    });
    const metadata = { changeId: "CY-0001", engine: "jj", name: "cy-CY-0001", path: workspacePath, repoRoot: repo, changePath: path.join(repo, "change.md"), createdAt: "now" };
    engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    assert.ok(calls.some((call) => call.includes("jj workspace add --name cy-CY-0001")));
    assert.deepEqual(engine.verify({ cwd: workspacePath, metadata }), { valid: true, errors: [] });
    engine.publish({ cwd: workspacePath, metadata, branch: "cy/CY-0001" });
    assert.ok(calls.some((call) => call.includes("jj bookmark set cy/CY-0001 -r @")));
    assert.ok(calls.some((call) => call.includes("jj git push --bookmark cy/CY-0001")));
  } finally {
    cleanup(repo);
  }
});

test("git worktree engine creates branch worktree and verifies clean root", () => {
  const repo = tempRepo();
  try {
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    mkdirSync(workspacePath, { recursive: true });
    const calls: string[] = [];
    const engine = new GitWorktreeEngine((command, args, cwd) => {
      calls.push(`${cwd}: ${command} ${args.join(" ")}`);
      if (args.join(" ") === "rev-parse --show-toplevel") return workspacePath;
      if (args.join(" ") === "status --porcelain") return "";
      return "";
    });
    const metadata = { changeId: "CY-0001", engine: "git-worktree", name: "cy-CY-0001", path: workspacePath, repoRoot: repo, changePath: path.join(repo, "change.md"), createdAt: "now", branch: "cy/CY-0001-test" };
    const created = engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    assert.equal(created.branch, "cy/CY-0001-test");
    assert.ok(calls.some((call) => call.includes("git worktree add -b cy/CY-0001-test")));
    assert.deepEqual(engine.verify({ cwd: workspacePath, metadata: created }), { valid: true, errors: [] });
    engine.publish({ cwd: workspacePath, metadata: created, branch: "cy/CY-0001-test" });
    assert.ok(calls.some((call) => call.includes("git push -u origin cy/CY-0001-test")));
  } finally {
    cleanup(repo);
  }
});

test("list and status summarize local changes", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "feature", title: "Add local provider" }, repo);
    assert.match(runList(repo), /CY-0001\tready\tfeature\tAdd local provider/);
    assert.match(runStatus("CY-0001", repo), /status: ready/);
  } finally {
    cleanup(repo);
  }
});

type ProviderRequest = HttpRequest & { payload: Record<string, unknown> };

function providerConfig(type: string, tokenEnv: string): any {
  return {
    project: { idPrefix: "CY", defaultBase: "main" },
    storage: { root: ".changeyard", changesDir: "changes", workspacesDir: "workspaces", reviewsDir: "reviews" },
    provider: { type, baseUrl: `https://${type}.example.test`, owner: "example-org", repo: "example-repo", auth: { tokenEnv } },
    vcs: { engine: "plain-copy", fallback: "plain-copy" },
    workspace: { pathPattern: "{id}/repo", namePattern: "cy-{id}", branchPattern: "cy/{id}", hydrate: { installCommand: "", copy: [], link: [], neverCopy: [] } },
    checks: { standard: [] },
  };
}

function providerSyncInput(remote: Record<string, unknown> = {}): any {
  return {
    repoRoot: "/repo",
    storageRoot: "/repo/.changeyard",
    changePath: "/repo/.changeyard/changes/CY-0001-provider.md",
    frontmatter: {
      id: "CY-0001",
      title: "Provider sync",
      status: "synced",
      type: "agent-task",
      labels: ["agent-ready", "provider"],
      remote,
    },
    body: "# Summary\n\nProvider body.\n",
  };
}

test("remote providers send expected issue, PR, and review HTTP requests", () => {
  const previousForgeToken = process.env.CHANGEYARD_TEST_FORGE_TOKEN;
  const previousGitHubToken = process.env.CHANGEYARD_TEST_GITHUB_TOKEN;
  const previousGitLabToken = process.env.CHANGEYARD_TEST_GITLAB_TOKEN;
  process.env.CHANGEYARD_TEST_FORGE_TOKEN = "forge-token";
  process.env.CHANGEYARD_TEST_GITHUB_TOKEN = "github-token";
  process.env.CHANGEYARD_TEST_GITLAB_TOKEN = "gitlab-token";
  const requests: ProviderRequest[] = [];
  setHttpTransportForTests((request) => {
    requests.push(request as ProviderRequest);
    if (request.url.endsWith("/pulls/42")) {
      return { status: 200, body: JSON.stringify({ number: 42, html_url: "https://example.test/pull/42", head: { sha: "abc123" } }) };
    }
    if (request.url.includes("/pulls/42/files")) {
      return { status: 200, body: JSON.stringify([{ filename: "src/example.ts", patch: "@@ -40,3 +40,4 @@\n context\n+line 42\n context\n" }]) };
    }
    if (request.url.endsWith("/merge_requests/43")) {
      return { status: 200, body: JSON.stringify({ iid: 43, web_url: "https://example.test/merge/43", diff_refs: { base_sha: "base", head_sha: "head", start_sha: "start" } }) };
    }
    if (request.url.endsWith("/merge_requests/43/changes")) {
      return { status: 200, body: JSON.stringify({ changes: [{ new_path: "src/example.ts", old_path: "src/example.ts", diff: "@@ -40,3 +40,4 @@\n context\n+line 42\n context\n" }] }) };
    }
    if (request.url.includes("/comments") || request.url.includes("/notes")) return { status: 201, body: JSON.stringify({ id: 44, html_url: "https://example.test/review/44", web_url: "https://example.test/review/44" }) };
    if (request.url.includes("/pulls")) return { status: 201, body: JSON.stringify({ number: 42, html_url: "https://example.test/pull/42" }) };
    if (request.url.includes("/merge_requests")) return { status: 201, body: JSON.stringify({ iid: 43, web_url: "https://example.test/merge/43" }) };
    return { status: request.method === "POST" ? 201 : 200, body: JSON.stringify({ number: 41, iid: 41, html_url: "https://example.test/issues/41", web_url: "https://example.test/issues/41" }) };
  });

  try {
    const forgejo = new ForgejoProvider(providerConfig("forgejo", "CHANGEYARD_TEST_FORGE_TOKEN"));
    const github = new GitHubProvider(providerConfig("github", "CHANGEYARD_TEST_GITHUB_TOKEN"));
    const gitlab = new GitLabProvider(providerConfig("gitlab", "CHANGEYARD_TEST_GITLAB_TOKEN"));

    assert.deepEqual(forgejo.syncIssue(providerSyncInput()), { provider: "forgejo", issueNumber: 41, issueUrl: "https://example.test/issues/41" });
    assert.deepEqual(github.syncIssue(providerSyncInput({ issueNumber: 7 })), { provider: "github", issueNumber: 41, issueUrl: "https://example.test/issues/41" });
    assert.deepEqual(gitlab.syncIssue(providerSyncInput({ issueNumber: 8 })), { provider: "gitlab", issueNumber: 41, issueUrl: "https://example.test/issues/41" });

    assert.equal(forgejo.createPullRequest?.({ ...providerSyncInput(), title: "Provider sync", branch: "cy/CY-0001", base: "main", draft: true }).pullRequestNumber, 42);
    assert.equal(github.createPullRequest?.({ ...providerSyncInput(), title: "Provider sync", branch: "cy/CY-0001", base: "main", draft: true }).pullRequestNumber, 42);
    assert.equal(gitlab.createPullRequest?.({ ...providerSyncInput(), title: "Provider sync", branch: "cy/CY-0001", base: "main", draft: true }).pullRequestNumber, 43);

    assert.equal(github.publishReview?.({ ...providerSyncInput({ pullRequestNumber: 42 }), reviewPath: "/repo/.changeyard/reviews/CY-0001/review-001.md", reviewFrontmatter: { review: 1 }, reviewBody: "# Summary\n\nApproved.", decision: "approved", inlineComments: [{ path: "src/example.ts", line: 42, body: "Tighten this assertion." }] }).reviewNumber, 44);
    assert.equal(gitlab.publishReview?.({ ...providerSyncInput({ pullRequestNumber: 43 }), reviewPath: "/repo/.changeyard/reviews/CY-0001/review-001.md", reviewFrontmatter: { review: 1 }, reviewBody: "# Summary\n\nApproved.", decision: "approved" }).reviewNumber, 44);

    const forgeIssue = requests.find((request) => request.url === "https://forgejo.example.test/api/v1/repos/example-org/example-repo/issues");
    const githubIssue = requests.find((request) => request.url === "https://github.example.test/repos/example-org/example-repo/issues/7");
    const gitlabIssue = requests.find((request) => request.url === "https://gitlab.example.test/api/v4/projects/example-org%2Fexample-repo/issues/8");
    const gitlabMergeRequest = requests.find((request) => request.url === "https://gitlab.example.test/api/v4/projects/example-org%2Fexample-repo/merge_requests");
    const githubReview = requests.find((request) => request.url === "https://github.example.test/repos/example-org/example-repo/issues/42/comments");
    const gitlabReview = requests.find((request) => request.url === "https://gitlab.example.test/api/v4/projects/example-org%2Fexample-repo/merge_requests/43/notes");

    assert.ok(forgeIssue);
    assert.ok(githubIssue);
    assert.ok(gitlabIssue);
    assert.ok(gitlabMergeRequest);
    assert.ok(githubReview);
    assert.ok(gitlabReview);
    assert.equal(forgeIssue?.method, "POST");
    assert.deepEqual(forgeIssue?.payload.labels, ["agent-ready", "provider"]);
    assert.equal(githubIssue?.method, "PATCH");
    assert.equal(githubIssue?.tokenScheme, "Bearer");
    assert.equal(gitlabIssue?.method, "PUT");
    assert.equal(gitlabMergeRequest?.payload.target_branch, "main");
    assert.match(String(githubReview?.payload.body), /Inline comments:/);
  } finally {
    setHttpTransportForTests();
    if (previousForgeToken === undefined) delete process.env.CHANGEYARD_TEST_FORGE_TOKEN; else process.env.CHANGEYARD_TEST_FORGE_TOKEN = previousForgeToken;
    if (previousGitHubToken === undefined) delete process.env.CHANGEYARD_TEST_GITHUB_TOKEN; else process.env.CHANGEYARD_TEST_GITHUB_TOKEN = previousGitHubToken;
    if (previousGitLabToken === undefined) delete process.env.CHANGEYARD_TEST_GITLAB_TOKEN; else process.env.CHANGEYARD_TEST_GITLAB_TOKEN = previousGitLabToken;
  }
});

test("HTTP provider helper surfaces remote status and JSON errors", () => {
  try {
    setHttpTransportForTests(() => ({ status: 422, body: JSON.stringify({ message: "Validation failed" }) }));
    assert.throws(() => curlJson({ method: "POST", url: "https://api.example.test/issues", token: "token", payload: {} }), /HTTP 422.*Validation failed/);
    setHttpTransportForTests(() => ({ status: 200, body: "not-json" }));
    assert.throws(() => curlJson({ method: "POST", url: "https://api.example.test/issues", token: "token", payload: {} }), /invalid JSON/);
  } finally {
    setHttpTransportForTests();
  }
});


test("package metadata includes release smoke scripts", () => {
  const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
  assert.equal(packageJson.scripts.prepack, "npm run build");
  assert.equal(packageJson.scripts.cli, "node dist/src/cli.js");
  assert.equal(packageJson.scripts["build:kanban"], "npm --workspace @changeyard/kanban run build");
  assert.equal(packageJson.scripts["pack:check"], "npm run build && npm pack --dry-run");
  assert.equal(packageJson.bin.cy, "./dist/src/cli.js");
  assert.equal(packageJson.engines.node, ">=22.0.0");
  assert.deepEqual(packageJson.files, ["dist/src", "packages/kanban/dist", "packages/kanban/package.json", "packages/kanban/README.md", "README.md", "docs", "scripts"]);
});


test("runtime config validation rejects unknown fields", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    writeFileSync(path.join(repo, ".changeyard", "config.local.jsonc"), `{"provider":{"type":"noop","unexpected":true}}\n`);
    assert.throws(() => loadConfig(repo), /provider\.unexpected is not allowed/);
  } finally {
    cleanup(repo);
  }
});

test("doctor reports workspace drift and recover all repairs missing markers", () => {
  const repo = tempRepo();
  try {
    runInit(repo);
    runCreate({ template: "agent-task", title: "Drift workspace" }, repo);
    runStart("CY-0001", repo);
    const markerPath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo", ".changeyard-workspace.json");
    rmSync(markerPath, { force: true });
    assert.match(runDoctor(repo), /missing workspace marker; run cy recover CY-0001/);
    assert.match(runRecover("all", repo), /Recovered CY-0001/);
    assert.match(runDoctor(repo), /workspace: CY-0001/);
  } finally {
    cleanup(repo);
  }
});

function runCommand(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} ${args.join(" ")} failed`);
}

function hasCommand(command: string): boolean {
  return spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0;
}

test("git-worktree engine integrates with a real temporary git repository", () => {
  if (!hasCommand("git")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("git", ["config", "user.email", "changeyard@example.test"], repo);
    runCommand("git", ["config", "user.name", "Changeyard Test"], repo);
    writeFileSync(path.join(repo, "README.md"), "# repo\n");
    runCommand("git", ["add", "README.md"], repo);
    runCommand("git", ["commit", "-m", "initial"], repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const engine = new GitWorktreeEngine();
    const metadata = { changeId: "CY-0001", engine: "git-worktree", name: "cy-CY-0001", path: workspacePath, repoRoot: repo, changePath: path.join(repo, "change.md"), createdAt: "now", branch: "cy/CY-0001-real" };
    const created = engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    assert.deepEqual(engine.verify({ cwd: workspacePath, metadata: created }), { valid: true, errors: [] });
  } finally {
    cleanup(repo);
  }
});

test("jj workspace engine can verify a real jj workspace when jj is installed", () => {
  if (!hasCommand("jj")) return;
  const repo = tempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const engine = new JjWorkspaceEngine();
    const metadata = { changeId: "CY-0001", engine: "jj", name: "cy-CY-0001-real", path: workspacePath, repoRoot: repo, changePath: path.join(repo, "change.md"), createdAt: "now" };
    const created = engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    assert.deepEqual(engine.verify({ cwd: workspacePath, metadata: created }), { valid: true, errors: [] });
  } finally {
    cleanup(repo);
  }
});
