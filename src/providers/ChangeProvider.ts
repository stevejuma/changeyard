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

export type BranchPullRequestInput = {
  repoRoot: string;
  storageRoot: string;
  frontmatter?: Frontmatter;
  title: string;
  body: string;
  head: string;
  base: string;
  draft: boolean;
};

export type FindOpenPullRequestByHeadInput = {
  repoRoot: string;
  storageRoot: string;
  head: string;
};

export type UpdatePullRequestBaseInput = {
  repoRoot: string;
  storageRoot: string;
  pullRequestNumber: number;
  base: string;
};

export type UpsertPullRequestCommentInput = {
  repoRoot: string;
  storageRoot: string;
  pullRequestNumber: number;
  marker: string;
  body: string;
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
  baseBranch?: string | null;
  headBranch?: string | null;
  state?: "open" | "closed" | "merged" | "unknown";
};

export type RemotePullRequestComment = {
  provider: string;
  commentNumber: number | null;
  commentUrl: string | null;
  action: "created" | "updated";
};

export interface ChangeProvider {
  name: string;
  capabilities(): ProviderCapabilities;
  syncIssue(input: SyncIssueInput): RemoteIssue;
  createPullRequest?(input: CreatePullRequestInput): RemotePullRequest;
  findOpenPullRequestByHead?(input: FindOpenPullRequestByHeadInput): RemotePullRequest | null;
  createBranchPullRequest?(input: BranchPullRequestInput): RemotePullRequest;
  updatePullRequestBase?(input: UpdatePullRequestBaseInput): RemotePullRequest;
  upsertPullRequestComment?(input: UpsertPullRequestCommentInput): RemotePullRequestComment;
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
