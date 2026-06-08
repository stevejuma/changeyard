import type { ChangeyardConfig } from "../types.js";
import { ChangeyardError } from "../errors.js";
import type { ChangeProvider, CreatePullRequestInput, ProviderCapabilities, PublishReviewInput, RemoteIssue, RemotePullRequest, RemoteReview, SyncIssueInput } from "./ChangeProvider.js";
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
  head?: {
    sha?: string;
  };
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

export class ForgejoProvider implements ChangeProvider {
  name = "forgejo";
  constructor(private config: ChangeyardConfig) {}

  capabilities(): ProviderCapabilities {
    return { issues: true, labels: true, pullRequests: true, draftPullRequests: true, reviews: true, comments: true };
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
    const cfg = requireConfig(this.config);
    const response = curlJson({
      method: "POST",
      url: `${cfg.baseUrl}/api/v1/repos/${cfg.owner}/${cfg.repo}/pulls`, token: cfg.token, tokenScheme: "token", payload: {
        title: input.title,
        body: input.body,
        head: input.branch,
        base: input.base,
        draft: input.draft,
      } });
    return { provider: this.name, pullRequestNumber: response.number ?? null, pullRequestUrl: response.html_url ?? response.url ?? null };
  }
}
