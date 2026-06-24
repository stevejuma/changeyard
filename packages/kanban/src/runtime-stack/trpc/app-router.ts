// Defines the typed TRPC boundary between the browser and the local runtime.
// Keep request and response contracts plus workspace-scoped procedures here,
// and delegate domain behavior to runtime-api.ts and lower-level services.
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

import type {
	RuntimeClineAccountBalanceResponse,
	RuntimeClineAccountOrganizationsResponse,
	RuntimeClineAccountProfileResponse,
	RuntimeClineAccountSwitchRequest,
	RuntimeClineAccountSwitchResponse,
	RuntimeClineAddProviderRequest,
	RuntimeClineAddProviderResponse,
	RuntimeClineDeviceAuthCompleteRequest,
	RuntimeClineDeviceAuthCompleteResponse,
	RuntimeClineDeviceAuthStartResponse,
	RuntimeClineKanbanAccessResponse,
	RuntimeClineMcpAuthStatusResponse,
	RuntimeClineMcpOAuthRequest,
	RuntimeClineMcpOAuthResponse,
	RuntimeClineMcpSettingsResponse,
	RuntimeClineMcpSettingsSaveRequest,
	RuntimeClineMcpSettingsSaveResponse,
	RuntimeClineOauthLoginRequest,
	RuntimeClineOauthLoginResponse,
	RuntimeClineProviderCatalogResponse,
	RuntimeClineProviderModelsRequest,
	RuntimeClineProviderModelsResponse,
	RuntimeClineProviderSettingsSaveRequest,
	RuntimeClineProviderSettingsSaveResponse,
	RuntimeClineUpdateProviderRequest,
	RuntimeClineUpdateProviderResponse,
	RuntimeCommandRunRequest,
	RuntimeCommandRunResponse,
	RuntimeConfigResponse,
	RuntimeConfigSaveRequest,
	RuntimeDebugResetAllStateResponse,
	RuntimeDirectoryListRequest,
	RuntimeDirectoryListResponse,
	RuntimeFeaturebaseTokenResponse,
	RuntimeGitCheckoutRequest,
	RuntimeGitCheckoutResponse,
	RuntimeGitCommitDiffRequest,
	RuntimeGitCommitDiffResponse,
	RuntimeGitDiscardResponse,
	RuntimeGitLogRequest,
	RuntimeGitLogResponse,
	RuntimeGitRefsResponse,
	RuntimeGitSummaryResponse,
	RuntimeGitSyncRequest,
	RuntimeGitSyncResponse,
	RuntimeHookIngestRequest,
	RuntimeHookIngestResponse,
	RuntimeHubInstancesResponse,
	RuntimeHubKillRequest,
	RuntimeHubKillResponse,
	RuntimeHubRestartResponse,
	RuntimeOpenFileRequest,
	RuntimeOpenFileResponse,
	RuntimeProjectAddRequest,
	RuntimeProjectAddResponse,
	RuntimeProjectDirectoryPickerResponse,
	RuntimeProjectRemoveRequest,
	RuntimeProjectRemoveResponse,
	RuntimeProjectsResponse,
	RuntimeRunUpdateResponse,
	RuntimeSessionAttachRequest,
	RuntimeSessionAttachResponse,
	RuntimeShellSessionStartRequest,
	RuntimeShellSessionStartResponse,
	RuntimeSlashCommandsResponse,
	RuntimeTaskChatAbortRequest,
	RuntimeTaskChatAbortResponse,
	RuntimeTaskChatCancelRequest,
	RuntimeTaskChatCancelResponse,
	RuntimeTaskChatMessagesRequest,
	RuntimeTaskChatMessagesResponse,
	RuntimeTaskChatReloadRequest,
	RuntimeTaskChatReloadResponse,
	RuntimeTaskChatSendRequest,
	RuntimeTaskChatSendResponse,
	RuntimeTaskSessionInputRequest,
	RuntimeTaskSessionInputResponse,
	RuntimeTaskSessionStartRequest,
	RuntimeTaskSessionStartResponse,
	RuntimeTaskSessionStopRequest,
	RuntimeTaskSessionStopResponse,
	RuntimeTaskWorkspaceInfoRequest,
	RuntimeTaskWorkspaceInfoResponse,
	RuntimeUpdateStatusResponse,
	RuntimeVcsDetectResponse,
	RuntimeVcsActiveWorkspaceRequest,
	RuntimeVcsApplyOperationRequest,
	RuntimeVcsApplyOperationResponse,
	RuntimeVcsConflictFileRequest,
	RuntimeVcsConflictFileResponse,
	RuntimeVcsDiffRequest,
	RuntimeVcsDiffResponse,
	RuntimeVcsJjDiffResponse,
	RuntimeVcsJjBranchesDataResponse,
	RuntimeVcsJjInventoryResponse,
	RuntimeVcsJjOperationDiffRequest,
	RuntimeVcsJjOperationDiffResponse,
	RuntimeVcsJjOperationActionResponse,
	RuntimeVcsJjOperationRevertRequest,
	RuntimeVcsJjOperationsRequest,
	RuntimeVcsJjOperationsResponse,
	RuntimeVcsJjStateResponse,
	RuntimeVcsPreviewOperationRequest,
	RuntimeVcsPreviewOperationResponse,
	RuntimeVcsResolveConflictFileRequest,
	RuntimeVcsResolveConflictFileResponse,
	RuntimeVcsOperationPreviewResponse,
	RuntimeVcsOperationResultResponse,
	RuntimeVcsSubmitStackPreviewRequest,
	RuntimeVcsSubmitStackPreviewResponse,
	RuntimeVcsSubmitStackResponse,
	RuntimeVcsBaseBranchChecksRequest,
	RuntimeVcsBranchChecksResponse,
	RuntimeVcsPullRequestChecksResponse,
	RuntimeVcsPullRequestConversation,
	RuntimeVcsPullRequestDetails,
	RuntimeVcsPullRequestSelector,
	RuntimeVcsPullRequestUpdateRequest,
	RuntimeVcsWorkspaceOperationRequest,
	RuntimeVcsWorkspaceStacksResponse,
	RuntimeVcsWorkspaceStateRequest,
	RuntimeVcsWorkspaceStateResponse,
	RuntimeWorkspaceChangesRequest,
	RuntimeWorkspaceChangesResponse,
	RuntimeWorkspaceFileSearchRequest,
	RuntimeWorkspaceFileSearchResponse,
	RuntimeWorkspaceStateNotifyResponse,
	RuntimeWorkspaceStateResponse,
	RuntimeWorkspaceStateSaveRequest,
	RuntimeWorktreeDeleteRequest,
	RuntimeWorktreeDeleteResponse,
	RuntimeWorktreeEnsureRequest,
	RuntimeWorktreeEnsureResponse,
} from "../core/api-contract.js";
import {
	runtimeChangeyardChangeCreateRequestSchema,
	runtimeChangeyardChangeActionResponseSchema,
	runtimeChangeyardBoardFileDiffRequestSchema,
	runtimeChangeyardBoardFileDiffResponseSchema,
	runtimeChangeyardBoardFilesRequestSchema,
	runtimeChangeyardBoardFilesResponseSchema,
	runtimeChangeyardBoardSummaryResponseSchema,
	runtimeChangeyardCompleteRequestSchema,
	runtimeChangeyardChangeDetailSchema,
	runtimeChangeyardChangeDependencyRequestSchema,
	runtimeChangeyardChangeGetRequestSchema,
	runtimeChangeyardChangeUpdateStatusRequestSchema,
	runtimeChangeyardChangeUpdateBodyRequestSchema,
	runtimeChangeyardLandRequestSchema,
	runtimeChangeyardNextActionSchema,
	runtimeChangeyardPlanningPromptRequestSchema,
	runtimeChangeyardPlanningPromptResponseSchema,
	runtimeChangeyardReviewCompleteRequestSchema,
	runtimeChangeyardReviewDetailSchema,
	runtimeChangeyardReviewGetRequestSchema,
	runtimeChangeyardReviewListRequestSchema,
	runtimeChangeyardReviewListResponseSchema,
	runtimeChangeyardReviewUpdateRequestSchema,
	runtimeChangeyardChangeUpdatePlanningSectionRequestSchema,
	runtimeChangeyardChangesListResponseSchema,
	runtimeChangeyardWorkspaceDeleteRequestSchema,
	runtimeChangeyardWorkspaceStatusSchema,
	runtimeChangeyardDoctorResponseSchema,
	runtimeChangeyardInitResponseSchema,
	runtimeChangeyardUpdateResponseSchema,
	runtimeChangeyardProjectConfigSchema,
	runtimeChangeyardUpdateProjectConfigRequestSchema,
	runtimeClineAccountBalanceResponseSchema,
	runtimeClineAccountOrganizationsResponseSchema,
	runtimeClineAccountProfileResponseSchema,
	runtimeClineAccountSwitchRequestSchema,
	runtimeClineAccountSwitchResponseSchema,
	runtimeClineAddProviderRequestSchema,
	runtimeClineAddProviderResponseSchema,
	runtimeClineDeviceAuthCompleteRequestSchema,
	runtimeClineDeviceAuthCompleteResponseSchema,
	runtimeClineDeviceAuthStartResponseSchema,
	runtimeClineKanbanAccessResponseSchema,
	runtimeClineMcpAuthStatusResponseSchema,
	runtimeClineMcpOAuthRequestSchema,
	runtimeClineMcpOAuthResponseSchema,
	runtimeClineMcpSettingsResponseSchema,
	runtimeClineMcpSettingsSaveRequestSchema,
	runtimeClineMcpSettingsSaveResponseSchema,
	runtimeClineOauthLoginRequestSchema,
	runtimeClineOauthLoginResponseSchema,
	runtimeClineProviderCatalogResponseSchema,
	runtimeClineProviderModelsRequestSchema,
	runtimeClineProviderModelsResponseSchema,
	runtimeClineProviderSettingsSaveRequestSchema,
	runtimeClineProviderSettingsSaveResponseSchema,
	runtimeClineUpdateProviderRequestSchema,
	runtimeClineUpdateProviderResponseSchema,
	runtimeCommandRunRequestSchema,
	runtimeCommandRunResponseSchema,
	runtimeConfigResponseSchema,
	runtimeConfigSaveRequestSchema,
	runtimeDebugResetAllStateResponseSchema,
	runtimeDirectoryListRequestSchema,
	runtimeDirectoryListResponseSchema,
	runtimeFeaturebaseTokenResponseSchema,
	runtimeGitCheckoutRequestSchema,
	runtimeGitCheckoutResponseSchema,
	runtimeGitCommitDiffRequestSchema,
	runtimeGitCommitDiffResponseSchema,
	runtimeGitDiscardResponseSchema,
	runtimeGitLogRequestSchema,
	runtimeGitLogResponseSchema,
	runtimeGitRefsResponseSchema,
	runtimeGitSummaryResponseSchema,
	runtimeGitSyncRequestSchema,
	runtimeGitSyncResponseSchema,
	runtimeHookIngestRequestSchema,
	runtimeHookIngestResponseSchema,
	runtimeHubInstancesResponseSchema,
	runtimeHubKillRequestSchema,
	runtimeHubKillResponseSchema,
	runtimeHubRestartResponseSchema,
	runtimeOpenFileRequestSchema,
	runtimeOpenFileResponseSchema,
	runtimeProjectAddRequestSchema,
	runtimeProjectAddResponseSchema,
	runtimeProjectDirectoryPickerResponseSchema,
	runtimeProjectRemoveRequestSchema,
	runtimeProjectRemoveResponseSchema,
	runtimeProjectsResponseSchema,
	runtimeRunUpdateResponseSchema,
	runtimeSessionAttachRequestSchema,
	runtimeSessionAttachResponseSchema,
	runtimeShellSessionStartRequestSchema,
	runtimeShellSessionStartResponseSchema,
	runtimeSlashCommandsResponseSchema,
	runtimeTaskChatAbortRequestSchema,
	runtimeTaskChatAbortResponseSchema,
	runtimeTaskChatCancelRequestSchema,
	runtimeTaskChatCancelResponseSchema,
	runtimeTaskChatMessagesRequestSchema,
	runtimeTaskChatMessagesResponseSchema,
	runtimeTaskChatReloadRequestSchema,
	runtimeTaskChatReloadResponseSchema,
	runtimeTaskChatSendRequestSchema,
	runtimeTaskChatSendResponseSchema,
	runtimeTaskSessionInputRequestSchema,
	runtimeTaskSessionInputResponseSchema,
	runtimeTaskSessionStartRequestSchema,
	runtimeTaskSessionStartResponseSchema,
	runtimeTaskSessionStopRequestSchema,
	runtimeTaskSessionStopResponseSchema,
	runtimeTaskWorkspaceInfoRequestSchema,
	runtimeTaskWorkspaceInfoResponseSchema,
	runtimeUpdateStatusResponseSchema,
	runtimeVcsDetectResponseSchema,
	runtimeVcsActiveWorkspaceRequestSchema,
	runtimeVcsApplyOperationRequestSchema,
	runtimeVcsApplyOperationResponseSchema,
	runtimeVcsConflictFileRequestSchema,
	runtimeVcsConflictFileResponseSchema,
	runtimeVcsDiffRequestSchema,
	runtimeVcsDiffResultSchema,
	runtimeVcsJjDiffResponseSchema,
	runtimeVcsJjBranchesDataResponseSchema,
	runtimeVcsJjInventoryResponseSchema,
	runtimeVcsJjOperationDiffRequestSchema,
	runtimeVcsJjOperationDiffResponseSchema,
	runtimeVcsJjOperationActionResponseSchema,
	runtimeVcsJjOperationRevertRequestSchema,
	runtimeVcsJjOperationsRequestSchema,
	runtimeVcsJjOperationsResponseSchema,
	runtimeVcsJjStateResponseSchema,
	runtimeVcsPreviewOperationRequestSchema,
	runtimeVcsPreviewOperationResponseSchema,
	runtimeVcsResolveConflictFileRequestSchema,
	runtimeVcsResolveConflictFileResponseSchema,
	runtimeVcsOperationPreviewSchema,
	runtimeVcsOperationResultSchema,
	runtimeVcsSubmitStackPreviewRequestSchema,
	runtimeVcsSubmitStackPreviewResponseSchema,
	runtimeVcsSubmitStackResponseSchema,
	runtimeVcsBaseBranchChecksRequestSchema,
	runtimeVcsBranchChecksResponseSchema,
	runtimeVcsPullRequestChecksResponseSchema,
	runtimeVcsPullRequestConversationSchema,
	runtimeVcsPullRequestDetailsSchema,
	runtimeVcsPullRequestSelectorSchema,
	runtimeVcsPullRequestUpdateRequestSchema,
	runtimeVcsWorkspaceOperationRequestSchema,
	runtimeVcsWorkspaceStacksResponseSchema,
	runtimeVcsWorkspaceStateRequestSchema,
	runtimeVcsWorkspaceStateResponseSchema,
	runtimeWorkspaceChangesRequestSchema,
	runtimeWorkspaceChangesResponseSchema,
	runtimeWorkspaceFileSearchRequestSchema,
	runtimeWorkspaceFileSearchResponseSchema,
	runtimeWorkspaceStateNotifyResponseSchema,
	runtimeWorkspaceStateResponseSchema,
	runtimeWorkspaceStateSaveRequestSchema,
	runtimeWorktreeDeleteRequestSchema,
	runtimeWorktreeDeleteResponseSchema,
	runtimeWorktreeEnsureRequestSchema,
	runtimeWorktreeEnsureResponseSchema,
} from "../core/api-contract.js";
import type { RuntimeTrpcChangesApi } from "./changes-api.js";

