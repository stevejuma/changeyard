import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { quickCompletionProfile, validateQuickCompletion } from "../change/quickLifecycle.js";
import { parseSliceRecords } from "../change/slices.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { parseSections } from "../documents/sections.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { changesRoot, storageRoot, workspacesRoot } from "../paths.js";
import { validatePlanningForGate } from "../planning/validation.js";
import { findChangeFile } from "../state/id.js";
import type { Frontmatter, WorkspaceMetadata } from "../types.js";
import { readWorkspaceMetadata, resolveWorkspaceChangePath } from "../workspace/marker.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import { describeJjWorkspaceCommit } from "../workspace/jjLandingDescriptions.js";
import { assertTransition } from "../state/transitions.js";
import { createProvider } from "../providers/index.js";
import { isDenied } from "../workspace/patterns.js";
import { countPassedManualChecks, runChecks } from "../checks/runChecks.js";
import { runVerify } from "./verify.js";
import { formatValidationFailure } from "./audit.js";
import { finalDescriptionMessage } from "./describe.js";

export type CompleteOptions = {
  noPr?: boolean;
  noCodeChange?: boolean;
  singleCommitOk?: boolean;
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
  return changedWorkspaceFiles(repoRoot, workspaceRoot, neverCopy).length > 0;
}

function changedWorkspaceFiles(repoRoot: string, workspaceRoot: string, neverCopy: string[]): string[] {
  const repoFiles = listFiles(repoRoot, neverCopy);
  const workspaceFiles = listFiles(workspaceRoot, neverCopy);
  const allFiles = [...new Set([...repoFiles, ...workspaceFiles])].sort();
  const changed: string[] = [];
  for (const file of allFiles) {
    if (!repoFiles.includes(file) || !workspaceFiles.includes(file)) {
      changed.push(file);
      continue;
    }
    const repoPath = path.join(repoRoot, file);
    const workspacePath = path.join(workspaceRoot, file);
    const repoContent = existsSync(repoPath) ? readFileSync(repoPath, "utf8") : "";
    const workspaceContent = existsSync(workspacePath) ? readFileSync(workspacePath, "utf8") : "";
    if (repoContent !== workspaceContent) changed.push(file);
  }
  return changed;
}

function enforceSliceGuard(changeId: string, metadataPath: string, body: string, changedFiles: string[], options: CompleteOptions): void {
  if (options.noCodeChange || options.singleCommitOk || changedFiles.length <= 3) return;
  const slices = parseSliceRecords(body);
  if (slices.length > 1) return;
  throw new Error([
    `Change ${changeId} appears to have ${changedFiles.length} changed files but only ${slices.length} recorded slice ${slices.length === 1 ? "commit" : "commits"}.`,
    "",
    "Changeyard expects one user-requested implementation increment per slice commit.",
    "",
    "Landing stack:",
    ...(slices.length
      ? slices.map((slice) => `- ${slice.title}: ${slice.id}${slice.commitId ? ` (${slice.commitId})` : ""}`)
      : ["- no recorded slices"]),
    "",
    "Recovery:",
    `- Split the work into reviewable slices with cy slice commit ${changeId} -m "<slice title>".`,
    "- If this is intentionally one indivisible change, re-run cy complete with --single-commit-ok.",
    `- Agents must only run cy complete on explicit completion wording; update protocol notes in ${metadataPath} if needed.`,
  ].join("\n"));
}

