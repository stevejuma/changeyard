import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import { fetchTrpcQuery, postTrpcMutation } from "@/runtime/trpc-client";
import type {
	QueryState,
	RuntimeDirectoryListRequest,
	RuntimeDirectoryListResponse,
	RuntimeGitCommitDiffResponse,
	RuntimeGitLogRequest,
	RuntimeGitLogResponse,
	RuntimeGitSyncAction,
	RuntimeGitSyncResponse,
	RuntimeProjectAddRequest,
	RuntimeProjectAddResponse,
	RuntimeProjectDirectoryPickerResponse,
	RuntimeProjectConfigResponse,
	RuntimeProjectConfigUpdateRequest,
	RuntimeProjectRemoveResponse,
	RuntimeProjectsResponse,
	RuntimeShellSessionStartRequest,
	RuntimeShellSessionStartResponse,
	RuntimeStateStreamVcsProjectEventMessage,
	RuntimeTaskSessionStopRequest,
	RuntimeTaskSessionStopResponse,
	RuntimeVcsBaseBranchChecksRequest,
	RuntimeVcsBranchChecksResponse,
	RuntimeVcsPullRequestChecksResponse,
	RuntimeVcsPullRequestConversation,
	RuntimeVcsPullRequestDetails,
	RuntimeVcsPullRequestSelector,
	RuntimeVcsPullRequestUpdateRequest,
	RuntimeVcsProjectEventKind,
	VcsBranchesDataResponse,
	VcsDetectResponse,
	VcsJjBranchesDataResponse,
	VcsJjDiffResponse,
	VcsJjInventoryResponse,
	VcsJjOperationActionResponse,
	VcsJjOperationDiffResponse,
	VcsJjOperationsResponse,
	VcsJjStateResponse,
} from "@/runtime/types";
import { subscribeToVcsProjectEvents } from "@/runtime/vcs-events";
import type {
	VcsDiffInput,
	VcsDiffResult,
	VcsConflictFileInput,
	VcsConflictFileResult,
	VcsResolveConflictFileInput,
	VcsResolveConflictFileResult,
	VcsOperationPreview,
	VcsOperationResult,
	VcsWorkspaceCommit,
	VcsWorkspaceOperationInput,
	VcsWorkspaceStack,
	VcsWorkspaceState,
	VcsWorkspaceStateInput,
	VcsWorkingCopyState,
} from "@/vcs-workspace-contracts";

export type VcsApiTag =
	| "Stacks"
	| "StackDetails"
	| "WorktreeChanges"
	| "BranchListing"
	| "BranchDetails"
	| "HeadSha"
	| "BaseBranchData"
	| "DivergentBookmarks"
	| "Diff"
	| "CommitChanges"
	| "ConflictFile"
	| "ProjectConfig"
	| "VcsDetection"
	| "OperationHistory"
	| "OperationDetails"
	| "RepositoryLog"
	| "PullRequests"
	| "PullRequestChecks"
	| "PullRequestConversation"
	| "BaseBranchChecks"
	| "Projects";

export const VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS = [
	"Stacks",
	"StackDetails",
	"WorktreeChanges",
	"BranchListing",
	"BranchDetails",
	"HeadSha",
	"BaseBranchData",
	"DivergentBookmarks",
	"Diff",
	"CommitChanges",
	"ConflictFile",
	"OperationHistory",
	"OperationDetails",
	"RepositoryLog",
] satisfies VcsApiTag[];

const VCS_API_TAGS = new Set<VcsApiTag>([
	"Stacks",
	"StackDetails",
	"WorktreeChanges",
	"BranchListing",
	"BranchDetails",
	"HeadSha",
	"BaseBranchData",
	"DivergentBookmarks",
	"Diff",
	"CommitChanges",
	"ConflictFile",
	"ProjectConfig",
	"VcsDetection",
	"OperationHistory",
	"OperationDetails",
	"RepositoryLog",
	"PullRequests",
	"PullRequestChecks",
	"BaseBranchChecks",
	"Projects",
]);

type WorkspaceQueryArg = {
	workspaceId: string;
};

type ActiveWorkspaceQueryArg = WorkspaceQueryArg & {
	workspacePath?: string | null;
};

