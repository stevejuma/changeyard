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

type PullRequestFile = {
  filename?: string;
  patch?: string;
  path?: string;
};

type PullRequestResponse = {
  number?: number;
  html_url?: string;
  url?: string;
  base?: {
    ref?: string;
    name?: string;
  };
  state?: string;
  merged?: boolean;
  merged_at?: string | null;
  head?: {
    sha?: string;
  };
};

type IssueCommentResponse = {
  id?: number;
  html_url?: string;
  url?: string;
  body?: string;
};

function requireConfig(config: ChangeyardConfig): { baseUrl: string; owner: string; repo: string; token: string } {
  const tokenEnv = config.provider.auth?.tokenEnv ?? "FORGE_TOKEN";
  const token = process.env[tokenEnv];
  if (!config.provider.baseUrl || !config.provider.owner || !config.provider.repo || !token) {
    throw new ChangeyardError("PROVIDER_CONFIG_INVALID", `Forgejo provider requires baseUrl, owner, repo, and ${tokenEnv}`);
  }
  return { baseUrl: config.provider.baseUrl.replace(/\/$/, ""), owner: config.provider.owner, repo: config.provider.repo, token };
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

function pullRequestFiles(cfg: { baseUrl: string; owner: string; repo: string; token: string }, pullNumber: number): PullRequestFile[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/pulls/${pullNumber}/files`,
    token: cfg.token,
    tokenScheme: "token",
    payload: {},
  });
  return Array.isArray(response) ? response as PullRequestFile[] : [];
}

function pullRequest(cfg: { baseUrl: string; owner: string; repo: string; token: string }, pullNumber: number): PullRequestResponse {
  return curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/pulls/${pullNumber}`,
    token: cfg.token,
    tokenScheme: "token",
    payload: {},
  });
}

function remotePullRequestFromResponse(response: PullRequestResponse, fallback?: { head?: string; base?: string }): RemotePullRequest | null {
  if (typeof response.number !== "number") return null;
  const baseBranch = typeof response.base?.ref === "string" ? response.base.ref : typeof response.base?.name === "string" ? response.base.name : fallback?.base ?? null;
  return {
    provider: "forgejo",
    pullRequestNumber: response.number,
    pullRequestUrl: typeof response.html_url === "string" ? response.html_url : typeof response.url === "string" ? response.url : null,
    baseBranch,
    headBranch: fallback?.head ?? null,
    state: response.merged || response.merged_at ? "merged" : response.state === "closed" ? "closed" : response.state === "open" || fallback ? "open" : "unknown",
  };
}