export interface RuntimeTrpcWorkspaceScope {
	workspaceId: string;
	workspacePath: string;
}

export interface RuntimeTrpcContext {
	requestedWorkspaceId: string | null;
	workspaceScope: RuntimeTrpcWorkspaceScope | null;
	runtimeApi: {
		loadConfig: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeConfigResponse>;
		saveConfig: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeConfigSaveRequest,
		) => Promise<RuntimeConfigResponse>;
		saveClineProviderSettings: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeClineProviderSettingsSaveRequest,
		) => Promise<RuntimeClineProviderSettingsSaveResponse>;
		addClineProvider: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeClineAddProviderRequest,
		) => Promise<RuntimeClineAddProviderResponse>;
		updateClineProvider: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeClineUpdateProviderRequest,
		) => Promise<RuntimeClineUpdateProviderResponse>;
		startTaskSession: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskSessionStartRequest,
		) => Promise<RuntimeTaskSessionStartResponse>;
		stopTaskSession: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskSessionStopRequest,
		) => Promise<RuntimeTaskSessionStopResponse>;
		sendTaskSessionInput: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskSessionInputRequest,
		) => Promise<RuntimeTaskSessionInputResponse>;
		getTaskChatMessages: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskChatMessagesRequest,
		) => Promise<RuntimeTaskChatMessagesResponse>;
		getClineSlashCommands: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeSlashCommandsResponse>;
		sendTaskChatMessage: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskChatSendRequest,
		) => Promise<RuntimeTaskChatSendResponse>;
		reloadTaskChatSession: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskChatReloadRequest,
		) => Promise<RuntimeTaskChatReloadResponse>;
		abortTaskChatTurn: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskChatAbortRequest,
		) => Promise<RuntimeTaskChatAbortResponse>;
		cancelTaskChatTurn: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskChatCancelRequest,
		) => Promise<RuntimeTaskChatCancelResponse>;
		getClineProviderCatalog: (
			scope: RuntimeTrpcWorkspaceScope | null,
		) => Promise<RuntimeClineProviderCatalogResponse>;
		getClineAccountProfile: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeClineAccountProfileResponse>;
		getClineKanbanAccess: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeClineKanbanAccessResponse>;
		getFeaturebaseToken: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeFeaturebaseTokenResponse>;
		getClineAccountBalance: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeClineAccountBalanceResponse>;
		getClineAccountOrganizations: (
			scope: RuntimeTrpcWorkspaceScope | null,
		) => Promise<RuntimeClineAccountOrganizationsResponse>;
		switchClineAccount: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeClineAccountSwitchRequest,
		) => Promise<RuntimeClineAccountSwitchResponse>;
		getClineProviderModels: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeClineProviderModelsRequest,
		) => Promise<RuntimeClineProviderModelsResponse>;
		runClineProviderOAuthLogin: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeClineOauthLoginRequest,
		) => Promise<RuntimeClineOauthLoginResponse>;
		startClineDeviceAuth: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeClineDeviceAuthStartResponse>;
		completeClineDeviceAuth: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeClineDeviceAuthCompleteRequest,
		) => Promise<RuntimeClineDeviceAuthCompleteResponse>;
		getClineMcpAuthStatuses: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeClineMcpAuthStatusResponse>;
		runClineMcpServerOAuth: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeClineMcpOAuthRequest,
		) => Promise<RuntimeClineMcpOAuthResponse>;
		getClineMcpSettings: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeClineMcpSettingsResponse>;
		saveClineMcpSettings: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeClineMcpSettingsSaveRequest,
		) => Promise<RuntimeClineMcpSettingsSaveResponse>;
		startShellSession: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeShellSessionStartRequest,
		) => Promise<RuntimeShellSessionStartResponse>;
		runCommand: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeCommandRunRequest,
		) => Promise<RuntimeCommandRunResponse>;
		resetAllState: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeDebugResetAllStateResponse>;
		openFile: (input: RuntimeOpenFileRequest) => Promise<RuntimeOpenFileResponse>;
		getUpdateStatus: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeUpdateStatusResponse>;
		runUpdateNow: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeRunUpdateResponse>;
		restartHub: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeHubRestartResponse>;
		listHubInstances: (scope: RuntimeTrpcWorkspaceScope | null) => Promise<RuntimeHubInstancesResponse>;
		killHubInstance: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeHubKillRequest,
		) => Promise<RuntimeHubKillResponse>;
	};
	workspaceApi: {
		loadGitSummary: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskWorkspaceInfoRequest | null,
		) => Promise<RuntimeGitSummaryResponse>;
		runGitSyncAction: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeGitSyncRequest,
		) => Promise<RuntimeGitSyncResponse>;
		checkoutGitBranch: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeGitCheckoutRequest,
		) => Promise<RuntimeGitCheckoutResponse>;
		discardGitChanges: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskWorkspaceInfoRequest | null,
		) => Promise<RuntimeGitDiscardResponse>;
		loadChanges: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeWorkspaceChangesRequest,
		) => Promise<RuntimeWorkspaceChangesResponse>;
		ensureWorktree: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeWorktreeEnsureRequest,
		) => Promise<RuntimeWorktreeEnsureResponse>;
		deleteWorktree: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeWorktreeDeleteRequest,
		) => Promise<RuntimeWorktreeDeleteResponse>;
		loadTaskContext: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskWorkspaceInfoRequest,
		) => Promise<RuntimeTaskWorkspaceInfoResponse>;
		searchFiles: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeWorkspaceFileSearchRequest,
		) => Promise<RuntimeWorkspaceFileSearchResponse>;
		loadState: (scope: RuntimeTrpcWorkspaceScope) => Promise<RuntimeWorkspaceStateResponse>;
		notifyStateUpdated: (scope: RuntimeTrpcWorkspaceScope) => Promise<RuntimeWorkspaceStateNotifyResponse>;
		saveState: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeWorkspaceStateSaveRequest,
		) => Promise<RuntimeWorkspaceStateResponse>;
		loadWorkspaceChanges: (scope: RuntimeTrpcWorkspaceScope) => Promise<RuntimeWorkspaceChangesResponse>;
		loadGitLog: (scope: RuntimeTrpcWorkspaceScope, input: RuntimeGitLogRequest) => Promise<RuntimeGitLogResponse>;
		loadRepositoryLog: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeGitLogRequest,
		) => Promise<RuntimeGitLogResponse>;
		loadGitRefs: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskWorkspaceInfoRequest | null,
		) => Promise<RuntimeGitRefsResponse>;
		loadRepositoryRefs: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeTaskWorkspaceInfoRequest | null,
		) => Promise<RuntimeGitRefsResponse>;
		loadCommitDiff: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeGitCommitDiffRequest,
		) => Promise<RuntimeGitCommitDiffResponse>;
		loadRepositoryCommitDiff: (
			scope: RuntimeTrpcWorkspaceScope,
			input: RuntimeGitCommitDiffRequest,
		) => Promise<RuntimeGitCommitDiffResponse>;
	};
	vcsApi: {
		detect: (scope: RuntimeTrpcWorkspaceScope | null, input?: RuntimeVcsActiveWorkspaceRequest) => Promise<RuntimeVcsDetectResponse>;
		jjDiff: (scope: RuntimeTrpcWorkspaceScope | null, input?: RuntimeVcsActiveWorkspaceRequest) => Promise<RuntimeVcsJjDiffResponse>;
		jjState: (scope: RuntimeTrpcWorkspaceScope | null, input?: RuntimeVcsActiveWorkspaceRequest) => Promise<RuntimeVcsJjStateResponse>;
		jjInventory: (scope: RuntimeTrpcWorkspaceScope | null, input?: RuntimeVcsActiveWorkspaceRequest) => Promise<RuntimeVcsJjInventoryResponse>;
		jjBranchesData: (scope: RuntimeTrpcWorkspaceScope | null, input?: RuntimeVcsActiveWorkspaceRequest) => Promise<RuntimeVcsJjBranchesDataResponse>;
		branchesData: (scope: RuntimeTrpcWorkspaceScope | null, input?: RuntimeVcsActiveWorkspaceRequest) => Promise<RuntimeVcsJjBranchesDataResponse>;
		jjOperations: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input?: RuntimeVcsJjOperationsRequest,
		) => Promise<RuntimeVcsJjOperationsResponse>;
		jjOperationDiff: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsJjOperationDiffRequest,
		) => Promise<RuntimeVcsJjOperationDiffResponse>;
		createJjOperationSnapshot: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input?: RuntimeVcsActiveWorkspaceRequest,
		) => Promise<RuntimeVcsJjOperationActionResponse>;
		revertJjOperation: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsJjOperationRevertRequest,
		) => Promise<RuntimeVcsJjOperationActionResponse>;
		workspaceState: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input?: RuntimeVcsWorkspaceStateRequest,
		) => Promise<RuntimeVcsWorkspaceStateResponse>;
		workspaceStacks: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input?: RuntimeVcsWorkspaceStateRequest,
		) => Promise<RuntimeVcsWorkspaceStacksResponse>;
		diff: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input?: RuntimeVcsDiffRequest,
		) => Promise<RuntimeVcsDiffResponse>;
		conflictFile: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsConflictFileRequest,
		) => Promise<RuntimeVcsConflictFileResponse>;
		resolveConflictFile: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsResolveConflictFileRequest,
		) => Promise<RuntimeVcsResolveConflictFileResponse>;
		previewWorkspaceOperation: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsWorkspaceOperationRequest,
		) => Promise<RuntimeVcsOperationPreviewResponse>;
		applyWorkspaceOperation: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsWorkspaceOperationRequest,
		) => Promise<RuntimeVcsOperationResultResponse>;
		previewOperation: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsPreviewOperationRequest,
		) => Promise<RuntimeVcsPreviewOperationResponse>;
		applyOperation: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsApplyOperationRequest,
		) => Promise<RuntimeVcsApplyOperationResponse>;
		submitStackPreview: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsSubmitStackPreviewRequest,
		) => Promise<RuntimeVcsSubmitStackPreviewResponse>;
		submitStack: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsSubmitStackPreviewRequest,
		) => Promise<RuntimeVcsSubmitStackResponse>;
		pullRequestDetails: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsPullRequestSelector,
		) => Promise<RuntimeVcsPullRequestDetails>;
		updatePullRequest: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsPullRequestUpdateRequest,
		) => Promise<RuntimeVcsPullRequestDetails>;
		pullRequestChecks: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsPullRequestSelector,
		) => Promise<RuntimeVcsPullRequestChecksResponse>;
		pullRequestConversation: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input: RuntimeVcsPullRequestSelector,
		) => Promise<RuntimeVcsPullRequestConversation>;
		baseBranchChecks: (
			scope: RuntimeTrpcWorkspaceScope | null,
			input?: RuntimeVcsBaseBranchChecksRequest,
		) => Promise<RuntimeVcsBranchChecksResponse>;
	};
	projectsApi: {
		listProjects: (preferredWorkspaceId: string | null) => Promise<RuntimeProjectsResponse>;
		addProject: (
			preferredWorkspaceId: string | null,
			input: RuntimeProjectAddRequest,
		) => Promise<RuntimeProjectAddResponse>;
		removeProject: (
			preferredWorkspaceId: string | null,
			input: RuntimeProjectRemoveRequest,
		) => Promise<RuntimeProjectRemoveResponse>;
		pickProjectDirectory: (preferredWorkspaceId: string | null) => Promise<RuntimeProjectDirectoryPickerResponse>;
		listDirectoryContents: (
			preferredWorkspaceId: string | null,
			input: RuntimeDirectoryListRequest,
		) => Promise<RuntimeDirectoryListResponse>;
	};
	hooksApi: {
		ingest: (input: RuntimeHookIngestRequest) => Promise<RuntimeHookIngestResponse>;
	};
	sessionApi: {
		attach: (input: RuntimeSessionAttachRequest) => Promise<RuntimeSessionAttachResponse>;
	};
	changesApi: RuntimeTrpcChangesApi;
}

