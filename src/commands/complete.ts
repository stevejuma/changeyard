import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { parseSections } from "../documents/sections.js";
import { changesRoot, workspacesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import type { Frontmatter } from "../types.js";
import { readWorkspaceMetadata } from "../workspace/marker.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import { assertTransition } from "../state/transitions.js";
import { createProvider } from "../providers/index.js";
import { isDenied } from "../workspace/patterns.js";
import { runChecks } from "../checks/runChecks.js";
import { runVerify } from "./verify.js";

export type CompleteOptions = {
  noPr?: boolean;
  noCodeChange?: boolean;
  profile?: string;
  dryRun?: boolean;
};

function listFiles(root: string, neverCopy: string[], prefix = ""): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const relative = prefix ? `${prefix}/${entry}` : entry;
    if (entry === ".changeyard-workspace.json" || entry === ".changeyard-hydrate.json" || isDenied(relative, [".git", ".jj", ".changeyard", ...neverCopy])) continue;
    const full = path.join(root, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) files.push(...listFiles(full, neverCopy, relative));
    if (stats.isFile()) files.push(relative);
  }
  return files.sort();
}

function hasWorkspaceChanges(repoRoot: string, workspaceRoot: string, neverCopy: string[]): boolean {
  const repoFiles = listFiles(repoRoot, neverCopy);
  const workspaceFiles = listFiles(workspaceRoot, neverCopy);
  if (repoFiles.join("\n") !== workspaceFiles.join("\n")) return true;
  for (const file of workspaceFiles) {
    const repoPath = path.join(repoRoot, file);
    const workspacePath = path.join(workspaceRoot, file);
    const repoContent = existsSync(repoPath) ? readFileSync(repoPath, "utf8") : "";
    const workspaceContent = existsSync(workspacePath) ? readFileSync(workspacePath, "utf8") : "";
    if (repoContent !== workspaceContent) return true;
  }
  return false;
}

function completionNotesPresent(body: string): boolean {
  const notes = parseSections(body).get("Completion Notes") ?? "";
  const trimmed = notes.trim();
  return trimmed.length > 0 && !trimmed.includes("Summarize what changed");
}

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

export function runComplete(id: string, options: CompleteOptions = {}, cwd = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  runVerify(id, cwd);
  const metadata = readWorkspaceMetadata(id, cwd);
  const config = loadConfig(metadata.repoRoot);
  const changePath = findChangeFile(changesRoot(metadata.repoRoot, config), id) ?? metadata.changePath;
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  assertTransition(String(parsed.frontmatter.status ?? ""), "ready_for_pr", `Complete ${id}`);
  if (!completionNotesPresent(parsed.body)) throw new Error("Completion Notes must be filled before completing a change");
  if (!options.noCodeChange && !hasWorkspaceChanges(metadata.repoRoot, metadata.path, config.workspace.hydrate.neverCopy)) {
    throw new Error("No workspace changes detected; use --no-code-change to complete metadata-only work");
  }

  const profile = options.profile ?? String(asRecord(parsed.frontmatter.checks).profile ?? "standard");
  const commands = config.checks[profile] ?? [];
  const logPath = path.join(workspacesRoot(metadata.repoRoot, config), id, "logs", "checks.log");

  if (options.dryRun) {
    return `Dry-run: would run ${commands.length} checks using ${profile} profile and complete ${id}`;
  }

  const results = runChecks(commands, metadata.path, logPath);
  const failed = results.find((result) => result.status === "failed");
  if (failed) throw new Error(`Check failed: ${failed.command}`);

  let nextFrontmatter: Frontmatter = {
    ...parsed.frontmatter,
    status: "ready_for_pr",
    updatedAt: new Date().toISOString(),
    checks: {
      ...asRecord(parsed.frontmatter.checks),
      profile,
      lastRun: new Date().toISOString(),
      lastStatus: "passed",
    },
  };

  if (!options.noPr) {
    const provider = createProvider(config.provider.type, config);
    if (!provider.createPullRequest) throw new Error(`Provider ${provider.name} does not support pull requests; use --no-pr`);
    const branch = String(metadata.branch ?? asRecord(parsed.frontmatter.branch).name ?? `cy/${id}`);
    createWorkspaceEngine(metadata.engine).publish({ cwd: metadata.path, metadata, branch });
    const base = String(asRecord(parsed.frontmatter.base).revision ?? config.project.defaultBase);
    const pr = provider.createPullRequest({ repoRoot: metadata.repoRoot, storageRoot: path.join(metadata.repoRoot, config.storage.root), changePath, frontmatter: nextFrontmatter, body: parsed.body, title: `${id}: ${String(parsed.frontmatter.title ?? id)}`, branch, base, draft: true });
    nextFrontmatter = {
      ...nextFrontmatter,
      status: "pr_open",
      remote: {
        ...asRecord(parsed.frontmatter.remote),
        provider: pr.provider,
        pullRequestNumber: pr.pullRequestNumber,
        pullRequestUrl: pr.pullRequestUrl,
      },
    };
  }

  writeFileSync(changePath, writeFrontmatter(nextFrontmatter, parsed.body));
  return `Completed ${id}: ${results.length} checks passed; status ${String(nextFrontmatter.status)}`;
}
