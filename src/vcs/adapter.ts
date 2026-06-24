import { detectVcsState } from "./detect.js";
import { loadConfig } from "../config/loadConfig.js";
import { storageRoot } from "../paths.js";
import type { ChangeyardConfig } from "../types.js";
import {
	applyGitWorkspaceOperation,
	loadGitConflictFile,
	loadGitWorkspaceDiff,
	loadGitWorkspaceStacks,
	loadGitWorkspaceState,
	previewGitWorkspaceOperation,
	resolveGitConflictFile,
} from "./git/workspace.js";
import { applyJjOperation } from "./jj/apply.js";
import { loadJjDiff } from "./jj/diff.js";
import { loadJjInventory, loadJjInventoryFromDetect } from "./jj/inventory.js";
import { createJjOperationSnapshot, loadJjOperationDiff, loadJjOperations, revertJjOperation } from "./jj/operations.js";
import { previewJjOperation } from "./jj/preview.js";
import { previewJjStackSubmit, submitJjStack } from "./jj/stack-submit.js";
import { listGitHubCliPullRequests } from "./github-cli-pr.js";
import { loadJjState, loadJjStateFromDetect } from "./jj/state.js";
import { cachedPullRequestToInventoryPr, findCachedPullRequest, providerRepositoryIdentity, readVcsPullRequestCache } from "./pr-cache.js";
import { getVcsBaseBranchChecks, getVcsPullRequestChecks, getVcsPullRequestConversation, getVcsPullRequestDetails, updateVcsPullRequestDetails } from "./pr-actions.js";
import {
	applyJjWorkspaceOperation,
	loadJjConflictFile,
	loadJjWorkspaceDiff,
	loadJjWorkspaceStacks,
	loadJjWorkspaceState,
	previewJjWorkspaceOperation,
	resolveJjConflictFile,
} from "./jj/workspace.js";
import type { NeutralOperationRequest } from "./workspace-types.js";
import { runVcsCommand } from "./process.js";
import type {
	VcsApplyOperationInput,
	VcsJjBranchesDataResult,
	VcsJjInventoryPullRequest,
	VcsJjInventoryItem,
	VcsJjInventoryResult,
	VcsJjStateResult,
	VcsPreviewOperationInput,
	VcsSubmitStackPreviewInput,
} from "./types.js";

type GitWorkspaceStateResult = Awaited<ReturnType<typeof loadGitWorkspaceState>>;
type JjWorkspaceStateResult = Awaited<ReturnType<typeof loadJjWorkspaceState>>;
type NeutralWorkspaceStateResult = {
	provider: string;
	headId: string | null;
	mode: string;
	conflicts: unknown[];
	workingCopy: unknown;
	stacks: Array<{ stackId: string; name?: string; pr?: unknown; commits: Array<{ commitId: string }> }>;
	appliedStackIds: string[];
	stateVersion?: number;
} & Record<string, unknown>;

type WorkspaceStateCacheEntry = {
	key: string;
	repoRoot: string;
	stateVersion: number;
	state: NeutralWorkspaceStateResult;
};

const workspaceStateCache = new Map<string, WorkspaceStateCacheEntry>();
const latestWorkspaceStateCacheKeyByRepo = new Map<string, string>();
let nextWorkspaceStateVersion = 1;

function workspaceStateCacheKey(repoRoot: string, input?: { targetRef?: string | null; appliedStackIds?: string[] }) {
	const targetRef = input?.targetRef ?? "";
	const appliedStackIds = [...(input?.appliedStackIds ?? [])].sort().join("\x1f");
	return `${repoRoot}\x00${targetRef}\x00${appliedStackIds}`;
}

function cacheWorkspaceState(
	repoRoot: string,
	input: { targetRef?: string | null; appliedStackIds?: string[] } | undefined,
	state: Record<string, unknown>,
) {
	const key = workspaceStateCacheKey(repoRoot, input);
	const stateVersion = nextWorkspaceStateVersion++;
	const versionedState = { ...state, stateVersion } as NeutralWorkspaceStateResult;
	workspaceStateCache.set(key, { key, repoRoot, stateVersion, state: versionedState });
	latestWorkspaceStateCacheKeyByRepo.set(repoRoot, key);
	return versionedState;
}

