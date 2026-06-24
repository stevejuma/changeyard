import { spawnSync } from "node:child_process";
import type {
	RemoteCheckState,
	RemoteCheckSummary,
	RemotePullRequest,
	RemotePullRequestCheck,
	RemotePullRequestChecks,
	RemotePullRequestDetails,
} from "../providers/ChangeProvider.js";

type GhJson = Record<string, unknown>;

type GhPullRequest = {
	number?: number;
	url?: string | null;
	title?: string | null;
	body?: string | null;
	headRefName?: string | null;
	baseRefName?: string | null;
	state?: string | null;
	isDraft?: boolean | null;
	author?: unknown;
	updatedAt?: string | null;
	statusCheckRollup?: unknown[];
};

type GhRunResult = {
	ok: boolean;
	stdout: string;
	stderr: string;
};

const DETAIL_FIELDS = [
	"number",
	"url",
	"title",
	"body",
	"headRefName",
	"baseRefName",
	"state",
	"isDraft",
	"author",
	"updatedAt",
	"statusCheckRollup",
].join(",");

const LIST_FIELDS = [
	"number",
	"url",
	"title",
	"headRefName",
	"baseRefName",
	"state",
	"isDraft",
	"statusCheckRollup",
].join(",");

function runGh(repoRoot: string, args: string[]): GhRunResult {
	const result = spawnSync("gh", args, {
		cwd: repoRoot,
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});
	return {
		ok: result.status === 0,
		stdout: typeof result.stdout === "string" ? result.stdout : "",
		stderr: typeof result.stderr === "string" ? result.stderr : result.error?.message ?? "",
	};
}

function parseJson<T>(value: string): T | null {
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

function stringValue(record: GhJson, keys: string[]): string | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) {
			return value;
		}
		if (typeof value === "number") {
			return String(value);
		}
	}
	return null;
}

function normalizePullRequestState(value: string | null | undefined): RemotePullRequest["state"] {
	switch (value?.toLowerCase()) {
		case "open":
			return "open";
		case "closed":
			return "closed";
		case "merged":
			return "merged";
		default:
			return "unknown";
	}
}

function normalizeCheckState(status: string | null, conclusion: string | null): RemoteCheckState {
	const normalizedStatus = status?.toLowerCase();
	const normalizedConclusion = conclusion?.toLowerCase();
	if (normalizedStatus === "success" || normalizedStatus === "successful") return "passed";
	if (normalizedStatus === "failure" || normalizedStatus === "failed" || normalizedStatus === "error") return "failed";
	if (normalizedStatus === "pending" || normalizedStatus === "expected" || normalizedStatus === "queued" || normalizedStatus === "in_progress") return "pending";
	if (normalizedStatus === "cancelled" || normalizedStatus === "timed_out") return "cancelled";
	if (normalizedStatus === "skipped") return "skipped";
	if (normalizedStatus && normalizedStatus !== "completed") return "unknown";
	if (normalizedConclusion === "success" || normalizedConclusion === "neutral") return "passed";
	if (normalizedConclusion === "failure" || normalizedConclusion === "startup_failure" || normalizedConclusion === "action_required") return "failed";
	if (normalizedConclusion === "cancelled" || normalizedConclusion === "timed_out") return "cancelled";
	if (normalizedConclusion === "skipped") return "skipped";
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

function authorLogin(value: unknown): string | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const login = (value as GhJson).login;
	return typeof login === "string" && login.trim() ? login : null;
}

function ghChecksForPullRequest(pullRequest: GhPullRequest, pullRequestNumber: number): RemotePullRequestCheck[] {
	return (pullRequest.statusCheckRollup ?? [])
		.map((value, index): RemotePullRequestCheck | null => {
			if (!value || typeof value !== "object" || Array.isArray(value)) {
				return null;
			}
			const record = value as GhJson;
			const name = stringValue(record, ["name", "workflowName", "context"]) ?? `Check ${index + 1}`;
			const url = stringValue(record, ["detailsUrl", "targetUrl", "url"]);
			const id = stringValue(record, ["databaseId", "id"]) ?? `${pullRequestNumber}:${name}:${index}`;
			const status = stringValue(record, ["status", "state"]);
			const conclusion = stringValue(record, ["conclusion"]);
			return {
				provider: "github",
				id,
				name,
				kind: "check",
				state: normalizeCheckState(status, conclusion),
				checkId: id,
				conclusion,
				url,
				startedAt: stringValue(record, ["startedAt", "createdAt"]),
				completedAt: stringValue(record, ["completedAt", "updatedAt"]),
				logAvailable: false,
			};
		})
		.filter((check): check is RemotePullRequestCheck => Boolean(check));
}

