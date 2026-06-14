import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runInit } from "../src/commands/init.js";
import { runCreate } from "../src/commands/create.js";
import { runDoctor } from "../src/commands/doctor.js";
import { runStart } from "../src/commands/start.js";
import { GitWorktreeEngine } from "../src/workspace/GitWorktreeEngine.js";
import { JjWorkspaceEngine } from "../src/workspace/JjWorkspaceEngine.js";
import type { WorkspaceMetadata } from "../src/types.js";

function tempRepo(): string {
  return mkdtempSync(path.join(os.tmpdir(), "changeyard-vcs-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function runCommand(command: string, args: string[], cwd: string): string {
  const nextArgs = command === "git"
    ? [
        "-c",
        "commit.gpgsign=false",
        "-c",
        "tag.gpgsign=false",
        ...(args[0] === "commit" ? ["commit", "--no-gpg-sign", ...args.slice(1)] : args),
      ]
    : args;
  const result = spawnSync(command, nextArgs, { cwd, encoding: "utf8" });
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

function writeMetadata(repoRoot: string, id: string, changePath: string, branch: string): void {
  const workspaceRoot = path.join(repoRoot, ".changeyard", "workspaces", id);
  const workspacePath = path.join(workspaceRoot, "repo");
  const metadataPath = path.join(workspaceRoot, "metadata.json");
  mkdirSync(workspacePath, { recursive: true });
  const metadata: WorkspaceMetadata = {
    changeId: id,
    engine: "plain-copy",
    name: `cy-${id}`,
    path: workspacePath,
    repoRoot,
    changePath,
    createdAt: new Date().toISOString(),
    branch,
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  writeFileSync(path.join(workspacePath, ".changeyard-workspace.json"), `${JSON.stringify({ changeId: id, metadataPath }, null, 2)}\n`);
}

function createTempRepo(): string {
  return tempRepo();
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

test("git-worktree engine publishes branches to a local bare remote", () => {
  if (!hasCommand("git")) return;
  const repo = createTempRepo();
  const remote = path.join(repo, "origin.git");
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    configureTestGitIdentity(repo);
    writeFileSync(path.join(repo, "README.md"), "# changeyard\n");
    runCommand("git", ["add", "README.md"], repo);
    runCommand("git", ["commit", "-m", "initial"], repo);
    runCommand("git", ["init", "--bare", remote], repo);
    runCommand("git", ["remote", "add", "origin", remote], repo);

    runCommand("git", ["config", "remote.origin.url", remote], repo);

    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const metadata: WorkspaceMetadata = {
      changeId: "CY-0001",
      engine: "git-worktree",
      name: "cy-CY-0001",
      path: workspacePath,
      repoRoot: repo,
      changePath: path.join(repo, ".changeyard", "changes", "CY-0001-workflow.md"),
      createdAt: new Date().toISOString(),
      branch: "cy/CY-0001",
    };
    const engine = new GitWorktreeEngine();
    const created = engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    writeFileSync(path.join(created.path, "WORKSPACE.md"), "# workspace marker\n");
    runCommand("git", ["add", "WORKSPACE.md"], created.path);
    runCommand("git", ["commit", "-m", "workspace commit"], created.path);
    engine.publish({ cwd: created.path, metadata: created, branch: created.branch });

    const remoteRefs = runCommand("git", ["ls-remote", "--heads", remote, "cy/CY-0001"], repo);
    assert.ok(remoteRefs.includes("refs/heads/cy/CY-0001"));
  } finally {
    cleanup(repo);
  }
});

test("jj engine publishes bookmarks to a local bare remote", () => {
  if (!hasCommand("git") || !hasCommand("jj")) return;
  const repo = createTempRepo();
  const remote = path.join(repo, "origin.git");
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    configureTestGitIdentity(repo);
    writeFileSync(path.join(repo, "README.md"), "# changeyard\n");
    runCommand("git", ["add", "README.md"], repo);
    runCommand("git", ["commit", "-m", "initial"], repo);
    runCommand("git", ["init", "--bare", remote], repo);
    runCommand("git", ["remote", "add", "origin", remote], repo);
    runCommand("jj", ["git", "init", "--colocate"], repo);
    configureTestJjIdentity(repo);
    runCommand("jj", ["describe", "-m", "initial"], repo);

    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    const metadata: WorkspaceMetadata = {
      changeId: "CY-0001",
      engine: "jj",
      name: "cy-CY-0001",
      path: workspacePath,
      repoRoot: repo,
      changePath: path.join(repo, ".changeyard", "changes", "CY-0001-workflow.md"),
      createdAt: new Date().toISOString(),
      branch: "cy/CY-0001",
    };
    const engine = new JjWorkspaceEngine();
    const created = engine.create({ repoRoot: repo, workspacePath, metadata, neverCopy: [] });
    writeFileSync(path.join(created.path, "WORKSPACE.md"), "# workspace marker\n");
    runCommand("jj", ["describe", "-m", "workspace commit"], created.path);
    engine.publish({ cwd: created.path, metadata: created, branch: created.branch! });

    const remoteRefs = runCommand("git", ["ls-remote", "--heads", remote, "cy/CY-0001"], repo);
    assert.ok(remoteRefs.includes("refs/heads/cy/CY-0001"));
  } finally {
    cleanup(repo);
  }
});

test("doctor detects workspace branch collisions and dirty workspace state", () => {
  if (!hasCommand("git")) return;
  const repo = createTempRepo();
  try {
    runCommand("git", ["init", "-b", "main"], repo);
    configureTestGitIdentity(repo);
    writeFileSync(path.join(repo, "README.md"), "# repo\n");
    runCommand("git", ["add", "README.md"], repo);
    runCommand("git", ["commit", "-m", "initial"], repo);
    runInit(repo);
    writeFileSync(
      path.join(repo, ".changeyard", "config.local.jsonc"),
      JSON.stringify({ vcs: { engine: "git-worktree", fallback: "git-worktree" } }, null, 2) + "\n",
    );
    runCreate({ template: "agent-task", title: "Workspace collision test" }, repo);
    runCreate({ template: "agent-task", title: "Workspace collision test 2" }, repo);

    const rootChangesPath = path.join(repo, ".changeyard", "changes");
    const changePath1 = path.join(rootChangesPath, readdirSync(rootChangesPath).find((entry) => entry.startsWith("CY-0001-")) ?? "");
    const changePath2 = path.join(rootChangesPath, readdirSync(rootChangesPath).find((entry) => entry.startsWith("CY-0002-")) ?? "");
    writeMetadata(repo, "CY-0001", changePath1, "cy/shared-workspace");
    writeMetadata(repo, "CY-0002", changePath2, "cy/shared-workspace");
    const report = runDoctor(repo);
    assert.match(report, /workspace bookmark\/branch collision: cy\/shared-workspace/);

    rmSync(path.join(repo, ".changeyard", "workspaces", "CY-0001"), { recursive: true, force: true });
    const startOutput = runStart("CY-0001", repo);
    const match = /in\s+\.changeyard\/workspaces\/CY-0001\/repo/.exec(startOutput);
    const workspacePath = path.join(repo, ".changeyard", "workspaces", "CY-0001", "repo");
    if (match) {
      writeFileSync(path.join(workspacePath, "dirty.txt"), "dirty-workspace\n");
    }
    let changeBody = readFileSync(changePath1, "utf8");
    changeBody = changeBody.replace("status: in_progress", "status: ready_for_pr");
    writeFileSync(changePath1, changeBody);
    const secondReport = runDoctor(repo, { verbose: true });
    assert.match(secondReport, /workspace has uncommitted changes/);
  } finally {
    cleanup(repo);
  }
});

test("workspace verification surfaces missing binaries and conflict states", () => {
  const missingBinaryGit = new GitWorktreeEngine(() => {
    throw new Error("git binary missing");
  });
  const missingBinaryJj = new JjWorkspaceEngine(() => {
    throw new Error("jj binary missing");
  });
  const tempPath = path.join(createTempRepo(), "workspace");
  mkdirSync(tempPath, { recursive: true });
  const metadata = {
    changeId: "CY-0001",
    engine: "git-worktree",
    name: "cy-CY-0001",
    path: tempPath,
    repoRoot: tempPath,
    changePath: path.join(tempPath, "change.md"),
    createdAt: new Date().toISOString(),
    branch: "cy/CY-0001",
  };

  const gitResult = missingBinaryGit.verify({ cwd: tempPath, metadata });
  assert.equal(gitResult.valid, false);
  assert.match(gitResult.errors.join("\n"), /git binary missing/);

  const jjResult = missingBinaryJj.verify({ cwd: tempPath, metadata: { ...metadata, engine: "jj" } });
  assert.equal(jjResult.valid, false);
  assert.match(jjResult.errors.join("\n"), /jj binary missing/);

  const conflictedGit = new GitWorktreeEngine((command, args) => {
    const joined = `${command} ${args.join(" ")}`;
    if (joined === "git rev-parse --show-toplevel") return tempPath;
    if (joined === "git status --porcelain") return "UU README.md";
    return "";
  });
  const conflictedGitResult = conflictedGit.verify({ cwd: tempPath, metadata });
  assert.equal(conflictedGitResult.valid, false);
  assert.match(conflictedGitResult.errors.join("\n"), /unresolved conflicts/);

  const conflictedJj = new JjWorkspaceEngine((command, args) => {
    const joined = `${command} ${args.join(" ")}`;
    if (joined === "jj workspace root") return tempPath;
    if (joined === "jj workspace list") return "cy-CY-0001";
    if (joined === "jj status") return "Changes to commit:\nconflict: README.md";
    if (joined === "jj resolve --list") return "README.md";
    return "";
  });
  const conflictedJjResult = conflictedJj.verify({ cwd: tempPath, metadata: { ...metadata, engine: "jj" } });
  assert.equal(conflictedJjResult.valid, false);
  assert.match(conflictedJjResult.errors.join("\n"), /jj workspace reports conflicts/);
});