function getLatestWorkspaceStateCache(repoRoot: string, stateVersion?: number | null): WorkspaceStateCacheEntry | null {
	const key = latestWorkspaceStateCacheKeyByRepo.get(repoRoot);
	const entry = key ? workspaceStateCache.get(key) ?? null : null;
	if (!entry) {
		return null;
	}
	if (stateVersion !== undefined && stateVersion !== null && entry.stateVersion !== stateVersion) {
		return null;
	}
	return entry;
}

function patchCachedWorkspaceState(entry: WorkspaceStateCacheEntry, result: Awaited<ReturnType<typeof applyJjWorkspaceOperation>>) {
	if (!result.ok || !result.cacheUpdate || result.cacheUpdate === "none" || result.cacheUpdate === "workspace" || !result.cachePayload) {
		return;
	}
	const state = entry.state;
	const payload = result.cachePayload;
	if (payload.headId !== undefined) {
		state.headId = payload.headId;
	}
	if (payload.mode !== undefined) {
		state.mode = payload.mode;
	}
	if (payload.appliedStackIds) {
		state.appliedStackIds = payload.appliedStackIds;
	}
	if (payload.conflicts) {
		state.conflicts = payload.conflicts;
	}
	if (payload.workingCopy) {
		state.workingCopy = payload.workingCopy;
	}
	for (const stackId of payload.removedStackIds ?? []) {
		state.stacks = state.stacks.filter((stack) => stack.stackId !== stackId);
		state.appliedStackIds = state.appliedStackIds.filter((appliedStackId) => appliedStackId !== stackId);
	}
	for (const stack of payload.stacks ?? []) {
		const index = state.stacks.findIndex((candidate) => candidate.stackId === stack.stackId);
		if (index >= 0) {
			state.stacks[index] = stack;
		} else {
			state.stacks.push(stack);
		}
	}
	for (const commit of payload.commits ?? []) {
		for (const stack of state.stacks) {
			const index = stack.commits.findIndex((candidate) => candidate.commitId === commit.commitId);
			if (index >= 0) {
				stack.commits[index] = commit;
			}
		}
	}
}

function scheduleWorkspaceStateReconcile(repoRoot: string, input: { targetRef?: string | null; appliedStackIds?: string[] } | undefined) {
	setTimeout(() => {
		void getVcsWorkspaceState(repoRoot, input).catch((error: unknown) => {
			console.warn("Failed to reconcile VCS workspace state after fast operation.", error);
		});
	}, 150);
}

function emptyWorkingCopyState() {
	return {
		files: [],
		hasConflicts: false,
		summary: {
			modified: 0,
			added: 0,
			deleted: 0,
			renamed: 0,
			copied: 0,
			unknown: 0,
		},
	};
}

function unsupportedCapabilities() {
	return {
		supportsMultiAppliedWorkspace: false,
		supportsHunkSelection: false,
		supportsHunkRestoreDiscard: false,
		supportsCommittedHunkSelection: false,
		supportsCommitRewrite: false,
		supportsMoveCommitAcrossStacks: false,
		supportsMoveChangesAcrossCommits: false,
		supportsUndoRedo: false,
		supportsSyntheticWorkspaceMerge: false,
		supportsCreateStack: false,
		supportsWorkingCopyCommit: false,
	};
}

function metadataString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value : null;
}

function gitCommitDisplayId(commit: GitWorkspaceStateResult["stacks"][number]["commits"][number]): string {
	return metadataString(commit.metadata?.commitHash) ?? commit.displayId ?? commit.commitId;
}

