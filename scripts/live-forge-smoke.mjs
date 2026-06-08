#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cliPath = path.join(projectRoot, "dist/src/cli.js");
const releaseNotesPath = path.join(projectRoot, "docs/release-notes.md");

const providers = {
  github: {
    type: "github",
    envToken: "GITHUB_TOKEN",
    envOwner: "GITHUB_OWNER",
    envRepo: "GITHUB_REPO",
    apiRoot: "https://api.github.com",
    cloneUrl: (owner, repo, token) => `https://x-access-token:${token}@github.com/${owner}/${repo}.git`,
    remoteIssueApi: (owner, repo, num) => `https://api.github.com/repos/${owner}/${repo}/issues/${num}`,
    remotePrApi: (owner, repo, num) => `https://api.github.com/repos/${owner}/${repo}/pulls/${num}`,
    expectedIssue: (owner, repo, num) => `https://github.com/${owner}/${repo}/issues/${num}`,
    expectedPr: (owner, repo, num) => `https://github.com/${owner}/${repo}/pull/${num}`,
    headers: (token) => [
      [`Authorization`, `Bearer ${token}`],
      ["X-GitHub-Api-Version", "2022-11-28"],
      ["Accept", "application/vnd.github+json"],
    ],
  },
  gitlab: {
    type: "gitlab",
    envToken: "GITLAB_TOKEN",
    envOwner: "GITLAB_OWNER",
    envRepo: "GITLAB_REPO",
    apiRoot: "https://gitlab.com",
    cloneUrl: (owner, repo, token) => `https://oauth2:${token}@gitlab.com/${owner}/${repo}.git`,
    remoteIssueApi: (owner, repo, num) => `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}/issues/${num}`,
    remotePrApi: (owner, repo, num) => `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}/merge_requests/${num}`,
    expectedIssue: (owner, repo, num) => `https://gitlab.com/${owner}/${repo}/-/issues/${num}`,
    expectedPr: (owner, repo, num) => `https://gitlab.com/${owner}/${repo}/-/merge_requests/${num}`,
    headers: (token) => [["Authorization", `Bearer ${token}`]],
  },
  forgejo: {
    type: "forgejo",
    envToken: "FORGE_TOKEN",
    envOwner: "FORGEJO_OWNER",
    envRepo: "FORGEJO_REPO",
    envBase: "FORGEJO_BASE_URL",
    apiRoot: "{base}/api/v1",
    cloneUrl: (owner, repo, token, base) => `https://forgejo:${token}@${base.replace(/\/$/, "")}/${owner}/${repo}.git`,
    remoteIssueApi: (owner, repo, num, base) => `${base}/api/v1/repos/${owner}/${repo}/issues/${num}`,
    remotePrApi: (owner, repo, num, base) => `${base}/api/v1/repos/${owner}/${repo}/pulls/${num}`,
    expectedIssue: (owner, repo, num, base) => `${base}/${owner}/${repo}/issues/${num}`,
    expectedPr: (owner, repo, num, base) => `${base}/${owner}/${repo}/pulls/${num}`,
    headers: (token) => [["Authorization", `token ${token}`]],
  },
};

const tokenScopeRequirements = {
  github: {
    required: ["repo", "read:user", "user:email"],
    label: "GitHub token with read/write repo and identity",
  },
  gitlab: {
    required: ["api"],
    label: "GitLab API scope (single `api` scope)",
  },
  forgejo: {
    required: ["write:issue", "write:repository"],
    label: "Forgejo repository and issue write access",
  },
};

function parseScopeList(headers) {
  const text = String(headers || "").toLowerCase();
  const oauth = /x-oauth-scopes:\s*(.+)/.exec(text);
  const readScope = /x-accepts-scopes:\s*(.+)/.exec(text);
  const xReadscope = /x-readscope:\s*(.+)/.exec(text);
  const values = [];
  if (oauth && oauth[1]) values.push(...oauth[1].split(",").map((entry) => entry.trim()).filter(Boolean));
  if (readScope && readScope[1]) values.push(...readScope[1].split(",").map((entry) => entry.trim()).filter(Boolean));
  if (xReadscope && xReadscope[1]) values.push(...xReadscope[1].split(",").map((entry) => entry.trim()).filter(Boolean));
  return Array.from(new Set(values));
}

