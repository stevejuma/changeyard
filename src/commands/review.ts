import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { changesRoot, reviewsRoot, storageRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import { renderPlanningContextForReview, renderProviderReviewBody } from "../providers/renderIssueBody.js";
import type { Frontmatter, ChangeStatus } from "../types.js";
import { assertTransition } from "../state/transitions.js";
import { createProvider } from "../providers/index.js";
import { assertRemoteChecksPass } from "./pr.js";

export type ReviewDecision = "approve" | "request-changes" | "reject" | "comment";

export interface ReviewInlineComment {
  path: string;
  line: number;
  body: string;
}

export interface ReviewRequiredChange {
  text: string;
  checked: boolean;
}

export interface ReviewSummary {
  change: string;
  review: number;
  status: string;
  reviewer: string | null;
  createdAt: string | null;
  completedAt: string | null;
  path: string;
  lastModifiedAt: string;
}

export interface ReviewDetail extends ReviewSummary {
  summary: string;
  requiredChanges: ReviewRequiredChange[];
  inlineComments: ReviewInlineComment[];
  body: string;
}

export interface ReviewUpdateInput {
  review: number;
  summary: string;
  requiredChanges: ReviewRequiredChange[];
  inlineComments: ReviewInlineComment[];
  expectedLastModifiedAt?: string | null;
}

export const REVIEW_SUMMARY_PLACEHOLDER = "Review the change here.";

export const REVIEW_BODY_TEMPLATE = `# Summary

${REVIEW_SUMMARY_PLACEHOLDER}

# Required Changes

- [ ] Add any required changes, or leave this checklist as a record.

# Inline Comments

Add inline comments as bullets: - path/to/file.ts:42: Comment text.
`;

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
  if (decision === "comment") return "commented";
  return "rejected";
}

export function mapReviewDecisionToStatus(decision: ReviewDecision): string {
  return reviewStatus(decision);
}

function changeStatus(decision: ReviewDecision): string {
  if (decision === "approve") return "approved";
  if (decision === "request-changes") return "changes_requested";
  if (decision === "comment") return "in_review";
  return "abandoned";
}

function latestReviewPath(root: string): string | undefined {
  if (!existsSync(root)) return undefined;
  return readdirSync(root).filter((file) => /^review-\d+\.md$/.test(file)).sort().map((file) => path.join(root, file)).pop();
}

function reviewPathForNumber(root: string, review: number): string {
  return path.join(root, `review-${String(review).padStart(3, "0")}.md`);
}

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function hasRemoteThread(frontmatter: Frontmatter): boolean {
  const remote = asRecord(frontmatter.remote);
  return typeof remote.issueNumber === "number" || typeof remote.pullRequestNumber === "number";
}

export function extractReviewSection(body: string, sectionName: string): string {
  const target = sectionName.trim().toLowerCase();
  const lines = body.split(/\r?\n/);
  let inSection = false;
  const collected: string[] = [];
  for (const line of lines) {
    const heading = /^#+\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const name = heading[1].trim().toLowerCase();
      if (inSection) break;
      inSection = name === target;
      continue;
    }
    if (inSection) collected.push(line);
  }
  return collected.join("\n").trim();
}

interface ReviewMarkdownSection {
  name: string;
  heading: string;
  content: string;
}

function parseReviewMarkdownSections(body: string): ReviewMarkdownSection[] {
  const sections: ReviewMarkdownSection[] = [];
  const lines = body.split(/\r?\n/);
  let current: ReviewMarkdownSection | null = null;
  for (const line of lines) {
    const heading = /^#+\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) {
        current.content = current.content.replace(/\n+$/, "");
        sections.push(current);
      }
      const name = heading[1].trim();
      current = { name: name.toLowerCase(), heading: line, content: "" };
      continue;
    }
    if (!current) {
      if (line.trim()) {
        current = { name: "", heading: "", content: line };
      }
      continue;
    }
    current.content += `${current.content ? "\n" : ""}${line}`;
  }
  if (current) {
    current.content = current.content.replace(/\n+$/, "");
    sections.push(current);
  }
  return sections;
}

