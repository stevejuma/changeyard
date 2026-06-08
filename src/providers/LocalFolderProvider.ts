import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeFrontmatter } from "../documents/frontmatter.js";
import type { Frontmatter } from "../types.js";
import type { ChangeProvider, CreatePullRequestInput, ProviderCapabilities, PublishReviewInput, RemoteIssue, RemotePullRequest, RemoteReview, SyncIssueInput } from "./ChangeProvider.js";
import { issueNumberFor } from "./providerState.js";

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
    const id = String(input.frontmatter.id ?? "");
    const issueNumber = issueNumberFor(input.storageRoot, `${id}-pr`);
    const prsRoot = path.join(input.storageRoot, "cache", "local-folder", "pull-requests");
    mkdirSync(prsRoot, { recursive: true });
    const prPath = path.join(prsRoot, `${String(issueNumber).padStart(4, "0")}-${id}.md`);
    writeFileSync(prPath, writeFrontmatter({
      provider: this.name,
      pullRequestNumber: issueNumber,
      sourceChange: id,
      title: input.title,
      branch: input.branch,
      base: input.base,
      draft: input.draft,
      updatedAt: new Date().toISOString(),
    }, input.body));
    return { provider: this.name, pullRequestNumber: issueNumber, pullRequestUrl: `file://${prPath}` };
  }
}
