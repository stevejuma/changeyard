import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ChangeyardConfig } from "../types.js";
import type { RemotePullRequest } from "../providers/ChangeProvider.js";
import type { VcsJjInventoryPullRequest } from "./types.js";

export type VcsPullRequestCacheState = "open" | "closed" | "merged" | "unknown";

export type VcsPullRequestCacheEntry = {
	provider: string;
	repository: string;
	head: string;
	base: string | null;
	number: number;
	url: string | null;
	state: VcsPullRequestCacheState;
	updatedAt: string;
};

type VcsPullRequestCacheFile = {
	version: 0;
	pullRequests: VcsPullRequestCacheEntry[];
};

type CacheLookup = {
	provider: string;
	repository: string;
	head: string;
};

function cachePath(storageRoot: string): string {
	return path.join(storageRoot, "cache", "vcs-prs.json");
}

function normalizeState(value: unknown): VcsPullRequestCacheState {
	return value === "open" || value === "closed" || value === "merged" || value === "unknown" ? value : "unknown";
}

function normalizeEntry(value: unknown): VcsPullRequestCacheEntry | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const entry = value as Partial<VcsPullRequestCacheEntry>;
	if (
		typeof entry.provider !== "string" ||
		typeof entry.repository !== "string" ||
		typeof entry.head !== "string" ||
		typeof entry.number !== "number"
	) {
		return null;
	}
	return {
		provider: entry.provider,
		repository: entry.repository,
		head: entry.head,
		base: typeof entry.base === "string" ? entry.base : null,
		number: entry.number,
		url: typeof entry.url === "string" ? entry.url : null,
		state: normalizeState(entry.state),
		updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString(),
	};
}

export function providerRepositoryIdentity(config: ChangeyardConfig, repoRoot: string): string {
	const owner = config.provider.owner?.trim();
	const repo = config.provider.repo?.trim();
	if (owner && repo) {
		const baseUrl = config.provider.baseUrl?.replace(/\/$/, "");
		return baseUrl ? `${baseUrl}/${owner}/${repo}` : `${owner}/${repo}`;
	}
	return repoRoot;
}

export function readVcsPullRequestCache(storageRoot: string): VcsPullRequestCacheEntry[] {
	const filePath = cachePath(storageRoot);
	if (!existsSync(filePath)) {
		return [];
	}
	try {
		const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<VcsPullRequestCacheFile>;
		return Array.isArray(parsed.pullRequests)
			? parsed.pullRequests.map(normalizeEntry).filter((entry): entry is VcsPullRequestCacheEntry => Boolean(entry))
			: [];
	} catch {
		return [];
	}
}

export function writeVcsPullRequestCache(storageRoot: string, pullRequests: readonly VcsPullRequestCacheEntry[]): void {
	const filePath = cachePath(storageRoot);
	mkdirSync(path.dirname(filePath), { recursive: true });
	const payload: VcsPullRequestCacheFile = {
		version: 0,
		pullRequests: [...pullRequests].sort((left, right) =>
			`${left.provider}\0${left.repository}\0${left.head}`.localeCompare(`${right.provider}\0${right.repository}\0${right.head}`),
		),
	};
	writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function findCachedPullRequest(
	pullRequests: readonly VcsPullRequestCacheEntry[],
	lookup: CacheLookup,
): VcsPullRequestCacheEntry | null {
	return pullRequests.find((entry) =>
		entry.provider === lookup.provider &&
		entry.repository === lookup.repository &&
		entry.head === lookup.head &&
		(entry.state === "open" || entry.state === "unknown")
	) ?? null;
}

export function upsertVcsPullRequestCacheEntry(
	storageRoot: string,
	entry: Omit<VcsPullRequestCacheEntry, "updatedAt"> & { updatedAt?: string },
): VcsPullRequestCacheEntry {
	const current = readVcsPullRequestCache(storageRoot);
	const nextEntry: VcsPullRequestCacheEntry = {
		...entry,
		updatedAt: entry.updatedAt ?? new Date().toISOString(),
	};
	const next = current.filter((candidate) =>
		!(
			candidate.provider === nextEntry.provider &&
			candidate.repository === nextEntry.repository &&
			candidate.head === nextEntry.head
		),
	);
	next.push(nextEntry);
	writeVcsPullRequestCache(storageRoot, next);
	return nextEntry;
}

export function remotePullRequestToCacheEntry(input: {
	provider: string;
	repository: string;
	head: string;
	fallbackBase: string | null;
	pullRequest: RemotePullRequest;
}): Omit<VcsPullRequestCacheEntry, "updatedAt"> | null {
	if (typeof input.pullRequest.pullRequestNumber !== "number") {
		return null;
	}
	return {
		provider: input.provider,
		repository: input.repository,
		head: input.pullRequest.headBranch ?? input.head,
		base: input.pullRequest.baseBranch ?? input.fallbackBase,
		number: input.pullRequest.pullRequestNumber,
		url: input.pullRequest.pullRequestUrl,
		state: normalizeState(input.pullRequest.state ?? "open"),
	};
}

export function cachedPullRequestToInventoryPr(
	entry: VcsPullRequestCacheEntry | null,
): VcsJjInventoryPullRequest | null {
	if (!entry) {
		return null;
	}
	return {
		number: entry.number,
		url: entry.url,
		baseBranch: entry.base,
	};
}

export function cachedPullRequestToRemotePullRequest(
	entry: VcsPullRequestCacheEntry | null,
): RemotePullRequest | null {
	if (!entry) {
		return null;
	}
	return {
		provider: entry.provider,
		pullRequestNumber: entry.number,
		pullRequestUrl: entry.url,
		baseBranch: entry.base,
		headBranch: entry.head,
		state: entry.state,
	};
}