function issueComments(cfg: { baseUrl: string; owner: string; repo: string; token: string }, pullNumber: number): IssueCommentResponse[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/issues/${pullNumber}/comments`,
    token: cfg.token,
    tokenScheme: "token",
    payload: {},
  });
  return Array.isArray(response) ? response as IssueCommentResponse[] : [];
}

export class ForgejoProvider implements ChangeProvider {
  name = "forgejo";
  constructor(private config: ChangeyardConfig) {}

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
      pullRequestDraftState: false,
      pullRequestAutoMerge: false,
      pullRequestTemplates: false,
    };
  }

  syncIssue(input: SyncIssueInput): RemoteIssue {
    const cfg = requireConfig(this.config);
    const existing = typeof input.frontmatter.remote === "object" && input.frontmatter.remote !== null && !Array.isArray(input.frontmatter.remote) ? input.frontmatter.remote.issueNumber : null;
    const method = typeof existing === "number" ? "PATCH" : "POST";
    const url = typeof existing === "number" ? `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/issues/${existing}` : `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/issues`;
    const response = curlJson({ method, url, token: cfg.token, tokenScheme: "token", payload: {
      title: String(input.frontmatter.title ?? input.frontmatter.id ?? "Changeyard change"),
      body: input.body,
      labels: Array.isArray(input.frontmatter.labels) ? input.frontmatter.labels : [],
    } });
    return { provider: this.name, issueNumber: response.number ?? null, issueUrl: response.html_url ?? response.url ?? null };
  }

  publishReview(input: PublishReviewInput): RemoteReview {
    const cfg = requireConfig(this.config);
    const thread = remoteThreadNumber(input);
    if (thread === null) throw new ChangeyardError("PROVIDER_CONFIG_INVALID", "Cannot publish review without remote issue or pull request number");

    const comments = input.inlineComments ?? [];
    let postedInline = false;
    if (comments.length > 0) {
      const pr = pullRequest(cfg, thread);
      const files = pullRequestFiles(cfg, thread);
      const commitId = typeof pr.head?.sha === "string" ? pr.head.sha : undefined;
      try {
        for (const comment of comments) {
          const position = validateReviewCommentPath(files, comment);
          curlJson({
            method: "POST",
            url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/pulls/${thread}/comments`,
            token: cfg.token,
            tokenScheme: "token",
            payload: {
              body: comment.body,
              path: comment.path,
              line: comment.line,
              side: "RIGHT",
              ...(position ? { position } : {}),
              ...(commitId ? { commit_id: commitId } : {}),
            },
          });
          postedInline = true;
        }
      } catch (error) {
        // Best effort native inline support. Keep backward-compatible summary behavior for older Forgejo versions.
        if (!(error instanceof Error && error.message.includes("not part of the current diff"))) throw error;
        postedInline = false;
      }
    }

    const response = curlJson({
      method: "POST",
      url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/issues/${thread}/comments`,
      token: cfg.token,
      tokenScheme: "token",
      payload: {
        body: `Review decision: ${input.decision}\n\n${input.reviewBody}${inlineCommentSummary(input)}${postedInline ? `\n\n(Posted ${comments.length} inline comment${comments.length === 1 ? "" : "s"} directly on this pull request.)` : ""}`,
      },
    });

    return { provider: this.name, reviewNumber: response.id ?? null, reviewUrl: response.html_url ?? response.url ?? null };
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
      url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/pulls?state=open&head=${encodeURIComponent(input.head)}&limit=1`,
      token: cfg.token,
      tokenScheme: "token",
      payload: {},
    });
    if (!Array.isArray(response) || !response[0]) return null;
    return remotePullRequestFromResponse(response[0] as PullRequestResponse, { head: input.head });
  }

  createBranchPullRequest(input: BranchPullRequestInput): RemotePullRequest {
    const cfg = requireConfig(this.config);
    const response = curlJson({
      method: "POST",
      url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/pulls`, token: cfg.token, tokenScheme: "token", payload: {
        title: input.title,
        body: input.body,
        head: input.head,
        base: input.base,
        draft: input.draft,
      } });
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
      url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/pulls/${input.pullRequestNumber}`,
      token: cfg.token,
      tokenScheme: "token",
      payload: { base: input.base },
    });
    return remotePullRequestFromResponse(response as PullRequestResponse, { base: input.base }) ?? {
      provider: this.name,
      pullRequestNumber: input.pullRequestNumber,
      pullRequestUrl: null,
      baseBranch: input.base,
      state: "unknown",
    };
  }

  upsertPullRequestComment(input: UpsertPullRequestCommentInput): RemotePullRequestComment {
    const cfg = requireConfig(this.config);
    const existing = issueComments(cfg, input.pullRequestNumber).find((comment) => comment.body?.includes(input.marker));
    if (existing?.id) {
      const response = curlJson({
        method: "PATCH",
        url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/issues/comments/${existing.id}`,
        token: cfg.token,
        tokenScheme: "token",
        payload: { body: input.body },
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
      url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/issues/${input.pullRequestNumber}/comments`,
      token: cfg.token,
      tokenScheme: "token",
      payload: { body: input.body },
    }) as IssueCommentResponse;
    return {
      provider: this.name,
      commentNumber: response.id ?? null,
      commentUrl: response.html_url ?? response.url ?? null,
      action: "created",
    };
  }
}
