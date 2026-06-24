import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import type { Frontmatter } from "../types.js";
import type {
  BranchPullRequestInput,
  BranchChecksInput,
  ChangeProvider,
  CreatePullRequestInput,
  FindOpenPullRequestByHeadInput,
  PullRequestLifecycleInput,
  ProviderCapabilities,
  PublishReviewInput,
  RemoteBranchChecks,
  RemoteCheckSummary,
  RemoteIssue,
  RemotePullRequest,
  RemotePullRequestComment,
  RemotePullRequestDetails,
  RemoteReview,
  SyncIssueInput,
  UpdatePullRequestBaseInput,
  UpdatePullRequestDetailsInput,
  UpsertPullRequestCommentInput,
} from "./ChangeProvider.js";
import { issueNumberFor } from "./providerState.js";

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function safeSlug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "pull-request";
}

function pullRequestsRoot(storageRoot: string): string {
  return path.join(storageRoot, "cache", "local-folder", "pull-requests");
}

function pullRequestCommentsRoot(storageRoot: string): string {
  return path.join(storageRoot, "cache", "local-folder", "pull-request-comments");
}

function localPullRequestFiles(storageRoot: string): string[] {
  const root = pullRequestsRoot(storageRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(root, entry));
}

function readLocalPullRequest(filePath: string): { frontmatter: Frontmatter; body: string } | null {
  try {
    return parseFrontmatter(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function remotePullRequestFromLocal(filePath: string, frontmatter: Frontmatter): RemotePullRequest | null {
  const number = frontmatter.pullRequestNumber;
  if (typeof number !== "number") return null;
  return {
    provider: "local-folder",
    pullRequestNumber: number,
    pullRequestUrl: `file://${filePath}`,
    baseBranch: typeof frontmatter.base === "string" ? frontmatter.base : null,
    headBranch: typeof frontmatter.head === "string" ? frontmatter.head : typeof frontmatter.branch === "string" ? frontmatter.branch : null,
    state: frontmatter.state === "closed" || frontmatter.state === "merged" || frontmatter.state === "unknown" ? frontmatter.state : "open",
  };
}

function remotePullRequestDetailsFromLocal(filePath: string, frontmatter: Frontmatter, body: string): RemotePullRequestDetails | null {
  const base = remotePullRequestFromLocal(filePath, frontmatter);
  if (!base) return null;
  return {
    ...base,
    title: typeof frontmatter.title === "string" ? frontmatter.title : `Pull request ${base.pullRequestNumber}`,
    body,
    author: typeof frontmatter.author === "string" ? frontmatter.author : null,
    updatedAt: typeof frontmatter.updatedAt === "string" ? frontmatter.updatedAt : null,
  };
}

function emptyCheckSummary(): RemoteCheckSummary {
  return { passed: 0, failed: 0, pending: 0, cancelled: 0, skipped: 0, unknown: 0, total: 0 };
}

function findLocalPullRequestByNumber(storageRoot: string, number: number): { path: string; frontmatter: Frontmatter; body: string } | null {
  for (const filePath of localPullRequestFiles(storageRoot)) {
    const parsed = readLocalPullRequest(filePath);
    if (parsed && parsed.frontmatter.pullRequestNumber === number) {
      return { path: filePath, ...parsed };
    }
  }
  return null;
}

function localCommentFiles(storageRoot: string): string[] {
  const root = pullRequestCommentsRoot(storageRoot);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => path.join(root, entry));
}

export class LocalFolderProvider implements ChangeProvider {
  name = "local-folder";

  capabilities(): ProviderCapabilities {
    return {
      issues: true,
      labels: true,
      pullRequests: true,
      draftPullRequests: true,
      reviews: true,
      comments: true,
      pullRequestChecks: false,
      pullRequestCheckLogs: false,
      pullRequestDetails: true,
      pullRequestUpdates: true,
      branchChecks: false,
      pullRequestDraftState: false,
      pullRequestAutoMerge: false,
      pullRequestTemplates: true,
    };
  }

  syncIssue(input: SyncIssueInput): RemoteIssue {
    const id = String(input.frontmatter.id ?? "");
    const issueNumber = issueNumberFor(input.storageRoot, id);
    const issuesRoot = path.join(input.storageRoot, "cache", "local-folder", "issues");
    mkdirSync(issuesRoot, { recursive: true });

    const issuePath = path.join(issuesRoot, `${String(issueNumber).padStart(4, "0")}-${id}.md`);
    const issueFrontmatter: Frontmatter = {
      provider: this.name,
      issueNumber,
      sourceChange: id,
      sourcePath: path.relative(input.repoRoot, input.changePath),
      title: String(input.frontmatter.title ?? "Untitled"),
      status: String(input.frontmatter.status ?? "unknown"),
      labels: Array.isArray(input.frontmatter.labels) ? input.frontmatter.labels : [],
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(issuePath, writeFrontmatter(issueFrontmatter, input.body));

    return {
      provider: this.name,
      issueNumber,
      issueUrl: `file://${issuePath}`,
    };
  }

  publishReview(input: PublishReviewInput): RemoteReview {
    const id = String(input.frontmatter.id ?? input.reviewFrontmatter.change ?? "");
    const reviewNumber = issueNumberFor(input.storageRoot, `${id}-review-${String(input.reviewFrontmatter.review ?? "latest")}`);
    const reviewsRoot = path.join(input.storageRoot, "cache", "local-folder", "reviews");
    mkdirSync(reviewsRoot, { recursive: true });
    const reviewPath = path.join(reviewsRoot, `${String(reviewNumber).padStart(4, "0")}-${id}.md`);
    writeFileSync(reviewPath, writeFrontmatter({
      provider: this.name,
      reviewNumber,
      sourceChange: id,
      sourceReview: path.relative(input.repoRoot, input.reviewPath),
      decision: input.decision,
      inlineCommentCount: input.inlineComments?.length ?? 0,
      updatedAt: new Date().toISOString(),
    }, `${input.reviewBody}${input.inlineComments?.length ? `\n\n# Inline Comment Payload\n\n${input.inlineComments.map((comment) => `- ${comment.path}:${comment.line}: ${comment.body}`).join("\n")}\n` : ""}`));
    return { provider: this.name, reviewNumber, reviewUrl: `file://${reviewPath}` };
  }

  createPullRequest(input: CreatePullRequestInput): RemotePullRequest {
    return this.createBranchPullRequest({
      repoRoot: input.repoRoot,
      storageRoot: input.storageRoot,
      frontmatter: input.frontmatter,
      title: input.title,
      body: input.body,
      head: input.branch,
      base: input.base,
      draft: input.draft,
    });
  }

  findOpenPullRequestByHead(input: FindOpenPullRequestByHeadInput): RemotePullRequest | null {
    for (const filePath of localPullRequestFiles(input.storageRoot)) {
      const parsed = readLocalPullRequest(filePath);
      if (!parsed) continue;
      const frontmatter = parsed.frontmatter;
      const head = typeof frontmatter.head === "string" ? frontmatter.head : typeof frontmatter.branch === "string" ? frontmatter.branch : null;
      const state = String(frontmatter.state ?? "open");
      if (head === input.head && state === "open") {
        return remotePullRequestFromLocal(filePath, frontmatter);
      }
    }
    return null;
  }

  createBranchPullRequest(input: BranchPullRequestInput): RemotePullRequest {
    const id = String(input.frontmatter?.id ?? "");
    const issueNumber = issueNumberFor(input.storageRoot, id ? `${id}-pr` : `branch-pr-${input.head}`);
    const prsRoot = pullRequestsRoot(input.storageRoot);
    mkdirSync(prsRoot, { recursive: true });
    const prPath = path.join(prsRoot, `${String(issueNumber).padStart(4, "0")}-${safeSlug(id || input.head)}.md`);
    writeFileSync(prPath, writeFrontmatter({
      provider: this.name,
      pullRequestNumber: issueNumber,
      sourceChange: id || null,
      title: input.title,
      head: input.head,
      branch: input.head,
      base: input.base,
      draft: input.draft,
      state: "open",
      updatedAt: new Date().toISOString(),
    }, input.body));
    return { provider: this.name, pullRequestNumber: issueNumber, pullRequestUrl: `file://${prPath}`, baseBranch: input.base, headBranch: input.head, state: "open" };
  }

  updatePullRequestBase(input: UpdatePullRequestBaseInput): RemotePullRequest {
    const existing = findLocalPullRequestByNumber(input.storageRoot, input.pullRequestNumber);
    const frontmatter: Frontmatter = {
      ...asRecord(existing?.frontmatter),
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      base: input.base,
      updatedAt: new Date().toISOString(),
    };
    const prPath = existing?.path ?? path.join(pullRequestsRoot(input.storageRoot), `${String(input.pullRequestNumber).padStart(4, "0")}-pull-request.md`);
    mkdirSync(path.dirname(prPath), { recursive: true });
    writeFileSync(prPath, writeFrontmatter(frontmatter, existing?.body ?? ""));
    return {
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestUrl: `file://${prPath}`,
      baseBranch: input.base,
      headBranch: typeof frontmatter.head === "string" ? frontmatter.head : typeof frontmatter.branch === "string" ? frontmatter.branch : null,
      state: frontmatter.state === "closed" || frontmatter.state === "merged" || frontmatter.state === "unknown" ? frontmatter.state : "open",
    };
  }

  getPullRequestDetails(input: PullRequestLifecycleInput): RemotePullRequestDetails {
    const existing = findLocalPullRequestByNumber(input.storageRoot, input.pullRequestNumber);
    if (existing) {
      const details = remotePullRequestDetailsFromLocal(existing.path, existing.frontmatter, existing.body);
      if (details) return details;
    }
    const prPath = path.join(pullRequestsRoot(input.storageRoot), `${String(input.pullRequestNumber).padStart(4, "0")}-pull-request.md`);
    return {
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestUrl: `file://${prPath}`,
      title: `Pull request ${input.pullRequestNumber}`,
      body: "",
      state: "unknown",
    };
  }

  updatePullRequestDetails(input: UpdatePullRequestDetailsInput): RemotePullRequestDetails {
    const existing = findLocalPullRequestByNumber(input.storageRoot, input.pullRequestNumber);
    const frontmatter: Frontmatter = {
      ...asRecord(existing?.frontmatter),
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      updatedAt: new Date().toISOString(),
    };
    if (input.title !== undefined) {
      frontmatter.title = input.title;
    }
    const body = input.body ?? existing?.body ?? "";
    const prPath = existing?.path ?? path.join(pullRequestsRoot(input.storageRoot), `${String(input.pullRequestNumber).padStart(4, "0")}-pull-request.md`);
    mkdirSync(path.dirname(prPath), { recursive: true });
    writeFileSync(prPath, writeFrontmatter(frontmatter, body));
    return remotePullRequestDetailsFromLocal(prPath, frontmatter, body) ?? {
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestUrl: `file://${prPath}`,
      title: input.title ?? `Pull request ${input.pullRequestNumber}`,
      body,
      state: "unknown",
    };
  }

  listBranchChecks(input: BranchChecksInput): RemoteBranchChecks {
    return {
      provider: this.name,
      branch: input.branch,
      sha: null,
      supported: false,
      overallState: "unknown",
      summary: emptyCheckSummary(),
      checks: [],
      message: "Local-folder provider does not support remote branch checks.",
    };
  }

  upsertPullRequestComment(input: UpsertPullRequestCommentInput): RemotePullRequestComment {
    for (const filePath of localCommentFiles(input.storageRoot)) {
      const parsed = readLocalPullRequest(filePath);
      if (!parsed) continue;
      if (parsed.frontmatter.pullRequestNumber === input.pullRequestNumber && parsed.frontmatter.marker === input.marker) {
        const nextFrontmatter: Frontmatter = {
          ...parsed.frontmatter,
          updatedAt: new Date().toISOString(),
        };
        writeFileSync(filePath, writeFrontmatter(nextFrontmatter, input.body));
        return {
          provider: this.name,
          commentNumber: typeof nextFrontmatter.commentNumber === "number" ? nextFrontmatter.commentNumber : null,
          commentUrl: `file://${filePath}`,
          action: "updated",
        };
      }
    }

    const commentNumber = issueNumberFor(input.storageRoot, `pr-${input.pullRequestNumber}-comment-${input.marker}`);
    const commentsRoot = pullRequestCommentsRoot(input.storageRoot);
    mkdirSync(commentsRoot, { recursive: true });
    const commentPath = path.join(commentsRoot, `${String(commentNumber).padStart(4, "0")}-pr-${input.pullRequestNumber}.md`);
    writeFileSync(commentPath, writeFrontmatter({
      provider: this.name,
      commentNumber,
      pullRequestNumber: input.pullRequestNumber,
      marker: input.marker,
      updatedAt: new Date().toISOString(),
    }, input.body));
    return {
      provider: this.name,
      commentNumber,
      commentUrl: `file://${commentPath}`,
      action: "created",
    };
  }
}