export function assertReviewBodyFilled(body: string): void {
  const summary = extractReviewSection(body, "summary");
  if (!summary || summary === REVIEW_SUMMARY_PLACEHOLDER) {
    throw new Error(
      "Review Summary must be filled in before completing. Edit the review markdown under .changeyard/reviews/<id>/ and replace the template placeholder.",
    );
  }
}

function assertReviewBodyCommentable(body: string, inlineComments: ReviewInlineComment[]): void {
  const summary = extractReviewSection(body, "summary");
  if ((!summary || summary === REVIEW_SUMMARY_PLACEHOLDER) && inlineComments.length === 0) {
    throw new Error(
      "Comment reviews require either a Summary or at least one Inline Comment before completing.",
    );
  }
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

function parseRequiredChanges(body: string): ReviewRequiredChange[] {
  const items: ReviewRequiredChange[] = [];
  let current: ReviewRequiredChange | null = null;
  for (const line of extractReviewSection(body, "Required Changes").split(/\r?\n/)) {
    const match = /^-\s+\[( |x|X)\]\s*(.*)$/.exec(line.trimEnd());
    if (match) {
      if (current) items.push({ ...current, text: current.text.trim() });
      current = {
        checked: match[1].toLowerCase() === "x",
        text: match[2].trim(),
      };
      continue;
    }
    if (!current) continue;
    if (!line.trim()) {
      current.text += "\n";
      continue;
    }
    current.text += `${current.text ? "\n" : ""}${line.replace(/^\s{2,}/, "")}`;
  }
  if (current) items.push({ ...current, text: current.text.trim() });
  return items.filter((item) => {
    const text = item.text.toLowerCase().replace(/\.$/, "");
    return text !== "none" && text !== "add any required changes, or leave this checklist as a record";
  });
}

function reviewLastModifiedAt(reviewPath: string): string {
  return statSync(reviewPath).mtime.toISOString();
}

function reviewSummaryFromPath(repoRoot: string, reviewPath: string): ReviewSummary {
  const parsed = parseFrontmatter(readFileSync(reviewPath, "utf8"));
  const frontmatter = parsed.frontmatter;
  return {
    change: String(frontmatter.change ?? ""),
    review: Number(frontmatter.review ?? 0),
    status: String(frontmatter.status ?? "unknown"),
    reviewer: typeof frontmatter.reviewer === "string" ? frontmatter.reviewer : null,
    createdAt: typeof frontmatter.createdAt === "string" ? frontmatter.createdAt : null,
    completedAt: typeof frontmatter.completedAt === "string" ? frontmatter.completedAt : null,
    path: path.relative(repoRoot, reviewPath),
    lastModifiedAt: reviewLastModifiedAt(reviewPath),
  };
}

function reviewDetailFromPath(repoRoot: string, reviewPath: string): ReviewDetail {
  const parsed = parseFrontmatter(readFileSync(reviewPath, "utf8"));
  return {
    ...reviewSummaryFromPath(repoRoot, reviewPath),
    summary: extractReviewSection(parsed.body, "Summary"),
    requiredChanges: parseRequiredChanges(parsed.body),
    inlineComments: parseInlineComments(parsed.body),
    body: parsed.body,
  };
}

function formatRequiredChanges(requiredChanges: ReviewRequiredChange[]): string {
  if (requiredChanges.length === 0) {
    return "- [x] None.";
  }
  return requiredChanges
    .map((item) => {
      const lines = (item.text.trim() || "Untitled required change").split(/\r?\n/);
      const [firstLine = "Untitled required change", ...remainingLines] = lines;
      return [
        `- [${item.checked ? "x" : " "}] ${firstLine}`,
        ...remainingLines.map((line) => `  ${line}`),
      ].join("\n");
    })
    .join("\n");
}

function formatInlineComments(inlineComments: ReviewInlineComment[]): string {
  if (inlineComments.length === 0) {
    return "None.";
  }
  return inlineComments
    .map((comment) => `- ${comment.path}:${comment.line}: ${comment.body.trim()}`)
    .join("\n");
}

function updateReviewBody(body: string, input: Omit<ReviewUpdateInput, "review" | "expectedLastModifiedAt">): string {
  const known = new Set(["summary", "required changes", "inline comments"]);
  const unknownSections = parseReviewMarkdownSections(body).filter((section) => !known.has(section.name));
  const sections = [
    `# Summary\n\n${input.summary.trim() || REVIEW_SUMMARY_PLACEHOLDER}`,
    `# Required Changes\n\n${formatRequiredChanges(input.requiredChanges)}`,
    `# Inline Comments\n\n${formatInlineComments(input.inlineComments)}`,
    ...unknownSections.map((section) => `${section.heading}\n\n${section.content}`.trim()),
  ];
  return `${sections.join("\n\n")}\n`;
}

export function listReviews(id: string, repoRoot = process.cwd()): ReviewSummary[] {
  const config = loadConfig(repoRoot);
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  const changeId = changePath ? String(parseFrontmatter(readFileSync(changePath, "utf8")).frontmatter.id ?? id) : id;
  const root = path.join(reviewsRoot(repoRoot, config), changeId);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((file) => /^review-\d+\.md$/.test(file))
    .sort()
    .map((file) => reviewSummaryFromPath(repoRoot, path.join(root, file)));
}

export function getReview(id: string, review: number, repoRoot = process.cwd()): ReviewDetail {
  const config = loadConfig(repoRoot);
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  const changeId = changePath ? String(parseFrontmatter(readFileSync(changePath, "utf8")).frontmatter.id ?? id) : id;
  const root = path.join(reviewsRoot(repoRoot, config), changeId);
  const reviewPath = reviewPathForNumber(root, review);
  if (!existsSync(reviewPath)) throw new Error(`Review not found for ${changeId}: ${review}`);
  return reviewDetailFromPath(repoRoot, reviewPath);
}

export function updateReview(id: string, input: ReviewUpdateInput, repoRoot = process.cwd()): ReviewDetail {
  const config = loadConfig(repoRoot);
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  const changeId = changePath ? String(parseFrontmatter(readFileSync(changePath, "utf8")).frontmatter.id ?? id) : id;
  const root = path.join(reviewsRoot(repoRoot, config), changeId);
  const reviewPath = reviewPathForNumber(root, input.review);
  if (!existsSync(reviewPath)) throw new Error(`Review not found for ${changeId}: ${input.review}`);
  const currentLastModifiedAt = reviewLastModifiedAt(reviewPath);
  if (input.expectedLastModifiedAt !== undefined && input.expectedLastModifiedAt !== currentLastModifiedAt) {
    throw new Error(`Review ${changeId} #${input.review} changed elsewhere. Reload the latest review and retry your edit.`);
  }
  const parsed = parseFrontmatter(readFileSync(reviewPath, "utf8"));
  const body = updateReviewBody(parsed.body, input);
  writeFileSync(reviewPath, writeFrontmatter({ ...parsed.frontmatter }, body));
  return getReview(changeId, input.review, repoRoot);
}

type MutationOptions = {
  dryRun?: boolean;
};

export function runReviewStart(id: string, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!id) throw new Error("change id is required");
  const config = loadConfig(repoRoot);
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!changePath) throw new Error(`Change not found: ${id}`);
  const parsedChange = parseFrontmatter(readFileSync(changePath, "utf8"));
  const changeId = String(parsedChange.frontmatter.id ?? id);
  const currentStatus = String(parsedChange.frontmatter.status ?? "");
  const nextChangeStatus: ChangeStatus = (currentStatus === "ready_for_pr" || currentStatus === "pr_open")
    ? "in_review"
    : currentStatus as ChangeStatus;
  if (nextChangeStatus !== currentStatus) {
    assertTransition(currentStatus, nextChangeStatus, `Review ${changeId}`);
  }

  const root = path.join(reviewsRoot(repoRoot, config), changeId);
  mkdirSync(root, { recursive: true });
  const review = nextReviewNumber(root);
  const reviewPath = path.join(root, `review-${String(review).padStart(3, "0")}.md`);
  const frontmatter: Frontmatter = {
    change: changeId,
    review,
    reviewer: process.env.USER ?? "review-agent",
    status: "in_review",
    createdAt: new Date().toISOString(),
    commitBased: false,
  };
  const reviewBody = REVIEW_BODY_TEMPLATE;
  const planningContext = renderPlanningContextForReview({
    canonicalPath: path.relative(repoRoot, changePath),
    frontmatter: parsedChange.frontmatter,
    body: parsedChange.body,
  });
  const body = planningContext ? `${reviewBody.trim()}\n\n${planningContext}` : reviewBody;
  if (mutationOptions.dryRun) {
    return `Dry-run: would start review ${review} for ${changeId}: ${path.relative(repoRoot, reviewPath)}`;
  }

  writeFileSync(reviewPath, writeFrontmatter(frontmatter, body));
  writeFileSync(changePath, writeFrontmatter({
    ...parsedChange.frontmatter,
    status: nextChangeStatus,
    updatedAt: new Date().toISOString(),
  }, parsedChange.body));
  return `Started review ${review} for ${changeId}: ${path.relative(repoRoot, reviewPath)}`;
}

