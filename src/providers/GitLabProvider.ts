import type { ChangeyardConfig } from "../types.js";
import { ChangeyardError } from "../errors.js";
import type {
  BranchPullRequestInput,
  ChangeProvider,
  CreatePullRequestInput,
  FindOpenPullRequestByHeadInput,
  PullRequestCheckLogInput,
  PullRequestChecksInput,
  ProviderCapabilities,
  PublishReviewInput,
  RemoteCheckLog,
  RemoteCheckState,
  RemoteCheckSummary,
  RemoteIssue,
  RemotePullRequest,
  RemotePullRequestAutoMerge,
  RemotePullRequestCheck,
  RemotePullRequestChecks,
  RemotePullRequestComment,
  RemoteReview,
  SetPullRequestAutoMergeInput,
  SetPullRequestDraftStateInput,
  SyncIssueInput,
  UpdatePullRequestBaseInput,
  UpsertPullRequestCommentInput,
} from "./ChangeProvider.js";
import { curlJson, curlRaw } from "./http.js";
import { validateReviewCommentPath } from "./reviewHelpers.js";

type MergeRequestResponse = {
  iid?: number;
  id?: number;
  title?: string;
  web_url?: string;
  source_branch?: string;
  target_branch?: string;
  state?: string;
  merged_at?: string | null;
  head_pipeline?: {
    sha?: string;
  };
  sha?: string;
  diff_refs?: {
    base_sha?: string;
    head_sha?: string;
    start_sha?: string;
  };
};

type MergeRequestDiffFile = {
  old_path?: string;
  new_path?: string;
  diff?: string;
  oldPath?: string;
  newPath?: string;
  patch?: string;
};

type MergeRequestNoteResponse = {
  id?: number;
  web_url?: string;
  body?: string;
};

type PipelineResponse = {
  id?: number;
  status?: string;
  web_url?: string;
  created_at?: string;
  updated_at?: string;
};

type PipelineJobResponse = {
  id?: number;
  name?: string;
  status?: string;
  web_url?: string;
  started_at?: string | null;
  finished_at?: string | null;
  pipeline?: {
    id?: number;
  };
};

function encodeProject(owner: string, repo: string): string {
  return encodeURIComponent(`${owner}/${repo}`);
}

function gitlabCheckState(status: string | undefined): RemoteCheckState {
  if (status === "success") return "passed";
  if (status === "failed") return "failed";
  if (status === "canceled") return "cancelled";
  if (status === "skipped") return "skipped";
  if (["created", "waiting_for_resource", "preparing", "pending", "running", "manual", "scheduled"].includes(status ?? "")) return "pending";
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
  const tokenEnv = config.provider.auth?.tokenEnv ?? "GITLAB_TOKEN";
  const token = process.env[tokenEnv];
  if (!config.provider.owner || !config.provider.repo || !token) {
    throw new ChangeyardError("PROVIDER_CONFIG_INVALID", `GitLab provider requires owner, repo, and ${tokenEnv}`);
  }
  return { baseUrl: (config.provider.baseUrl ?? "https://gitlab.com").replace(/\/$/, ""), owner: config.provider.owner, repo: config.provider.repo, token };
}

function inlineCommentSummary(input: PublishReviewInput): string {
  const comments = input.inlineComments ?? [];
  if (!comments.length) return "";
  return `\n\nInline comments:\n${comments.map((comment) => `- ${comment.path}:${comment.line}: ${comment.body}`).join("\n")}`;
}

function remoteThread(input: PublishReviewInput): { kind: "merge_requests" | "issues"; number: number } | null {
  const remote = typeof input.frontmatter.remote === "object" && input.frontmatter.remote !== null && !Array.isArray(input.frontmatter.remote) ? input.frontmatter.remote : {};
  const pr = remote.pullRequestNumber;
  const issue = remote.issueNumber;
  if (typeof pr === "number") return { kind: "merge_requests", number: pr };
  if (typeof issue === "number") return { kind: "issues", number: issue };
  return null;
}

