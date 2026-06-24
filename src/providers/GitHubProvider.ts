import type { ChangeyardConfig } from "../types.js";
import { ChangeyardError } from "../errors.js";
import type {
  BranchPullRequestInput,
  BranchChecksInput,
  ChangeProvider,
  CreatePullRequestInput,
  FindOpenPullRequestByHeadInput,
  PullRequestCheckLogInput,
  PullRequestChecksInput,
  PullRequestLifecycleInput,
  ProviderCapabilities,
  RemoteBranchChecks,
  RemoteCheckLog,
  RemoteCheckState,
  RemoteCheckSummary,
  RemoteIssue,
  RemotePullRequest,
  RemotePullRequestAutoMerge,
  RemotePullRequestCheck,
  RemotePullRequestChecks,
  RemotePullRequestComment,
  RemotePullRequestDetails,
  RemoteReview,
  SetPullRequestAutoMergeInput,
  SetPullRequestDraftStateInput,
  SyncIssueInput,
  PublishReviewInput,
  UpdatePullRequestBaseInput,
  UpdatePullRequestDetailsInput,
  UpsertPullRequestCommentInput,
} from "./ChangeProvider.js";
import { curlGraphql, curlJson, curlRaw } from "./http.js";
import { validateReviewCommentPath } from "./reviewHelpers.js";

const GITHUB_HEADERS = ["Accept: application/vnd.github+json", "X-GitHub-Api-Version: 2022-11-28"];

type PullRequestResponse = {
  number?: number;
  node_id?: string;
  title?: string;
  body?: string | null;
  html_url?: string;
  url?: string;
  base?: {
    ref?: string;
  };
  state?: string;
  merged_at?: string | null;
  head?: {
    ref?: string;
    sha?: string;
  };
  user?: {
    login?: string;
  };
  updated_at?: string;
  draft?: boolean;
  auto_merge?: unknown;
};

type CommitResponse = {
  sha?: string;
};

type PullRequestListFile = {
  filename?: string;
  patch?: string;
};

type IssueCommentResponse = {
  id?: number;
  html_url?: string;
  url?: string;
  body?: string;
};

type WorkflowRun = {
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  created_at?: string;
  updated_at?: string;
  run_started_at?: string;
};

type WorkflowJob = {
  id?: number;
  run_id?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  started_at?: string;
  completed_at?: string | null;
};

type CheckRun = {
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  html_url?: string;
  started_at?: string;
  completed_at?: string | null;
};

function githubCheckState(status: string | undefined, conclusion: string | null | undefined): RemoteCheckState {
  if (status !== "completed") {
    return ["queued", "in_progress", "requested", "waiting", "pending"].includes(status ?? "") ? "pending" : "unknown";
  }
  if (conclusion === "success" || conclusion === "neutral") return "passed";
  if (conclusion === "skipped") return "skipped";
  if (conclusion === "cancelled" || conclusion === "timed_out") return "cancelled";
  if (conclusion === "failure" || conclusion === "startup_failure" || conclusion === "action_required") return "failed";
  return "unknown";
}

function summarizeChecks(checks: RemotePullRequestCheck[]): RemoteCheckSummary {
  const summary: RemoteCheckSummary = {
    passed: 0,
    failed: 0,
    pending: 0,
    cancelled: 0,
    skipped: 0,
    unknown: 0,
    total: checks.length,
  };
  for (const check of checks) summary[check.state] += 1;
  return summary;
}

function overallCheckState(checks: RemotePullRequestCheck[]): RemoteCheckState {
  if (checks.length === 0) return "unknown";
  if (checks.some((check) => check.state === "failed")) return "failed";
  if (checks.some((check) => check.state === "pending")) return "pending";
  if (checks.some((check) => check.state === "unknown")) return "unknown";
  if (checks.some((check) => check.state === "cancelled")) return "cancelled";
  if (checks.every((check) => check.state === "skipped")) return "skipped";
  return "passed";
}

function requireConfig(config: ChangeyardConfig): { baseUrl: string; owner: string; repo: string; token: string } {
  const tokenEnv = config.provider.auth?.tokenEnv ?? "GITHUB_TOKEN";
  const token = process.env[tokenEnv];
  if (!config.provider.owner || !config.provider.repo || !token) {
    throw new ChangeyardError("PROVIDER_CONFIG_INVALID", `GitHub provider requires owner, repo, and ${tokenEnv}`);
  }
  return { baseUrl: (config.provider.baseUrl ?? "https://api.github.com").replace(/\/$/, ""), owner: config.provider.owner, repo: config.provider.repo, token };
}

function graphqlUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/api/v3")) return `${baseUrl.slice(0, -"/api/v3".length)}/api/graphql`;
  return `${baseUrl}/graphql`;
}

function inlineCommentSummary(input: PublishReviewInput): string {
  const comments = input.inlineComments ?? [];
  if (!comments.length) return "";
  return `\n\nInline comments:\n${comments.map((comment) => `- ${comment.path}:${comment.line}: ${comment.body}`).join("\n")}`;
}

function remoteThreadNumber(input: PublishReviewInput): number | null {
  const remote = typeof input.frontmatter.remote === "object" && input.frontmatter.remote !== null && !Array.isArray(input.frontmatter.remote) ? input.frontmatter.remote : {};
  const pr = remote.pullRequestNumber;
  const issue = remote.issueNumber;
  return typeof pr === "number" ? pr : typeof issue === "number" ? issue : null;
}

function pullRequest(cfg: { baseUrl: string; owner: string; repo: string; token: string }, pullNumber: number): PullRequestResponse {
  return curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/pulls/${pullNumber}`,
    token: cfg.token,
    tokenScheme: "Bearer",
    payload: {},
    extraHeaders: GITHUB_HEADERS,
  });
}

function workflowRuns(cfg: { baseUrl: string; owner: string; repo: string; token: string }, headSha: string): WorkflowRun[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`,
    token: cfg.token,
    tokenScheme: "Bearer",
    extraHeaders: GITHUB_HEADERS,
  });
  const runs = (response as { workflow_runs?: unknown }).workflow_runs;
  return Array.isArray(runs) ? runs as WorkflowRun[] : [];
}

function workflowJobs(cfg: { baseUrl: string; owner: string; repo: string; token: string }, runId: number): WorkflowJob[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/actions/runs/${runId}/jobs?per_page=100`,
    token: cfg.token,
    tokenScheme: "Bearer",
    extraHeaders: GITHUB_HEADERS,
  });
  const jobs = (response as { jobs?: unknown }).jobs;
  return Array.isArray(jobs) ? jobs as WorkflowJob[] : [];
}

function commitCheckRuns(cfg: { baseUrl: string; owner: string; repo: string; token: string }, headSha: string): CheckRun[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/commits/${headSha}/check-runs?per_page=100`,
    token: cfg.token,
    tokenScheme: "Bearer",
    extraHeaders: GITHUB_HEADERS,
  });
  const checkRuns = (response as { check_runs?: unknown }).check_runs;
  return Array.isArray(checkRuns) ? checkRuns as CheckRun[] : [];
}

function branchCommit(cfg: { baseUrl: string; owner: string; repo: string; token: string }, branch: string): CommitResponse {
  return curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/commits/${encodeURIComponent(branch)}`,
    token: cfg.token,
    tokenScheme: "Bearer",
    payload: {},
    extraHeaders: GITHUB_HEADERS,
  }) as CommitResponse;
}

function pullRequestFiles(cfg: { baseUrl: string; owner: string; repo: string; token: string }, pullNumber: number): PullRequestListFile[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/pulls/${pullNumber}/files?per_page=100`,
    token: cfg.token,
    tokenScheme: "Bearer",
    payload: {},
    extraHeaders: GITHUB_HEADERS,
  });
  return Array.isArray(response) ? response as PullRequestListFile[] : [];
}

function remotePullRequestFromResponse(response: PullRequestResponse, fallback?: { head?: string; base?: string }): RemotePullRequest | null {
  if (typeof response.number !== "number") return null;
  return {
    provider: "github",
    pullRequestNumber: response.number,
    pullRequestUrl: typeof response.html_url === "string" ? response.html_url : typeof response.url === "string" ? response.url : null,
    baseBranch: typeof response.base?.ref === "string" ? response.base.ref : fallback?.base ?? null,
    headBranch: typeof response.head?.ref === "string" ? response.head.ref : fallback?.head ?? null,
    draft: typeof response.draft === "boolean" ? response.draft : null,
    autoMerge: response.auto_merge ? true : null,
    state: response.merged_at ? "merged" : response.state === "closed" ? "closed" : response.state === "open" || fallback ? "open" : "unknown",
  };
}

