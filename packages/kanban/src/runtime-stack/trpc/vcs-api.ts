import { appendFileSync } from "node:fs";
import type {
	RuntimeVcsApplyOperationRequest,
	RuntimeVcsApplyOperationResponse,
	RuntimeVcsDetectResponse,
	RuntimeVcsDiffRequest,
	RuntimeVcsDiffResponse,
	RuntimeVcsJjDiffResponse,
	RuntimeVcsJjBranchesDataResponse,
	RuntimeVcsJjInventoryResponse,
	RuntimeVcsJjOperationDiffRequest,
	RuntimeVcsJjOperationDiffResponse,
	RuntimeVcsJjOperationsRequest,
	RuntimeVcsJjOperationsResponse,
	RuntimeVcsJjStateResponse,
	RuntimeVcsPreviewOperationRequest,
	RuntimeVcsPreviewOperationResponse,
	RuntimeVcsOperationPreviewResponse,
	RuntimeVcsOperationResultResponse,
	RuntimeVcsSubmitStackPreviewRequest,
	RuntimeVcsSubmitStackPreviewResponse,
	RuntimeVcsSubmitStackResponse,
	RuntimeVcsWorkspaceOperationRequest,
	RuntimeVcsWorkspaceStacksResponse,
	RuntimeVcsWorkspaceStateRequest,
	RuntimeVcsWorkspaceStateResponse,
} from "../core/api-contract.js";
import type { RuntimeTrpcContext, RuntimeTrpcWorkspaceScope } from "./app-router.js";
import type { RuntimeChangeyardApiAdapter } from "./changes-api.js";

export interface CreateVcsApiDependencies {
	changeyardApi?: RuntimeChangeyardApiAdapter | null;
	getActiveWorkspacePath: () => string | null;
	fallbackWorkspacePath: string;
}