function hasMinimumScopes(headers, profileType) {
  const requirements = tokenScopeRequirements[profileType];
  if (!requirements) return true;
  const scopes = parseScopeList(headers);
  if (!scopes.length) return null;
  const missing = requirements.required.filter((scope) => !scopes.includes(scope.toLowerCase()));
  return missing.length === 0 ? true : missing;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", env: process.env, shell: false });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "");
    throw new Error(`${command} ${args.join(" ")} failed: ${detail.trim() || "command failed"}`);
  }
  return (result.stdout || "").trim();
}

function runCli(cwd, ...args) {
  return run(process.execPath, [cliPath, ...args], cwd);
}

function requestJson(method, url, token, headers, payload) {
  const headerList = [
    ["Accept", "application/json"],
    ["Content-Type", "application/json"],
    ...headers,
  ];
  const curlArgs = ["-sS", "-X", method, "-w", "\n%{http_code}"];
  for (const [name, value] of headerList) {
    curlArgs.push("-H", `${name}: ${value}`);
  }
  if (payload !== undefined) curlArgs.push("-d", JSON.stringify(payload));
  curlArgs.push(url);

  const result = spawnSync("curl", curlArgs, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`curl failed for ${url}`);
  const output = `${result.stdout || ""}`;
  const split = output.lastIndexOf("\n");
  const body = split === -1 ? output : output.slice(0, split);
  const status = Number(split === -1 ? "0" : output.slice(split + 1).trim());
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status} for ${url}`);
  }
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function setNested(target, keys, value) {
  let current = target;
  for (const key of keys.slice(0, -1)) {
    const existing = current[key];
    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end === -1) return {};

  const raw = text.slice(4, end).replace(/\r\n/g, "\n");
  const frontmatter = {};
  const stack = [{ indent: -1, path: [] }];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const indent = line.match(/^ */)?.[0].length ?? 0;
    const trimmed = line.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].path;

    if (trimmed.startsWith("- ")) {
      const listPath = stack[stack.length - 1].path;
      const existing = pathValue(frontmatter, listPath);
      const item = parseScalar(trimmed.slice(2));
      if (Array.isArray(existing)) {
        existing.push(item);
      } else if (listPath.length > 0) {
        setNested(frontmatter, listPath, [item]);
      }
      continue;
    }

    const match = /^([^:]+):(.*)$/.exec(trimmed);
    if (!match) continue;

    const key = match[1].trim();
    const value = match[2];
    const keys = [...parent, key];

    if (value.trim() === "") {
      setNested(frontmatter, keys, {});
      stack.push({ indent, path: keys });
    } else {
      setNested(frontmatter, keys, parseScalar(value));
    }
  }

  return frontmatter;
}

function pathValue(root, keys) {
  if (!keys.length) return root;
  let current = root;
  for (const key of keys) {
    current = current[key];
  }
  return current;
}

function normalizeRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseIdFromChangeCreate(output) {
  const match = /CY-[0-9]+/.exec(output);
  if (!match) throw new Error(`Could not determine change id from: ${output}`);
  return match[0];
}

function latestReviewPath(root) {
  const files = readdirSync(root).filter((entry) => /^review-\d+\.md$/.test(entry));
  files.sort();
  if (!files.length) return undefined;
  return path.join(root, files.at(-1));
}

function appendReleaseNotes(entry) {
  let existing = "# Release Notes and Smoke Results\n\n";
  try {
    existing = readFileSync(releaseNotesPath, "utf8");
  } catch {
    // no previous notes file
  }
  if (!existing.startsWith("# Release Notes and Smoke Results")) {
    existing = `# Release Notes and Smoke Results\n\n${existing}`;
  }
  const now = new Date().toISOString();
  writeFileSync(releaseNotesPath, `${existing}## ${now}\n- ${entry}\n\n`);
}

function existsFile(filePath) {
  try {
    execSync(`test -f ${JSON.stringify(filePath)}`);
    return true;
  } catch {
    return false;
  }
}

function assertPrereqs(providerName, profile) {
  const required = [profile.envToken, profile.envOwner, profile.envRepo];
  if (providerName === "forgejo") required.push(profile.envBase);
  const notSet = required.filter((name) => !process.env[name]);
  if (notSet.length) throw new Error(`Missing environment variables: ${notSet.join(", ")}`);
  if (process.env.CHANGEYARD_LIVE_SMOKE !== "1") {
    throw new Error("Set CHANGEYARD_LIVE_SMOKE=1 to run smoke checks");
  }
  if (!existsFile(cliPath)) throw new Error(`Built CLI not found: ${cliPath}`);
}

