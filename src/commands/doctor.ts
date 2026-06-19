import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { parseSections, replaceSection } from "../documents/sections.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { changesRoot, reviewsRoot, storageRoot, workspacesRoot } from "../paths.js";
import { createProvider } from "../providers/index.js";
import { readProviderState, writeProviderState } from "../providers/providerState.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import { shellCommandRunner, shellInspectionCommandRunner } from "../workspace/commandRunner.js";
import { parseInlineComments } from "./review.js";
import { deleteWorkspace, getWorkspaceStatus } from "./workspace.js";
import type { Frontmatter, WorkspaceMetadata } from "../types.js";

export type DoctorReport = {
  ok: string[];
  warnings: string[];
  fixes: string[];
  notes: string[];
};

type MutationOptions = {
  dryRun?: boolean;
  fix?: boolean;
  verbose?: boolean;
  deleteStaleCompletedWorkspaces?: boolean;
  checkCompletedAcceptanceCriteria?: boolean;
  waiveMissingJjBookmarks?: boolean;
  waiveStaleCompletedReviews?: boolean;
  staleCompletedDays?: number;
};

type ChangeRecord = {
  id: string;
  filePath: string;
  frontmatter: Frontmatter;
  body: string;
};

type LocalFolderIssueCache = {
  issueNumber: number;
  issuePath: string;
  sourceChange: string;
};

const reviewTerminalStatuses = new Set(["approved", "changes_requested", "rejected", "abandoned"]);
const completedReviewStatuses = new Set(["approved", "merged"]);
const completedLifecycleStatuses = new Set(["ready_for_pr", "pr_open", "in_review", "changes_requested", "approved", "merged", "abandoned"]);
const missingBookmarkWaiverStatuses = new Set(["ready_for_pr", "approved", "merged", "abandoned"]);
const branchAwareStatuses = new Set(["ready_for_pr", "pr_open", "in_review", "changes_requested", "approved", "merged", "abandoned"]);
const checksLogStatuses = new Set(["ready_for_pr", "pr_open", "in_review", "changes_requested", "approved", "merged", "abandoned"]);
const defaultWrapWidth = 88;
const minimumWrapWidth = 48;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function staleCompletedDays(config: ReturnType<typeof loadConfig>, options: MutationOptions): number {
  return options.staleCompletedDays ?? config.doctor?.staleCompletedDays ?? 3;
}

