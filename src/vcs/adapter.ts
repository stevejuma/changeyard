import { detectVcsState } from "./detect.js";
import { loadConfig } from "../config/loadConfig.js";
import {
	applyGitWorkspaceOperation,
	loadGitWorkspaceDiff,
	loadGitWorkspaceStacks,
	loadGitWorkspaceState,
	previewGitWorkspaceOperation,
} from "./git/workspace.js";
import { applyJjOperation } from "./jj/apply.js";
import { loadJjDiff } from "./jj/diff.js";
import { loadJjInventory, loadJjInventoryFromDetect } from "./jj/inventory.js";
import { loadJjOperationDiff, loadJjOperations } from "./jj/operations.js";
import { previewJjOperation } from "./jj/preview.js";
import { previewJjStackSubmit, submitJjStack } from "./jj/stack-submit.js";
import { loadJjState, loadJjStateFromDetect } from "./jj/state.js";
import {
	applyJjWorkspaceOperation,
	loadJjWorkspaceDiff,
	loadJjWorkspaceStacks,
	loadJjWorkspaceState,
	previewJjWorkspaceOperation,
} from "./jj/workspace.js";
import type { NeutralOperationRequest } from "./workspace-types.js";
import { runVcsCommand } from "./process.js";
import type {
	VcsApplyOperationInput,
	VcsJjBranchesDataResult,
	VcsJjInventoryItem,
	VcsJjInventoryResult,
	VcsJjStateResult,
	VcsPreviewOperationInput,
	VcsSubmitStackPreviewInput,
} from "./types.js";

type GitWorkspaceStateResult = Awaited<ReturnType<typeof loadGitWorkspaceState>>;

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

function gitWorkspaceToBranchesData(
	detect: Awaited<ReturnType<typeof detectVcsState>>,
	state: GitWorkspaceStateResult,
): VcsJjBranchesDataResult {
	const appliedStackIds = new Set<string>(state.appliedStackIds);
	const stacks = state.stacks.map((stack, index) => {
		const changes = stack.commits.map((commit) => ({
			id: commit.commitId,
			changeId: commit.commitId,
			commitId: gitCommitDisplayId(commit),
			title: commit.title,
			authorName: commit.authorName,
			authorEmail: commit.authorEmail,
			authorAvatarUrl: commit.authorAvatarUrl,
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
	return { inventory, state: branchState };
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
	return await loadJjInventory(repoRoot, runVcsCommand, { targetBranch: config.vcs.targetBranch ?? null });
}

export async function getJjBranchesData(repoRoot: string) {
	const config = loadConfig(repoRoot);
	const detect = await detectVcsState(repoRoot, runVcsCommand);
	const options = { targetBranch: config.vcs.targetBranch ?? null };
	if (detect.repository.kind === "git") {
		const state = await loadGitWorkspaceState(repoRoot, runVcsCommand, {
			...options,
			appliedStackIds: config.vcs.appliedStacks ?? [],
		});
		return gitWorkspaceToBranchesData(detect, state);
	}
	const [inventory, state] = await Promise.all([
		loadJjInventoryFromDetect(repoRoot, runVcsCommand, detect, options),
		loadJjStateFromDetect(repoRoot, runVcsCommand, detect, options),
	]);
	return { inventory, state };
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
		return await loadJjWorkspaceState(repoRoot, runVcsCommand, {
			targetBranch: input?.targetRef ?? config.vcs.targetBranch ?? null,
			appliedStackIds: input?.appliedStackIds ?? config.vcs.appliedStacks ?? [],
		});
	}
	if (detect.repository.kind === "git") {
		return await loadGitWorkspaceState(repoRoot, runVcsCommand, {
			targetBranch: input?.targetRef ?? config.vcs.targetBranch ?? null,
			appliedStackIds: input?.appliedStackIds ?? config.vcs.appliedStacks ?? [],
		});
	}
	const targetRef = input?.targetRef ?? config.vcs.targetBranch ?? detect.jj.defaultBase ?? detect.git.defaultBranch ?? "";
	return {
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
	};
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
		return await applyJjWorkspaceOperation(repoRoot, input, runVcsCommand);
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