interface RuntimeTrpcContextWithWorkspaceScope extends RuntimeTrpcContext {
	workspaceScope: RuntimeTrpcWorkspaceScope;
}

function readConflictRevision(cause: unknown): number | null {
	if (!cause || typeof cause !== "object" || !("currentRevision" in cause)) {
		return null;
	}
	const revision = (cause as { currentRevision?: unknown }).currentRevision;
	if (typeof revision !== "number") {
		return null;
	}
	return Number.isFinite(revision) ? revision : null;
}

function readConflictUpdatedAt(cause: unknown): string | null {
	if (!cause || typeof cause !== "object" || !("currentUpdatedAt" in cause)) {
		return null;
	}
	const updatedAt = (cause as { currentUpdatedAt?: unknown }).currentUpdatedAt;
	return typeof updatedAt === "string" ? updatedAt : null;
}

const t = initTRPC.context<RuntimeTrpcContext>().create({
	errorFormatter({ shape, error }) {
		const conflictRevision = error.code === "CONFLICT" ? readConflictRevision(error.cause) : null;
		const conflictUpdatedAt = error.code === "CONFLICT" ? readConflictUpdatedAt(error.cause) : null;
		return {
			...shape,
			data: {
				...shape.data,
				conflictRevision,
				conflictUpdatedAt,
			},
		};
	},
});

const workspaceProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.requestedWorkspaceId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Missing workspace scope. Include x-kanban-workspace-id header or workspaceId query parameter.",
		});
	}
	if (!ctx.workspaceScope) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Unknown workspace ID: ${ctx.requestedWorkspaceId}`,
		});
	}
	return next({
		ctx: {
			...ctx,
			workspaceScope: ctx.workspaceScope,
		} satisfies RuntimeTrpcContextWithWorkspaceScope,
	});
});

const optionalTaskWorkspaceInfoRequestSchema = runtimeTaskWorkspaceInfoRequestSchema.nullable().optional();
const gitSyncActionInputSchema = runtimeGitSyncRequestSchema;

export const runtimeAppRouter = t.router({
	runtime: t.router({
		getConfig: t.procedure.output(runtimeConfigResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.loadConfig(ctx.workspaceScope);
		}),
		saveConfig: t.procedure
			.input(runtimeConfigSaveRequestSchema)
			.output(runtimeConfigResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.saveConfig(ctx.workspaceScope, input);
			}),
		saveClineProviderSettings: t.procedure
			.input(runtimeClineProviderSettingsSaveRequestSchema)
			.output(runtimeClineProviderSettingsSaveResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.saveClineProviderSettings(ctx.workspaceScope, input);
			}),
		addClineProvider: t.procedure
			.input(runtimeClineAddProviderRequestSchema)
			.output(runtimeClineAddProviderResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.addClineProvider(ctx.workspaceScope, input);
			}),
		updateClineProvider: t.procedure
			.input(runtimeClineUpdateProviderRequestSchema)
			.output(runtimeClineUpdateProviderResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.updateClineProvider(ctx.workspaceScope, input);
			}),
		startTaskSession: workspaceProcedure
			.input(runtimeTaskSessionStartRequestSchema)
			.output(runtimeTaskSessionStartResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.startTaskSession(ctx.workspaceScope, input);
			}),
		stopTaskSession: workspaceProcedure
			.input(runtimeTaskSessionStopRequestSchema)
			.output(runtimeTaskSessionStopResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.stopTaskSession(ctx.workspaceScope, input);
			}),
		sendTaskSessionInput: workspaceProcedure
			.input(runtimeTaskSessionInputRequestSchema)
			.output(runtimeTaskSessionInputResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.sendTaskSessionInput(ctx.workspaceScope, input);
			}),
		getTaskChatMessages: workspaceProcedure
			.input(runtimeTaskChatMessagesRequestSchema)
			.output(runtimeTaskChatMessagesResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.runtimeApi.getTaskChatMessages(ctx.workspaceScope, input);
			}),
		getClineSlashCommands: t.procedure.output(runtimeSlashCommandsResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.getClineSlashCommands(ctx.workspaceScope);
		}),
		reloadTaskChatSession: workspaceProcedure
			.input(runtimeTaskChatReloadRequestSchema)
			.output(runtimeTaskChatReloadResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.reloadTaskChatSession(ctx.workspaceScope, input);
			}),
		sendTaskChatMessage: workspaceProcedure
			.input(runtimeTaskChatSendRequestSchema)
			.output(runtimeTaskChatSendResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.sendTaskChatMessage(ctx.workspaceScope, input);
			}),
		abortTaskChatTurn: workspaceProcedure
			.input(runtimeTaskChatAbortRequestSchema)
			.output(runtimeTaskChatAbortResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.abortTaskChatTurn(ctx.workspaceScope, input);
			}),
		cancelTaskChatTurn: workspaceProcedure
			.input(runtimeTaskChatCancelRequestSchema)
			.output(runtimeTaskChatCancelResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.cancelTaskChatTurn(ctx.workspaceScope, input);
			}),
		getClineProviderCatalog: t.procedure.output(runtimeClineProviderCatalogResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.getClineProviderCatalog(ctx.workspaceScope);
		}),
		getClineAccountProfile: t.procedure.output(runtimeClineAccountProfileResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.getClineAccountProfile(ctx.workspaceScope);
		}),
		getClineKanbanAccess: t.procedure.output(runtimeClineKanbanAccessResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.getClineKanbanAccess(ctx.workspaceScope);
		}),
		getFeaturebaseToken: t.procedure.output(runtimeFeaturebaseTokenResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.getFeaturebaseToken(ctx.workspaceScope);
		}),
		getClineAccountBalance: t.procedure.output(runtimeClineAccountBalanceResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.getClineAccountBalance(ctx.workspaceScope);
		}),
		getClineAccountOrganizations: t.procedure
			.output(runtimeClineAccountOrganizationsResponseSchema)
			.query(async ({ ctx }) => {
				return await ctx.runtimeApi.getClineAccountOrganizations(ctx.workspaceScope);
			}),
		switchClineAccount: t.procedure
			.input(runtimeClineAccountSwitchRequestSchema)
			.output(runtimeClineAccountSwitchResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.switchClineAccount(ctx.workspaceScope, input);
			}),
		getClineProviderModels: t.procedure
			.input(runtimeClineProviderModelsRequestSchema)
			.output(runtimeClineProviderModelsResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.runtimeApi.getClineProviderModels(ctx.workspaceScope, input);
			}),
		getClineMcpAuthStatuses: t.procedure.output(runtimeClineMcpAuthStatusResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.getClineMcpAuthStatuses(ctx.workspaceScope);
		}),
		runClineMcpServerOAuth: t.procedure
			.input(runtimeClineMcpOAuthRequestSchema)
			.output(runtimeClineMcpOAuthResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.runClineMcpServerOAuth(ctx.workspaceScope, input);
			}),
		getClineMcpSettings: t.procedure.output(runtimeClineMcpSettingsResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.getClineMcpSettings(ctx.workspaceScope);
		}),
		saveClineMcpSettings: t.procedure
			.input(runtimeClineMcpSettingsSaveRequestSchema)
			.output(runtimeClineMcpSettingsSaveResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.saveClineMcpSettings(ctx.workspaceScope, input);
			}),
		runClineProviderOAuthLogin: t.procedure
			.input(runtimeClineOauthLoginRequestSchema)
			.output(runtimeClineOauthLoginResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.runClineProviderOAuthLogin(ctx.workspaceScope, input);
			}),
		startClineDeviceAuth: t.procedure.output(runtimeClineDeviceAuthStartResponseSchema).mutation(async ({ ctx }) => {
			return await ctx.runtimeApi.startClineDeviceAuth(ctx.workspaceScope);
		}),
		completeClineDeviceAuth: t.procedure
			.input(runtimeClineDeviceAuthCompleteRequestSchema)
			.output(runtimeClineDeviceAuthCompleteResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.completeClineDeviceAuth(ctx.workspaceScope, input);
			}),
		startShellSession: workspaceProcedure
			.input(runtimeShellSessionStartRequestSchema)
			.output(runtimeShellSessionStartResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.startShellSession(ctx.workspaceScope, input);
			}),
		runCommand: workspaceProcedure
			.input(runtimeCommandRunRequestSchema)
			.output(runtimeCommandRunResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.runCommand(ctx.workspaceScope, input);
			}),
		resetAllState: t.procedure.output(runtimeDebugResetAllStateResponseSchema).mutation(async ({ ctx }) => {
			return await ctx.runtimeApi.resetAllState(ctx.workspaceScope);
		}),
		openFile: t.procedure
			.input(runtimeOpenFileRequestSchema)
			.output(runtimeOpenFileResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.openFile(input);
			}),
		getUpdateStatus: t.procedure.output(runtimeUpdateStatusResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.getUpdateStatus(ctx.workspaceScope);
		}),
		runUpdateNow: t.procedure.output(runtimeRunUpdateResponseSchema).mutation(async ({ ctx }) => {
			return await ctx.runtimeApi.runUpdateNow(ctx.workspaceScope);
		}),
		restartHub: t.procedure.output(runtimeHubRestartResponseSchema).mutation(async ({ ctx }) => {
			return await ctx.runtimeApi.restartHub(ctx.workspaceScope);
		}),
		listHubInstances: t.procedure.output(runtimeHubInstancesResponseSchema).query(async ({ ctx }) => {
			return await ctx.runtimeApi.listHubInstances(ctx.workspaceScope);
		}),
		killHubInstance: t.procedure
			.input(runtimeHubKillRequestSchema)
			.output(runtimeHubKillResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.runtimeApi.killHubInstance(ctx.workspaceScope, input);
			}),
	}),
	vcs: t.router({
		detect: t.procedure
			.input(runtimeVcsActiveWorkspaceRequestSchema.optional())
			.output(runtimeVcsDetectResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.detect(ctx.workspaceScope, input);
			}),
		jjDiff: t.procedure
			.input(runtimeVcsActiveWorkspaceRequestSchema.optional())
			.output(runtimeVcsJjDiffResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.jjDiff(ctx.workspaceScope, input);
			}),
		jjState: t.procedure
			.input(runtimeVcsActiveWorkspaceRequestSchema.optional())
			.output(runtimeVcsJjStateResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.jjState(ctx.workspaceScope, input);
			}),
		jjInventory: t.procedure
			.input(runtimeVcsActiveWorkspaceRequestSchema.optional())
			.output(runtimeVcsJjInventoryResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.jjInventory(ctx.workspaceScope, input);
			}),
		jjBranchesData: t.procedure
			.input(runtimeVcsActiveWorkspaceRequestSchema.optional())
			.output(runtimeVcsJjBranchesDataResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.jjBranchesData(ctx.workspaceScope, input);
			}),
		branchesData: t.procedure
			.input(runtimeVcsActiveWorkspaceRequestSchema.optional())
			.output(runtimeVcsJjBranchesDataResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.branchesData(ctx.workspaceScope, input);
			}),
		jjOperations: t.procedure
			.input(runtimeVcsJjOperationsRequestSchema.optional())
			.output(runtimeVcsJjOperationsResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.jjOperations(ctx.workspaceScope, input);
			}),
		jjOperationDiff: t.procedure
			.input(runtimeVcsJjOperationDiffRequestSchema)
			.output(runtimeVcsJjOperationDiffResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.jjOperationDiff(ctx.workspaceScope, input);
			}),
		createJjOperationSnapshot: t.procedure
			.input(runtimeVcsActiveWorkspaceRequestSchema.optional())
			.output(runtimeVcsJjOperationActionResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.vcsApi.createJjOperationSnapshot(ctx.workspaceScope, input);
			}),
		revertJjOperation: t.procedure
			.input(runtimeVcsJjOperationRevertRequestSchema)
			.output(runtimeVcsJjOperationActionResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.vcsApi.revertJjOperation(ctx.workspaceScope, input);
			}),
		workspaceState: t.procedure
			.input(runtimeVcsWorkspaceStateRequestSchema.optional())
			.output(runtimeVcsWorkspaceStateResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.workspaceState(ctx.workspaceScope, input);
			}),
		workspaceStacks: t.procedure
			.input(runtimeVcsWorkspaceStateRequestSchema.optional())
			.output(runtimeVcsWorkspaceStacksResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.workspaceStacks(ctx.workspaceScope, input);
			}),
		diff: t.procedure
			.input(runtimeVcsDiffRequestSchema.optional())
			.output(runtimeVcsDiffResultSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.diff(ctx.workspaceScope, input);
			}),
		conflictFile: t.procedure
			.input(runtimeVcsConflictFileRequestSchema)
			.output(runtimeVcsConflictFileResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.conflictFile(ctx.workspaceScope, input);
			}),
		resolveConflictFile: t.procedure
			.input(runtimeVcsResolveConflictFileRequestSchema)
			.output(runtimeVcsResolveConflictFileResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.vcsApi.resolveConflictFile(ctx.workspaceScope, input);
			}),
		previewWorkspaceOperation: t.procedure
			.input(runtimeVcsWorkspaceOperationRequestSchema)
			.output(runtimeVcsOperationPreviewSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.previewWorkspaceOperation(ctx.workspaceScope, input);
			}),
		applyWorkspaceOperation: t.procedure
			.input(runtimeVcsWorkspaceOperationRequestSchema)
			.output(runtimeVcsOperationResultSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.vcsApi.applyWorkspaceOperation(ctx.workspaceScope, input);
			}),
		previewOperation: t.procedure
			.input(runtimeVcsPreviewOperationRequestSchema)
			.output(runtimeVcsPreviewOperationResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.previewOperation(ctx.workspaceScope, input);
			}),
		applyOperation: t.procedure
			.input(runtimeVcsApplyOperationRequestSchema)
			.output(runtimeVcsApplyOperationResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.vcsApi.applyOperation(ctx.workspaceScope, input);
			}),
		submitStackPreview: t.procedure
			.input(runtimeVcsSubmitStackPreviewRequestSchema)
			.output(runtimeVcsSubmitStackPreviewResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.submitStackPreview(ctx.workspaceScope, input);
			}),
		submitStack: t.procedure
			.input(runtimeVcsSubmitStackPreviewRequestSchema)
			.output(runtimeVcsSubmitStackResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.vcsApi.submitStack(ctx.workspaceScope, input);
			}),
		pullRequestDetails: t.procedure
			.input(runtimeVcsPullRequestSelectorSchema)
			.output(runtimeVcsPullRequestDetailsSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.pullRequestDetails(ctx.workspaceScope, input);
			}),
		updatePullRequest: t.procedure
			.input(runtimeVcsPullRequestUpdateRequestSchema)
			.output(runtimeVcsPullRequestDetailsSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.vcsApi.updatePullRequest(ctx.workspaceScope, input);
			}),
		pullRequestChecks: t.procedure
			.input(runtimeVcsPullRequestSelectorSchema)
			.output(runtimeVcsPullRequestChecksResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.pullRequestChecks(ctx.workspaceScope, input);
			}),
		pullRequestConversation: t.procedure
			.input(runtimeVcsPullRequestSelectorSchema)
			.output(runtimeVcsPullRequestConversationSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.pullRequestConversation(ctx.workspaceScope, input);
			}),
		baseBranchChecks: t.procedure
			.input(runtimeVcsBaseBranchChecksRequestSchema.optional())
			.output(runtimeVcsBranchChecksResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.vcsApi.baseBranchChecks(ctx.workspaceScope, input);
			}),
	}),
	workspace: t.router({
		getGitSummary: workspaceProcedure
			.input(optionalTaskWorkspaceInfoRequestSchema)
			.output(runtimeGitSummaryResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.workspaceApi.loadGitSummary(ctx.workspaceScope, input ?? null);
			}),
		runGitSyncAction: workspaceProcedure
			.input(gitSyncActionInputSchema)
			.output(runtimeGitSyncResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.workspaceApi.runGitSyncAction(ctx.workspaceScope, input);
			}),
		checkoutGitBranch: workspaceProcedure
			.input(runtimeGitCheckoutRequestSchema)
			.output(runtimeGitCheckoutResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.workspaceApi.checkoutGitBranch(ctx.workspaceScope, input);
			}),
		discardGitChanges: workspaceProcedure
			.input(optionalTaskWorkspaceInfoRequestSchema)
			.output(runtimeGitDiscardResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.workspaceApi.discardGitChanges(ctx.workspaceScope, input ?? null);
			}),
		getChanges: workspaceProcedure
			.input(runtimeWorkspaceChangesRequestSchema)
			.output(runtimeWorkspaceChangesResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.workspaceApi.loadChanges(ctx.workspaceScope, input);
			}),
		ensureWorktree: workspaceProcedure
			.input(runtimeWorktreeEnsureRequestSchema)
			.output(runtimeWorktreeEnsureResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.workspaceApi.ensureWorktree(ctx.workspaceScope, input);
			}),
		deleteWorktree: workspaceProcedure
			.input(runtimeWorktreeDeleteRequestSchema)
			.output(runtimeWorktreeDeleteResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.workspaceApi.deleteWorktree(ctx.workspaceScope, input);
			}),
		getTaskContext: workspaceProcedure
			.input(runtimeTaskWorkspaceInfoRequestSchema)
			.output(runtimeTaskWorkspaceInfoResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.workspaceApi.loadTaskContext(ctx.workspaceScope, input);
			}),
		searchFiles: workspaceProcedure
			.input(runtimeWorkspaceFileSearchRequestSchema)
			.output(runtimeWorkspaceFileSearchResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.workspaceApi.searchFiles(ctx.workspaceScope, input);
			}),
		getState: workspaceProcedure.output(runtimeWorkspaceStateResponseSchema).query(async ({ ctx }) => {
			return await ctx.workspaceApi.loadState(ctx.workspaceScope);
		}),
		notifyStateUpdated: workspaceProcedure
			.output(runtimeWorkspaceStateNotifyResponseSchema)
			.mutation(async ({ ctx }) => {
				return await ctx.workspaceApi.notifyStateUpdated(ctx.workspaceScope);
			}),
		saveState: workspaceProcedure
			.input(runtimeWorkspaceStateSaveRequestSchema)
			.output(runtimeWorkspaceStateResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.workspaceApi.saveState(ctx.workspaceScope, input);
			}),
		getWorkspaceChanges: workspaceProcedure.output(runtimeWorkspaceChangesResponseSchema).query(async ({ ctx }) => {
			return await ctx.workspaceApi.loadWorkspaceChanges(ctx.workspaceScope);
		}),
		getGitLog: workspaceProcedure
			.input(runtimeGitLogRequestSchema)
			.output(runtimeGitLogResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.workspaceApi.loadGitLog(ctx.workspaceScope, input);
			}),
		getRepositoryLog: workspaceProcedure
			.input(runtimeGitLogRequestSchema)
			.output(runtimeGitLogResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.workspaceApi.loadRepositoryLog(ctx.workspaceScope, input);
			}),
		getGitRefs: workspaceProcedure
			.input(optionalTaskWorkspaceInfoRequestSchema)
			.output(runtimeGitRefsResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.workspaceApi.loadGitRefs(ctx.workspaceScope, input ?? null);
			}),
		getRepositoryRefs: workspaceProcedure
			.input(optionalTaskWorkspaceInfoRequestSchema)
			.output(runtimeGitRefsResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.workspaceApi.loadRepositoryRefs(ctx.workspaceScope, input ?? null);
			}),
		getCommitDiff: workspaceProcedure
			.input(runtimeGitCommitDiffRequestSchema)
			.output(runtimeGitCommitDiffResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.workspaceApi.loadCommitDiff(ctx.workspaceScope, input);
			}),
		getRepositoryCommitDiff: workspaceProcedure
			.input(runtimeGitCommitDiffRequestSchema)
			.output(runtimeGitCommitDiffResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.workspaceApi.loadRepositoryCommitDiff(ctx.workspaceScope, input);
			}),
	}),
	changes: t.router({
		list: workspaceProcedure.output(runtimeChangeyardChangesListResponseSchema).query(async ({ ctx }) => {
			return await ctx.changesApi.listChanges(ctx.workspaceScope.workspacePath);
		}),
		create: workspaceProcedure
			.input(runtimeChangeyardChangeCreateRequestSchema)
			.output(runtimeChangeyardChangeDetailSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.createChange(ctx.workspaceScope.workspacePath, input);
			}),
		get: workspaceProcedure
			.input(runtimeChangeyardChangeGetRequestSchema)
			.output(runtimeChangeyardChangeDetailSchema.nullable())
			.query(async ({ ctx, input }) => {
				return await ctx.changesApi.getChange(ctx.workspaceScope.workspacePath, input);
			}),
		getWorkspaceChanges: workspaceProcedure
			.input(runtimeChangeyardChangeGetRequestSchema)
			.output(runtimeWorkspaceChangesResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.changesApi.loadChangeWorkspaceChanges(ctx.workspaceScope.workspacePath, input);
			}),
		getBoardSummary: workspaceProcedure
			.input(runtimeChangeyardChangeGetRequestSchema)
			.output(runtimeChangeyardBoardSummaryResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.changesApi.loadChangeBoardSummary(ctx.workspaceScope.workspacePath, input);
			}),
		getBoardFiles: workspaceProcedure
			.input(runtimeChangeyardBoardFilesRequestSchema)
			.output(runtimeChangeyardBoardFilesResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.changesApi.loadChangeBoardFiles(ctx.workspaceScope.workspacePath, input);
			}),
		getBoardFileDiff: workspaceProcedure
			.input(runtimeChangeyardBoardFileDiffRequestSchema)
			.output(runtimeChangeyardBoardFileDiffResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.changesApi.loadChangeBoardFileDiff(ctx.workspaceScope.workspacePath, input);
			}),
		validate: workspaceProcedure
			.input(runtimeChangeyardChangeGetRequestSchema)
			.output(runtimeChangeyardChangeDetailSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.validateChange(ctx.workspaceScope.workspacePath, input);
			}),
		sync: workspaceProcedure
			.input(runtimeChangeyardChangeGetRequestSchema)
			.output(runtimeChangeyardChangeDetailSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.syncChange(ctx.workspaceScope.workspacePath, input);
			}),
		start: workspaceProcedure
			.input(runtimeChangeyardChangeGetRequestSchema)
			.output(runtimeChangeyardChangeDetailSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.startChange(ctx.workspaceScope.workspacePath, input);
			}),
		verify: workspaceProcedure
			.input(runtimeChangeyardChangeGetRequestSchema)
			.output(runtimeChangeyardChangeActionResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.verifyChange(ctx.workspaceScope.workspacePath, input);
			}),
		complete: workspaceProcedure
			.input(runtimeChangeyardCompleteRequestSchema)
			.output(runtimeChangeyardChangeActionResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.completeChange(ctx.workspaceScope.workspacePath, input);
			}),
		next: workspaceProcedure
			.input(runtimeChangeyardChangeGetRequestSchema)
			.output(runtimeChangeyardNextActionSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.changesApi.nextAction(ctx.workspaceScope.workspacePath, input);
			}),
		land: workspaceProcedure
			.input(runtimeChangeyardLandRequestSchema)
			.output(runtimeChangeyardChangeActionResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.landChange(ctx.workspaceScope.workspacePath, input);
			}),
		workspaceStatus: workspaceProcedure
			.input(runtimeChangeyardChangeGetRequestSchema)
			.output(runtimeChangeyardWorkspaceStatusSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.changesApi.workspaceStatus(ctx.workspaceScope.workspacePath, input);
			}),
		workspaceList: workspaceProcedure
			.output(runtimeChangeyardWorkspaceStatusSchema.array())
			.query(async ({ ctx }) => {
				return await ctx.changesApi.workspaceList(ctx.workspaceScope.workspacePath);
			}),
		workspaceDelete: workspaceProcedure
			.input(runtimeChangeyardWorkspaceDeleteRequestSchema)
			.output(runtimeChangeyardChangeActionResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.workspaceDelete(ctx.workspaceScope.workspacePath, input);
			}),
		reviewStart: workspaceProcedure
			.input(runtimeChangeyardChangeGetRequestSchema)
			.output(runtimeChangeyardChangeActionResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.reviewStart(ctx.workspaceScope.workspacePath, input);
			}),
		reviewList: workspaceProcedure
			.input(runtimeChangeyardReviewListRequestSchema)
			.output(runtimeChangeyardReviewListResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.changesApi.reviewList(ctx.workspaceScope.workspacePath, input);
			}),
		reviewGet: workspaceProcedure
			.input(runtimeChangeyardReviewGetRequestSchema)
			.output(runtimeChangeyardReviewDetailSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.changesApi.reviewGet(ctx.workspaceScope.workspacePath, input);
			}),
		reviewUpdate: workspaceProcedure
			.input(runtimeChangeyardReviewUpdateRequestSchema)
			.output(runtimeChangeyardReviewDetailSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.reviewUpdate(ctx.workspaceScope.workspacePath, input);
			}),
		reviewComplete: workspaceProcedure
			.input(runtimeChangeyardReviewCompleteRequestSchema)
			.output(runtimeChangeyardChangeActionResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.reviewComplete(ctx.workspaceScope.workspacePath, input);
			}),
		planningPrompt: workspaceProcedure
			.input(runtimeChangeyardPlanningPromptRequestSchema)
			.output(runtimeChangeyardPlanningPromptResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.changesApi.planningPrompt(ctx.workspaceScope.workspacePath, input);
			}),
		updatePlanningSection: workspaceProcedure
			.input(runtimeChangeyardChangeUpdatePlanningSectionRequestSchema)
			.output(runtimeChangeyardChangeDetailSchema)
			.mutation(async ({ ctx, input }) => {
				try {
					return await ctx.changesApi.updatePlanningSection(ctx.workspaceScope.workspacePath, input);
				} catch (error) {
					if (error instanceof Error && error.name === "ChangeMutationConflictError") {
						throw new TRPCError({
							code: "CONFLICT",
							message: error.message,
							cause: {
								currentUpdatedAt: readConflictUpdatedAt(error),
							},
						});
					}
					throw error;
				}
			}),
		updateStatus: workspaceProcedure
			.input(runtimeChangeyardChangeUpdateStatusRequestSchema)
			.output(runtimeChangeyardChangeDetailSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.updateChangeStatus(ctx.workspaceScope.workspacePath, input);
			}),
		link: workspaceProcedure
			.input(runtimeChangeyardChangeDependencyRequestSchema)
			.output(runtimeChangeyardChangeDetailSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.linkChange(ctx.workspaceScope.workspacePath, input);
			}),
		unlink: workspaceProcedure
			.input(runtimeChangeyardChangeDependencyRequestSchema)
			.output(runtimeChangeyardChangeDetailSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.unlinkChange(ctx.workspaceScope.workspacePath, input);
			}),
		updateBody: workspaceProcedure
			.input(runtimeChangeyardChangeUpdateBodyRequestSchema)
			.output(runtimeChangeyardChangeDetailSchema)
			.mutation(async ({ ctx, input }) => {
				try {
					return await ctx.changesApi.updateChangeBody(ctx.workspaceScope.workspacePath, input);
				} catch (error) {
					if (error instanceof Error && error.name === "ChangeMutationConflictError") {
						throw new TRPCError({
							code: "CONFLICT",
							message: error.message,
							cause: {
								currentUpdatedAt: readConflictUpdatedAt(error),
							},
						});
					}
					throw error;
				}
			}),
		init: workspaceProcedure.output(runtimeChangeyardInitResponseSchema).mutation(async ({ ctx }) => {
			return await ctx.changesApi.initProject(ctx.workspaceScope.workspacePath);
		}),
		update: workspaceProcedure.output(runtimeChangeyardUpdateResponseSchema).mutation(async ({ ctx }) => {
			return await ctx.changesApi.updateProject(ctx.workspaceScope.workspacePath);
		}),
		getProjectConfig: workspaceProcedure.output(runtimeChangeyardProjectConfigSchema).query(async ({ ctx }) => {
			return await ctx.changesApi.getProjectConfig(ctx.workspaceScope.workspacePath);
		}),
		updateProjectConfig: workspaceProcedure
			.input(runtimeChangeyardUpdateProjectConfigRequestSchema)
			.output(runtimeChangeyardProjectConfigSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.changesApi.updateProjectConfig(ctx.workspaceScope.workspacePath, input);
			}),
		doctor: workspaceProcedure.output(runtimeChangeyardDoctorResponseSchema).query(async ({ ctx }) => {
			return await ctx.changesApi.doctorProject(ctx.workspaceScope.workspacePath);
		}),
	}),
	projects: t.router({
		list: t.procedure.output(runtimeProjectsResponseSchema).query(async ({ ctx }) => {
			return await ctx.projectsApi.listProjects(ctx.requestedWorkspaceId);
		}),
		add: t.procedure
			.input(runtimeProjectAddRequestSchema)
			.output(runtimeProjectAddResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.projectsApi.addProject(ctx.requestedWorkspaceId, input);
			}),
		remove: t.procedure
			.input(runtimeProjectRemoveRequestSchema)
			.output(runtimeProjectRemoveResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.projectsApi.removeProject(ctx.requestedWorkspaceId, input);
			}),
		pickDirectory: t.procedure.output(runtimeProjectDirectoryPickerResponseSchema).mutation(async ({ ctx }) => {
			return await ctx.projectsApi.pickProjectDirectory(ctx.requestedWorkspaceId);
		}),
		listDirectoryContents: t.procedure
			.input(runtimeDirectoryListRequestSchema)
			.output(runtimeDirectoryListResponseSchema)
			.query(async ({ ctx, input }) => {
				return await ctx.projectsApi.listDirectoryContents(ctx.requestedWorkspaceId, input);
			}),
	}),
	hooks: t.router({
		ingest: t.procedure
			.input(runtimeHookIngestRequestSchema)
			.output(runtimeHookIngestResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.hooksApi.ingest(input);
			}),
	}),
	session: t.router({
		attach: t.procedure
			.input(runtimeSessionAttachRequestSchema)
			.output(runtimeSessionAttachResponseSchema)
			.mutation(async ({ ctx, input }) => {
				return await ctx.sessionApi.attach(input);
			}),
	}),
});

export type RuntimeAppRouter = typeof runtimeAppRouter;
export type RuntimeAppRouterInputs = inferRouterInputs<RuntimeAppRouter>;
export type RuntimeAppRouterOutputs = inferRouterOutputs<RuntimeAppRouter>;