function remotePullRequestDetailsFromResponse(response: PullRequestResponse, fallback?: { head?: string; base?: string }): RemotePullRequestDetails | null {
  const base = remotePullRequestFromResponse(response, fallback);
  if (!base) return null;
  return {
    ...base,
    title: typeof response.title === "string" ? response.title : `Pull request ${base.pullRequestNumber}`,
    body: typeof response.body === "string" ? response.body : "",
    author: typeof response.user?.login === "string" ? response.user.login : null,
    updatedAt: typeof response.updated_at === "string" ? response.updated_at : null,
  };
}

function githubChecksForSha(cfg: { baseUrl: string; owner: string; repo: string; token: string }, headSha: string): RemotePullRequestCheck[] {
  const checks: RemotePullRequestCheck[] = [];
  const actionsJobNames = new Set<string>();
  for (const run of workflowRuns(cfg, headSha)) {
    if (typeof run.id !== "number") continue;
    const jobs = workflowJobs(cfg, run.id);
    if (jobs.length === 0) {
      const state = githubCheckState(run.status, run.conclusion);
      checks.push({
        provider: "github",
        id: `run:${run.id}`,
        name: run.name ?? `GitHub Actions run ${run.id}`,
        kind: "run",
        state,
        runId: String(run.id),
        conclusion: run.conclusion ?? run.status ?? null,
        url: run.html_url ?? null,
        startedAt: run.run_started_at ?? run.created_at ?? null,
        completedAt: run.status === "completed" ? run.updated_at ?? null : null,
        logAvailable: true,
      });
      continue;
    }
    for (const job of jobs) {
      if (typeof job.id !== "number") continue;
      const name = job.name ?? `GitHub Actions job ${job.id}`;
      actionsJobNames.add(name);
      checks.push({
        provider: "github",
        id: `job:${job.id}`,
        name,
        kind: "job",
        state: githubCheckState(job.status, job.conclusion),
        runId: String(job.run_id ?? run.id),
        jobId: String(job.id),
        conclusion: job.conclusion ?? job.status ?? null,
        url: job.html_url ?? null,
        startedAt: job.started_at ?? null,
        completedAt: job.completed_at ?? null,
        logAvailable: true,
      });
    }
  }

  for (const checkRun of commitCheckRuns(cfg, headSha)) {
    if (typeof checkRun.id !== "number") continue;
    const name = checkRun.name ?? `GitHub check ${checkRun.id}`;
    if (actionsJobNames.has(name)) continue;
    checks.push({
      provider: "github",
      id: `check:${checkRun.id}`,
      name,
      kind: "check",
      state: githubCheckState(checkRun.status, checkRun.conclusion),
      checkId: String(checkRun.id),
      conclusion: checkRun.conclusion ?? checkRun.status ?? null,
      url: checkRun.html_url ?? null,
      startedAt: checkRun.started_at ?? null,
      completedAt: checkRun.completed_at ?? null,
      logAvailable: false,
    });
  }
  return checks;
}

function pullRequestNodeId(cfg: { baseUrl: string; owner: string; repo: string; token: string }, pullNumber: number): { nodeId: string; response: PullRequestResponse } {
  const response = pullRequest(cfg, pullNumber);
  if (typeof response.node_id !== "string" || !response.node_id) {
    throw new ChangeyardError("PROVIDER_REQUEST_FAILED", `GitHub pull request ${pullNumber} did not include a node_id`);
  }
  return { nodeId: response.node_id, response };
}

function githubLifecyclePrFromGraphql(provider: string, pullNumber: number, payload: unknown, fallbackUrl: string | null, stateFallback: "open" | "closed" | "merged" | "unknown" = "open"): RemotePullRequest {
  const pullRequest = typeof payload === "object" && payload !== null && "pullRequest" in payload
    ? (payload as { pullRequest?: { number?: number; url?: string; isDraft?: boolean; autoMergeRequest?: unknown } }).pullRequest
    : null;
  return {
    provider,
    pullRequestNumber: typeof pullRequest?.number === "number" ? pullRequest.number : pullNumber,
    pullRequestUrl: typeof pullRequest?.url === "string" ? pullRequest.url : fallbackUrl,
    draft: typeof pullRequest?.isDraft === "boolean" ? pullRequest.isDraft : null,
    autoMerge: pullRequest?.autoMergeRequest ? true : null,
    state: stateFallback,
  };
}