function mergeRequest(cfg: { baseUrl: string; owner: string; repo: string; token: string }, mergeRequestNumber: number): MergeRequestResponse {
  return curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${mergeRequestNumber}`,
    token: cfg.token,
    tokenScheme: "Bearer",
    payload: {},
  });
}

function mergeRequestPipelines(cfg: { baseUrl: string; owner: string; repo: string; token: string }, mergeRequestNumber: number): PipelineResponse[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${mergeRequestNumber}/pipelines?per_page=100`,
    token: cfg.token,
    tokenScheme: "Bearer",
  });
  return Array.isArray(response) ? response as PipelineResponse[] : [];
}

function pipelineJobs(cfg: { baseUrl: string; owner: string; repo: string; token: string }, pipelineId: number): PipelineJobResponse[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/pipelines/${pipelineId}/jobs?per_page=100`,
    token: cfg.token,
    tokenScheme: "Bearer",
  });
  return Array.isArray(response) ? response as PipelineJobResponse[] : [];
}

function mergeRequestDiffs(cfg: { baseUrl: string; owner: string; repo: string; token: string }, mergeRequestNumber: number): MergeRequestDiffFile[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${mergeRequestNumber}/changes`,
    token: cfg.token,
    tokenScheme: "Bearer",
    payload: {},
  });
  const changes = (response as { changes?: unknown }).changes;
  return Array.isArray(changes)
    ? (changes as MergeRequestDiffFile[]).map((file) => ({
        ...file,
        oldPath: file.old_path,
        newPath: file.new_path,
        patch: file.diff,
      }))
    : [];
}

function remotePullRequestFromMergeRequest(response: MergeRequestResponse, fallback?: { head?: string; base?: string }): RemotePullRequest | null {
  const number = typeof response.iid === "number" ? response.iid : typeof response.id === "number" ? response.id : null;
  if (number === null) return null;
  return {
    provider: "gitlab",
    pullRequestNumber: number,
    pullRequestUrl: response.web_url ?? null,
    baseBranch: response.target_branch ?? fallback?.base ?? null,
    headBranch: response.source_branch ?? fallback?.head ?? null,
    draft: typeof response.title === "string" ? /^(Draft|WIP):\s*/iu.test(response.title) : null,
    state: response.merged_at ? "merged" : response.state === "closed" ? "closed" : response.state === "opened" || fallback ? "open" : "unknown",
  };
}

function draftTitle(title: string, draft: boolean): string {
  const readyTitle = title.replace(/^(Draft|WIP):\s*/iu, "").trim();
  return draft ? `Draft: ${readyTitle || title}` : readyTitle || title;
}

