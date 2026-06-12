import type {
	RuntimeVcsApplyOperationRequest,
	RuntimeVcsApplyOperationResponse,
	RuntimeVcsDetectResponse,
	RuntimeVcsJjDiffResponse,
	RuntimeVcsJjInventoryResponse,
	RuntimeVcsJjOperationDiffRequest,
	RuntimeVcsJjOperationDiffResponse,
	RuntimeVcsJjOperationsRequest,
	RuntimeVcsJjOperationsResponse,
	RuntimeVcsJjStateResponse,
	RuntimeVcsPreviewOperationRequest,
	RuntimeVcsPreviewOperationResponse,
	RuntimeVcsSubmitStackPreviewRequest,
	RuntimeVcsSubmitStackPreviewResponse,
	RuntimeVcsSubmitStackResponse,
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
		lanes: [],
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

function createUnavailableJjOperationsResponse(reason: string): RuntimeVcsJjOperationsResponse {
	return {
		operations: [],
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
