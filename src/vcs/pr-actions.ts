import { readFileSync } from "node:fs";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { changesRoot, storageRoot } from "../paths.js";
import { createProvider } from "../providers/index.js";
import type {
	ChangeProvider,
	RemoteBranchChecks,
	RemoteCheckSummary,
	RemotePullRequest,
	RemotePullRequestChecks,
	RemotePullRequestDetails,
} from "../providers/ChangeProvider.js";
import { findChangeFile } from "../state/id.js";
import type { ChangeyardConfig, Frontmatter, ParsedMarkdown } from "../types.js";
import {
	getGitHubCliPullRequestChecks,
	getGitHubCliPullRequestDetails,
	updateGitHubCliPullRequestDetails,
} from "./github-cli-pr.js";
import {
	cachedPullRequestToRemotePullRequest,
	findCachedPullRequest,
	providerRepositoryIdentity,
	readVcsPullRequestCache,
	remotePullRequestToCacheEntry,
	upsertVcsPullRequestCacheEntry,
} from "./pr-cache.js";

export type VcsPullRequestSelector = {
	changeId?: string | null;
	number?: number | null;
	headBranch?: string | null;
};

export type VcsPullRequestUpdateInput = VcsPullRequestSelector & {
	title?: string;
	body?: string;
};

export type VcsBaseBranchChecksInput = {
	branch?: string | null;
};

type PullRequestTarget = {
	provider: ChangeProvider;
	config: ChangeyardConfig;
	storageRoot: string;
	pullRequestNumber: number;
	headBranch: string | null;
	baseBranch: string | null;
	cachedPullRequest: RemotePullRequest | null;
	frontmatter?: Frontmatter;
};

