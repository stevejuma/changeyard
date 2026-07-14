import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { quickCompletionProfile } from "../change/quickLifecycle.js";
import { parseSliceRecords } from "../change/slices.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { storageRoot, workspacesRoot } from "../paths.js";
import { resolveActiveChangePaths } from "../state/activeChangeDocument.js";
import type { Frontmatter, WorkspaceMetadata } from "../types.js";
import { readWorkspaceMetadata } from "../workspace/marker.js";
import { describeJjWorkspaceCommit } from "../workspace/jjLandingDescriptions.js";
import { assertTransition } from "../state/transitions.js";
import { createProvider } from "../providers/index.js";
import { inspectWorkspaceChanges } from "../workspace/changeInspection.js";
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
  const changePaths = resolveActiveChangePaths(changeId, metadata.repoRoot);
  const changePath = changePaths.activePath;
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
  const changedFiles = inspectWorkspaceChanges(metadata, config).landingFiles;
  if (!options.noCodeChange && changedFiles.length === 0) {
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

  const provider = createProvider(config.provider.type, config);
  const providerPrSupported = Boolean(provider.createPullRequest);

  writeFileSync(changePath, writeFrontmatter(nextFrontmatter, parsed.body));
  if (metadata.engine !== "jj" && changePaths.rootPath !== changePath) {
    writeFileSync(changePaths.rootPath, writeFrontmatter(nextFrontmatter, parsed.body));
  }
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
    ? providerPrSupported
      ? `Next: cy pr new ${changeId}`
      : `Next: cy land ${changeId}`
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