function createUnavailableResponse(reason: string): RuntimeVcsDetectResponse {
	return {
		cwd: "",
		repository: {
			kind: "none",
			root: null,
		},
		jj: {
			installed: false,
			version: null,
			repoRoot: null,
			currentBookmark: null,
			currentChangeId: null,
			defaultBase: null,
		},
		git: {
			remoteName: null,
			remoteUrl: null,
			provider: "none",
			defaultBranch: null,
		},
		publishing: {
			provider: "none",
			remoteName: null,
			available: false,
			authenticated: false,
			reason,
		},
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

function createUnavailableJjStateResponse(reason: string): RuntimeVcsJjStateResponse {
	return {
		...createUnavailableResponse(reason),
		bookmarks: [],
		changes: [],
		stacks: [],
		unassignedChanges: [],
	};
}

function createUnavailableJjDiffResponse(reason: string): RuntimeVcsJjDiffResponse {
	return {
		changeId: null,
		summary: "",
		patch: "",
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

function createUnavailableJjInventoryResponse(reason: string): RuntimeVcsJjInventoryResponse {
	return {
		...createUnavailableResponse(reason),
		workspaceTarget: null,
		items: [],
	};
}

function createUnavailableJjBranchesDataResponse(reason: string): RuntimeVcsJjBranchesDataResponse {
	return {
		inventory: createUnavailableJjInventoryResponse(reason),
		state: createUnavailableJjStateResponse(reason),
	};
}

const unsupportedWorkspaceCapabilities: RuntimeVcsWorkspaceStateResponse["capabilities"] = {
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

function createUnavailableWorkspaceStateResponse(reason: string): RuntimeVcsWorkspaceStateResponse {
	return {
		projectId: "",
		provider: "git",
		targetRef: "",
		headId: null,
		mode: "unsupported",
		capabilities: unsupportedWorkspaceCapabilities,
		stacks: [],
		appliedStackIds: [],
		workingCopy: {
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
		},
		conflicts: [
			{
				id: "workspace-unavailable",
				path: null,
				message: reason,
				commitIds: [],
				stackIds: [],
			},
		],
	};
}

function createUnavailableWorkspaceStacksResponse(reason: string): RuntimeVcsWorkspaceStacksResponse {
	return {
		stacks: createUnavailableWorkspaceStateResponse(reason).stacks,
	};
}

function createUnavailableDiffResponse(reason: string): RuntimeVcsDiffResponse {
	return {
		ok: false,
		summary: "",
		patch: "",
		files: [],
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

function createUnavailableWorkspacePreviewResponse(
	reason: string,
	input: RuntimeVcsWorkspaceOperationRequest,
): RuntimeVcsOperationPreviewResponse {
	return {
		valid: false,
		operation: input.operation,
		title: "Preview unavailable",
		summary: reason,
		risk: "high",
		disabledReason: reason,
		warnings: [],
		conflicts: [],
		affectedStackIds: [],
		affectedCommitIds: [],
		affectedPaths: [],
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

function createUnavailableWorkspaceApplyResponse(
	reason: string,
	input: RuntimeVcsWorkspaceOperationRequest,
): RuntimeVcsOperationResultResponse {
	return {
		ok: false,
		operation: input.operation,
		title: "Operation unavailable",
		summary: reason,
		affectedStackIds: [],
		affectedCommitIds: [],
		affectedPaths: [],
		recovery: {
			instructions: [reason],
		},
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

function createUnavailableJjOperationsResponse(reason: string): RuntimeVcsJjOperationsResponse {
	return {
		operations: [],
		requestedLimit: 50,
		nextCursor: null,
		hasMore: false,
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

function createUnavailableJjOperationDiffResponse(
	reason: string,
	input: RuntimeVcsJjOperationDiffRequest,
): RuntimeVcsJjOperationDiffResponse {
	return {
		operationId: input.operationId,
		summary: "",
		patch: "",
		files: [],
		commits: [],
		commitSkip: input.commitSkip ?? 0,
		commitLimit: input.commitLimit ?? 50,
		nextCursor: null,
		totalCommitCount: 0,
		hasMoreCommits: false,
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

function createUnavailablePreviewResponse(
	reason: string,
	input: RuntimeVcsPreviewOperationRequest,
): RuntimeVcsPreviewOperationResponse {
	return {
		valid: false,
		operation: input,
		title: "Preview unavailable",
		description: reason,
		risk: "high",
		commands: [],
		affectedChangeIds: [],
		affectedBookmarks: [],
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

function createUnavailableApplyResponse(
	reason: string,
	input: RuntimeVcsApplyOperationRequest,
): RuntimeVcsApplyOperationResponse {
	return {
		ok: false,
		operation: input,
		title: "Operation unavailable",
		description: reason,
		risk: "high",
		command: null,
		stdout: "",
		stderr: "",
		exitCode: null,
		affectedChangeIds: [],
		affectedBookmarks: [],
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

function createUnavailableSubmitPreviewResponse(
	reason: string,
): RuntimeVcsSubmitStackPreviewResponse {
	return {
		available: false,
		targetBookmark: null,
		remoteName: null,
		repoOwner: null,
		repoName: null,
		items: [],
		commands: [],
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

function createUnavailableSubmitResponse(
	reason: string,
): RuntimeVcsSubmitStackResponse {
	return {
		ok: false,
		targetBookmark: null,
		remoteName: null,
		repoOwner: null,
		repoName: null,
		items: [],
		commands: [],
		diagnostics: [
			{
				level: "warning",
				code: "workspace_missing",
				message: reason,
			},
		],
	};
}

export function createVcsApi(deps: CreateVcsApiDependencies): RuntimeTrpcContext["vcsApi"] {
	return {
		detect: async (workspaceScope: RuntimeTrpcWorkspaceScope | null) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableResponse("No active workspace is available for VCS detection.");
			}
			if (!deps.changeyardApi?.detectVcs) {
				return createUnavailableResponse("Changeyard VCS detection is not available in this runtime.");
			}
			return await deps.changeyardApi.detectVcs(workspacePath);
		},
		jjDiff: async (workspaceScope: RuntimeTrpcWorkspaceScope | null) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableJjDiffResponse("No active workspace is available for JJ diff.");
			}
			if (!deps.changeyardApi?.getJjDiff) {
				return createUnavailableJjDiffResponse("Changeyard JJ diff is not available in this runtime.");
			}
			return await deps.changeyardApi.getJjDiff(workspacePath);
		},
		jjState: async (workspaceScope: RuntimeTrpcWorkspaceScope | null) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableJjStateResponse("No active workspace is available for JJ state.");
			}
			if (!deps.changeyardApi?.getJjState) {
				return createUnavailableJjStateResponse("Changeyard JJ state is not available in this runtime.");
			}
			return await deps.changeyardApi.getJjState(workspacePath);
		},
		jjInventory: async (workspaceScope: RuntimeTrpcWorkspaceScope | null) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableJjInventoryResponse("No active workspace is available for JJ inventory.");
			}
			if (!deps.changeyardApi?.getJjInventory) {
				return createUnavailableJjInventoryResponse("Changeyard JJ inventory is not available in this runtime.");
			}
			return await deps.changeyardApi.getJjInventory(workspacePath);
		},
		jjBranchesData: async (workspaceScope: RuntimeTrpcWorkspaceScope | null) => {
			const startedAt = Date.now();
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			try {
				if (!workspacePath) {
					return createUnavailableJjBranchesDataResponse("No active workspace is available for JJ branches data.");
				}
				if (!deps.changeyardApi?.getJjBranchesData) {
					return createUnavailableJjBranchesDataResponse("Changeyard JJ branches data is not available in this runtime.");
				}
				return await deps.changeyardApi.getJjBranchesData(workspacePath);
			} finally {
				writeVcsTiming(`[vcs timing] vcs.jjBranchesData ${Date.now() - startedAt}ms`);
			}
		},
		branchesData: async (workspaceScope: RuntimeTrpcWorkspaceScope | null) => {
			const startedAt = Date.now();
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			try {
				if (!workspacePath) {
					return createUnavailableJjBranchesDataResponse("No active workspace is available for VCS branches data.");
				}
				const readBranchesData = deps.changeyardApi?.getVcsBranchesData ?? deps.changeyardApi?.getJjBranchesData;
				if (!readBranchesData) {
					return createUnavailableJjBranchesDataResponse("Provider-neutral VCS branches data is not available in this runtime.");
				}
				return await readBranchesData(workspacePath);
			} finally {
				writeVcsTiming(`[vcs timing] vcs.branchesData ${Date.now() - startedAt}ms`);
			}
		},
		jjOperations: async (
			workspaceScope: RuntimeTrpcWorkspaceScope | null,
			input?: RuntimeVcsJjOperationsRequest,
		) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableJjOperationsResponse("No active workspace is available for JJ operation history.");
			}
			if (!deps.changeyardApi?.getJjOperations) {
				return createUnavailableJjOperationsResponse("Changeyard JJ operation history is not available in this runtime.");
			}
			return await deps.changeyardApi.getJjOperations(workspacePath, input);
		},
		jjOperationDiff: async (
			workspaceScope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsJjOperationDiffRequest,
		) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableJjOperationDiffResponse("No active workspace is available for JJ operation details.", input);
			}
			if (!deps.changeyardApi?.getJjOperationDiff) {
				return createUnavailableJjOperationDiffResponse(
					"Changeyard JJ operation details are not available in this runtime.",
					input,
				);
			}
			return await deps.changeyardApi.getJjOperationDiff(workspacePath, input);
		},
		workspaceState: async (
			workspaceScope: RuntimeTrpcWorkspaceScope | null,
			input?: RuntimeVcsWorkspaceStateRequest,
		) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableWorkspaceStateResponse("No active workspace is available for VCS workspace state.");
			}
			if (!deps.changeyardApi?.getVcsWorkspaceState) {
				return createUnavailableWorkspaceStateResponse("Provider-neutral VCS workspace state is not available in this runtime.");
			}
			return await deps.changeyardApi.getVcsWorkspaceState(workspacePath, input);
		},
		workspaceStacks: async (
			workspaceScope: RuntimeTrpcWorkspaceScope | null,
			input?: RuntimeVcsWorkspaceStateRequest,
		) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableWorkspaceStacksResponse("No active workspace is available for VCS stacks.");
			}
			if (!deps.changeyardApi?.getVcsWorkspaceStacks) {
				return createUnavailableWorkspaceStacksResponse("Provider-neutral VCS stacks are not available in this runtime.");
			}
			return await deps.changeyardApi.getVcsWorkspaceStacks(workspacePath, input);
		},
		diff: async (
			workspaceScope: RuntimeTrpcWorkspaceScope | null,
			input?: RuntimeVcsDiffRequest,
		) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableDiffResponse("No active workspace is available for VCS diff.");
			}
			if (!deps.changeyardApi?.getVcsDiff) {
				return createUnavailableDiffResponse("Provider-neutral VCS diff is not available in this runtime.");
			}
			return await deps.changeyardApi.getVcsDiff(workspacePath, input);
		},
		previewWorkspaceOperation: async (
			workspaceScope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsWorkspaceOperationRequest,
		) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableWorkspacePreviewResponse("No active workspace is available for VCS workspace previews.", input);
			}
			if (!deps.changeyardApi?.previewVcsWorkspaceOperation) {
				return createUnavailableWorkspacePreviewResponse(
					"Provider-neutral VCS workspace previews are not available in this runtime.",
					input,
				);
			}
			return await deps.changeyardApi.previewVcsWorkspaceOperation(workspacePath, input);
		},
		applyWorkspaceOperation: async (
			workspaceScope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsWorkspaceOperationRequest,
		) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableWorkspaceApplyResponse("No active workspace is available for VCS workspace operations.", input);
			}
			if (!deps.changeyardApi?.applyVcsWorkspaceOperation) {
				return createUnavailableWorkspaceApplyResponse(
					"Provider-neutral VCS workspace operations are not available in this runtime.",
					input,
				);
			}
			return await deps.changeyardApi.applyVcsWorkspaceOperation(workspacePath, input);
		},
		previewOperation: async (workspaceScope: RuntimeTrpcWorkspaceScope | null, input: RuntimeVcsPreviewOperationRequest) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailablePreviewResponse("No active workspace is available for VCS previews.", input);
			}
			if (!deps.changeyardApi?.previewVcsOperation) {
				return createUnavailablePreviewResponse("Changeyard VCS previews are not available in this runtime.", input);
			}
			return await deps.changeyardApi.previewVcsOperation(workspacePath, input);
		},
		applyOperation: async (workspaceScope: RuntimeTrpcWorkspaceScope | null, input: RuntimeVcsApplyOperationRequest) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableApplyResponse("No active workspace is available for VCS operations.", input);
			}
			if (!deps.changeyardApi?.applyVcsOperation) {
				return createUnavailableApplyResponse("Changeyard VCS operations are not available in this runtime.", input);
			}
			return await deps.changeyardApi.applyVcsOperation(workspacePath, input);
		},
		submitStackPreview: async (
			workspaceScope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsSubmitStackPreviewRequest,
		) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableSubmitPreviewResponse("No active workspace is available for VCS submit preview.");
			}
			if (!deps.changeyardApi?.submitVcsStackPreview) {
				return createUnavailableSubmitPreviewResponse(
					"Changeyard VCS submit preview is not available in this runtime.",
				);
			}
			return await deps.changeyardApi.submitVcsStackPreview(workspacePath, input);
		},
		submitStack: async (
			workspaceScope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsSubmitStackPreviewRequest,
		) => {
			const workspacePath = workspaceScope?.workspacePath ?? deps.getActiveWorkspacePath() ?? deps.fallbackWorkspacePath;
			if (!workspacePath) {
				return createUnavailableSubmitResponse("No active workspace is available for VCS submit.");
			}
			if (!deps.changeyardApi?.submitVcsStack) {
				return createUnavailableSubmitResponse("Changeyard VCS submit is not available in this runtime.");
			}
			return await deps.changeyardApi.submitVcsStack(workspacePath, input);
		},
	};
}

function writeVcsTiming(message: string): void {
	if (process.env.NODE_ENV === "production") {
		return;
	}
	const logPath = process.env.CHANGEYARD_VCS_TIMING_LOG;
	if (!logPath) {
		return;
	}
	try {
		appendFileSync(logPath, `${message}\n`, "utf8");
	} catch {
		// Timing diagnostics must never interfere with user-facing TUI rendering.
	}
}