function asRecord(value: unknown): Frontmatter {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function selectedKeys(selector: VcsPullRequestSelector): string[] {
	return [
		selector.changeId?.trim() ? "changeId" : null,
		typeof selector.number === "number" ? "number" : null,
		selector.headBranch?.trim() ? "headBranch" : null,
	].filter((key): key is string => Boolean(key));
}

function assertSingleSelector(selector: VcsPullRequestSelector): void {
	const keys = selectedKeys(selector);
	if (keys.length !== 1) {
		throw new Error("Select exactly one pull request target: changeId, number, or headBranch.");
	}
}

function emptySummary(): RemoteCheckSummary {
	return { passed: 0, failed: 0, pending: 0, cancelled: 0, skipped: 0, unknown: 0, total: 0 };
}

function unsupportedPullRequestChecks(provider: ChangeProvider, pullRequestNumber: number, message?: string): RemotePullRequestChecks {
	return {
		provider: provider.name,
		pullRequestNumber,
		supported: false,
		overallState: "unknown",
		summary: emptySummary(),
		checks: [],
		message: message ?? `Provider ${provider.name} does not support remote pull request checks.`,
	};
}

function unsupportedBranchChecks(provider: ChangeProvider, branch: string, message?: string): RemoteBranchChecks {
	return {
		provider: provider.name,
		branch,
		sha: null,
		supported: false,
		overallState: "unknown",
		summary: emptySummary(),
		checks: [],
		message: message ?? `Provider ${provider.name} does not support remote branch checks.`,
	};
}

function loadChange(repoRoot: string, config: ChangeyardConfig, id: string): { path: string; parsed: ParsedMarkdown } {
	const changePath = findChangeFile(changesRoot(repoRoot, config), id);
	if (!changePath) throw new Error(`Change not found: ${id}`);
	return {
		path: changePath,
		parsed: parseFrontmatter(readFileSync(changePath, "utf8")),
	};
}

function pullRequestNumberFromFrontmatter(frontmatter: Frontmatter): number | null {
	const remote = asRecord(frontmatter.remote);
	return typeof remote.pullRequestNumber === "number" ? remote.pullRequestNumber : null;
}

function pullRequestFromFrontmatter(provider: ChangeProvider, frontmatter: Frontmatter): RemotePullRequest | null {
	const remote = asRecord(frontmatter.remote);
	const pullRequestNumber = typeof remote.pullRequestNumber === "number" ? remote.pullRequestNumber : null;
	if (pullRequestNumber === null) return null;
	return {
		provider: typeof remote.provider === "string" ? remote.provider : provider.name,
		pullRequestNumber,
		pullRequestUrl: typeof remote.pullRequestUrl === "string" ? remote.pullRequestUrl : null,
		state: "unknown",
	};
}

function cachePullRequest(repoRoot: string, target: PullRequestTarget, pullRequest: RemotePullRequest & { title?: string | null }): void {
	if (typeof pullRequest.pullRequestNumber !== "number") return;
	const head = pullRequest.headBranch ?? target.headBranch;
	if (!head) return;
	const entry = remotePullRequestToCacheEntry({
		provider: target.config.provider.type,
		repository: providerRepositoryIdentity(target.config, repoRoot),
		head,
		fallbackBase: pullRequest.baseBranch ?? target.baseBranch,
		pullRequest,
	});
	if (entry) upsertVcsPullRequestCacheEntry(target.storageRoot, entry);
}

function resolveHeadBranchTarget(repoRoot: string, config: ChangeyardConfig, provider: ChangeProvider, root: string, headBranch: string): PullRequestTarget {
	const repository = providerRepositoryIdentity(config, repoRoot);
	const cached = findCachedPullRequest(readVcsPullRequestCache(root), {
		provider: config.provider.type,
		repository,
		head: headBranch,
	});
	const cachedPullRequest = cachedPullRequestToRemotePullRequest(cached);
	if (cachedPullRequest?.pullRequestNumber) {
		return {
			provider,
			config,
			storageRoot: root,
			pullRequestNumber: cachedPullRequest.pullRequestNumber,
			headBranch,
			baseBranch: cachedPullRequest.baseBranch ?? null,
			cachedPullRequest,
		};
	}
	if (config.provider.type === "noop") {
		const discovered = getGitHubCliPullRequestDetails(repoRoot, { headBranch });
		if (discovered?.pullRequestNumber) {
			const target: PullRequestTarget = {
				provider,
				config,
				storageRoot: root,
				pullRequestNumber: discovered.pullRequestNumber,
				headBranch,
				baseBranch: discovered.baseBranch ?? null,
				cachedPullRequest: discovered,
			};
			cachePullRequest(repoRoot, target, discovered);
			return target;
		}
	}
	if (!provider.findOpenPullRequestByHead) {
		throw new Error(`Provider ${provider.name} cannot find pull requests by head branch.`);
	}
	const found = provider.findOpenPullRequestByHead({ repoRoot, storageRoot: root, head: headBranch });
	if (!found?.pullRequestNumber) {
		throw new Error(`No open pull request found for head branch ${headBranch}.`);
	}
	const target: PullRequestTarget = {
		provider,
		config,
		storageRoot: root,
		pullRequestNumber: found.pullRequestNumber,
		headBranch,
		baseBranch: found.baseBranch ?? null,
		cachedPullRequest: found,
	};
	cachePullRequest(repoRoot, target, found);
	return target;
}

function resolvePullRequestTarget(repoRoot: string, selector: VcsPullRequestSelector): PullRequestTarget {
	assertSingleSelector(selector);
	const config = loadConfig(repoRoot);
	const provider = createProvider(config.provider.type, config);
	const root = storageRoot(repoRoot, config);
	if (selector.changeId?.trim()) {
		const loaded = loadChange(repoRoot, config, selector.changeId.trim());
		const pullRequestNumber = pullRequestNumberFromFrontmatter(loaded.parsed.frontmatter);
		if (pullRequestNumber === null) {
			throw new Error(`Change ${selector.changeId} does not have remote.pullRequestNumber metadata.`);
		}
		const cachedPullRequest = pullRequestFromFrontmatter(provider, loaded.parsed.frontmatter);
		return {
			provider,
			config,
			storageRoot: root,
			pullRequestNumber,
			headBranch: null,
			baseBranch: null,
			cachedPullRequest,
			frontmatter: loaded.parsed.frontmatter,
		};
	}
	if (typeof selector.number === "number") {
		return {
			provider,
			config,
			storageRoot: root,
			pullRequestNumber: selector.number,
			headBranch: null,
			baseBranch: null,
			cachedPullRequest: null,
		};
	}
	const headBranch = selector.headBranch?.trim();
	if (!headBranch) {
		throw new Error("Missing pull request selector.");
	}
	return resolveHeadBranchTarget(repoRoot, config, provider, root, headBranch);
}

function fallbackDetails(target: PullRequestTarget): RemotePullRequestDetails {
	return {
		provider: target.cachedPullRequest?.provider ?? target.provider.name,
		pullRequestNumber: target.pullRequestNumber,
		pullRequestUrl: target.cachedPullRequest?.pullRequestUrl ?? null,
		baseBranch: target.cachedPullRequest?.baseBranch ?? target.baseBranch,
		headBranch: target.cachedPullRequest?.headBranch ?? target.headBranch,
		state: target.cachedPullRequest?.state ?? "unknown",
		title: `PR #${target.pullRequestNumber}`,
		body: "",
		author: null,
		updatedAt: null,
	};
}

function normalizeBranchName(branch: string): string {
	const trimmed = branch.trim();
	if (trimmed.startsWith("refs/heads/")) return trimmed.slice("refs/heads/".length);
	if (trimmed.startsWith("origin/")) return trimmed.slice("origin/".length);
	return trimmed;
}

export function getVcsPullRequestDetails(repoRoot: string, selector: VcsPullRequestSelector): RemotePullRequestDetails {
	const target = resolvePullRequestTarget(repoRoot, selector);
	if (!target.provider.capabilities().pullRequestDetails || !target.provider.getPullRequestDetails) {
		const discovered = getGitHubCliPullRequestDetails(repoRoot, {
			number: target.pullRequestNumber,
			headBranch: target.headBranch,
		});
		if (discovered) {
			cachePullRequest(repoRoot, target, discovered);
			return discovered;
		}
		return fallbackDetails(target);
	}
	const details = target.provider.getPullRequestDetails({
		repoRoot,
		storageRoot: target.storageRoot,
		pullRequestNumber: target.pullRequestNumber,
		frontmatter: target.frontmatter,
	});
	cachePullRequest(repoRoot, target, details);
	return details;
}

export function updateVcsPullRequestDetails(repoRoot: string, input: VcsPullRequestUpdateInput): RemotePullRequestDetails {
	const target = resolvePullRequestTarget(repoRoot, input);
	if (!target.provider.capabilities().pullRequestUpdates || !target.provider.updatePullRequestDetails) {
		const discovered = updateGitHubCliPullRequestDetails(
			repoRoot,
			{ number: target.pullRequestNumber, headBranch: target.headBranch },
			{ title: input.title, body: input.body },
		);
		if (discovered) {
			cachePullRequest(repoRoot, target, discovered);
			return discovered;
		}
		throw new Error(`Provider ${target.provider.name} does not support pull request detail updates.`);
	}
	const details = target.provider.updatePullRequestDetails({
		repoRoot,
		storageRoot: target.storageRoot,
		pullRequestNumber: target.pullRequestNumber,
		frontmatter: target.frontmatter,
		title: input.title,
		body: input.body,
	});
	cachePullRequest(repoRoot, target, details);
	return details;
}

export function getVcsPullRequestChecks(repoRoot: string, selector: VcsPullRequestSelector): RemotePullRequestChecks {
	const target = resolvePullRequestTarget(repoRoot, selector);
	if (!target.provider.capabilities().pullRequestChecks || !target.provider.listPullRequestChecks) {
		const discovered = getGitHubCliPullRequestChecks(repoRoot, {
			number: target.pullRequestNumber,
			headBranch: target.headBranch,
		});
		if (discovered) {
			return discovered;
		}
		return unsupportedPullRequestChecks(target.provider, target.pullRequestNumber);
	}
	return target.provider.listPullRequestChecks({
		repoRoot,
		storageRoot: target.storageRoot,
		pullRequestNumber: target.pullRequestNumber,
		frontmatter: target.frontmatter,
	});
}

export function getVcsBaseBranchChecks(repoRoot: string, input: VcsBaseBranchChecksInput = {}): RemoteBranchChecks {
	const config = loadConfig(repoRoot);
	const provider = createProvider(config.provider.type, config);
	const branch = normalizeBranchName(input.branch ?? config.vcs.targetBranch ?? config.project.defaultBase);
	if (!branch) {
		return unsupportedBranchChecks(provider, "", "No base branch is configured for branch checks.");
	}
	if (!provider.capabilities().branchChecks || !provider.listBranchChecks) {
		return unsupportedBranchChecks(provider, branch);
	}
	return provider.listBranchChecks({
		repoRoot,
		storageRoot: storageRoot(repoRoot, config),
		branch,
	});
}