export function runReviewComplete(id: string, decision: ReviewDecision, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!id) throw new Error("change id is required");
  if (!decision) throw new Error("--decision is required");
  const config = loadConfig(repoRoot);
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!changePath) throw new Error(`Change not found: ${id}`);
  const parsedChange = parseFrontmatter(readFileSync(changePath, "utf8"));
  const changeId = String(parsedChange.frontmatter.id ?? id);
  const root = path.join(reviewsRoot(repoRoot, config), changeId);
  const reviewPath = latestReviewPath(root);
  if (!reviewPath) throw new Error(`No review found for ${changeId}`);

  const parsedReview = parseFrontmatter(readFileSync(reviewPath, "utf8"));
  const status = reviewStatus(decision);

  const inlineComments = parseInlineComments(parsedReview.body);
  if (decision === "comment") {
    assertReviewBodyCommentable(parsedReview.body, inlineComments);
  } else {
    assertReviewBodyFilled(parsedReview.body);
  }
  if (decision === "approve") {
    assertRemoteChecksPass(changeId, repoRoot, parsedChange.frontmatter);
  }
  if (mutationOptions.dryRun) {
    return `Dry-run: would complete review for ${changeId}: ${status} (${inlineComments.length} inline comments)`;
  }

  const provider = createProvider(config.provider.type, config);
  let reviewFrontmatter: Frontmatter = { ...parsedReview.frontmatter, status, completedAt: new Date().toISOString() };
  if (provider.publishReview && (provider.name === "local-folder" || hasRemoteThread(parsedChange.frontmatter))) {
    const renderedReviewBody = renderProviderReviewBody({
      canonicalPath: path.relative(repoRoot, changePath),
      frontmatter: parsedChange.frontmatter,
      body: parsedChange.body,
      reviewBody: parsedReview.body,
    });
    const remoteReview = provider.publishReview({
      repoRoot,
      storageRoot: storageRoot(repoRoot, config),
      changePath,
      frontmatter: parsedChange.frontmatter,
      body: parsedChange.body,
      reviewPath,
      reviewFrontmatter,
      reviewBody: renderedReviewBody,
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
  if (decision !== "comment") {
    assertTransition(String(parsedChange.frontmatter.status ?? ""), nextStatus, `Review ${changeId}`);
    writeFileSync(changePath, writeFrontmatter({ ...parsedChange.frontmatter, status: nextStatus, updatedAt: new Date().toISOString() }, parsedChange.body));
  }
  return `Completed review for ${changeId}: ${status}`;
}