function mergeRequestNotes(cfg: { baseUrl: string; owner: string; repo: string; token: string }, mergeRequestNumber: number): MergeRequestNoteResponse[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${mergeRequestNumber}/notes?per_page=100`,
    token: cfg.token,
    tokenScheme: "Bearer",
    payload: {},
  });
  return Array.isArray(response) ? response as MergeRequestNoteResponse[] : [];
}

export class GitLabProvider implements ChangeProvider {
  name = "gitlab";
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
      pullRequestDraftState: true,
      pullRequestAutoMerge: true,
      pullRequestTemplates: true,
    };
  }

  syncIssue(input: SyncIssueInput): RemoteIssue {
    const cfg = requireConfig(this.config);
    const existing = typeof input.frontmatter.remote === "object" && input.frontmatter.remote !== null && !Array.isArray(input.frontmatter.remote) ? input.frontmatter.remote.issueNumber : null;
    const method = typeof existing === "number" ? "PUT" : "POST";
    const url = typeof existing === "number" ? `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/issues/${existing}` : `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/issues`;
    const response = curlJson({ method, url, token: cfg.token, tokenScheme: "Bearer", payload: {
      title: String(input.frontmatter.title ?? input.frontmatter.id ?? "Changeyard change"),
      description: input.body,
      labels: Array.isArray(input.frontmatter.labels) ? input.frontmatter.labels.join(",") : undefined,
    } });
    return { provider: this.name, issueNumber: response.iid ?? response.id ?? null, issueUrl: response.web_url ?? null };
  }

  publishReview(input: PublishReviewInput): RemoteReview {
    const cfg = requireConfig(this.config);
    const thread = remoteThread(input);
    if (thread === null) throw new ChangeyardError("PROVIDER_CONFIG_INVALID", "Cannot publish review without remote issue or merge request number");

    if (thread.kind !== "merge_requests") {
      const response = curlJson({
        method: "POST",
        url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/issues/${thread.number}/notes`,
        token: cfg.token,
        tokenScheme: "Bearer",
        payload: {
          body: `Review decision: ${input.decision}\n\n${input.reviewBody}${inlineCommentSummary(input)}`,
        },
      });
      return { provider: this.name, reviewNumber: response.id ?? null, reviewUrl: response.web_url ?? null };
    }

    const comments = input.inlineComments ?? [];
    const changed = mergeRequestDiffs(cfg, thread.number);
    const mr = mergeRequest(cfg, thread.number);
    const diffRefs = mr.diff_refs;
    if (typeof diffRefs?.base_sha !== "string" || typeof diffRefs.head_sha !== "string" || typeof diffRefs.start_sha !== "string") {
      throw new ChangeyardError("REVIEW_COMMENT_INVALID", "Merge request diff refs are missing required SHAs");
    }

    for (const comment of comments) {
      const position = validateReviewCommentPath(changed, comment);
      const matching = changed.find((file) => file.new_path === comment.path || file.old_path === comment.path);
      const positionPayload = {
        position_type: "text",
        base_sha: diffRefs.base_sha,
        start_sha: diffRefs.start_sha,
        head_sha: diffRefs.head_sha,
        old_path: matching?.old_path ?? comment.path,
        new_path: matching?.new_path ?? comment.path,
        new_line: comment.line,
      };
      curlJson({
        method: "POST",
        url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${thread.number}/discussions`,
        token: cfg.token,
        tokenScheme: "Bearer",
        payload: {
          body: comment.body,
          position: positionPayload,
        },
      });
    }

    const response = curlJson({
      method: "POST",
      url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${thread.number}/notes`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload: {
        body: `Review decision: ${input.decision}\n\n${input.reviewBody}${inlineCommentSummary(input)}${comments.length ? `\n\n(Posted ${comments.length} inline comment${comments.length === 1 ? "" : "s"} directly on this merge request.)` : ""}`,
      },
    });

    return { provider: this.name, reviewNumber: response.id ?? null, reviewUrl: response.web_url ?? null };
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
      url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests?source_branch=${encodeURIComponent(input.head)}&state=opened&per_page=1`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload: {},
    });
    if (!Array.isArray(response) || !response[0]) return null;
    return remotePullRequestFromMergeRequest(response[0] as MergeRequestResponse, { head: input.head });
  }

  createBranchPullRequest(input: BranchPullRequestInput): RemotePullRequest {
    const cfg = requireConfig(this.config);
    const response = curlJson({ method: "POST", url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests`, token: cfg.token, tokenScheme: "Bearer", payload: {
      title: input.draft ? `Draft: ${input.title}` : input.title,
      description: input.body,
      source_branch: input.head,
      target_branch: input.base,
    } });
    return remotePullRequestFromMergeRequest(response as MergeRequestResponse, { head: input.head, base: input.base }) ?? {
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
      method: "PUT",
      url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${input.pullRequestNumber}`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload: { target_branch: input.base },
    });
    return remotePullRequestFromMergeRequest(response as MergeRequestResponse, { base: input.base }) ?? {
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestUrl: null,
      baseBranch: input.base,
      state: "unknown",
    };
  }

  setPullRequestDraftState(input: SetPullRequestDraftStateInput): RemotePullRequest {
    const cfg = requireConfig(this.config);
    const current = mergeRequest(cfg, input.pullRequestNumber);
    const currentTitle = typeof current.title === "string" ? current.title : `Merge request ${input.pullRequestNumber}`;
    const response = curlJson({
      method: "PUT",
      url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${input.pullRequestNumber}`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload: { title: draftTitle(currentTitle, input.draft) },
    });
    return remotePullRequestFromMergeRequest(response as MergeRequestResponse) ?? {
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestUrl: current.web_url ?? null,
      draft: input.draft,
      state: "open",
    };
  }

  setPullRequestAutoMerge(input: SetPullRequestAutoMergeInput): RemotePullRequestAutoMerge {
    const cfg = requireConfig(this.config);
    if (!input.enabled) {
      const current = mergeRequest(cfg, input.pullRequestNumber);
      return {
        provider: this.name,
        pullRequestNumber: input.pullRequestNumber,
        pullRequestUrl: current.web_url ?? null,
        supported: false,
        enabled: false,
        message: "GitLab auto-merge disable is not supported by Changeyard v1; disable it in GitLab if needed.",
      };
    }
    const response = curlJson({
      method: "PUT",
      url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${input.pullRequestNumber}/merge`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload: { auto_merge: true },
    }) as MergeRequestResponse;
    return {
      provider: this.name,
      pullRequestNumber: response.iid ?? input.pullRequestNumber,
      pullRequestUrl: response.web_url ?? null,
      supported: true,
      enabled: true,
    };
  }

  upsertPullRequestComment(input: UpsertPullRequestCommentInput): RemotePullRequestComment {
    const cfg = requireConfig(this.config);
    const existing = mergeRequestNotes(cfg, input.pullRequestNumber).find((note) => note.body?.includes(input.marker));
    if (existing?.id) {
      const response = curlJson({
        method: "PUT",
        url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${input.pullRequestNumber}/notes/${existing.id}`,
        token: cfg.token,
        tokenScheme: "Bearer",
        payload: { body: input.body },
      }) as MergeRequestNoteResponse;
      return {
        provider: this.name,
        commentNumber: response.id ?? existing.id,
        commentUrl: response.web_url ?? existing.web_url ?? null,
        action: "updated",
      };
    }
    const response = curlJson({
      method: "POST",
      url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/merge_requests/${input.pullRequestNumber}/notes`,
      token: cfg.token,
      tokenScheme: "Bearer",
      payload: { body: input.body },
    }) as MergeRequestNoteResponse;
    return {
      provider: this.name,
      commentNumber: response.id ?? null,
      commentUrl: response.web_url ?? null,
      action: "created",
    };
  }

  listPullRequestChecks(input: PullRequestChecksInput): RemotePullRequestChecks {
    const cfg = requireConfig(this.config);
    const checks: RemotePullRequestCheck[] = [];
    for (const pipeline of mergeRequestPipelines(cfg, input.pullRequestNumber)) {
      if (typeof pipeline.id !== "number") continue;
      const jobs = pipelineJobs(cfg, pipeline.id);
      if (jobs.length === 0) {
        checks.push({
          provider: this.name,
          id: `run:${pipeline.id}`,
          name: `GitLab pipeline ${pipeline.id}`,
          kind: "run",
          state: gitlabCheckState(pipeline.status),
          runId: String(pipeline.id),
          conclusion: pipeline.status ?? null,
          url: pipeline.web_url ?? null,
          startedAt: pipeline.created_at ?? null,
          completedAt: pipeline.updated_at ?? null,
          logAvailable: false,
        });
        continue;
      }
      for (const job of jobs) {
        if (typeof job.id !== "number") continue;
        checks.push({
          provider: this.name,
          id: `job:${job.id}`,
          name: job.name ?? `GitLab job ${job.id}`,
          kind: "job",
          state: gitlabCheckState(job.status),
          runId: String(job.pipeline?.id ?? pipeline.id),
          jobId: String(job.id),
          conclusion: job.status ?? null,
          url: job.web_url ?? null,
          startedAt: job.started_at ?? null,
          completedAt: job.finished_at ?? null,
          logAvailable: true,
        });
      }
    }
    return {
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      supported: true,
      overallState: overallCheckState(checks),
      summary: summarizeChecks(checks),
      checks,
      message: checks.length === 0 ? `GitLab merge request ${input.pullRequestNumber} has no pipelines yet.` : undefined,
    };
  }

  getPullRequestCheckLog(input: PullRequestCheckLogInput): RemoteCheckLog {
    const cfg = requireConfig(this.config);
    if (!input.jobId) {
      throw new ChangeyardError("PROVIDER_CONFIG_INVALID", "GitLab check log retrieval requires --job <job-id>.");
    }
    const content = curlRaw({
      method: "GET",
      url: `${cfg.baseUrl}/api/v4/projects/${encodeProject(cfg.owner, cfg.repo)}/jobs/${encodeURIComponent(input.jobId)}/trace`,
      token: cfg.token,
      tokenScheme: "Bearer",
      accept: "text/plain",
    });
    return {
      provider: this.name,
      supported: true,
      selector: `job:${input.jobId}`,
      fileName: `gitlab-job-${input.jobId}.log`,
      content,
      contentType: "text",
    };
  }
}