type VcsWorkspaceStateQueryArg = ActiveWorkspaceQueryArg & {
	input?: Omit<VcsWorkspaceStateInput, "projectId">;
};

type VcsDiffQueryArg = ActiveWorkspaceQueryArg & {
	input?: Omit<VcsDiffInput, "projectId">;
};

type VcsConflictFileQueryArg = ActiveWorkspaceQueryArg & {
	input: Omit<VcsConflictFileInput, "projectId">;
};

type VcsResolveConflictFileArg = ActiveWorkspaceQueryArg & {
	input: Omit<VcsResolveConflictFileInput, "projectId">;
};

type VcsWorkspaceOperationArg = ActiveWorkspaceQueryArg & {
	input: Omit<VcsWorkspaceOperationInput, "projectId">;
};

type CommitDiffQueryArg = ActiveWorkspaceQueryArg & {
	commitHash: string;
	baseCommitHash?: string;
};

type UpdateProjectConfigArg = WorkspaceQueryArg & {
	input: RuntimeProjectConfigUpdateRequest;
};

type JjOperationsQueryArg = ActiveWorkspaceQueryArg & {
	cursor?: string | null;
	pageSize: number;
};

type JjOperationDiffQueryArg = ActiveWorkspaceQueryArg & {
	operationId: string;
	cursor?: string | null;
	pageSize: number;
};

type JjOperationRevertArg = ActiveWorkspaceQueryArg & {
	operationId: string;
};

type RepositoryLogQueryArg = ActiveWorkspaceQueryArg & {
	input: RuntimeGitLogRequest;
};

type GitSyncActionArg = ActiveWorkspaceQueryArg & {
	action: RuntimeGitSyncAction;
	targetRef?: string | null;
};

type PullRequestSelectorArg = ActiveWorkspaceQueryArg & {
	input: Omit<RuntimeVcsPullRequestSelector, "workspacePath">;
};

type PullRequestUpdateArg = ActiveWorkspaceQueryArg & {
	input: Omit<RuntimeVcsPullRequestUpdateRequest, "workspacePath">;
};

type BaseBranchChecksArg = ActiveWorkspaceQueryArg & {
	input?: Omit<RuntimeVcsBaseBranchChecksRequest, "workspacePath">;
};

function withActiveWorkspaceInput<T extends Record<string, unknown>>(
	input: T,
	workspacePath: string | null | undefined,
): T & { workspacePath?: string } {
	if (!workspacePath) {
		return input;
	}
	return {
		...input,
		workspacePath,
	};
}

type PickProjectDirectoryArg = {
	workspaceId?: string | null;
};

type AddProjectArg = {
	workspaceId?: string | null;
	input: RuntimeProjectAddRequest;
};

type RemoveProjectArg = {
	workspaceId?: string | null;
	projectId: string;
};

type ProjectDirectoryQueryArg = {
	workspaceId?: string | null;
	input?: RuntimeDirectoryListRequest;
};

type StartShellSessionArg = WorkspaceQueryArg & {
	input: RuntimeShellSessionStartRequest;
};

type StopTaskSessionArg = WorkspaceQueryArg & {
	input: RuntimeTaskSessionStopRequest;
};

type RtkResult<T> = {
	data?: T;
	currentData?: T;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error?: unknown;
};

function errorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
		return error.message;
	}
	return fallback;
}

function normalizeVcsApiTags(tags: readonly string[] | undefined): VcsApiTag[] {
	if (!tags) {
		return [];
	}
	return tags.filter((tag): tag is VcsApiTag => VCS_API_TAGS.has(tag as VcsApiTag));
}

function replaceWorkspaceCommit(draft: VcsWorkspaceState, commit: VcsWorkspaceCommit): boolean {
	let replaced = false;
	for (const stack of draft.stacks) {
		const index = stack.commits.findIndex((candidate) => candidate.commitId === commit.commitId);
		if (index >= 0) {
			stack.commits[index] = {
				...commit,
				stackIds: commit.stackIds.length > 0 ? commit.stackIds : stack.commits[index]?.stackIds ?? [stack.stackId],
			};
			replaced = true;
		}
	}
	return replaced;
}