function createGitInventoryItem(input: {
	id: string;
	name: string;
	type: VcsJjInventoryItem["type"];
	group: VcsJjInventoryItem["group"];
	commitId: string | null;
	title: string | null;
	authorName?: string | null;
	authorEmail?: string | null;
	timestamp?: string | null;
	target?: string | null;
	hasLocal?: boolean;
	isCurrent?: boolean;
}): VcsJjInventoryItem {
	return {
		id: input.id,
		name: input.name,
		type: input.type,
		group: input.group,
		changeId: null,
		commitId: input.commitId,
		title: input.title,
		authorName: input.authorName ?? null,
		authorEmail: input.authorEmail ?? null,
		authorAvatarUrl: null,
		timestamp: input.timestamp ?? null,
		target: input.target ?? input.name,
		remoteName: null,
		hasLocal: input.hasLocal ?? true,
		remotes: [],
		synced: false,
		tracked: false,
		isCurrent: input.isCurrent ?? false,
		pr: null,
	};
}

function hydrateInventoryPullRequests(
	repoRoot: string,
	config: ChangeyardConfig,
	inventory: VcsJjInventoryResult,
): VcsJjInventoryResult {
	const root = storageRoot(repoRoot, config);
	const provider = config.provider.type;
	const repository = providerRepositoryIdentity(config, repoRoot);
	const pullRequests = readVcsPullRequestCache(root);
	const discoveredPullRequests = discoveredPullRequestsByHead(repoRoot, config);
	const hydrateItem = (item: VcsJjInventoryItem | null): VcsJjInventoryItem | null => {
		if (!item) {
			return null;
		}
		const head = item.target ?? item.name;
		const cached = findCachedPullRequest(pullRequests, { provider, repository, head });
		const pr = cachedPullRequestToInventoryPr(cached) ?? discoveredPullRequests.get(head) ?? null;
		return pr ? { ...item, pr } : item;
	};
	return {
		...inventory,
		workspaceTarget: hydrateItem(inventory.workspaceTarget),
		items: inventory.items.map((item) => hydrateItem(item) ?? item),
	};
}

function discoveredPullRequestsByHead(repoRoot: string, config: ChangeyardConfig): Map<string, VcsJjInventoryPullRequest> {
	if (config.provider.type !== "noop") {
		return new Map();
	}
	return new Map(
		listGitHubCliPullRequests(repoRoot)
			.filter((pullRequest) => typeof pullRequest.pullRequestNumber === "number" && pullRequest.headBranch)
			.map((pullRequest) => [
				pullRequest.headBranch as string,
				{
					number: pullRequest.pullRequestNumber as number,
					url: pullRequest.pullRequestUrl,
					baseBranch: pullRequest.baseBranch ?? null,
					title: pullRequest.title,
				},
			]),
	);
}

function hydrateWorkspacePullRequests<TState extends { stacks: Array<{ name?: string; pr?: unknown }> }>(
	repoRoot: string,
	config: ChangeyardConfig,
	state: TState,
): TState {
	const root = storageRoot(repoRoot, config);
	const provider = config.provider.type;
	const repository = providerRepositoryIdentity(config, repoRoot);
	const pullRequests = readVcsPullRequestCache(root);
	const discoveredPullRequests = discoveredPullRequestsByHead(repoRoot, config);
	return {
		...state,
		stacks: state.stacks.map((stack) => {
			const head = stack.name?.trim();
			if (!head) return stack;
			const cached = findCachedPullRequest(pullRequests, { provider, repository, head });
			const pr = cachedPullRequestToInventoryPr(cached) ?? discoveredPullRequests.get(head) ?? null;
			return pr ? { ...stack, pr } : stack;
		}),
	};
}

