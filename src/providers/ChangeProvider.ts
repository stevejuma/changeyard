import type { Frontmatter } from "../types.js";

export type ProviderCapabilities = {
  issues: boolean;
  labels: boolean;
  pullRequests: boolean;
  draftPullRequests: boolean;
  reviews: boolean;
  comments: boolean;
  pullRequestChecks: boolean;
  pullRequestCheckLogs: boolean;
  pullRequestDetails: boolean;
  pullRequestUpdates: boolean;
  branchChecks: boolean;
  pullRequestDraftState: boolean;
  pullRequestAutoMerge: boolean;
  pullRequestTemplates: boolean;
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

export type PullRequestLifecycleInput = {
  repoRoot: string;
  storageRoot: string;
  pullRequestNumber: number;
  frontmatter?: Frontmatter;
};

export type UpdatePullRequestDetailsInput = PullRequestLifecycleInput & {
  title?: string;
  body?: string;
};

export type SetPullRequestDraftStateInput = PullRequestLifecycleInput & {
  draft: boolean;
};

export type SetPullRequestAutoMergeInput = PullRequestLifecycleInput & {
  enabled: boolean;
};

export type RemotePullRequestAutoMerge = {
  provider: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  supported: boolean;
  enabled: boolean;
  message?: string;
};

export type RemotePullRequestTemplate = {
  provider: string;
  path: string;
  title: string;
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
  draft?: boolean | null;
  autoMerge?: boolean | null;
  state?: "open" | "closed" | "merged" | "unknown";
};

export type RemotePullRequestDetails = RemotePullRequest & {
  title: string;
  body: string;
  author?: string | null;
  updatedAt?: string | null;
};

export type RemotePullRequestComment = {
  provider: string;
  commentNumber: number | null;
  commentUrl: string | null;
  action: "created" | "updated";
};

export type RemoteCheckState = "passed" | "failed" | "pending" | "cancelled" | "skipped" | "unknown";

export type RemotePullRequestCheck = {
  provider: string;
  id: string;
  name: string;
  kind: "run" | "job" | "check";
  state: RemoteCheckState;
  runId?: string | null;
  jobId?: string | null;
  checkId?: string | null;
  conclusion?: string | null;
  url?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  logAvailable: boolean;
};

export type RemoteCheckSummary = Record<RemoteCheckState, number> & {
  total: number;
};

export type RemotePullRequestChecks = {
  provider: string;
  pullRequestNumber: number;
  supported: boolean;
  overallState: RemoteCheckState;
  summary: RemoteCheckSummary;
  checks: RemotePullRequestCheck[];
  message?: string;
};

export type RemoteBranchChecks = {
  provider: string;
  branch: string;
  sha: string | null;
  supported: boolean;
  overallState: RemoteCheckState;
  summary: RemoteCheckSummary;
  checks: RemotePullRequestCheck[];
  message?: string;
};

export type PullRequestChecksInput = {
  repoRoot: string;
  storageRoot: string;
  pullRequestNumber: number;
  frontmatter?: Frontmatter;
};

export type BranchChecksInput = {
  repoRoot: string;
  storageRoot: string;
  branch: string;
};

export type PullRequestCheckLogInput = PullRequestChecksInput & {
  runId?: string;
  jobId?: string;
  checkId?: string;
};

export type RemoteCheckLog = {
  provider: string;
  supported: boolean;
  selector: string;
  fileName: string;
  content: string;
  contentType: "text" | "archive";
  message?: string;
};

export interface ChangeProvider {
  name: string;
  capabilities(): ProviderCapabilities;
  syncIssue(input: SyncIssueInput): RemoteIssue;
  createPullRequest?(input: CreatePullRequestInput): RemotePullRequest;
  findOpenPullRequestByHead?(input: FindOpenPullRequestByHeadInput): RemotePullRequest | null;
  createBranchPullRequest?(input: BranchPullRequestInput): RemotePullRequest;
  updatePullRequestBase?(input: UpdatePullRequestBaseInput): RemotePullRequest;
  getPullRequestDetails?(input: PullRequestLifecycleInput): RemotePullRequestDetails;
  updatePullRequestDetails?(input: UpdatePullRequestDetailsInput): RemotePullRequestDetails;
  setPullRequestDraftState?(input: SetPullRequestDraftStateInput): RemotePullRequest;
  setPullRequestAutoMerge?(input: SetPullRequestAutoMergeInput): RemotePullRequestAutoMerge;
  listPullRequestTemplates?(input: PullRequestLifecycleInput): RemotePullRequestTemplate[];
  upsertPullRequestComment?(input: UpsertPullRequestCommentInput): RemotePullRequestComment;
  publishReview?(input: PublishReviewInput): RemoteReview;
  listPullRequestChecks?(input: PullRequestChecksInput): RemotePullRequestChecks;
  listBranchChecks?(input: BranchChecksInput): RemoteBranchChecks;
  getPullRequestCheckLog?(input: PullRequestCheckLogInput): RemoteCheckLog;
}

export const noProviderCapabilities: ProviderCapabilities = {
  issues: false,
  labels: false,
  pullRequests: false,
  draftPullRequests: false,
  reviews: false,
  comments: false,
  pullRequestChecks: false,
  pullRequestCheckLogs: false,
  pullRequestDetails: false,
  pullRequestUpdates: false,
  branchChecks: false,
  pullRequestDraftState: false,
  pullRequestAutoMerge: false,
  pullRequestTemplates: false,
};