function ghPullRequestToRemote(pullRequest: GhPullRequest): RemotePullRequest | null {
	if (typeof pullRequest.number !== "number") {
		return null;
	}
	return {
		provider: "github",
		pullRequestNumber: pullRequest.number,
		pullRequestUrl: typeof pullRequest.url === "string" ? pullRequest.url : null,
		baseBranch: typeof pullRequest.baseRefName === "string" ? pullRequest.baseRefName : null,
		headBranch: typeof pullRequest.headRefName === "string" ? pullRequest.headRefName : null,
		draft: typeof pullRequest.isDraft === "boolean" ? pullRequest.isDraft : null,
		state: normalizePullRequestState(pullRequest.state),
	};
}

function ghPullRequestToDetails(pullRequest: GhPullRequest): RemotePullRequestDetails | null {
	const summary = ghPullRequestToRemote(pullRequest);
	if (!summary) {
		return null;
	}
	return {
		...summary,
		title: typeof pullRequest.title === "string" ? pullRequest.title : `PR #${summary.pullRequestNumber}`,
		body: typeof pullRequest.body === "string" ? pullRequest.body : "",
		author: authorLogin(pullRequest.author),
		updatedAt: typeof pullRequest.updatedAt === "string" ? pullRequest.updatedAt : null,
	};
}

function selectorValue(selector: { number?: number; headBranch?: string | null }): string | null {
	if (typeof selector.number === "number") {
		return String(selector.number);
	}
	const headBranch = selector.headBranch?.trim();
	return headBranch || null;
}

export function listGitHubCliPullRequests(repoRoot: string): RemotePullRequestDetails[] {
	const result = runGh(repoRoot, ["pr", "list", "--state", "open", "--limit", "100", "--json", LIST_FIELDS]);
	if (!result.ok) {
		return [];
	}
	const parsed = parseJson<GhPullRequest[]>(result.stdout);
	if (!Array.isArray(parsed)) {
		return [];
	}
	return parsed
		.map((pullRequest) => ghPullRequestToDetails(pullRequest))
		.filter((pullRequest): pullRequest is RemotePullRequestDetails => Boolean(pullRequest));
}

export function getGitHubCliPullRequestDetails(
	repoRoot: string,
	selector: { number?: number; headBranch?: string | null },
): RemotePullRequestDetails | null {
	const value = selectorValue(selector);
	if (!value) {
		return null;
	}
	const result = runGh(repoRoot, ["pr", "view", value, "--json", DETAIL_FIELDS]);
	if (!result.ok) {
		return null;
	}
	const parsed = parseJson<GhPullRequest>(result.stdout);
	return parsed ? ghPullRequestToDetails(parsed) : null;
}

export function updateGitHubCliPullRequestDetails(
	repoRoot: string,
	selector: { number?: number; headBranch?: string | null },
	input: { title?: string; body?: string },
): RemotePullRequestDetails | null {
	const value = selectorValue(selector);
	if (!value) {
		return null;
	}
	const args = ["pr", "edit", value];
	if (input.title !== undefined) {
		args.push("--title", input.title);
	}
	if (input.body !== undefined) {
		args.push("--body", input.body);
	}
	if (args.length === 3) {
		return getGitHubCliPullRequestDetails(repoRoot, selector);
	}
	const result = runGh(repoRoot, args);
	if (!result.ok) {
		const message = (result.stderr || result.stdout || "GitHub CLI could not update the pull request.").trim();
		throw new Error(message);
	}
	return getGitHubCliPullRequestDetails(repoRoot, selector);
}

export function getGitHubCliPullRequestChecks(
	repoRoot: string,
	selector: { number?: number; headBranch?: string | null },
): RemotePullRequestChecks | null {
	const value = selectorValue(selector);
	if (!value) {
		return null;
	}
	const result = runGh(repoRoot, ["pr", "view", value, "--json", "number,statusCheckRollup"]);
	if (!result.ok) {
		return null;
	}
	const parsed = parseJson<GhPullRequest>(result.stdout);
	if (!parsed || typeof parsed.number !== "number") {
		return null;
	}
	const checks = ghChecksForPullRequest(parsed, parsed.number);
	return {
		provider: "github",
		pullRequestNumber: parsed.number,
		supported: true,
		overallState: overallCheckState(checks),
		summary: summarizeChecks(checks),
		checks,
		message: checks.length === 0 ? `GitHub pull request ${parsed.number} has no checks.` : undefined,
	};
}