function assertProviderReachability(profile, owner, repo) {
  const token = process.env[profile.envToken];
  if (profile.type === "forgejo") {
    const base = process.env[profile.envBase]?.replace(/\/$/, "");
    if (!base) throw new Error("Missing FORGEJO_BASE_URL");
    requestJson("GET", `${base}/api/v1/version`, token, profile.headers(token));
    requestJson("GET", `${base}/api/v1/repos/${owner}/${repo}`, token, profile.headers(token));
    return;
  }

  const endpoint = profile.type === "github"
    ? `${profile.apiRoot}/repos/${owner}/${repo}`
    : `${profile.apiRoot}/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}`;
  requestJson("GET", endpoint, token, profile.headers(token));
}

function parseScopeHints(profile, token) {
  if (process.env.CHANGEYARD_LIVE_SMOKE_SCOPE_CHECK !== "1") return [];
  const hints = [];
  const expected = tokenScopeRequirements[profile.type];
  if (profile.type === "github") {
    const userCall = spawnSync("curl", ["-sS", "-I", "-H", `Authorization: Bearer ${token}`, "https://api.github.com/user"], { encoding: "utf8" });
    if (userCall.status === 0) {
      const headers = `${userCall.stdout || ""}`.toLowerCase();
      const scopeCheck = hasMinimumScopes(headers, "github");
      if (scopeCheck === null) {
        hints.push(`Could not read GitHub token scopes; for this workflow, include at least: ${expected.required.join(", ")}.`);
      } else if (Array.isArray(scopeCheck)) {
        hints.push(`GitHub token is missing required scopes: ${scopeCheck.join(", ")}.`);
      }
    } else {
      hints.push("Could not query GitHub scope headers while scope check is enabled.");
    }
  } else if (profile.type === "gitlab") {
    const userCall = spawnSync("curl", ["-sS", "-I", "-H", `Authorization: Bearer ${token}`, `${profile.apiRoot}/api/v4/user`], { encoding: "utf8" });
    if (userCall.status === 0) {
      const headers = `${userCall.stdout || ""}`.toLowerCase();
      const scopeCheck = hasMinimumScopes(headers, "gitlab");
      if (scopeCheck === null) {
        hints.push(`Could not read GitLab token scopes; for this workflow, include at least: ${expected.required.join(", ")}.`);
      } else if (Array.isArray(scopeCheck)) {
        hints.push(`GitLab token is missing required scope: ${scopeCheck.join(", ")}.`);
      }
    }
  } else {
    const required = expected.required.join(", ");
    hints.push(`Forgejo scope diagnostics unavailable from headers. Ensure token has at least: ${required}.`);
  }
  return hints;
}

function assertRemoteArtifact(profile, owner, repo, artifact, base) {
  if (!artifact) return;
  const runSteps = [];
  if (artifact.expected) {
    runSteps.push(`Expected ${artifact.kind} URL for ${artifact.number}: ${artifact.expected}`);
    if (artifact.url !== artifact.expected) throw new Error(`Remote ${artifact.kind} URL mismatch: ${artifact.url}`);
  }
  requestJson("GET", artifact.remoteUrl(owner, repo, artifact.number, base), process.env[artifact.tokenEnv], profile.headers(process.env[artifact.tokenEnv]));
  return runSteps;
}

function getNumber(value) {
  const cast = Number(value);
  return Number.isFinite(cast) ? cast : undefined;
}