function gitWorkspaceToBranchesData(
	detect: Awaited<ReturnType<typeof detectVcsState>>,
	repoRoot: string,
	config: ChangeyardConfig,
	state: GitWorkspaceStateResult,
): VcsJjBranchesDataResult {
	const appliedStackIds = new Set<string>(state.appliedStackIds);
	const stacks = state.stacks.map((stack, index) => {
		const changes = stack.commits.map((commit) => ({
			id: commit.commitId,
			changeId: commit.commitId,
			commitId: gitCommitDisplayId(commit),
			title: commit.title,
			description: commit.description,
			authorName: commit.authorName,
			authorEmail: commit.authorEmail,
			authorAvatarUrl: commit.authorAvatarUrl,
			timestamp: commit.timestamp,
			bookmarks: [stack.name],
			remoteBookmarks: [],
			isCurrent: commit.isCurrent,
			isHead: commit.isHead,
		}));
		const headCommit = stack.commits.find((commit) => commit.commitId === stack.headCommitId) ?? stack.commits.at(-1) ?? null;
		const headCommitId = headCommit ? gitCommitDisplayId(headCommit) : stack.headCommitId;
		return {
			id: stack.stackId,
			tip: stack.headCommitId ?? stack.stackId,
			base: stack.baseRef ?? state.targetRef,
			order: index,
			isCheckedOut: stack.isCurrent,
			heads: [
				{
					id: `${stack.stackId}:${stack.headCommitId ?? stack.stackId}`,
					bookmarkName: stack.name,
					changeId: stack.headCommitId ?? stack.stackId,
					commitId: headCommitId ?? stack.stackId,
					title: headCommit?.title ?? stack.name,
					isCheckedOut: stack.isCurrent,
				},
			],
			changes,
		};
	});
	const inventoryItems = state.stacks.map((stack) => {
		const headCommit = stack.commits.find((commit) => commit.commitId === stack.headCommitId) ?? stack.commits.at(-1) ?? null;
			return createGitInventoryItem({
				id: `branch:${stack.stackId}`,
				name: stack.name,
				type: "branch",
				group: stack.isCurrent || appliedStackIds.has(stack.stackId) ? "applied" : "local",
			commitId: headCommit ? gitCommitDisplayId(headCommit) : stack.headCommitId,
			title: headCommit?.title ?? stack.name,
			authorName: headCommit?.authorName ?? null,
			authorEmail: headCommit?.authorEmail ?? null,
			timestamp: headCommit?.timestamp ?? null,
			target: stack.stackId,
			isCurrent: stack.isCurrent,
		});
	});
	const workspaceTarget = state.targetRef
		? createGitInventoryItem({
				id: `workspace-target:${state.targetRef}`,
				name: state.targetRef,
				type: "workspace",
				group: "current",
				commitId: null,
				title: "Workspace target",
				target: state.targetRef,
				hasLocal: false,
			})
		: null;
	const inventory: VcsJjInventoryResult = {
		...detect,
		workspaceTarget,
		items: inventoryItems,
		diagnostics: detect.diagnostics,
	};
	const branchState: VcsJjStateResult = {
		...detect,
		bookmarks: [],
		changes: [],
		stacks,
		unassignedChanges: [],
		diagnostics: detect.diagnostics,
	};
	return { inventory: hydrateInventoryPullRequests(repoRoot, config, inventory), state: branchState };
}

export async function detectVcs(repoRoot: string) {
	return await detectVcsState(repoRoot);
}

export async function getJjState(repoRoot: string) {
	const config = loadConfig(repoRoot);
	return await loadJjState(repoRoot, runVcsCommand, { targetBranch: config.vcs.targetBranch ?? null });
}

export async function getJjDiff(repoRoot: string) {
	return await loadJjDiff(repoRoot, runVcsCommand);
}

export async function getJjInventory(repoRoot: string) {
	const config = loadConfig(repoRoot);
	const inventory = await loadJjInventory(repoRoot, runVcsCommand, {
		targetBranch: config.vcs.targetBranch ?? null,
		remoteBookmarks: config.vcs.remoteBookmarks,
	});
	return hydrateInventoryPullRequests(repoRoot, config, inventory);
}

export async function getJjBranchesData(repoRoot: string) {
	const config = loadConfig(repoRoot);
	const detect = await detectVcsState(repoRoot, runVcsCommand);
	const options = {
		targetBranch: config.vcs.targetBranch ?? null,
		remoteBookmarks: config.vcs.remoteBookmarks,
	};
	if (detect.repository.kind === "git") {
		const state = await loadGitWorkspaceState(repoRoot, runVcsCommand, {
			...options,
			appliedStackIds: config.vcs.appliedStacks ?? [],
		});
		return gitWorkspaceToBranchesData(detect, repoRoot, config, state);
	}
	const [inventory, state] = await Promise.all([
		loadJjInventoryFromDetect(repoRoot, runVcsCommand, detect, options),
		loadJjStateFromDetect(repoRoot, runVcsCommand, detect, options),
	]);
	return { inventory: hydrateInventoryPullRequests(repoRoot, config, inventory), state };
}