function issueComments(cfg: { baseUrl: string; owner: string; repo: string; token: string }, pullNumber: number): IssueCommentResponse[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/issues/${pullNumber}/comments?per_page=100`,
    token: cfg.token,
    tokenScheme: "Bearer",
    payload: {},
    extraHeaders: GITHUB_HEADERS,
  });
  return Array.isArray(response) ? response as IssueCommentResponse[] : [];
}

export class GitHubProvider implements ChangeProvider {
  name = "github";
  constructor(private config: ChangeyardConfig) {}

  capabilities(): ProviderCapabilities {
    return {
      issues: true,
      labels: true,
      pullRequests: true,
      draftPullRequests: true,
      reviews: true,
      comments: true,
      pullRequestChecks: true,
      pullRequestCheckLogs: true,
      pullRequestDetails: true,
      pullRequestUpdates: true,
      branchChecks: true,
      pullRequestDraftState: true,
      pullRequestAutoMerge: true,
      pullRequestTemplates: true,
    };
  }

  syncIssue(input: SyncIssueInput): RemoteIssue {
    const cfg = requireConfig(this.config);
    const existing = typeof input.frontmatter.remote === "object" && input.frontmatter.remote !== null && !Array.isArray(input.frontmatter.remote) ? input.frontmatter.remote.issueNumber : null;
    const method = typeof existing === "number" ? "PATCH" : "POST";
    const url = typeof existing === "number" ? `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/issues/${existing}` : `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/issues`;
    const response = curlJson({ method, url, token: cfg.token, tokenScheme: "Bearer", payload: {
      title: String(input.frontmatter.title ?? input.frontmatter.id ?? "Changeyard change"),
      body: input.body,
      labels: Array.isArray(input.frontmatter.labels) ? input.frontmatter.labels : [],
    }, extraHeaders: GITHUB_HEADERS });
    return { provider: this.name, issueNumber: response.number ?? null, issueUrl: response.html_url ?? response.url ?? null };
  }

  publishReview(input: PublishReviewInput): RemoteReview {
    const cfg = requireConfig(this.config);
    const thread = remoteThreadNumber(input);
    if (thread === null) throw new ChangeyardError("PROVIDER_CONFIG_INVALID", "Cannot publish review without remote issue or pull request number");

    const comments = input.inlineComments ?? [];
    let review: { id?: number | null; html_url?: string | null; url?: string | null };
    let postedInline = false;

    if (comments.length > 0) {
      const pull = pullRequest(cfg, thread);
      const commitId = typeof pull.head?.sha === "string" ? pull.head.sha : undefined;
      if (!commitId) {
        throw new ChangeyardError("REVIEW_COMMENT_INVALID", `Pull request ${thread} is missing head SHA`);
      }
      const files = pullRequestFiles(cfg, thread);

      for (const comment of comments) {
        const position = validateReviewCommentPath(files, comment);
        curlJson({
          method: "POST",
          url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/pulls/${thread}/comments`,
          token: cfg.token,
          tokenScheme: "Bearer",
          payload: {
            body: comment.body,
            path: comment.path,
            side: "RIGHT",
            line: comment.line,
            position,
            commit_id: commitId,
          },
          extraHeaders: GITHUB_HEADERS,
        });
        postedInline = true;
      }
    }

    review = curlJson({
      method: "POST",
      url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/issues/${thread}/comments`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload: {
        body: `Review decision: ${input.decision}\n\n${input.reviewBody}${postedInline ? `\n\n(Posted ${comments.length} inline review comment${comments.length === 1 ? "" : "s"} directly on this pull request.)` : ""}${inlineCommentSummary(input)}`,
      },
      extraHeaders: GITHUB_HEADERS,
    });

    return { provider: this.name, reviewNumber: review.id ?? null, reviewUrl: review.html_url ?? review.url ?? null };
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
    const cfg = requireConfig(this.config);
    const response = curlJson({
      method: "GET",
      url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/pulls?head=${encodeURIComponent(`${cfg.owner}:${input.head}`)}&state=open&per_page=1`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload: {},
      extraHeaders: GITHUB_HEADERS,
    });
    if (!Array.isArray(response) || !response[0]) return null;
    return remotePullRequestFromResponse(response[0] as PullRequestResponse, { head: input.head });
  }

  createBranchPullRequest(input: BranchPullRequestInput): RemotePullRequest {
    const cfg = requireConfig(this.config);
    const response = curlJson({ method: "POST", url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/pulls`, token: cfg.token, tokenScheme: "Bearer", payload: {
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
      draft: input.draft,
    }, extraHeaders: GITHUB_HEADERS });
    return remotePullRequestFromResponse(response as PullRequestResponse, { head: input.head, base: input.base }) ?? {
      provider: this.name,
      pullRequestNumber: null,
      pullRequestUrl: null,
      baseBranch: input.base,
      headBranch: input.head,
      state: "unknown",
    };
  }

  updatePullRequestBase(input: UpdatePullRequestBaseInput): RemotePullRequest {
    const cfg = requireConfig(this.config);
    const response = curlJson({
      method: "PATCH",
      url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/pulls/${input.pullRequestNumber}`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload: { base: input.base },
      extraHeaders: GITHUB_HEADERS,
    });
    return remotePullRequestFromResponse(response as PullRequestResponse, { base: input.base }) ?? {
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestUrl: null,
      baseBranch: input.base,
      state: "unknown",
    };
  }

  getPullRequestDetails(input: PullRequestLifecycleInput): RemotePullRequestDetails {
    const cfg = requireConfig(this.config);
    const response = pullRequest(cfg, input.pullRequestNumber);
    return remotePullRequestDetailsFromResponse(response) ?? {
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestUrl: null,
      title: `Pull request ${input.pullRequestNumber}`,
      body: "",
      state: "unknown",
    };
  }

  updatePullRequestDetails(input: UpdatePullRequestDetailsInput): RemotePullRequestDetails {
    const cfg = requireConfig(this.config);
    const payload: Record<string, string> = {};
    if (input.title !== undefined) payload.title = input.title;
    if (input.body !== undefined) payload.body = input.body;
    const response = curlJson({
      method: "PATCH",
      url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/pulls/${input.pullRequestNumber}`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload,
      extraHeaders: GITHUB_HEADERS,
    });
    return remotePullRequestDetailsFromResponse(response as PullRequestResponse) ?? this.getPullRequestDetails(input);
  }

  setPullRequestDraftState(input: SetPullRequestDraftStateInput): RemotePullRequest {
    const cfg = requireConfig(this.config);
    const { nodeId, response } = pullRequestNodeId(cfg, input.pullRequestNumber);
    const mutationName = input.draft ? "convertPullRequestToDraft" : "markPullRequestReadyForReview";
    const data = curlGraphql({
      url: graphqlUrl(cfg.baseUrl),
      token: cfg.token,
      tokenScheme: "Bearer",
      extraHeaders: GITHUB_HEADERS,
      query: input.draft
        ? `mutation($pullRequestId: ID!) {
            convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) {
              pullRequest { number url isDraft autoMergeRequest { enabledAt } }
            }
          }`
        : `mutation($pullRequestId: ID!) {
            markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
              pullRequest { number url isDraft autoMergeRequest { enabledAt } }
            }
          }`,
      variables: { pullRequestId: nodeId },
    });
    return githubLifecyclePrFromGraphql(this.name, input.pullRequestNumber, data[mutationName], response.html_url ?? response.url ?? null);
  }

  setPullRequestAutoMerge(input: SetPullRequestAutoMergeInput): RemotePullRequestAutoMerge {
    const cfg = requireConfig(this.config);
    const { nodeId, response } = pullRequestNodeId(cfg, input.pullRequestNumber);
    const mutationName = input.enabled ? "enablePullRequestAutoMerge" : "disablePullRequestAutoMerge";
    const data = curlGraphql({
      url: graphqlUrl(cfg.baseUrl),
      token: cfg.token,
      tokenScheme: "Bearer",
      extraHeaders: GITHUB_HEADERS,
      query: input.enabled
        ? `mutation($pullRequestId: ID!) {
            enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId }) {
              pullRequest { number url autoMergeRequest { enabledAt } }
            }
          }`
        : `mutation($pullRequestId: ID!) {
            disablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId }) {
              pullRequest { number url autoMergeRequest { enabledAt } }
            }
          }`,
      variables: { pullRequestId: nodeId },
    });
    const pullRequest = data[mutationName]?.pullRequest as { number?: number; url?: string; autoMergeRequest?: unknown } | undefined;
    return {
      provider: this.name,
      pullRequestNumber: typeof pullRequest?.number === "number" ? pullRequest.number : input.pullRequestNumber,
      pullRequestUrl: typeof pullRequest?.url === "string" ? pullRequest.url : response.html_url ?? response.url ?? null,
      supported: true,
      enabled: input.enabled ? true : Boolean(pullRequest?.autoMergeRequest),
    };
  }

  upsertPullRequestComment(input: UpsertPullRequestCommentInput): RemotePullRequestComment {
    const cfg = requireConfig(this.config);
    const existing = issueComments(cfg, input.pullRequestNumber).find((comment) => comment.body?.includes(input.marker));
    if (existing?.id) {
      const response = curlJson({
        method: "PATCH",
        url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/issues/comments/${existing.id}`,
        token: cfg.token,
        tokenScheme: "Bearer",
        payload: { body: input.body },
        extraHeaders: GITHUB_HEADERS,
      }) as IssueCommentResponse;
      return {
        provider: this.name,
        commentNumber: response.id ?? existing.id,
        commentUrl: response.html_url ?? response.url ?? existing.html_url ?? existing.url ?? null,
        action: "updated",
      };
    }
    const response = curlJson({
      method: "POST",
      url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/issues/${input.pullRequestNumber}/comments`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload: { body: input.body },
      extraHeaders: GITHUB_HEADERS,
    }) as IssueCommentResponse;
    return {
      provider: this.name,
      commentNumber: response.id ?? null,
      commentUrl: response.html_url ?? response.url ?? null,
      action: "created",
    };
  }

  listPullRequestChecks(input: PullRequestChecksInput): RemotePullRequestChecks {
    const cfg = requireConfig(this.config);
    const pull = pullRequest(cfg, input.pullRequestNumber);
    const headSha = pull.head?.sha;
    if (!headSha) {
      const checks: RemotePullRequestCheck[] = [];
      return {
        provider: this.name,
        pullRequestNumber: input.pullRequestNumber,
        supported: true,
        overallState: "unknown",
        summary: summarizeChecks(checks),
        checks,
        message: `GitHub pull request ${input.pullRequestNumber} did not include a head SHA.`,
      };
    }

    const checks = githubChecksForSha(cfg, headSha);

    return {
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      supported: true,
      overallState: overallCheckState(checks),
      summary: summarizeChecks(checks),
      checks,
    };
  }

  listBranchChecks(input: BranchChecksInput): RemoteBranchChecks {
    const cfg = requireConfig(this.config);
    const commit = branchCommit(cfg, input.branch);
    const sha = typeof commit.sha === "string" ? commit.sha : null;
    if (!sha) {
      const checks: RemotePullRequestCheck[] = [];
      return {
        provider: this.name,
        branch: input.branch,
        sha: null,
        supported: true,
        overallState: "unknown",
        summary: summarizeChecks(checks),
        checks,
        message: `GitHub branch ${input.branch} did not resolve to a commit SHA.`,
      };
    }
    const checks = githubChecksForSha(cfg, sha);
    return {
      provider: this.name,
      branch: input.branch,
      sha,
      supported: true,
      overallState: overallCheckState(checks),
      summary: summarizeChecks(checks),
      checks,
      message: checks.length === 0 ? `GitHub branch ${input.branch} has no checks for ${sha}.` : undefined,
    };
  }

  getPullRequestCheckLog(input: PullRequestCheckLogInput): RemoteCheckLog {
    const cfg = requireConfig(this.config);
    if (input.jobId) {
      const content = curlRaw({
        method: "GET",
        url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/actions/jobs/${encodeURIComponent(input.jobId)}/logs`,
        token: cfg.token,
        tokenScheme: "Bearer",
        accept: "text/plain",
        followRedirects: true,
        extraHeaders: GITHUB_HEADERS,
      });
      return {
        provider: this.name,
        supported: true,
        selector: `job:${input.jobId}`,
        fileName: `github-job-${input.jobId}.log`,
        content,
        contentType: "text",
      };
    }
    if (input.runId) {
      const content = curlRaw({
        method: "GET",
        url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/actions/runs/${encodeURIComponent(input.runId)}/logs`,
        token: cfg.token,
        tokenScheme: "Bearer",
        accept: "application/zip",
        followRedirects: true,
        extraHeaders: GITHUB_HEADERS,
      });
      return {
        provider: this.name,
        supported: true,
        selector: `run:${input.runId}`,
        fileName: `github-run-${input.runId}-logs.zip`,
        content,
        contentType: "archive",
      };
    }
    throw new ChangeyardError("PROVIDER_CONFIG_INVALID", "GitHub check log retrieval requires --job <job-id> or --run <run-id>.");
  }
}