function parseDateValue(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function completionAge(change: ChangeRecord, thresholdDays: number): {
  source: string;
  date: Date;
  ageDays: number;
  stale: boolean;
} | null {
  for (const source of ["mergedAt", "updatedAt", "createdAt"]) {
    const date = parseDateValue(change.frontmatter[source]);
    if (!date) continue;
    const ageMs = Date.now() - date.getTime();
    return {
      source,
      date,
      ageDays: Math.max(0, Math.floor(ageMs / millisecondsPerDay)),
      stale: ageMs >= thresholdDays * millisecondsPerDay,
    };
  }
  return null;
}

function isCompletedValidationNoise(message: string): boolean {
  return /checkbox|checklist|Quick scope risk review unresolved|Acceptance Criteria must include at least one unchecked task before/i.test(message);
}

function filterCompletedValidationNoise<T extends { valid: boolean; errors: string[]; warnings?: string[] }>(
  validation: T,
  frontmatter: Frontmatter,
): T {
  const status = String(frontmatter.status ?? "");
  if (!completedLifecycleStatuses.has(status)) return validation;
  const errors = validation.errors.filter((entry) => !isCompletedValidationNoise(entry));
  return {
    ...validation,
    valid: errors.length === 0,
    errors,
    warnings: validation.warnings?.filter((entry) => !isCompletedValidationNoise(entry)),
  };
}

function reviewRequired(config: ReturnType<typeof loadConfig>): boolean {
  return config.review?.requireBeforePr === true || config.pullRequests?.requireApprovedReview === true;
}

function reviewWaived(frontmatter: Frontmatter): boolean {
  return asRecord(frontmatter.review).required === false;
}

function branchWaived(frontmatter: Frontmatter): boolean {
  return asRecord(frontmatter.branch).required === false;
}

function isDeferredTask(line: string): boolean {
  return /\bDeferred\s*:/i.test(line);
}

function checkCompletedAcceptanceCriteria(body: string): { body: string; checkedCount: number } {
  const acceptanceCriteria = parseSections(body).get("Acceptance Criteria");
  if (acceptanceCriteria === undefined) return { body, checkedCount: 0 };

  let checkedCount = 0;
  const nextAcceptanceCriteria = acceptanceCriteria.replace(
    /^(\s*[-*]\s+\[) \](\s+\S.*)$/gm,
    (line: string, prefix: string, suffix: string) => {
      if (isDeferredTask(line)) return line;
      checkedCount += 1;
      return `${prefix}x]${suffix}`;
    },
  );
  if (checkedCount === 0) return { body, checkedCount: 0 };

  return {
    body: replaceSection(body, "Acceptance Criteria", nextAcceptanceCriteria),
    checkedCount,
  };
}

function terminalWrapWidth(): number {
  const columns = Number(process.stdout?.columns ?? process.env.COLUMNS ?? 0);
  if (!Number.isFinite(columns) || columns <= 0) return defaultWrapWidth;
  return Math.max(minimumWrapWidth, columns);
}

function wrapText(value: string, width: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function pushWrapped(lines: string[], prefix: string, value: string, width: number): void {
  const wrapped = wrapText(value, Math.max(20, width - prefix.length));
  lines.push(`${prefix}${wrapped[0] ?? ""}`);
  for (const line of wrapped.slice(1)) lines.push(`${" ".repeat(prefix.length)}${line}`);
}

function pushTextSection(lines: string[], title: string, items: string[], width: number): void {
  if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
  lines.push(`${title}:`);
  if (items.length === 0) {
    lines.push("  - No blocking problems found");
    return;
  }
  for (const item of items) pushWrapped(lines, "  - ", item, width);
}

function renderPlainDoctorReport(report: DoctorReport, options: MutationOptions = {}): string {
  const lines: string[] = [];
  const width = terminalWrapWidth();

  pushTextSection(lines, "Doctor ok", report.ok, width);
  if (report.warnings.length > 0) pushTextSection(lines, "Warnings", report.warnings, width);
  if (report.fixes.length > 0) pushTextSection(lines, "Fixes", report.fixes, width);
  if (report.notes.length > 0 && (options.verbose || report.fixes.length > 0)) {
    pushTextSection(lines, "Notes", report.notes, width);
  }

  return lines.join("\n");
}

function safeReadJson<T>(filePath: string, warnings: string[], relativeRoot: string): T | undefined {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    warnings.push(`${path.relative(relativeRoot, filePath)}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function readMarkdown(filePath: string): { frontmatter: Frontmatter; body: string } {
  return parseFrontmatter(readFileSync(filePath, "utf8"));
}

function writeYaml(filePath: string, frontmatter: Frontmatter, body: string): void {
  writeFileSync(filePath, `${writeFrontmatter(frontmatter, body).trimEnd()}\n`);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

function gitHasBranch(repoRoot: string, branch: string): boolean {
  try {
    shellCommandRunner("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], repoRoot);
    return true;
  } catch {
    return false;
  }
}

function gitHasRemoteBranch(repoRoot: string, branch: string): boolean {
  try {
    const output = shellCommandRunner("git", ["ls-remote", "--heads", "origin", branch], repoRoot);
    return output.split("\n").some((line) => line.includes(`refs/heads/${branch}`));
  } catch {
    return false;
  }
}

function gitStatusState(workspacePath: string): { dirty: boolean; conflicts: boolean } {
  try {
    const status = shellCommandRunner("git", ["status", "--porcelain"], workspacePath);
    return { dirty: status.trim().length > 0, conflicts: /\bUU\b/.test(status) };
  } catch {
    return { dirty: true, conflicts: true };
  }
}

function jjWorkspaceState(workspacePath: string, bookmark: string): { exists: boolean; dirty: boolean; conflicts: boolean } {
  try {
    const list = shellInspectionCommandRunner("jj", ["bookmark", "list"], workspacePath);
    const status = shellInspectionCommandRunner("jj", ["status"], workspacePath);
    let conflicts = false;
    try {
      conflicts = shellInspectionCommandRunner("jj", ["resolve", "--list"], workspacePath).trim().length > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("No conflicts found")) throw error;
    }
    return {
      exists: list.includes(bookmark),
      dirty: status.trim().length > 0,
      conflicts,
    };
  } catch {
    return { exists: false, dirty: true, conflicts: true };
  }
}

function expectedRemoteUrl(config: ReturnType<typeof loadConfig>, kind: "issue" | "pr", number: number): string | null {
  if (config.provider.type === "github") {
    if (kind === "issue") return `https://github.com/${config.provider.owner}/${config.provider.repo}/issues/${number}`;
    return `https://github.com/${config.provider.owner}/${config.provider.repo}/pull/${number}`;
  }
  if (config.provider.type === "gitlab") {
    if (kind === "issue") return `https://gitlab.com/${config.provider.owner}/${config.provider.repo}/-/issues/${number}`;
    return `https://gitlab.com/${config.provider.owner}/${config.provider.repo}/-/merge_requests/${number}`;
  }
  if (config.provider.type === "forgejo") {
    const base = normalizeBaseUrl(config.provider.baseUrl ?? "");
    if (kind === "issue") return `${base}/${config.provider.owner}/${config.provider.repo}/issues/${number}`;
    return `${base}/${config.provider.owner}/${config.provider.repo}/pulls/${number}`;
  }
  return null;
}

function expectedLocalUrl(filePath: string): string {
  return `file://${filePath}`;
}

function localFolderIssueCache(root: string, warnings: string[], relativeRoot: string): Map<string, LocalFolderIssueCache> {
  const cacheRoot = path.join(root, "cache", "local-folder", "issues");
  const byChange = new Map<string, LocalFolderIssueCache>();
  if (!existsSync(cacheRoot)) return byChange;

  for (const file of readdirSync(cacheRoot)) {
    if (!/\.md$/.test(file)) continue;
    const match = /^(\d+)-(.+)\.md$/.exec(file);
    if (!match) continue;

    const issueNumber = Number(match[1]);
    const sourceFromPath = match[2];
    const issuePath = path.join(cacheRoot, file);
    const parsed = safeReadJson<{ sourceChange?: unknown }>(issuePath, warnings, relativeRoot);
    const sourceChange = typeof parsed?.sourceChange === "string" ? parsed.sourceChange : sourceFromPath;
    byChange.set(sourceChange, { issueNumber, issuePath, sourceChange });
  }

  return byChange;
}

function reconcileProviderState(
  root: string,
  changes: ChangeRecord[],
  options: MutationOptions,
  warnings: string[],
  notes: string[],
  fixes: string[],
): { changed: boolean; nextState: ReturnType<typeof readProviderState> } {
  const state = readProviderState(root);
  const cache = localFolderIssueCache(root, warnings, root);
  const seen = new Set(changes.map((change) => change.id));
  let changed = false;

  for (const [changeId, issueNumber] of Object.entries(state.issues)) {
    if (!seen.has(changeId)) {
      warnings.push(`stale provider-state entry: ${changeId} -> #${issueNumber}`);
      if (options.fix && !options.dryRun) {
        delete state.issues[changeId];
        fixes.push(`Removed stale provider-state entry for ${changeId}`);
        changed = true;
      }
      continue;
    }

    if (typeof issueNumber !== "number") {
      warnings.push(`provider-state issue number is not numeric for ${changeId}: ${String(issueNumber)}`);
      if (options.fix && !options.dryRun) {
        delete state.issues[changeId];
        changed = true;
      }
    }
  }

  for (const change of changes) {
    const remote = asRecord(change.frontmatter.remote);
    const issueNumber = remote.issueNumber;
    const cacheEntry = cache.get(change.id);

    if (typeof issueNumber !== "number" && cacheEntry) {
      notes.push(`missing local-folder issue mapping for ${change.id}; repairable from cache`);
      if (options.fix && !options.dryRun) {
        state.issues[change.id] = cacheEntry.issueNumber;
        changed = true;
      }
      continue;
    }
    if (cacheEntry && issueNumber !== cacheEntry.issueNumber) {
      warnings.push(`local-folder issue drift for ${change.id}: cache has #${cacheEntry.issueNumber}, change has #${String(issueNumber)}`);
      if (options.fix && !options.dryRun) {
        state.issues[change.id] = cacheEntry.issueNumber;
        changed = true;
      }
      continue;
    }
    if (typeof issueNumber === "number") {
      state.issues[change.id] = issueNumber;
    }
  }

  if (options.fix && !options.dryRun) {
    let maxIssue = 0;
    for (const value of Object.values(state.issues)) {
      if (typeof value === "number") maxIssue = Math.max(maxIssue, value);
    }
    for (const cacheEntry of cache.values()) {
      state.issues[cacheEntry.sourceChange] = cacheEntry.issueNumber;
      maxIssue = Math.max(maxIssue, cacheEntry.issueNumber);
    }
    if (state.nextIssueNumber <= maxIssue) {
      state.nextIssueNumber = maxIssue + 1;
      changed = true;
    }
  }

  return { changed, nextState: state };
}

function latestReviewPath(root: string): string | undefined {
  if (!existsSync(root)) return undefined;
  const latest = readdirSync(root)
    .filter((entry) => /^review-\d+\.md$/.test(entry))
    .sort()
    .map((entry) => path.join(root, entry))
    .pop();
  return latest;
}

function recoverIncompleteSync(
  change: ChangeRecord,
  root: string,
  cache: Map<string, LocalFolderIssueCache>,
  options: MutationOptions,
  warnings: string[],
  notes: string[],
  fixes: string[],
  config: ReturnType<typeof loadConfig>,
): void {
  const status = String(change.frontmatter.status ?? "");
  if (!["synced", "ready_for_pr", "pr_open", "in_review", "changes_requested", "approved", "merged", "abandoned"].includes(status)) return;
  const remote = asRecord(change.frontmatter.remote);
  if (typeof remote.issueNumber === "number") return;

  if (config.provider.type !== "local-folder") {
    notes.push(`Incomplete sync detected for ${change.id}: remote issue metadata is missing`);
    return;
  }

  const cacheEntry = cache.get(change.id);
  if (!cacheEntry) {
    warnings.push(`${change.id}: no local-folder issue cache entry available for recovery`);
    return;
  }

  if (options.dryRun) {
    notes.push(`Would recover missing issue metadata for ${change.id} from cache`);
    return;
  }
  if (!options.fix) return;

  const nextFrontmatter: Frontmatter = {
    ...change.frontmatter,
    remote: {
      ...asRecord(change.frontmatter.remote),
      provider: "local-folder",
      issueNumber: cacheEntry.issueNumber,
      issueUrl: expectedLocalUrl(cacheEntry.issuePath),
    },
    updatedAt: new Date().toISOString(),
  };
  writeYaml(change.filePath, nextFrontmatter, change.body);
  change.frontmatter = nextFrontmatter;
  fixes.push(`Recovered missing local-folder issue metadata for ${change.id}`);
}

function recoverReviewIfNeeded(
  change: ChangeRecord,
  reviewRoot: string,
  repoRoot: string,
  storageRootPath: string,
  provider: ReturnType<typeof createProvider>,
  options: MutationOptions,
  warnings: string[],
  notes: string[],
  fixes: string[],
): void {
  if (!provider.publishReview) return;
  if (!reviewTerminalStatuses.has(String(change.frontmatter.status))) return;
  if (reviewWaived(change.frontmatter)) return;

  const reviewPath = latestReviewPath(reviewRoot);
  if (!reviewPath) {
    if (!completedReviewStatuses.has(String(change.frontmatter.status))) {
      notes.push(`No review file found for ${change.id}, expected if status is ${change.frontmatter.status}`);
    }
    return;
  }

  const review = readMarkdown(reviewPath);
  const reviewStatus = String(review.frontmatter.status ?? "");
  if (!reviewTerminalStatuses.has(reviewStatus)) {
    warnings.push(`${path.basename(reviewPath)} for ${change.id} is not in a terminal status`);
    return;
  }

  const reviewRemote = asRecord(review.frontmatter.remote);
  if (typeof reviewRemote.reviewNumber === "number") return;

  if (!asRecord(change.frontmatter.remote).provider || !change.frontmatter.remote) {
    warnings.push(`${change.id}: review is completed but review remote data is missing`);
  }

  const inlineComments = parseInlineComments(review.body);

  if (options.dryRun) {
    notes.push(`Would republish review comments for ${change.id}: ${path.basename(reviewPath)}`);
    return;
  }
  if (!options.fix) {
    notes.push(`Review for ${change.id} is terminal but no remote review metadata is present`);
    return;
  }

  const published = provider.publishReview({
    repoRoot,
    storageRoot: storageRootPath,
    changePath: change.filePath,
    frontmatter: change.frontmatter,
    body: change.body,
    reviewPath,
    reviewFrontmatter: review.frontmatter,
    reviewBody: review.body,
    decision: reviewStatus,
    inlineComments,
  });

  const nextReviewFrontmatter = {
    ...review.frontmatter,
    remote: {
      ...asRecord(review.frontmatter.remote),
      provider: published.provider,
      reviewNumber: published.reviewNumber,
      reviewUrl: published.reviewUrl,
    },
  };
  writeYaml(reviewPath, nextReviewFrontmatter, review.body);
  fixes.push(`Republished terminal review for ${change.id}`);
}

function recoverIncompleteComplete(
  change: ChangeRecord,
  metadata: WorkspaceMetadata,
  provider: ReturnType<typeof createProvider>,
  root: string,
  repoRoot: string,
  options: MutationOptions,
  warnings: string[],
  notes: string[],
  fixes: string[],
): void {
  if (!provider.createPullRequest) return;
  if (String(change.frontmatter.status) !== "ready_for_pr") return;

  const remote = asRecord(change.frontmatter.remote);
  if (typeof remote.pullRequestNumber === "number") return;

  const issueNumber = remote.issueNumber;
  if (typeof issueNumber !== "number") {
    warnings.push(`${change.id}: ready_for_pr without issue number`);
    return;
  }

  if (options.dryRun) {
    notes.push(`Would recover PR publication for ${change.id}`);
    return;
  }
  if (!options.fix) {
    notes.push(`${change.id}: ready_for_pr without PR metadata; run cy complete ${change.id}`);
    return;
  }

  const branch = metadata.branch ?? `cy/${change.id}`;
  const base = String(asRecord(change.frontmatter.base).revision ?? "main");
  const pr = provider.createPullRequest({
    repoRoot,
    storageRoot: root,
    changePath: change.filePath,
    frontmatter: change.frontmatter,
    body: change.body,
    title: `${change.id}: ${String(change.frontmatter.title ?? change.id)}`,
    branch,
    base,
    draft: true,
  });

  const nextFrontmatter: Frontmatter = {
    ...change.frontmatter,
    status: "pr_open",
    remote: {
      ...asRecord(change.frontmatter.remote),
      provider: pr.provider,
      pullRequestNumber: pr.pullRequestNumber,
      pullRequestUrl: pr.pullRequestUrl,
    },
    updatedAt: new Date().toISOString(),
  };
  writeYaml(change.filePath, nextFrontmatter, change.body);
  change.frontmatter = nextFrontmatter;
  fixes.push(`Recovered PR publication for ${change.id}`);
}

function maybeDeleteStaleCompletedWorkspace(input: {
  change: ChangeRecord | undefined;
  metadata: WorkspaceMetadata;
  repoRoot: string;
  options: MutationOptions;
  thresholdDays: number;
  warnings: string[];
  notes: string[];
  fixes: string[];
}): boolean {
  const change = input.change;
  if (!change) return false;
  if (String(change.frontmatter.status ?? "") !== "merged") return false;

  const age = completionAge(change, input.thresholdDays);
  if (!age) {
    if (input.options.deleteStaleCompletedWorkspaces) {
      input.notes.push(`${change.id}: completed workspace cleanup skipped because mergedAt, updatedAt, and createdAt are missing or invalid`);
    }
    return false;
  }
  if (!age.stale) return false;

  const cleanupCommand = `cy doctor --fix --delete-stale-completed-workspaces --stale-completed-days ${input.thresholdDays}`;
  if (!input.options.deleteStaleCompletedWorkspaces) {
    input.notes.push(`${change.id}: stale completed workspace remains; run ${cleanupCommand} from ${input.repoRoot} to delete eligible completed workspaces`);
    return false;
  }

  let status;
  try {
    status = getWorkspaceStatus(change.id, input.repoRoot);
  } catch (error) {
    input.warnings.push(`${change.id}: skipped stale completed workspace cleanup because workspace status could not be inspected: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }

  const blockers = [
    ...(status.rootMismatch ? [`workspace belongs to a different repo root`] : []),
    ...(!status.exists ? [`workspace path does not exist`] : []),
    ...(status.status !== "merged" ? [`workspace status is ${status.status}, expected merged`] : []),
    ...(status.dirty ? [`workspace is dirty`] : []),
    ...(status.conflicts ? [`workspace has conflicts`] : []),
    ...status.errors,
  ];
  if (blockers.length > 0) {
    input.warnings.push(`${change.id}: skipped stale completed workspace cleanup: ${blockers.join("; ")}. Recovery: run cy workspace status ${change.id} from ${input.repoRoot}.`);
    return false;
  }

  const workspaceRoot = path.dirname(status.path ?? input.metadata.path);
  if (input.options.dryRun) {
    input.notes.push(`Would delete stale completed workspace ${change.id} (${age.ageDays} days old via ${age.source}): ${workspaceRoot}`);
    return false;
  }
  if (!input.options.fix) {
    input.notes.push(`${change.id}: stale completed workspace is eligible for deletion; run ${cleanupCommand} from ${input.repoRoot}`);
    return false;
  }

  const message = deleteWorkspace(change.id, {}, input.repoRoot);
  input.fixes.push(message);
  return true;
}

function maybeWaiveStaleCompletedReview(input: {
  change: ChangeRecord;
  reviewRoot: string;
  repoRoot: string;
  config: ReturnType<typeof loadConfig>;
  options: MutationOptions;
  thresholdDays: number;
  warnings: string[];
  notes: string[];
  fixes: string[];
}): void {
  const status = String(input.change.frontmatter.status ?? "");
  if (!completedReviewStatuses.has(status)) return;
  if (!reviewRequired(input.config)) return;
  if (reviewWaived(input.change.frontmatter)) return;
  if (latestReviewPath(input.reviewRoot)) return;

  const age = completionAge(input.change, input.thresholdDays);
  if (!age) {
    input.warnings.push(`${input.change.id}: completed change is missing a review and has no valid mergedAt, updatedAt, or createdAt timestamp. Recovery: add a review with cy review start ${input.change.id}, or set review.required: false after confirming the waiver.`);
    return;
  }

  if (!age.stale) {
    input.notes.push(`${input.change.id}: completed change is missing a review; stale review waiver is eligible after ${input.thresholdDays} days`);
    return;
  }

  const cleanupCommand = `cy doctor --fix --waive-stale-completed-reviews --stale-completed-days ${input.thresholdDays}`;
  if (!input.options.waiveStaleCompletedReviews) {
    input.warnings.push(`${input.change.id}: stale completed change is missing a review. Recovery: run ${cleanupCommand} from ${input.repoRoot}, or create a review with cy review start ${input.change.id}.`);
    return;
  }

  if (input.options.dryRun) {
    input.notes.push(`Would waive review requirement for stale completed change ${input.change.id} (${age.ageDays} days old via ${age.source})`);
    return;
  }
  if (!input.options.fix) {
    input.notes.push(`${input.change.id}: stale completed review requirement can be waived; run ${cleanupCommand} from ${input.repoRoot}`);
    return;
  }

  const now = new Date().toISOString();
  const nextFrontmatter: Frontmatter = {
    ...input.change.frontmatter,
    review: {
      ...asRecord(input.change.frontmatter.review),
      required: false,
      waivedAt: now,
      waivedBy: "cy doctor",
      waiverReason: `Stale completed ${status} change older than ${input.thresholdDays} days had no review artifact.`,
    },
    updatedAt: now,
  };
  writeYaml(input.change.filePath, nextFrontmatter, input.change.body);
  input.change.frontmatter = nextFrontmatter;
  input.fixes.push(`Waived review requirement for stale completed change ${input.change.id}`);
}

function maybeCheckCompletedAcceptanceCriteria(input: {
  change: ChangeRecord;
  repoRoot: string;
  options: MutationOptions;
  warnings: string[];
  notes: string[];
  fixes: string[];
}): void {
  const status = String(input.change.frontmatter.status ?? "");
  if (!completedLifecycleStatuses.has(status)) return;

  const result = checkCompletedAcceptanceCriteria(input.change.body);
  if (result.checkedCount === 0) return;

  const cleanupCommand = "cy doctor --fix --check-completed-acceptance-criteria";
  const itemLabel = result.checkedCount === 1 ? "item" : "items";
  if (!input.options.checkCompletedAcceptanceCriteria) {
    input.warnings.push(`${input.change.id}: completed change has ${result.checkedCount} unchecked Acceptance Criteria ${itemLabel}. Recovery: run ${cleanupCommand} from ${input.repoRoot}, or update # Acceptance Criteria manually.`);
    return;
  }

  if (input.options.dryRun) {
    input.notes.push(`Would check ${result.checkedCount} unresolved Acceptance Criteria ${itemLabel} for completed change ${input.change.id}`);
    return;
  }
  if (!input.options.fix) {
    input.notes.push(`${input.change.id}: unresolved completed Acceptance Criteria can be checked; run ${cleanupCommand} from ${input.repoRoot}`);
    return;
  }

  const nextFrontmatter: Frontmatter = {
    ...input.change.frontmatter,
    updatedAt: new Date().toISOString(),
  };
  writeYaml(input.change.filePath, nextFrontmatter, result.body);
  input.change.frontmatter = nextFrontmatter;
  input.change.body = result.body;
  input.fixes.push(`Checked ${result.checkedCount} unresolved Acceptance Criteria ${itemLabel} for completed change ${input.change.id}`);
}

function maybeWaiveMissingJjBookmark(input: {
  change: ChangeRecord | undefined;
  workspaceId: string;
  bookmark: string;
  repoRoot: string;
  options: MutationOptions;
  warnings: string[];
  notes: string[];
  fixes: string[];
}): boolean {
  const change = input.change;
  if (!change) return false;
  if (branchWaived(change.frontmatter)) {
    input.notes.push(`${input.workspaceId}: jj bookmark is missing but branch requirement is waived`);
    return true;
  }

  const status = String(change.frontmatter.status ?? "");
  if (!missingBookmarkWaiverStatuses.has(status)) return false;

  const cleanupCommand = "cy doctor --fix --waive-missing-jj-bookmarks";
  if (!input.options.waiveMissingJjBookmarks) {
    input.warnings.push(`${input.workspaceId}: jj bookmark missing: ${input.bookmark}. Recovery: if this change no longer needs a PR/bookmark, run ${cleanupCommand} from ${input.repoRoot}; otherwise recreate the bookmark in ${input.repoRoot}.`);
    return true;
  }

  const nextStatus = status === "ready_for_pr" ? "approved" : status;
  if (input.options.dryRun) {
    const statusNote = nextStatus !== status ? ` and mark ${change.id} approved` : "";
    input.notes.push(`Would waive missing JJ bookmark for ${change.id}${statusNote}: ${input.bookmark}`);
    return true;
  }
  if (!input.options.fix) {
    input.notes.push(`${change.id}: missing JJ bookmark can be waived when no PR/bookmark is required; run ${cleanupCommand} from ${input.repoRoot}`);
    return true;
  }

  const now = new Date().toISOString();
  const nextFrontmatter: Frontmatter = {
    ...change.frontmatter,
    status: nextStatus,
    branch: {
      ...asRecord(change.frontmatter.branch),
      name: input.bookmark,
      required: false,
      waivedAt: now,
      waivedBy: "cy doctor",
      waiverReason: `Missing JJ bookmark accepted because this ${status} change no longer requires a PR branch.`,
    },
    updatedAt: now,
  };
  writeYaml(change.filePath, nextFrontmatter, change.body);
  change.frontmatter = nextFrontmatter;
  const statusMessage = nextStatus !== status ? " and marked it approved" : "";
  input.fixes.push(`Waived missing JJ bookmark for ${change.id}${statusMessage}`);
  return true;
}

export function doctorReport(repoRoot = process.cwd(), options: MutationOptions = {}): DoctorReport {
  const config = loadConfig(repoRoot);
  const root = storageRoot(repoRoot, config);
  const changesPath = changesRoot(repoRoot, config);
  const workspacesPath = workspacesRoot(repoRoot, config);
  const warnings: string[] = [];
  const ok: string[] = [];
  const fixes: string[] = [];
  const notes: string[] = [];
  const thresholdDays = staleCompletedDays(config, options);

  const provider = createProvider(config.provider.type, config);
  const workspaceEngine = createWorkspaceEngine(config.vcs.engine);

  ok.push(`provider: ${provider.name}`);
  ok.push(`workspace engine: ${workspaceEngine.name}`);

  if (existsSync(root)) ok.push(`storage: ${path.relative(repoRoot, root)}`);
  else warnings.push(`missing storage root: ${path.relative(repoRoot, root)}`);
  if (existsSync(path.join(root, "schema.json"))) ok.push(`schema: ${path.relative(repoRoot, path.join(root, "schema.json"))}`);
  else warnings.push(`missing schema: ${path.relative(repoRoot, path.join(root, "schema.json"))}`);

  const changes: ChangeRecord[] = [];
  const seenWorkspaceIds = new Set<string>();
  const seenBranches = new Set<string>();
  const workspaceByChange = new Map<string, WorkspaceMetadata & { workspaceId: string; workspacePath: string }>();

  if (existsSync(changesPath)) {
    for (const file of readdirSync(changesPath).filter((entry) => entry.endsWith(".md")).sort()) {
      const filePath = path.join(changesPath, file);
      const parsed = readMarkdown(filePath);
      const validation = filterCompletedValidationNoise(validateChangeFile(filePath, root, { config }), parsed.frontmatter);
      if (!validation.valid) {
        warnings.push(`${file}: ${validation.errors.join("; ")}`);
      }
      if (validation.warnings?.length) {
        warnings.push(`${file}: ${validation.warnings.join("; ")}`);
      }
      const id = String(parsed.frontmatter.id ?? file.replace(/\.md$/, ""));
      if (!parsed.frontmatter.id) warnings.push(`${file}: missing change id`);
      changes.push({ id, filePath, frontmatter: parsed.frontmatter, body: parsed.body });
    }
  } else {
    notes.push("No changes directory found");
  }

  const state = readProviderState(root);
  if (config.provider.type === "local-folder") {
    const reconcile = reconcileProviderState(root, changes, options, warnings, notes, fixes);
    if (reconcile.changed && options.fix && !options.dryRun) {
      writeProviderState(root, reconcile.nextState);
      fixes.push("Reconciled local-folder provider state");
    }
  } else if (Object.keys(state.issues).length > 0) {
    notes.push("Provider-state cache exists but provider is remote; sync recovery is limited");
  }

  const localCache = localFolderIssueCache(root, warnings, root);

  if (existsSync(workspacesPath)) {
    for (const workspaceId of readdirSync(workspacesPath).sort()) {
      const workspaceRoot = path.join(workspacesPath, workspaceId);
      const metadataPath = path.join(workspaceRoot, "metadata.json");
      if (!existsSync(metadataPath)) {
        warnings.push(`${workspaceId}: workspace metadata missing`);
        continue;
      }

      const metadata = safeReadJson<WorkspaceMetadata>(metadataPath, warnings, repoRoot);
      if (!metadata) continue;
      if (metadata.changeId !== workspaceId) warnings.push(`${workspaceId}: metadata changeId mismatch (${metadata.changeId})`);

      if (!existsSync(metadata.path)) {
        warnings.push(`${workspaceId}: workspace path missing (${metadata.path})`);
        continue;
      }

      const matchingChange = changes.find((change) => change.id === metadata.changeId);
      if (maybeDeleteStaleCompletedWorkspace({
        change: matchingChange,
        metadata,
        repoRoot,
        options,
        thresholdDays,
        warnings,
        notes,
        fixes,
      })) {
        continue;
      }

      const markerPath = path.join(metadata.path, ".changeyard-workspace.json");
      if (!existsSync(markerPath)) {
        const fixHint = `missing workspace marker; run cy recover ${metadata.changeId}`;
        warnings.push(`${workspaceId}: ${fixHint}`);
        if (options.fix) {
          const markerData = { changeId: workspaceId, metadataPath };
          if (options.dryRun) {
            notes.push(`Would recover workspace marker for ${workspaceId}`);
          } else {
            writeFileSync(markerPath, `${JSON.stringify(markerData, null, 2)}\n`);
            fixes.push(`Recovered missing marker for ${workspaceId}`);
          }
        }
      } else {
        const marker = safeReadJson<{ changeId?: string; metadataPath?: string }>(markerPath, warnings, repoRoot);
        if (marker && marker.changeId !== metadata.changeId) {
          warnings.push(`${workspaceId}: marker changeId mismatch (${marker.changeId ?? "missing"})`);
        }
        if (marker && marker.metadataPath && path.resolve(marker.metadataPath) !== path.resolve(metadataPath)) {
          warnings.push(`${workspaceId}: marker metadataPath mismatch`);
        }
      }

      seenWorkspaceIds.add(workspaceId);
      workspaceByChange.set(metadata.changeId, { ...metadata, workspaceId, workspacePath: workspaceRoot });

      if (metadata.branch) {
        if (seenBranches.has(metadata.branch)) warnings.push(`workspace bookmark/branch collision: ${metadata.branch}`);
        seenBranches.add(metadata.branch);
      }

      const engine = createWorkspaceEngine(metadata.engine);
      const verify = engine.verify({ cwd: metadata.path, metadata });
      if (!verify.valid) warnings.push(...verify.errors.map((entry) => `${workspaceId}: ${entry}`));
      else ok.push(`workspace: ${workspaceId}`);

      const changeStatus = String(matchingChange?.frontmatter.status ?? "");
      const branch = metadata.branch ?? `cy/${metadata.changeId}`;

      if (metadata.engine === "git-worktree") {
        if (!gitHasBranch(metadata.repoRoot ?? metadata.path, branch) && branchAwareStatuses.has(changeStatus)) {
          warnings.push(`${workspaceId}: workspace branch missing: ${branch}`);
        }
        const branchState = gitStatusState(metadata.path);
        if (branchState.conflicts) warnings.push(`${workspaceId}: workspace has git conflicts`);
        if (branchState.dirty && changeStatus !== "in_progress") notes.push(`${workspaceId}: workspace has uncommitted changes`);
        if (branchAwareStatuses.has(changeStatus) && !gitHasRemoteBranch(metadata.repoRoot ?? metadata.path, branch)) {
          notes.push(`${workspaceId}: workspace branch missing on remote: ${branch}`);
        }
      }

      if (metadata.engine === "jj" && metadata.branch) {
        const stateResult = jjWorkspaceState(metadata.path, metadata.branch);
        if (!stateResult.exists && branchAwareStatuses.has(changeStatus)) {
          const handled = maybeWaiveMissingJjBookmark({
            change: matchingChange,
            workspaceId,
            bookmark: metadata.branch,
            repoRoot,
            options,
            warnings,
            notes,
            fixes,
          });
          if (!handled) {
            warnings.push(`${workspaceId}: jj bookmark missing: ${metadata.branch}. Recovery: recreate the bookmark from ${repoRoot}, or run cy doctor --fix from ${repoRoot} only when the in-review state is already complete and should move to approved.`);
            if (changeStatus === "in_review" && matchingChange) {
              if (options.dryRun) {
                notes.push(`Would move ${matchingChange.id} to approved because its JJ bookmark is missing while in review`);
              } else if (options.fix) {
                const nextFrontmatter: Frontmatter = {
                  ...matchingChange.frontmatter,
                  status: "approved",
                  updatedAt: new Date().toISOString(),
                };
                writeYaml(matchingChange.filePath, nextFrontmatter, matchingChange.body);
                matchingChange.frontmatter = nextFrontmatter;
                fixes.push(`Moved ${matchingChange.id} to approved because its JJ bookmark is missing while in review`);
              }
            }
          }
        }
        if (stateResult.conflicts) warnings.push(`${workspaceId}: jj workspace reports conflicts`);
        if (stateResult.dirty && changeStatus !== "in_progress") notes.push(`${workspaceId}: jj workspace is dirty`);
      }

      const logPath = path.join(workspaceRoot, "logs", "checks.log");
      if (checksLogStatuses.has(changeStatus) && !existsSync(logPath)) {
        notes.push(`${workspaceId}: checks log missing: ${path.relative(repoRoot, logPath)}`);
      }

      if (matchingChange) {
        const reviewRoot = path.join(reviewsRoot(repoRoot, config), matchingChange.id);
        recoverReviewIfNeeded(
          matchingChange,
          reviewRoot,
          repoRoot,
          root,
          provider,
          options,
          warnings,
          notes,
          fixes,
        );
      }
    }
  }

  const issueCacheRoot = path.join(root, "cache", "local-folder", "issues");
  for (const change of changes) {
    const remote = asRecord(change.frontmatter.remote);
    const issueNumber = remote.issueNumber;
    const issueUrl = typeof remote.issueUrl === "string" ? remote.issueUrl : "";
    const prNumber = remote.pullRequestNumber;
    const prUrl = typeof remote.pullRequestUrl === "string" ? remote.pullRequestUrl : "";
    const status = String(change.frontmatter.status ?? "");
    const checks = asRecord(change.frontmatter.checks);
    const reviewRoot = path.join(reviewsRoot(repoRoot, config), change.id);

    maybeCheckCompletedAcceptanceCriteria({
      change,
      repoRoot,
      options,
      warnings,
      notes,
      fixes,
    });
    recoverIncompleteSync(change, root, localCache, options, warnings, notes, fixes, config);
    maybeWaiveStaleCompletedReview({
      change,
      reviewRoot,
      repoRoot,
      config,
      options,
      thresholdDays,
      warnings,
      notes,
      fixes,
    });
    if (checksLogStatuses.has(status) && checks.lastStatus === "passed" && typeof checks.lastRun !== "string") {
      warnings.push(`${change.id}: completion metadata indicates checks passed but lastRun is missing`);
    }

    if (typeof issueNumber === "number") {
      if (config.provider.type === "local-folder") {
        const expectedIssuePath = path.join(issueCacheRoot, `${String(issueNumber).padStart(4, "0")}-${change.id}.md`);
        if (!existsSync(expectedIssuePath)) warnings.push(`${change.id}: local-folder issue cache missing for #${issueNumber}`);
        if (issueUrl && issueUrl !== expectedLocalUrl(expectedIssuePath)) {
          notes.push(`${change.id}: issue URL points to alternate location; expected cache path: ${expectedIssuePath}`);
        }
      } else {
        const expected = expectedRemoteUrl(config, "issue", issueNumber);
        if (expected && issueUrl && !issueUrl.includes(expected)) {
          warnings.push(`${change.id}: stale issue URL "${issueUrl}"`);
        }
      }
    } else if (issueNumber !== undefined && issueNumber !== null) {
      warnings.push(`${change.id}: remote.issueNumber must be a number`);
    }

    if (typeof prNumber === "number") {
      if (config.provider.type === "local-folder") {
        const expectedPrPath = path.join(root, "cache", "local-folder", "pull-requests", `${String(prNumber).padStart(4, "0")}-${change.id}.md`);
        if (!existsSync(expectedPrPath)) warnings.push(`${change.id}: local-folder pull request cache missing for #${prNumber}`);
        if (prUrl && !prUrl.startsWith("file://")) warnings.push(`${change.id}: local-folder PR URL must be a file URL`);
      } else {
        const expected = expectedRemoteUrl(config, "pr", prNumber);
        if (expected && prUrl && !prUrl.includes(expected)) {
          warnings.push(`${change.id}: stale pull request URL "${prUrl}"`);
        }
      }
    } else if (prNumber !== undefined && prNumber !== null) {
      warnings.push(`${change.id}: remote.pullRequestNumber must be a number`);
    }

    if (status === "ready_for_pr" && !workspaceByChange.has(change.id)) {
      warnings.push(`${change.id}: missing workspace while status is ${status}`);
    }

    if (status === "ready_for_pr") {
      const metadata = workspaceByChange.get(change.id);
      if (metadata) {
        recoverIncompleteComplete(change, metadata, provider, root, repoRoot, options, warnings, notes, fixes);
      }
    }
  }

  for (const workspaceId of seenWorkspaceIds) {
    if (!changes.some((change) => change.id === workspaceId)) {
      notes.push(`Orphan workspace found for ${workspaceId}`);
    }
  }

  return { ok, warnings, fixes, notes };
}

export function runDoctor(repoRoot = process.cwd(), options: MutationOptions = {}): string {
  const report = doctorReport(repoRoot, options);
  return renderPlainDoctorReport(report, options);
}