export async function getVcsBranchesData(repoRoot: string) {
	return await getJjBranchesData(repoRoot);
}

export async function getVcsWorkspaceState(
	repoRoot: string,
	input?: { targetRef?: string | null; appliedStackIds?: string[] },
) {
	const config = loadConfig(repoRoot);
	const detect = await detectVcsState(repoRoot, runVcsCommand);
	if (detect.repository.kind === "jj") {
		const state = await loadJjWorkspaceState(repoRoot, runVcsCommand, {
			targetBranch: input?.targetRef ?? config.vcs.targetBranch ?? null,
			appliedStackIds: input?.appliedStackIds ?? config.vcs.appliedStacks ?? [],
		});
		return cacheWorkspaceState(repoRoot, input, hydrateWorkspacePullRequests(repoRoot, config, state));
	}
	if (detect.repository.kind === "git") {
		const state = await loadGitWorkspaceState(repoRoot, runVcsCommand, {
			targetBranch: input?.targetRef ?? config.vcs.targetBranch ?? null,
			appliedStackIds: input?.appliedStackIds ?? config.vcs.appliedStacks ?? [],
		});
		return cacheWorkspaceState(repoRoot, input, hydrateWorkspacePullRequests(repoRoot, config, state));
	}
	const targetRef = input?.targetRef ?? config.vcs.targetBranch ?? detect.jj.defaultBase ?? detect.git.defaultBranch ?? "";
	return cacheWorkspaceState(repoRoot, input, {
		projectId: repoRoot,
		provider: "git" as const,
		targetRef,
		headId: null,
		mode: detect.repository.kind === "none" ? "unsupported" : "unsupported",
		capabilities: unsupportedCapabilities(),
		stacks: [],
		appliedStackIds: input?.appliedStackIds ?? config.vcs.appliedStacks ?? [],
		workingCopy: emptyWorkingCopyState(),
		conflicts: [
			{
				id: "provider-engine-pending",
				path: null,
				message: "Provider-neutral workspace engines are not implemented yet.",
				commitIds: [],
				stackIds: [],
			},
		],
	});
}

export async function getVcsWorkspaceStacks(
	repoRoot: string,
	input?: { targetRef?: string | null; appliedStackIds?: string[] },
) {
	const detect = await detectVcsState(repoRoot, runVcsCommand);
	if (detect.repository.kind === "jj") {
		const config = loadConfig(repoRoot);
		return await loadJjWorkspaceStacks(repoRoot, runVcsCommand, {
			targetBranch: input?.targetRef ?? config.vcs.targetBranch ?? null,
			appliedStackIds: input?.appliedStackIds ?? config.vcs.appliedStacks ?? [],
		});
	}
	if (detect.repository.kind === "git") {
		const config = loadConfig(repoRoot);
		return await loadGitWorkspaceStacks(repoRoot, runVcsCommand, {
			targetBranch: input?.targetRef ?? config.vcs.targetBranch ?? null,
			appliedStackIds: input?.appliedStackIds ?? config.vcs.appliedStacks ?? [],
		});
	}
	const state = await getVcsWorkspaceState(repoRoot, input);
	return { stacks: state.stacks };
}

export async function getVcsDiff(repoRoot: string, _input?: unknown) {
	const detect = await detectVcsState(repoRoot, runVcsCommand);
	if (detect.repository.kind === "jj") {
		return await loadJjWorkspaceDiff(repoRoot, runVcsCommand);
	}
	if (detect.repository.kind === "git") {
		return await loadGitWorkspaceDiff(repoRoot, runVcsCommand);
	}
	return {
		ok: false,
		summary: "",
		patch: "",
		files: [],
		diagnostics: [
			{
				level: "warning" as const,
				code: "provider_engine_pending",
				message: "Provider-neutral diff engines are not implemented yet.",
			},
		],
	};
}