function replaceWorkspaceStack(draft: VcsWorkspaceState, stack: VcsWorkspaceStack): void {
	const index = draft.stacks.findIndex((candidate) => candidate.stackId === stack.stackId);
	if (index >= 0) {
		draft.stacks[index] = {
			...stack,
			isApplied: draft.stacks[index]?.isApplied ?? stack.isApplied,
		};
		return;
	}
	draft.stacks.push(stack);
}

function patchWorkspaceWorkingCopy(draft: VcsWorkspaceState, workingCopy: VcsWorkingCopyState | null | undefined): void {
	if (workingCopy) {
		draft.workingCopy = workingCopy;
	}
}

export function patchWorkspaceStateFromOperationResult(draft: VcsWorkspaceState, result: VcsOperationResult): boolean {
	if (!result.ok || !result.cacheUpdate || result.cacheUpdate === "none") {
		return true;
	}
	if (result.cacheUpdate === "workspace") {
		return false;
	}
	const payload = result.cachePayload;
	if (!payload) {
		return false;
	}
	if (payload.headId !== undefined) {
		draft.headId = payload.headId;
	}
	if (payload.mode !== undefined) {
		draft.mode = payload.mode;
	}
	if (payload.appliedStackIds) {
		draft.appliedStackIds = payload.appliedStackIds;
	}
	if (payload.conflicts) {
		draft.conflicts = payload.conflicts;
	}
	if (result.cacheUpdate === "commits") {
		const commits = payload.commits ?? [];
		return commits.length > 0 && commits.every((commit) => replaceWorkspaceCommit(draft, commit));
	}
	if (result.cacheUpdate === "stacks") {
		for (const stackId of payload.removedStackIds ?? []) {
			draft.stacks = draft.stacks.filter((stack) => stack.stackId !== stackId);
			draft.appliedStackIds = draft.appliedStackIds.filter((appliedStackId) => appliedStackId !== stackId);
		}
		for (const stack of payload.stacks ?? []) {
			replaceWorkspaceStack(draft, stack);
		}
		return Boolean((payload.stacks?.length ?? 0) > 0 || (payload.removedStackIds?.length ?? 0) > 0);
	}
	if (result.cacheUpdate === "working_copy") {
		for (const stack of payload.stacks ?? []) {
			replaceWorkspaceStack(draft, stack);
		}
		for (const commit of payload.commits ?? []) {
			replaceWorkspaceCommit(draft, commit);
		}
		patchWorkspaceWorkingCopy(draft, payload.workingCopy);
		return true;
	}
	return false;
}

export function toRuntimeQueryState<T>(result: RtkResult<T>, message: string): QueryState<T> {
	if (result.data !== undefined) {
		return { status: "ready", data: result.data };
	}
	if (result.isError) {
		return { status: "error", message: errorMessage(result.error, message) };
	}
	return { status: "loading" };
}

export function toRuntimeCurrentQueryState<T>(result: RtkResult<T>, message: string): QueryState<T> {
	if (result.currentData !== undefined) {
		return { status: "ready", data: result.currentData };
	}
	if (result.isError) {
		return { status: "error", message: errorMessage(result.error, message) };
	}
	return { status: "loading" };
}

export function tagsForVcsEvent(kind: RuntimeVcsProjectEventKind): VcsApiTag[] {
	switch (kind) {
		case "worktree_changes":
			return [
				"WorktreeChanges",
				"Diff",
				"CommitChanges",
				"ConflictFile",
				"Stacks",
				"StackDetails",
				"BranchListing",
				"BranchDetails",
				"DivergentBookmarks",
				"ProjectConfig",
				"VcsDetection",
				"OperationDetails",
				"RepositoryLog",
			];
		case "vcs/head":
			return ["HeadSha", "Stacks", "StackDetails", "BranchDetails", "Diff", "CommitChanges", "ConflictFile", "VcsDetection"];
		case "vcs/activity":
			return [
				"Stacks",
				"StackDetails",
				"BranchListing",
				"BranchDetails",
				"BaseBranchData",
				"DivergentBookmarks",
				"HeadSha",
				"ConflictFile",
				"VcsDetection",
				"OperationHistory",
				"OperationDetails",
				"RepositoryLog",
				"PullRequests",
				"PullRequestChecks",
				"PullRequestConversation",
				"BaseBranchChecks",
			];
		case "vcs/fetch":
			return ["BranchListing", "BaseBranchData", "DivergentBookmarks", "VcsDetection", "BaseBranchChecks", "PullRequestChecks", "PullRequestConversation"];
	}
}