function legacyHasWorkspaceChanges(repoRoot: string, workspaceRoot: string, neverCopy: string[]): boolean {
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
  return trimmed.length > 0
    && !trimmed.includes("Summarize what changed")
    && !trimmed.includes("Summarize changed areas");
}

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function writeWorkspaceMetadata(repoRoot: string, id: string, metadata: WorkspaceMetadata): void {
  const config = loadConfig(repoRoot);
  const metadataPath = path.join(workspacesRoot(repoRoot, config), id, "metadata.json");
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

export function runComplete(id: string, options: CompleteOptions = {}, cwd = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const metadata = readWorkspaceMetadata(id, cwd);
  const changeId = metadata.changeId;
  const config = loadConfig(metadata.repoRoot);
  const changePath = metadata.engine === "jj" ? resolveWorkspaceChangePath(metadata) : findChangeFile(changesRoot(metadata.repoRoot, config), changeId) ?? metadata.changePath;
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  runVerify(changeId, cwd);
  assertTransition(String(parsed.frontmatter.status ?? ""), "ready_for_pr", `Complete ${changeId}`);
  const validation = validateChangeFile(changePath, storageRoot(metadata.repoRoot, config), { gate: "complete", config });
  if (!validation.valid) throw new Error(formatValidationFailure({
    id: changeId,
    repoRoot: metadata.repoRoot,
    gate: "complete",
    result: validation,
  }));
  const planningValidation = validatePlanningForGate(parsed.frontmatter, parsed.body, "complete");
  if (!planningValidation.valid) throw new Error(formatValidationFailure({
    id: changeId,
    repoRoot: metadata.repoRoot,
    gate: "complete",
    result: planningValidation,
  }));
  const quickValidation = validateQuickCompletion(parsed.frontmatter, parsed.body);
  if (!quickValidation.valid) throw new Error(formatValidationFailure({
    id: changeId,
    repoRoot: metadata.repoRoot,
    gate: "complete",
    result: { ...quickValidation, warnings: [] },
  }));
  if (!completionNotesPresent(parsed.body)) throw new Error([
    "Completion Notes must be filled before completing a change",
    "",
    "Recovery:",
    "- Update # Completion Notes with changed areas, checks run, and remaining risks or follow-ups.",
    `- Re-run cy complete ${changeId} --no-pr from ${metadata.path}.`,
  ].join("\n"));
  const changedFiles = changedWorkspaceFiles(metadata.repoRoot, metadata.path, config.workspace.hydrate.neverCopy);
  if (!options.noCodeChange && changedFiles.length === 0 && !legacyHasWorkspaceChanges(metadata.repoRoot, metadata.path, config.workspace.hydrate.neverCopy)) {
    throw new Error([
      "No workspace changes detected; use --no-code-change to complete metadata-only work",
      "",
      "Recovery:",
      `- Confirm you are in the expected workspace: cd ${metadata.path} && cy verify ${changeId}.`,
      `- If this was intentionally metadata-only work, re-run cy complete ${changeId} --no-pr --no-code-change.`,
    ].join("\n"));
  }
  enforceSliceGuard(changeId, changePath, parsed.body, changedFiles, options);

  const profile = options.profile
    ?? quickCompletionProfile(parsed.frontmatter, config)
    ?? String(asRecord(parsed.frontmatter.checks).profile ?? "standard");
  const commands = config.checks[profile] ?? [];
  const logPath = path.join(workspacesRoot(metadata.repoRoot, config), changeId, "logs", "checks.log");

  if (options.dryRun) {
    return `Dry-run: would run ${commands.length} checks using ${profile} profile and complete ${changeId}`;
  }

  const manualPassed = countPassedManualChecks(logPath);
  const results = commands.length > 0 ? runChecks(commands, metadata.path, logPath) : [];
  const failed = results.find((result) => result.status === "failed");
  if (failed) throw new Error([
    `Check failed: ${failed.command}`,
    "",
    "Recovery:",
    `- Inspect ${logPath} for the failing command output.`,
    `- Fix the issue in ${metadata.path}, update Completion Notes if needed, then re-run cy complete ${changeId} --no-pr.`,
  ].join("\n"));

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

  let remoteChecksSupported = false;
  if (!options.noPr) {
    const provider = createProvider(config.provider.type, config);
    if (!provider.createPullRequest) throw new Error(`Provider ${provider.name} does not support pull requests; use --no-pr`);
    remoteChecksSupported = provider.capabilities().pullRequestChecks;
    const branch = String(metadata.branch ?? asRecord(parsed.frontmatter.branch).name ?? `cy/${changeId}`);
    createWorkspaceEngine(metadata.engine).publish({ cwd: metadata.path, metadata, branch });
    const base = String(asRecord(parsed.frontmatter.base).revision ?? config.project.defaultBase);
    const pr = provider.createPullRequest({ repoRoot: metadata.repoRoot, storageRoot: path.join(metadata.repoRoot, config.storage.root), changePath, frontmatter: nextFrontmatter, body: parsed.body, title: `${changeId}: ${String(parsed.frontmatter.title ?? changeId)}`, branch, base, draft: true });
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
  let finalDescriptionUpdated = false;
  if (metadata.engine === "jj" && metadata.workspaceChangeId) {
    const generated = finalDescriptionMessage(changeId, metadata, metadata.repoRoot, metadata.targetRef ?? config.project.defaultBase);
    describeJjWorkspaceCommit(metadata.path, metadata.workspaceChangeId, generated.message);
    writeWorkspaceMetadata(metadata.repoRoot, changeId, {
      ...metadata,
      finalDescriptionUpdatedAt: new Date().toISOString(),
    });
    finalDescriptionUpdated = true;
  }
  const followUp = nextFrontmatter.status === "ready_for_pr"
    ? `Next: cy land ${changeId}`
    : nextFrontmatter.status === "pr_open" && remoteChecksSupported
      ? `Next: cy pr checks ${changeId}`
      : `Next: cy review start ${changeId}`;
  const checkSummary = results.length > 0
    ? `${results.length} checks passed`
    : manualPassed > 0
      ? `${manualPassed} recorded checks passed`
      : "0 checks passed";
  return [
    `Completed ${changeId}: ${checkSummary}; status ${String(nextFrontmatter.status)}`,
    ...(finalDescriptionUpdated ? ["Final description: updated"] : []),
    followUp,
  ].join("\n");
}