export async function getVcsConflictFile(
	repoRoot: string,
	input: { path: string; source?: "workspace" | "commit"; revision?: string | null; commitId?: string | null },
) {
	const detect = await detectVcsState(repoRoot, runVcsCommand);
	if (detect.repository.kind === "jj") {
		return await loadJjConflictFile(repoRoot, runVcsCommand, input);
	}
	if (detect.repository.kind === "git") {
		return await loadGitConflictFile(repoRoot, runVcsCommand, input);
	}
	return {
		ok: false,
		provider: "git" as const,
		path: input.path,
		source: input.source ?? "workspace" as const,
		revision: input.revision ?? null,
		readOnly: true,
		left: "",
		base: "",
		right: "",
		labels: {
			left: "Left",
			base: "Base",
			right: "Right",
		},
		diagnostics: [
			{
				level: "warning" as const,
				code: "provider_engine_pending",
				message: "Provider-neutral conflict files are not implemented for this repository.",
			},
		],
	};
}

export async function resolveVcsConflictFile(
	repoRoot: string,
	input: { path: string; resolvedContent: string },
) {
	const detect = await detectVcsState(repoRoot, runVcsCommand);
	if (detect.repository.kind === "jj") {
		return await resolveJjConflictFile(repoRoot, runVcsCommand, input);
	}
	if (detect.repository.kind === "git") {
		return await resolveGitConflictFile(repoRoot, runVcsCommand, input);
	}
	return {
		ok: false,
		path: input.path,
		summary: "Provider-neutral conflict resolution is not implemented for this repository.",
		diagnostics: [
			{
				level: "warning" as const,
				code: "provider_engine_pending",
				message: "Provider-neutral conflict resolution is not implemented for this repository.",
			},
		],
	};
}

export async function previewVcsWorkspaceOperation(repoRoot: string, input: NeutralOperationRequest) {
	const detect = await detectVcsState(repoRoot, runVcsCommand);
	if (detect.repository.kind === "jj") {
		return await previewJjWorkspaceOperation(repoRoot, input, runVcsCommand);
	}
	if (detect.repository.kind === "git") {
		const config = loadConfig(repoRoot);
		return await previewGitWorkspaceOperation(repoRoot, input, runVcsCommand, {
			targetBranch: config.vcs.targetBranch ?? null,
			appliedStackIds: config.vcs.appliedStacks ?? [],
		});
	}
	return {
		valid: false,
		operation: input.operation,
		title: "Preview unavailable",
		summary: "Provider-neutral workspace operation preview is not implemented yet.",
		risk: "high" as const,
		disabledReason: "Provider-neutral workspace operation preview is not implemented yet.",
		warnings: [],
		conflicts: [],
		affectedStackIds: [],
		affectedCommitIds: [],
		affectedPaths: [],
		diagnostics: [
			{
				level: "warning" as const,
				code: "provider_engine_pending",
				message: "Provider-neutral workspace operation preview is not implemented yet.",
			},
		],
	};
}

export async function applyVcsWorkspaceOperation(repoRoot: string, input: NeutralOperationRequest) {
	const detect = await detectVcsState(repoRoot, runVcsCommand);
	if (detect.repository.kind === "jj") {
		const cachedEntry = getLatestWorkspaceStateCache(repoRoot, input.operationContext?.stateVersion);
		const result = await applyJjWorkspaceOperation(repoRoot, input, runVcsCommand, cachedEntry?.state.provider === "jj" ? cachedEntry.state as never : null);
		if (cachedEntry) {
			patchCachedWorkspaceState(cachedEntry, result);
			if (result.ok && result.cacheUpdate && result.cacheUpdate !== "workspace") {
				scheduleWorkspaceStateReconcile(repoRoot, undefined);
			}
		}
		return result;
	}
	if (detect.repository.kind === "git") {
		const config = loadConfig(repoRoot);
		return await applyGitWorkspaceOperation(repoRoot, input, runVcsCommand, {
			targetBranch: config.vcs.targetBranch ?? null,
			appliedStackIds: config.vcs.appliedStacks ?? [],
		});
	}
	return {
		ok: false,
		operation: input.operation,
		title: "Operation unavailable",
		summary: "Provider-neutral workspace operation apply is not implemented yet.",
		affectedStackIds: [],
		affectedCommitIds: [],
		affectedPaths: [],
		recovery: {
			instructions: ["No repository changes were attempted."],
		},
		diagnostics: [
			{
				level: "warning" as const,
				code: "provider_engine_pending",
				message: "Provider-neutral workspace operation apply is not implemented yet.",
			},
		],
	};
}

