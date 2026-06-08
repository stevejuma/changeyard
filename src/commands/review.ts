import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { changesRoot, reviewsRoot, storageRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import type { Frontmatter, ChangeStatus } from "../types.js";
import { assertTransition } from "../state/transitions.js";
import { createProvider } from "../providers/index.js";

export type ReviewDecision = "approve" | "request-changes" | "reject";

function nextReviewNumber(root: string): number {
  if (!existsSync(root)) return 1;
  let max = 0;
  for (const file of readdirSync(root)) {
    const match = /^review-(\d+)\.md$/.exec(file);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function reviewStatus(decision: ReviewDecision): string {
  if (decision === "approve") return "approved";
  if (decision === "request-changes") return "changes_requested";
  return "rejected";
}

export function mapReviewDecisionToStatus(decision: ReviewDecision): string {
  return reviewStatus(decision);
}

function changeStatus(decision: ReviewDecision): string {
  if (decision === "approve") return "approved";
  if (decision === "request-changes") return "changes_requested";
  return "abandoned";
}

function latestReviewPath(root: string): string | undefined {
  if (!existsSync(root)) return undefined;
  return readdirSync(root).filter((file) => /^review-\d+\.md$/.test(file)).sort().map((file) => path.join(root, file)).pop();
}

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function hasRemoteThread(frontmatter: Frontmatter): boolean {
  const remote = asRecord(frontmatter.remote);
  return typeof remote.issueNumber === "number" || typeof remote.pullRequestNumber === "number";
}

export function parseInlineComments(body: string): { path: string; line: number; body: string }[] {
  const lines = body.split(/\r?\n/);
  const comments: { path: string; line: number; body: string }[] = [];
  let inSection = false;
  for (const line of lines) {
    const heading = /^#+\s+(.+?)\s*$/.exec(line);
    if (heading) {
      inSection = heading[1].toLowerCase() === "inline comments";
      continue;
    }
    if (!inSection) continue;
    const match = /^-\s+([^:]+):(\d+):\s+(.+)$/.exec(line);
    if (match) comments.push({ path: match[1].trim(), line: Number(match[2]), body: match[3].trim() });
  }
  return comments;
}

type MutationOptions = {
  dryRun?: boolean;
};

export function runReviewStart(id: string, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!id) throw new Error("change id is required");
  const config = loadConfig(repoRoot);
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!changePath) throw new Error(`Change not found: ${id}`);

  const root = path.join(reviewsRoot(repoRoot, config), id);
  mkdirSync(root, { recursive: true });
  const review = nextReviewNumber(root);
  const reviewPath = path.join(root, `review-${String(review).padStart(3, "0")}.md`);
  const frontmatter: Frontmatter = {
    change: id,
    review,
    reviewer: process.env.USER ?? "review-agent",
    status: "in_review",
    createdAt: new Date().toISOString(),
    commitBased: false,
  };
  const body = `# Summary\n\nReview the change here.\n\n# Required Changes\n\n- [ ] Add any required changes, or leave this checklist as a record.\n\n# Inline Comments\n\nAdd inline comments as bullets: - path/to/file.ts:42: Comment text.\n`;
  if (mutationOptions.dryRun) {
    return `Dry-run: would start review ${review} for ${id}: ${path.relative(repoRoot, reviewPath)}`;
  }

  writeFileSync(reviewPath, writeFrontmatter(frontmatter, body));
  return `Started review ${review} for ${id}: ${path.relative(repoRoot, reviewPath)}`;
}

export function runReviewComplete(id: string, decision: ReviewDecision, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!id) throw new Error("change id is required");
  if (!decision) throw new Error("--decision is required");
  const config = loadConfig(repoRoot);
  const root = path.join(reviewsRoot(repoRoot, config), id);
  const reviewPath = latestReviewPath(root);
  if (!reviewPath) throw new Error(`No review found for ${id}`);

  const parsedReview = parseFrontmatter(readFileSync(reviewPath, "utf8"));
  const status = reviewStatus(decision);

  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!changePath) throw new Error(`Change not found: ${id}`);
  const parsedChange = parseFrontmatter(readFileSync(changePath, "utf8"));

  const inlineComments = parseInlineComments(parsedReview.body);
  if (mutationOptions.dryRun) {
    return `Dry-run: would complete review for ${id}: ${status} (${inlineComments.length} inline comments)`;
  }

  const provider = createProvider(config.provider.type, config);
  let reviewFrontmatter: Frontmatter = { ...parsedReview.frontmatter, status, completedAt: new Date().toISOString() };
  if (provider.publishReview && (provider.name === "local-folder" || hasRemoteThread(parsedChange.frontmatter))) {
    const remoteReview = provider.publishReview({
      repoRoot,
      storageRoot: storageRoot(repoRoot, config),
      changePath,
      frontmatter: parsedChange.frontmatter,
      body: parsedChange.body,
      reviewPath,
      reviewFrontmatter,
      reviewBody: parsedReview.body,
      decision: status,
      inlineComments,
    });
    reviewFrontmatter = {
      ...reviewFrontmatter,
      remote: {
        provider: remoteReview.provider,
        reviewNumber: remoteReview.reviewNumber,
        reviewUrl: remoteReview.reviewUrl,
      },
    };
  }

  writeFileSync(reviewPath, writeFrontmatter(reviewFrontmatter, parsedReview.body));

  const nextStatus = changeStatus(decision) as ChangeStatus;
  assertTransition(String(parsedChange.frontmatter.status ?? ""), nextStatus, `Review ${id}`);
  writeFileSync(changePath, writeFrontmatter({ ...parsedChange.frontmatter, status: nextStatus, updatedAt: new Date().toISOString() }, parsedChange.body));
  return `Completed review for ${id}: ${status}`;
}
