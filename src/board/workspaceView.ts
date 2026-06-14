import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { isDenied } from "../workspace/patterns.js";
import type { WorkspaceMetadata } from "../types.js";

export type WorkspaceTerminalView = {
  engine: string;
  path: string;
  commands: string[];
  statusOutput: string;
  diffOutput: string;
  checkLog?: string;
};

function listComparableFiles(root: string, neverCopy: string[], prefix = ""): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const relative = prefix ? `${prefix}/${entry}` : entry;
    if (
      entry === ".changeyard-workspace.json"
      || entry === ".changeyard-hydrate.json"
      || isDenied(relative, [".git", ".jj", ".changeyard", ...neverCopy])
    ) {
      continue;
    }
    const full = path.join(root, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) files.push(...listComparableFiles(full, neverCopy, relative));
    if (stats.isFile()) files.push(relative);
  }
  return files.sort();
}

function summarizePlainCopyDiff(repoRoot: string, workspaceRoot: string, neverCopy: string[]): string {
  const repoFiles = new Set(listComparableFiles(repoRoot, neverCopy));
  const workspaceFiles = new Set(listComparableFiles(workspaceRoot, neverCopy));
  const allFiles = [...new Set([...repoFiles, ...workspaceFiles])].sort();
  const lines: string[] = [];

  for (const file of allFiles) {
    if (!repoFiles.has(file)) {
      lines.push(`A ${file}`);
      continue;
    }
    if (!workspaceFiles.has(file)) {
      lines.push(`D ${file}`);
      continue;
    }
    const repoContent = readFileSync(path.join(repoRoot, file), "utf8");
    const workspaceContent = readFileSync(path.join(workspaceRoot, file), "utf8");
    if (repoContent !== workspaceContent) lines.push(`M ${file}`);
  }

  return lines.length > 0 ? lines.join("\n") : "No workspace changes detected.";
}

function runCommand(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    return output || `${command} ${args.join(" ")} failed`;
  }
  return output || "No output.";
}

function readCheckLog(repoRoot: string, id: string): string | undefined {
  const config = loadConfig(repoRoot);
  const logPath = path.join(repoRoot, config.storage.root, config.storage.workspacesDir, id, "logs", "checks.log");
  return existsSync(logPath) ? readFileSync(logPath, "utf8").trim() : undefined;
}

function commandsForEngine(id: string, metadata: WorkspaceMetadata): string[] {
  if (metadata.engine === "git-worktree") {
    return [
      `cd ${metadata.path}`,
      "git status --short",
      "git diff --stat HEAD",
      `cy verify ${id}`,
    ];
  }
  if (metadata.engine === "jj") {
    return [
      `cd ${metadata.path}`,
      "jj status",
      "jj diff --ignore-working-copy --summary",
      `cy verify ${id}`,
    ];
  }
  return [
    `cd ${metadata.path}`,
    "ls",
    `cy verify ${id}`,
  ];
}

export function readWorkspaceTerminalView(repoRoot: string, id: string, metadata: WorkspaceMetadata): WorkspaceTerminalView {
  const config = loadConfig(repoRoot);
  const checkLog = readCheckLog(repoRoot, id);

  if (metadata.engine === "git-worktree") {
    return {
      engine: metadata.engine,
      path: metadata.path,
      commands: commandsForEngine(id, metadata),
      statusOutput: runCommand("git", ["status", "--short"], metadata.path),
      diffOutput: runCommand("git", ["diff", "--stat", "HEAD"], metadata.path),
      checkLog,
    };
  }

  if (metadata.engine === "jj") {
    return {
      engine: metadata.engine,
      path: metadata.path,
      commands: commandsForEngine(id, metadata),
      statusOutput: runCommand("jj", ["status"], metadata.path),
      diffOutput: runCommand("jj", ["diff", "--ignore-working-copy", "--summary"], metadata.path),
      checkLog,
    };
  }

  return {
    engine: metadata.engine,
    path: metadata.path,
    commands: commandsForEngine(id, metadata),
    statusOutput: "Plain-copy workspace. Compare the copied checkout against the repo root and run commands locally in the workspace directory.",
    diffOutput: summarizePlainCopyDiff(repoRoot, metadata.path, config.workspace.hydrate.neverCopy),
    checkLog,
  };
}