async function subscribeToWorkspaceEvents(
	workspaceId: string,
	dispatch: (action: unknown) => void,
	cacheDataLoaded: Promise<unknown>,
	cacheEntryRemoved: Promise<void>,
): Promise<void> {
	try {
		await cacheDataLoaded;
	} catch {
		return;
	}
	const unsubscribe = subscribeToVcsProjectEvents(workspaceId, (event: RuntimeStateStreamVcsProjectEventMessage) => {
		dispatch(vcsApi.util.invalidateTags(tagsForVcsEvent(event.kind)));
	});
	try {
		await cacheEntryRemoved;
	} finally {
		unsubscribe();
	}
}

export const vcsApi = createApi({
	reducerPath: "vcsApi",
	baseQuery: fakeBaseQuery(),
	tagTypes: [
		"Stacks",
		"StackDetails",
		"WorktreeChanges",
		"BranchListing",
		"BranchDetails",
		"HeadSha",
		"BaseBranchData",
		"DivergentBookmarks",
		"Diff",
		"CommitChanges",
		"ConflictFile",
		"ProjectConfig",
		"VcsDetection",
		"OperationHistory",
		"OperationDetails",
		"RepositoryLog",
		"PullRequests",
		"PullRequestChecks",
		"PullRequestConversation",
		"BaseBranchChecks",
		"Projects",
	],
	endpoints: (builder) => ({
		getProjects: builder.query<RuntimeProjectsResponse, void>({
			queryFn: async (_arg, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeProjectsResponse>(
							"projects.list",
							undefined,
							null,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["Projects"],
		}),
		pickProjectDirectory: builder.mutation<RuntimeProjectDirectoryPickerResponse, PickProjectDirectoryArg | void>({
			queryFn: async (arg) => {
				try {
					return {
						data: await postTrpcMutation<RuntimeProjectDirectoryPickerResponse>(
							"projects.pickDirectory",
							{},
							arg?.workspaceId ?? null,
						),
					};
				} catch (error) {
					return { error };
				}
			},
		}),
		addProject: builder.mutation<RuntimeProjectAddResponse, AddProjectArg>({
			queryFn: async ({ workspaceId, input }) => {
				try {
					return {
						data: await postTrpcMutation<RuntimeProjectAddResponse>(
							"projects.add",
							input,
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: ["Projects"],
		}),
		removeProject: builder.mutation<RuntimeProjectRemoveResponse, RemoveProjectArg>({
			queryFn: async ({ workspaceId, projectId }) => {
				try {
					return {
						data: await postTrpcMutation<RuntimeProjectRemoveResponse>(
							"projects.remove",
							{ projectId },
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: ["Projects"],
		}),
		getProjectDirectoryContents: builder.query<RuntimeDirectoryListResponse, ProjectDirectoryQueryArg>({
			queryFn: async ({ workspaceId, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeDirectoryListResponse>(
							"projects.listDirectoryContents",
							input ?? {},
							workspaceId ?? null,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
		}),
		startShellSession: builder.mutation<RuntimeShellSessionStartResponse, StartShellSessionArg>({
			queryFn: async ({ workspaceId, input }) => {
				try {
					return {
						data: await postTrpcMutation<RuntimeShellSessionStartResponse>(
							"runtime.startShellSession",
							input,
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
		}),
		stopTaskSession: builder.mutation<RuntimeTaskSessionStopResponse, StopTaskSessionArg>({
			queryFn: async ({ workspaceId, input }) => {
				try {
					return {
						data: await postTrpcMutation<RuntimeTaskSessionStopResponse>(
							"runtime.stopTaskSession",
							input,
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
		}),
		getVcsDetect: builder.query<VcsDetectResponse, ActiveWorkspaceQueryArg>({
			queryFn: async ({ workspaceId, workspacePath }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsDetectResponse>("vcs.detect", withActiveWorkspaceInput({}, workspacePath), workspaceId, { signal }) };
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["VcsDetection", "BaseBranchData"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getProjectConfig: builder.query<RuntimeProjectConfigResponse, WorkspaceQueryArg>({
			queryFn: async ({ workspaceId }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeProjectConfigResponse>(
							"changes.getProjectConfig",
							undefined,
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["ProjectConfig"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		updateProjectConfig: builder.mutation<RuntimeProjectConfigResponse, UpdateProjectConfigArg>({
			queryFn: async ({ workspaceId, input }) => {
				try {
					return {
						data: await postTrpcMutation<RuntimeProjectConfigResponse>(
							"changes.updateProjectConfig",
							input,
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: [
				"ProjectConfig",
				"Stacks",
				"StackDetails",
				"BranchListing",
				"BranchDetails",
				"BaseBranchData",
				"DivergentBookmarks",
			],
		}),
		getJjState: builder.query<VcsJjStateResponse, ActiveWorkspaceQueryArg>({
			queryFn: async ({ workspaceId, workspacePath }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsJjStateResponse>("vcs.jjState", withActiveWorkspaceInput({}, workspacePath), workspaceId, { signal }) };
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["Stacks", "StackDetails", "WorktreeChanges", "HeadSha", "BaseBranchData"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getJjDiff: builder.query<VcsJjDiffResponse, ActiveWorkspaceQueryArg>({
			queryFn: async ({ workspaceId, workspacePath }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsJjDiffResponse>("vcs.jjDiff", withActiveWorkspaceInput({}, workspacePath), workspaceId, { signal }) };
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["WorktreeChanges", "Diff"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getJjInventory: builder.query<VcsJjInventoryResponse, ActiveWorkspaceQueryArg>({
			queryFn: async ({ workspaceId, workspacePath }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsJjInventoryResponse>("vcs.jjInventory", withActiveWorkspaceInput({}, workspacePath), workspaceId, { signal }) };
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["BranchListing", "BaseBranchData", "DivergentBookmarks"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getJjBranchesData: builder.query<VcsJjBranchesDataResponse, ActiveWorkspaceQueryArg>({
			queryFn: async ({ workspaceId, workspacePath }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsJjBranchesDataResponse>("vcs.jjBranchesData", withActiveWorkspaceInput({}, workspacePath), workspaceId, { signal }) };
				} catch (error) {
					return { error };
				}
			},
			providesTags: [
				"BranchListing",
				"Stacks",
				"StackDetails",
				"BaseBranchData",
				"DivergentBookmarks",
				"HeadSha",
				"WorktreeChanges",
			],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getVcsBranchesData: builder.query<VcsBranchesDataResponse, ActiveWorkspaceQueryArg>({
			queryFn: async ({ workspaceId, workspacePath }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsBranchesDataResponse>("vcs.branchesData", withActiveWorkspaceInput({}, workspacePath), workspaceId, { signal }) };
				} catch (error) {
					return { error };
				}
			},
			providesTags: [
				"BranchListing",
				"Stacks",
				"StackDetails",
				"BaseBranchData",
				"DivergentBookmarks",
				"HeadSha",
				"WorktreeChanges",
			],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getVcsWorkspaceState: builder.query<VcsWorkspaceState, VcsWorkspaceStateQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<VcsWorkspaceState>(
							"vcs.workspaceState",
							withActiveWorkspaceInput(input ?? {}, workspacePath),
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["Stacks", "StackDetails", "WorktreeChanges", "HeadSha", "BaseBranchData"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getVcsStacks: builder.query<{ stacks: VcsWorkspaceStack[] }, VcsWorkspaceStateQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<{ stacks: VcsWorkspaceStack[] }>(
							"vcs.workspaceStacks",
							withActiveWorkspaceInput(input ?? {}, workspacePath),
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["Stacks", "StackDetails", "BranchListing", "BranchDetails", "BaseBranchData"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getPullRequestDetails: builder.query<RuntimeVcsPullRequestDetails, PullRequestSelectorArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeVcsPullRequestDetails>(
							"vcs.pullRequestDetails",
							withActiveWorkspaceInput(input, workspacePath),
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, arg) => [
				"PullRequests",
				{ type: "PullRequests", id: JSON.stringify(arg.input) },
			],
		}),
		updatePullRequest: builder.mutation<RuntimeVcsPullRequestDetails, PullRequestUpdateArg>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return {
						data: await postTrpcMutation<RuntimeVcsPullRequestDetails>(
							"vcs.updatePullRequest",
							withActiveWorkspaceInput(input, workspacePath),
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: ["PullRequests", "PullRequestChecks", "PullRequestConversation", "BranchListing", "Stacks", "StackDetails"],
		}),
		getPullRequestChecks: builder.query<RuntimeVcsPullRequestChecksResponse, PullRequestSelectorArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeVcsPullRequestChecksResponse>(
							"vcs.pullRequestChecks",
							withActiveWorkspaceInput(input, workspacePath),
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, arg) => [
				"PullRequestChecks",
				{ type: "PullRequestChecks", id: JSON.stringify(arg.input) },
			],
		}),
		getPullRequestConversation: builder.query<RuntimeVcsPullRequestConversation, PullRequestSelectorArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeVcsPullRequestConversation>(
							"vcs.pullRequestConversation",
							withActiveWorkspaceInput(input, workspacePath),
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, arg) => [
				"PullRequestConversation",
				{ type: "PullRequestConversation", id: JSON.stringify(arg.input) },
			],
		}),
		getBaseBranchChecks: builder.query<RuntimeVcsBranchChecksResponse, BaseBranchChecksArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeVcsBranchChecksResponse>(
							"vcs.baseBranchChecks",
							withActiveWorkspaceInput(input ?? {}, workspacePath),
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["BaseBranchChecks"],
		}),
		getVcsDiff: builder.query<VcsDiffResult, VcsDiffQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<VcsDiffResult>(
							"vcs.diff",
							withActiveWorkspaceInput(input ?? {}, workspacePath),
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["WorktreeChanges", "Diff", "CommitChanges"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		runGitSyncAction: builder.mutation<RuntimeGitSyncResponse, GitSyncActionArg>({
			queryFn: async ({ workspaceId, workspacePath, action, targetRef }) => {
				try {
					return {
						data: await postTrpcMutation<RuntimeGitSyncResponse>(
							"workspace.runGitSyncAction",
							withActiveWorkspaceInput(
								{
									action,
									targetRef: targetRef ?? undefined,
								},
								workspacePath,
							),
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS,
		}),
		getVcsConflictFile: builder.query<VcsConflictFileResult, VcsConflictFileQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<VcsConflictFileResult>(
							"vcs.conflictFile",
							withActiveWorkspaceInput(input, workspacePath),
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, arg) => [
				"ConflictFile",
				{ type: "ConflictFile", id: `${arg.workspacePath ?? ""}:${arg.input.source ?? "workspace"}:${arg.input.revision ?? ""}:${arg.input.path}` },
			],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		resolveVcsConflictFile: builder.mutation<VcsResolveConflictFileResult, VcsResolveConflictFileArg>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return {
						data: await postTrpcMutation<VcsResolveConflictFileResult>(
							"vcs.resolveConflictFile",
							withActiveWorkspaceInput(input, workspacePath),
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: (_result, _error, arg) => [
				"Stacks",
				"StackDetails",
				"WorktreeChanges",
				"Diff",
				"CommitChanges",
				"ConflictFile",
				{ type: "ConflictFile", id: `${arg.workspacePath ?? ""}:workspace::${arg.input.path}` },
			],
		}),
		previewVcsOperation: builder.query<VcsOperationPreview, VcsWorkspaceOperationArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<VcsOperationPreview>(
							"vcs.previewWorkspaceOperation",
							withActiveWorkspaceInput(input, workspacePath),
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["Diff"],
		}),
		applyVcsOperation: builder.mutation<VcsOperationResult, VcsWorkspaceOperationArg>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return {
						data: await postTrpcMutation<VcsOperationResult>(
							"vcs.applyWorkspaceOperation",
							withActiveWorkspaceInput(input, workspacePath),
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
			onQueryStarted: async (arg, { dispatch, queryFulfilled }) => {
				try {
					const { data } = await queryFulfilled;
					let patched = false;
					if (data.ok && data.cacheUpdate && data.cacheUpdate !== "workspace") {
						dispatch(
							vcsApi.util.updateQueryData("getVcsWorkspaceState", { workspaceId: arg.workspaceId, workspacePath: arg.workspacePath }, (draft) => {
								patched = patchWorkspaceStateFromOperationResult(draft, data);
							}),
						);
					}
					const invalidateTags = patched
						? normalizeVcsApiTags(data.invalidateTags)
						: VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS;
					if (invalidateTags.length > 0) {
						dispatch(vcsApi.util.invalidateTags(invalidateTags));
					}
				} catch {
					dispatch(vcsApi.util.invalidateTags(VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS));
				}
			},
		}),
		getRepositoryCommitDiff: builder.query<RuntimeGitCommitDiffResponse, CommitDiffQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, commitHash, baseCommitHash }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeGitCommitDiffResponse>(
							"workspace.getRepositoryCommitDiff",
							{ commitHash, baseCommitHash, workspacePath: workspacePath ?? undefined },
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, arg) => [
				"Diff",
				"CommitChanges",
				{ type: "CommitChanges", id: arg.baseCommitHash ? `${arg.baseCommitHash}..${arg.commitHash}` : arg.commitHash },
			],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getRepositoryLog: builder.query<RuntimeGitLogResponse, RepositoryLogQueryArg>({
			serializeQueryArgs: ({ endpointName, queryArgs }) => {
				const { maxCount: _maxCount, skip: _skip, cursor: _cursor, pageSize: _pageSize, ...baseInput } = queryArgs.input;
				return `${endpointName}:${queryArgs.workspaceId}:${queryArgs.workspacePath ?? ""}:${JSON.stringify(baseInput)}`;
			},
			forceRefetch: ({ currentArg, previousArg }) =>
				currentArg?.input.maxCount !== previousArg?.input.maxCount ||
				currentArg?.input.skip !== previousArg?.input.skip ||
				currentArg?.input.cursor !== previousArg?.input.cursor ||
				currentArg?.input.pageSize !== previousArg?.input.pageSize ||
				JSON.stringify(currentArg?.input ?? {}) !== JSON.stringify(previousArg?.input ?? {}),
			merge: (currentCache, response, { arg }) => {
				if (((!arg.input.skip || arg.input.skip <= 0) && !arg.input.cursor) || !currentCache.ok || !response.ok) {
					Object.assign(currentCache, response);
					return;
				}
				const existingHashes = new Set(currentCache.commits.map((commit) => commit.hash));
				const nextCommits = response.commits.filter((commit) => !existingHashes.has(commit.hash));
				Object.assign(currentCache, {
					...response,
					commits: [...currentCache.commits, ...nextCommits],
				});
			},
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeGitLogResponse>(
							"workspace.getRepositoryLog",
							withActiveWorkspaceInput(input, workspacePath),
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["RepositoryLog"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getJjOperations: builder.query<VcsJjOperationsResponse, JjOperationsQueryArg>({
			serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}:${queryArgs.workspaceId}:${queryArgs.workspacePath ?? ""}`,
			forceRefetch: ({ currentArg, previousArg }) =>
				currentArg?.cursor !== previousArg?.cursor ||
				currentArg?.pageSize !== previousArg?.pageSize,
			merge: (currentCache, response, { arg }) => {
				if (!arg.cursor) {
					Object.assign(currentCache, response);
					return;
				}
				const seen = new Set(currentCache.operations.map((operation) => operation.id));
				const nextOperations = response.operations.filter((operation) => !seen.has(operation.id));
				Object.assign(currentCache, {
					...response,
					operations: [...currentCache.operations, ...nextOperations],
				});
			},
			queryFn: async ({ workspaceId, workspacePath, cursor, pageSize }, { signal }) => {
				try {
					const payload = await fetchTrpcQuery<VcsJjOperationsResponse>(
						"vcs.jjOperations",
						{ cursor: cursor ?? null, pageSize, workspacePath: workspacePath ?? undefined },
						workspaceId,
						{ signal },
					);
					const seen = new Set<string>();
					const operations = payload.operations.filter((operation) => {
						if (seen.has(operation.id)) {
							return false;
						}
						seen.add(operation.id);
						return true;
					});
					return { data: { ...payload, operations } };
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["OperationHistory"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getJjOperationDiff: builder.query<VcsJjOperationDiffResponse, JjOperationDiffQueryArg>({
			serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}:${queryArgs.workspaceId}:${queryArgs.workspacePath ?? ""}:${queryArgs.operationId}`,
			forceRefetch: ({ currentArg, previousArg }) =>
				currentArg?.cursor !== previousArg?.cursor ||
				currentArg?.pageSize !== previousArg?.pageSize,
			merge: (currentCache, response, { arg }) => {
				if (!arg.cursor) {
					Object.assign(currentCache, response);
					return;
				}
				const seen = new Set(currentCache.commits.map((commit) => commit.hash));
				const nextCommits = response.commits.filter((commit) => !seen.has(commit.hash));
				Object.assign(currentCache, {
					...response,
					summary: response.summary || currentCache.summary,
					patch: response.patch || currentCache.patch,
					files: response.files.length > 0 ? response.files : currentCache.files,
					commits: [...currentCache.commits, ...nextCommits],
				});
			},
			queryFn: async ({ workspaceId, workspacePath, operationId, cursor, pageSize }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<VcsJjOperationDiffResponse>(
							"vcs.jjOperationDiff",
							{ operationId, cursor: cursor ?? null, pageSize, workspacePath: workspacePath ?? undefined },
							workspaceId,
							{ signal },
						),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: (_result, _error, arg) => [
				"OperationDetails",
				{ type: "OperationDetails", id: arg.operationId },
			],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		createJjOperationSnapshot: builder.mutation<VcsJjOperationActionResponse, ActiveWorkspaceQueryArg>({
			queryFn: async ({ workspaceId, workspacePath }) => {
				try {
					return {
						data: await postTrpcMutation<VcsJjOperationActionResponse>(
							"vcs.createJjOperationSnapshot",
							withActiveWorkspaceInput({}, workspacePath),
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS,
		}),
		revertJjOperation: builder.mutation<VcsJjOperationActionResponse, JjOperationRevertArg>({
			queryFn: async ({ workspaceId, workspacePath, operationId }) => {
				try {
					return {
						data: await postTrpcMutation<VcsJjOperationActionResponse>(
							"vcs.revertJjOperation",
							{ operationId, workspacePath: workspacePath ?? undefined },
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS,
		}),
	}),
});

export const {
	useGetProjectsQuery,
	usePickProjectDirectoryMutation,
	useAddProjectMutation,
	useRemoveProjectMutation,
	useLazyGetProjectDirectoryContentsQuery,
	useStartShellSessionMutation,
	useStopTaskSessionMutation,
	useGetVcsDetectQuery,
	useGetProjectConfigQuery,
	useUpdateProjectConfigMutation,
	useGetJjStateQuery,
	useGetJjDiffQuery,
	useGetJjInventoryQuery,
	useGetJjBranchesDataQuery,
	useGetVcsBranchesDataQuery,
	useGetVcsWorkspaceStateQuery,
	useGetVcsStacksQuery,
	useGetPullRequestDetailsQuery,
	useUpdatePullRequestMutation,
	useGetPullRequestChecksQuery,
	useLazyGetPullRequestChecksQuery,
	useGetPullRequestConversationQuery,
	useGetBaseBranchChecksQuery,
	useGetVcsDiffQuery,
	useRunGitSyncActionMutation,
	useGetVcsConflictFileQuery,
	useResolveVcsConflictFileMutation,
	usePreviewVcsOperationQuery,
	useLazyPreviewVcsOperationQuery,
	useApplyVcsOperationMutation,
	useGetRepositoryCommitDiffQuery,
	useGetRepositoryLogQuery,
	useGetJjOperationsQuery,
	useGetJjOperationDiffQuery,
	useCreateJjOperationSnapshotMutation,
	useRevertJjOperationMutation,
} = vcsApi;
