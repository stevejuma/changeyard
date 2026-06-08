import type { ChangeyardConfig } from "../types.js";
import { ChangeyardError } from "../errors.js";
import type { ChangeProvider, CreatePullRequestInput, ProviderCapabilities, PublishReviewInput, RemoteIssue, RemotePullRequest, RemoteReview, SyncIssueInput } from "./ChangeProvider.js";
import { curlJson } from "./http.js";
import { validateReviewCommentPath } from "./reviewHelpers.js";

type PullRequestResponse = {
  number?: number;
  html_url?: string;
  url?: string;
  head?: {
    sha?: string;
  };
};

type PullRequestListFile = {
  filename?: string;
  patch?: string;
};

function requireConfig(config: ChangeyardConfig): { baseUrl: string; owner: string; repo: string; token: string } {
  const tokenEnv = config.provider.auth?.tokenEnv ?? "GITHUB_TOKEN";
  const token = process.env[tokenEnv];
  if (!config.provider.owner || !config.provider.repo || !token) {
    throw new ChangeyardError("PROVIDER_CONFIG_INVALID", `GitHub provider requires owner, repo, and ${tokenEnv}`);
  }
  return { baseUrl: (config.provider.baseUrl ?? "https://api.github.com").replace(/\/$/, ""), owner: config.provider.owner, repo: config.provider.repo, token };
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
    extraHeaders: ["Accept: application/vnd.github+json", "X-GitHub-Api-Version: 2022-11-28"],
  });
}

function pullRequestFiles(cfg: { baseUrl: string; owner: string; repo: string; token: string }, pullNumber: number): PullRequestListFile[] {
  const response = curlJson({
    method: "GET",
    url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/pulls/${pullNumber}/files?per_page=100`,
    token: cfg.token,
    tokenScheme: "Bearer",
    payload: {},
    extraHeaders: ["Accept: application/vnd.github+json", "X-GitHub-Api-Version: 2022-11-28"],
  });
  return Array.isArray(response) ? response as PullRequestListFile[] : [];
}

export class GitHubProvider implements ChangeProvider {
  name = "github";
  constructor(private config: ChangeyardConfig) {}

  capabilities(): ProviderCapabilities {
    return { issues: true, labels: true, pullRequests: true, draftPullRequests: true, reviews: true, comments: true };
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
    }, extraHeaders: ["Accept: application/vnd.github+json", "X-GitHub-Api-Version: 2022-11-28"] });
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
          extraHeaders: ["Accept: application/vnd.github+json", "X-GitHub-Api-Version: 2022-11-28"],
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
      extraHeaders: ["Accept: application/vnd.github+json", "X-GitHub-Api-Version: 2022-11-28"],
    });

    return { provider: this.name, reviewNumber: review.id ?? null, reviewUrl: review.html_url ?? review.url ?? null };
  }

  createPullRequest(input: CreatePullRequestInput): RemotePullRequest {
    const cfg = requireConfig(this.config);
    const response = curlJson({ method: "POST", url: `${cfg.baseUrl}/repos/${cfg.owner}/${cfg.repo}/pulls`, token: cfg.token, tokenScheme: "Bearer", payload: {
      title: input.title,
      body: input.body,
      head: input.branch,
      base: input.base,
      draft: input.draft,
    }, extraHeaders: ["Accept: application/vnd.github+json", "X-GitHub-Api-Version: 2022-11-28"] });
    return { provider: this.name, pullRequestNumber: response.number ?? null, pullRequestUrl: response.html_url ?? response.url ?? null };
  }
}
