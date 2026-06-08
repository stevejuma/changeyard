import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { changesRoot, reviewsRoot, storageRoot, workspacesRoot } from "../paths.js";
import { createProvider } from "../providers/index.js";
import { readProviderState, writeProviderState } from "../providers/providerState.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import { shellCommandRunner } from "../workspace/commandRunner.js";
import { parseInlineComments } from "./review.js";
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
const branchAwareStatuses = new Set(["ready_for_pr", "pr_open", "in_review", "changes_requested", "approved", "merged", "abandoned"]);
const checksLogStatuses = new Set(["ready_for_pr", "pr_open", "in_review", "changes_requested", "approved", "merged", "abandoned"]);

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
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
    const list = shellCommandRunner("jj", ["bookmark", "list"], workspacePath);
    const status = shellCommandRunner("jj", ["status"], workspacePath);
    return {
      exists: list.includes(bookmark),
      dirty: status.trim().length > 0,
      conflicts: /conflict/i.test(status),
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

  const reviewPath = latestReviewPath(reviewRoot);
  if (!reviewPath) {
    notes.push(`No review file found for ${change.id}, expected if status is ${change.frontmatter.status}`);
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

export function doctorReport(repoRoot = process.cwd(), options: MutationOptions = {}): DoctorReport {
  const config = loadConfig(repoRoot);
  const root = storageRoot(repoRoot, config);
  const changesPath = changesRoot(repoRoot, config);
  const workspacesPath = workspacesRoot(repoRoot, config);
  const warnings: string[] = [];
  const ok: string[] = [];
  const fixes: string[] = [];
  const notes: string[] = [];

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
      const validation = validateChangeFile(filePath, root);
      const parsed = readMarkdown(filePath);
      if (!validation.valid) {
        warnings.push(`${file}: ${validation.errors.join("; ")}`);
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

      const matchingChange = changes.find((change) => change.id === metadata.changeId);
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
        if (!stateResult.exists && branchAwareStatuses.has(changeStatus)) warnings.push(`${workspaceId}: jj bookmark missing: ${metadata.branch}`);
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

    recoverIncompleteSync(change, root, localCache, options, warnings, notes, fixes, config);
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
    } else if (issueNumber !== undefined) {
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
    } else if (prNumber !== undefined) {
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
  const lines: string[] = [];

  if (report.ok.length > 0) lines.push(`Doctor ok: ${report.ok.join(", ")}`);
  else lines.push("Doctor ok");

  if (report.warnings.length > 0) {
    lines.push(...report.warnings.map((warning) => `Warning: ${warning}`));
  }
  if (report.fixes.length > 0) {
    lines.push(...report.fixes.map((fix) => `Fix: ${fix}`));
  }
  if (report.notes.length > 0 && (options.verbose || report.fixes.length > 0)) {
    lines.push(...report.notes.map((note) => `Note: ${note}`));
  }

  return lines.join("\n");
}