function runLiveSmoke(providerName) {
  const profile = providers[providerName];
  const owner = process.env[profile.envOwner] ?? "";
  const repo = process.env[profile.envRepo] ?? "";
  const token = process.env[profile.envToken] ?? "";
  const base = profile.type === "forgejo" ? `${process.env[profile.envBase] ?? ""}`.replace(/\/$/, "") : profile.apiRoot;

  const runSteps = [];
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), `changeyard-live-smoke-${providerName}-`));

  try {
    assertPrereqs(providerName, profile);
    assertProviderReachability(profile, owner, repo);
    runSteps.push("validated smoke environment and provider reachability");

    for (const hint of parseScopeHints(profile, token)) runSteps.push(hint);

    run("git", ["init", "-b", "main"], tempRoot);
    run("git", ["config", "user.name", "Changeyard Smoke"], tempRoot);
    run("git", ["config", "user.email", "changeyard-smoke@example.test"], tempRoot);
    writeFileSync(path.join(tempRoot, "README.md"), "# changeyard smoke repository\n");
    run("git", ["add", "README.md"], tempRoot);
    run("git", ["commit", "-m", "chore: initialize smoke repository"], tempRoot);
    run("git", ["remote", "add", "origin",
      profile.type === "forgejo"
        ? profile.cloneUrl(owner, repo, token, base)
        : profile.cloneUrl(owner, repo, token),
    ], tempRoot);

    runCli(tempRoot, "init");
    writeFileSync(
      path.join(tempRoot, ".changeyard/config.local.jsonc"),
      JSON.stringify({
        provider: {
          type: profile.type,
          owner,
          repo,
          ...(profile.type === "forgejo" ? { baseUrl: base } : {}),
          auth: { tokenEnv: profile.envToken },
        },
      }, null, 2) + "\n",
    );

    runSteps.push("initialized repository and wrote provider config");

    const createOutput = runCli(
      tempRoot,
      "create",
      "--template",
      "agent-task",
      "--title",
      `Live smoke ${providerName} ${new Date().toISOString()}`,
    );
    const changeId = parseIdFromChangeCreate(createOutput);

    const changeFiles = readdirSync(path.join(tempRoot, ".changeyard/changes")).filter((entry) => entry.startsWith(`${changeId}-`) && entry.endsWith(".md"));
    if (!changeFiles.length) throw new Error(`Cannot locate change file for ${changeId}`);
    const changePath = path.join(tempRoot, ".changeyard/changes", changeFiles[0]);

    runSteps.push(`created change ${changeId}`);
    runCli(tempRoot, "validate", changeId);
    runCli(tempRoot, "sync", changeId);

    const startOutput = runCli(tempRoot, "start", changeId);
    const startMatch = /Started\s+(CY-[0-9]+)\s+in\s+([^\n]+)/.exec(startOutput);
    if (!startMatch) throw new Error("Could not resolve workspace path from start output");
    const workspacePath = path.join(tempRoot, startMatch[2]);
    runSteps.push(`started ${changeId} at ${startMatch[2]}`);

    const changeBody = readFileSync(changePath, "utf8");
    const nextChangeBody = changeBody.replace(
      "Summarize what changed, what checks ran, and what risks remain.",
      `Completed smoke verification for ${providerName} at ${new Date().toISOString()}.`,
    );
    writeFileSync(changePath, nextChangeBody);

    runCli(workspacePath, "complete", changeId);
    runSteps.push("completed change and published remote PR/MR");

    runCli(tempRoot, "review", "start", changeId);
    const reviewPath = latestReviewPath(path.join(tempRoot, ".changeyard/reviews", changeId));
    if (!reviewPath) throw new Error("No review file found");
    const reviewBody = readFileSync(reviewPath, "utf8").replace(
      "- path/to/file.ts:42: Comment text.",
      `- README.md:1: Smoke inline review comment.`,
    );
    writeFileSync(reviewPath, reviewBody);

    runCli(tempRoot, "review", "complete", changeId, "--decision", "approve");
    runSteps.push("submitted review");

    const changeFrontmatter = parseFrontmatter(readFileSync(changePath, "utf8"));
    const reviewFrontmatter = parseFrontmatter(readFileSync(reviewPath, "utf8"));
    const issueNumber = getNumber(normalizeRecord(changeFrontmatter.remote).issueNumber);
    const pullRequestNumber = getNumber(normalizeRecord(changeFrontmatter.remote).pullRequestNumber);
    const reviewNumber = getNumber(normalizeRecord(reviewFrontmatter.remote).reviewNumber);
    if (![issueNumber, pullRequestNumber, reviewNumber].every((value) => Number.isFinite(value))) {
      throw new Error("Could not parse remote artifact numbers from change/review metadata");
    }

    const issueUrl = String(normalizeRecord(changeFrontmatter.remote).issueUrl);
    const pullRequestUrl = String(normalizeRecord(changeFrontmatter.remote).pullRequestUrl);
    const reviewUrl = String(normalizeRecord(reviewFrontmatter.remote).reviewUrl);
    requestJson("GET", profile.remoteIssueApi(owner, repo, issueNumber, base), token, profile.headers(token));
    requestJson("GET", profile.remotePrApi(owner, repo, pullRequestNumber, base), token, profile.headers(token));
    if (issueUrl.startsWith("http")) requestJson("GET", issueUrl, token, profile.headers(token));
    if (pullRequestUrl.startsWith("http")) requestJson("GET", pullRequestUrl, token, profile.headers(token));
    if (reviewUrl.startsWith("http")) requestJson("GET", reviewUrl, token, profile.headers(token));

    if (issueUrl) {
      runSteps.push(`expected issue URL verified: ${issueUrl}`);
      if (issueUrl !== profile.expectedIssue(owner, repo, issueNumber, base)) {
        runSteps.push(`expected ${providerName} issue URL shape: ${profile.expectedIssue(owner, repo, issueNumber, base)}`);
      }
    }

    if (pullRequestUrl) {
      if (pullRequestUrl !== profile.expectedPr(owner, repo, pullRequestNumber, base)) {
        runSteps.push(`expected ${providerName} PR URL shape: ${profile.expectedPr(owner, repo, pullRequestNumber, base)}`);
      }
    }

    if (profile.type === "github") {
      const comments = requestJson("GET", `${base}/repos/${owner}/${repo}/pulls/${pullRequestNumber}/comments?per_page=100`, token, profile.headers(token));
      if (!Array.isArray(comments) || comments.length === 0) {
        throw new Error("No pull request comments were created on GitHub");
      }
      if (!comments.some((entry) => String(entry.path ?? "").includes("README.md"))) {
        runSteps.push("review inline comment payload did not include README.md path in GitHub PR comments");
      }
    } else if (profile.type === "gitlab") {
      const notes = requestJson("GET", `${base}/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}/merge_requests/${pullRequestNumber}/notes`, token, profile.headers(token));
      if (!Array.isArray(notes)) throw new Error("No merge request notes were found on GitLab");
      const hasDecision = notes.some((entry) => String((entry.body ?? "").toLowerCase()).includes("review decision: approved"));
      if (!hasDecision) runSteps.push("review note body does not include decision marker");
    } else {
      const comments = requestJson("GET", `${base}/api/v1/repos/${owner}/${repo}/pulls/${pullRequestNumber}/comments`, token, profile.headers(token));
      if (!Array.isArray(comments)) throw new Error("No Forgejo pull request comments were returned");
      const hasComment = comments.some((entry) => String(entry.body ?? "").includes("Smoke inline review"));
      if (!hasComment) runSteps.push("review inline comment payload not visible through Forgejo comments endpoint");
    }

    const workspaceMetadataPath = path.join(tempRoot, ".changeyard/workspaces", changeId, "metadata.json");
    let branchToCleanup = `cy/${changeId}`;
    try {
      const metadata = JSON.parse(readFileSync(workspaceMetadataPath, "utf8"));
      if (typeof metadata.branch === "string" && metadata.branch.trim()) branchToCleanup = metadata.branch;
    } catch {
      // fallback to default branch name
    }

    if (!process.env.CHANGEYARD_KEEP_LIVE_ARTIFACTS) {
      try {
        run("git", ["push", "origin", "--delete", branchToCleanup], tempRoot);
      } catch {
        // best-effort cleanup
      }
      if (profile.type === "github") {
        requestJson("PATCH", `${base}/repos/${owner}/${repo}/pulls/${pullRequestNumber}`, token, profile.headers(token), { state: "closed" });
        requestJson("PATCH", `${base}/repos/${owner}/${repo}/issues/${issueNumber}`, token, profile.headers(token), { state: "closed" });
      } else if (profile.type === "gitlab") {
        requestJson("PUT", `${base}/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}/merge_requests/${pullRequestNumber}`, token, profile.headers(token), { state_event: "close" });
        requestJson("PUT", `${base}/api/v4/projects/${encodeURIComponent(`${owner}/${repo}`)}/issues/${issueNumber}`, token, profile.headers(token), { state_event: "close" });
      } else {
        requestJson("PATCH", `${base}/api/v1/repos/${owner}/${repo}/pulls/${pullRequestNumber}`, token, profile.headers(token), { state: "closed" });
        requestJson("PATCH", `${base}/api/v1/repos/${owner}/${repo}/issues/${issueNumber}`, token, profile.headers(token), { state: "closed" });
      }
    }

    appendReleaseNotes(`✅ Live smoke passed for ${providerName}: issue ${issueNumber}, PR ${pullRequestNumber}, review ${reviewNumber}`);
    return true;
  } catch (error) {
    appendReleaseNotes(`❌ Live smoke failed for ${providerName}: ${error instanceof Error ? error.message : String(error)} (${runSteps.join("; ")})`);
    return false;
  } finally {
    if (!process.env.CHANGEYARD_KEEP_LIVE_ARTIFACTS) {
      try {
        rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}

const providerName = process.argv[2] ?? "github";
if (!Object.hasOwn(providers, providerName)) {
  throw new Error(`Unknown provider: ${providerName}`);
}

const ok = runLiveSmoke(providerName);
if (!ok) process.exit(1);
