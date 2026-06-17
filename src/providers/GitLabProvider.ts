import type { ChangeyardConfig } from "../types.js";
import { ChangeyardError } from "../errors.js";
import type {
  BranchPullRequestInput,
  ChangeProvider,
  CreatePullRequestInput,
  FindOpenPullRequestByHeadInput,
  ProviderCapabilities,
  PublishReviewInput,
  RemoteIssue,
  RemotePullRequest,
  RemotePullRequestComment,
  RemoteReview,
  SyncIssueInput,
  UpdatePullRequestBaseInput,
  UpsertPullRequestCommentInput,
} from "./ChangeProvider.js";
import { curlJson } from "./http.js";
import { validateReviewCommentPath } from "./reviewHelpers.js";

type MergeRequestResponse = {
  iid?: number;
  id?: number;
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

function encodeProject(owner: string, repo: string): string {
  return encodeURIComponent(`${owner}/${repo}`);
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
    state: response.merged_at ? "merged" : response.state === "closed" ? "closed" : response.state === "opened" || fallback ? "open" : "unknown",
  };
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
    return { issues: true, labels: true, pullRequests: true, draftPullRequests: true, reviews: true, comments: true };
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
}