export async function getJjOperations(repoRoot: string, input?: { limit?: number | null; cursor?: string | null; pageSize?: number | null }) {
	return await loadJjOperations(repoRoot, runVcsCommand, {
		limit: input?.limit,
		cursor: input?.cursor,
		pageSize: input?.pageSize,
	});
}

export async function getJjOperationDiff(
	repoRoot: string,
	input: { operationId: string; commitSkip?: number | null; commitLimit?: number | null; cursor?: string | null; pageSize?: number | null },
) {
	return await loadJjOperationDiff(repoRoot, runVcsCommand, input.operationId, {
		commitSkip: input.commitSkip,
		commitLimit: input.commitLimit,
		cursor: input.cursor,
		pageSize: input.pageSize,
	});
}

export async function createJjSnapshot(repoRoot: string) {
	return await createJjOperationSnapshot(repoRoot, runVcsCommand);
}

export async function revertJjOperationById(repoRoot: string, input: { operationId: string }) {
	return await revertJjOperation(repoRoot, runVcsCommand, input.operationId);
}

export async function previewVcsOperation(repoRoot: string, input: VcsPreviewOperationInput) {
	return await previewJjOperation(repoRoot, input, runVcsCommand);
}

export async function applyVcsOperation(repoRoot: string, input: VcsApplyOperationInput) {
	return await applyJjOperation(repoRoot, input, runVcsCommand);
}

export async function submitVcsStackPreview(repoRoot: string, input: VcsSubmitStackPreviewInput) {
	return await previewJjStackSubmit(repoRoot, input, runVcsCommand);
}

export async function submitVcsStack(repoRoot: string, input: VcsSubmitStackPreviewInput) {
	return await submitJjStack(repoRoot, input, runVcsCommand);
}

function toRuntimePullRequestDetails(details: ReturnType<typeof getVcsPullRequestDetails>) {
	return {
		provider: details.provider,
		number: details.pullRequestNumber ?? 0,
		url: details.pullRequestUrl,
		baseBranch: details.baseBranch ?? null,
		headBranch: details.headBranch ?? null,
		title: details.title,
		body: details.body,
		state: details.state ?? "unknown",
		draft: details.draft ?? null,
		autoMerge: details.autoMerge ?? null,
		author: details.author ?? null,
		updatedAt: details.updatedAt ?? null,
	};
}

export async function getVcsPrDetails(repoRoot: string, input: Parameters<typeof getVcsPullRequestDetails>[1]) {
	return toRuntimePullRequestDetails(getVcsPullRequestDetails(repoRoot, input));
}

export async function updateVcsPrDetails(repoRoot: string, input: Parameters<typeof updateVcsPullRequestDetails>[1]) {
	return toRuntimePullRequestDetails(updateVcsPullRequestDetails(repoRoot, input));
}

export async function getVcsPrChecks(repoRoot: string, input: Parameters<typeof getVcsPullRequestChecks>[1]) {
	return getVcsPullRequestChecks(repoRoot, input);
}

export async function getVcsPrConversation(repoRoot: string, input: Parameters<typeof getVcsPullRequestConversation>[1]) {
	return getVcsPullRequestConversation(repoRoot, input);
}

export async function getVcsBaseChecks(repoRoot: string, input?: Parameters<typeof getVcsBaseBranchChecks>[1]) {
	return getVcsBaseBranchChecks(repoRoot, input);
}
