import type { Frontmatter } from "../types.js";

export type ProviderCapabilities = {
  issues: boolean;
  labels: boolean;
  pullRequests: boolean;
  draftPullRequests: boolean;
  reviews: boolean;
  comments: boolean;
};

export type SyncIssueInput = {
  repoRoot: string;
  storageRoot: string;
  changePath: string;
  frontmatter: Frontmatter;
  body: string;
};

export type CreatePullRequestInput = SyncIssueInput & {
  title: string;
  branch: string;
  base: string;
  draft: boolean;
};

export type RemoteIssue = {
  provider: string;
  issueNumber: number | null;
  issueUrl: string | null;
};

export type InlineReviewComment = {
  path: string;
  line: number;
  body: string;
};

export type PublishReviewInput = SyncIssueInput & {
  reviewPath: string;
  reviewFrontmatter: Frontmatter;
  reviewBody: string;
  decision: string;
  inlineComments?: InlineReviewComment[];
};

export type RemoteReview = {
  provider: string;
  reviewNumber: number | null;
  reviewUrl: string | null;
};

export type RemotePullRequest = {
  provider: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
};

export interface ChangeProvider {
  name: string;
  capabilities(): ProviderCapabilities;
  syncIssue(input: SyncIssueInput): RemoteIssue;
  createPullRequest?(input: CreatePullRequestInput): RemotePullRequest;
  publishReview?(input: PublishReviewInput): RemoteReview;
}

export const noProviderCapabilities: ProviderCapabilities = {
  issues: false,
  labels: false,
  pullRequests: false,
  draftPullRequests: false,
  reviews: false,
  comments: false,
};
