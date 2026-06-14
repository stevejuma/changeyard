import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import { fetchTrpcQuery, postTrpcMutation } from "@/runtime/trpc-client";
import type {
	QueryState,
	RuntimeDirectoryListRequest,
	RuntimeDirectoryListResponse,
	RuntimeGitCommitDiffResponse,
	RuntimeGitLogRequest,
	RuntimeGitLogResponse,
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
	VcsOperationPreview,
	VcsOperationResult,
	VcsWorkspaceOperationInput,
	VcsWorkspaceStack,
	VcsWorkspaceState,
	VcsWorkspaceStateInput,
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
	| "ProjectConfig"
	| "VcsDetection"
	| "OperationHistory"
	| "OperationDetails"
	| "RepositoryLog"
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
	"OperationHistory",
	"OperationDetails",
	"RepositoryLog",
] satisfies VcsApiTag[];

type WorkspaceQueryArg = {
	workspaceId: string;
};

type VcsWorkspaceStateQueryArg = WorkspaceQueryArg & {
	input?: Omit<VcsWorkspaceStateInput, "projectId">;
};

type VcsDiffQueryArg = WorkspaceQueryArg & {
	input?: Omit<VcsDiffInput, "projectId">;
};

type VcsWorkspaceOperationArg = WorkspaceQueryArg & {
	input: Omit<VcsWorkspaceOperationInput, "projectId">;
};

type CommitDiffQueryArg = WorkspaceQueryArg & {
	commitHash: string;
};

type UpdateProjectConfigArg = WorkspaceQueryArg & {
	input: RuntimeProjectConfigUpdateRequest;
};

type JjOperationsQueryArg = WorkspaceQueryArg & {
	cursor?: string | null;
	pageSize: number;
};

type JjOperationDiffQueryArg = WorkspaceQueryArg & {
	operationId: string;
	cursor?: string | null;
	pageSize: number;
};

type JjOperationRevertArg = WorkspaceQueryArg & {
	operationId: string;
};

type RepositoryLogQueryArg = WorkspaceQueryArg & {
	input: RuntimeGitLogRequest;
};

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

export function toRuntimeQueryState<T>(result: RtkResult<T>, message: string): QueryState<T> {
	if (result.data !== undefined) {
		return { status: "ready", data: result.data };
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
			return ["HeadSha", "Stacks", "StackDetails", "BranchDetails", "Diff", "CommitChanges", "VcsDetection"];
		case "vcs/activity":
			return [
				"Stacks",
				"StackDetails",
				"BranchListing",
				"BranchDetails",
				"BaseBranchData",
				"DivergentBookmarks",
				"HeadSha",
				"VcsDetection",
				"OperationHistory",
				"OperationDetails",
				"RepositoryLog",
			];
		case "vcs/fetch":
			return ["BranchListing", "BaseBranchData", "DivergentBookmarks", "VcsDetection"];
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
		"ProjectConfig",
		"VcsDetection",
		"OperationHistory",
		"OperationDetails",
		"RepositoryLog",
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
		getVcsDetect: builder.query<VcsDetectResponse, WorkspaceQueryArg>({
			queryFn: async ({ workspaceId }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<VcsDetectResponse>("vcs.detect", undefined, workspaceId, { signal }),
					};
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
		getJjState: builder.query<VcsJjStateResponse, WorkspaceQueryArg>({
			queryFn: async ({ workspaceId }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsJjStateResponse>("vcs.jjState", undefined, workspaceId, { signal }) };
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["Stacks", "StackDetails", "WorktreeChanges", "HeadSha", "BaseBranchData"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getJjDiff: builder.query<VcsJjDiffResponse, WorkspaceQueryArg>({
			queryFn: async ({ workspaceId }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsJjDiffResponse>("vcs.jjDiff", undefined, workspaceId, { signal }) };
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["WorktreeChanges", "Diff"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getJjInventory: builder.query<VcsJjInventoryResponse, WorkspaceQueryArg>({
			queryFn: async ({ workspaceId }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsJjInventoryResponse>("vcs.jjInventory", undefined, workspaceId, { signal }) };
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["BranchListing", "BaseBranchData", "DivergentBookmarks"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getJjBranchesData: builder.query<VcsJjBranchesDataResponse, WorkspaceQueryArg>({
			queryFn: async ({ workspaceId }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsJjBranchesDataResponse>("vcs.jjBranchesData", undefined, workspaceId, { signal }) };
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
		getVcsBranchesData: builder.query<VcsBranchesDataResponse, WorkspaceQueryArg>({
			queryFn: async ({ workspaceId }, { signal }) => {
				try {
					return { data: await fetchTrpcQuery<VcsBranchesDataResponse>("vcs.branchesData", undefined, workspaceId, { signal }) };
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
			queryFn: async ({ workspaceId, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<VcsWorkspaceState>(
							"vcs.workspaceState",
							input ?? {},
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
			queryFn: async ({ workspaceId, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<{ stacks: VcsWorkspaceStack[] }>(
							"vcs.workspaceStacks",
							input ?? {},
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
		getVcsDiff: builder.query<VcsDiffResult, VcsDiffQueryArg>({
			queryFn: async ({ workspaceId, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<VcsDiffResult>("vcs.diff", input ?? {}, workspaceId, { signal }),
					};
				} catch (error) {
					return { error };
				}
			},
			providesTags: ["WorktreeChanges", "Diff", "CommitChanges"],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		previewVcsOperation: builder.query<VcsOperationPreview, VcsWorkspaceOperationArg>({
			queryFn: async ({ workspaceId, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<VcsOperationPreview>(
							"vcs.previewWorkspaceOperation",
							input,
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
			queryFn: async ({ workspaceId, input }) => {
				try {
					return {
						data: await postTrpcMutation<VcsOperationResult>(
							"vcs.applyWorkspaceOperation",
							input,
							workspaceId,
						),
					};
				} catch (error) {
					return { error };
				}
			},
			invalidatesTags: VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS,
		}),
		getRepositoryCommitDiff: builder.query<RuntimeGitCommitDiffResponse, CommitDiffQueryArg>({
			queryFn: async ({ workspaceId, commitHash }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeGitCommitDiffResponse>(
							"workspace.getRepositoryCommitDiff",
							{ commitHash },
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
				{ type: "CommitChanges", id: arg.commitHash },
			],
			onCacheEntryAdded: ({ workspaceId }, { dispatch, cacheDataLoaded, cacheEntryRemoved }) =>
				subscribeToWorkspaceEvents(workspaceId, dispatch, cacheDataLoaded, cacheEntryRemoved),
		}),
		getRepositoryLog: builder.query<RuntimeGitLogResponse, RepositoryLogQueryArg>({
			serializeQueryArgs: ({ endpointName, queryArgs }) => {
				const { maxCount: _maxCount, skip: _skip, cursor: _cursor, pageSize: _pageSize, ...baseInput } = queryArgs.input;
				return `${endpointName}:${queryArgs.workspaceId}:${JSON.stringify(baseInput)}`;
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
			queryFn: async ({ workspaceId, input }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<RuntimeGitLogResponse>(
							"workspace.getRepositoryLog",
							input,
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
			serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}:${queryArgs.workspaceId}`,
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
			queryFn: async ({ workspaceId, cursor, pageSize }, { signal }) => {
				try {
					const payload = await fetchTrpcQuery<VcsJjOperationsResponse>(
						"vcs.jjOperations",
						{ cursor: cursor ?? null, pageSize },
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
			serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}:${queryArgs.workspaceId}:${queryArgs.operationId}`,
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
			queryFn: async ({ workspaceId, operationId, cursor, pageSize }, { signal }) => {
				try {
					return {
						data: await fetchTrpcQuery<VcsJjOperationDiffResponse>(
							"vcs.jjOperationDiff",
							{ operationId, cursor: cursor ?? null, pageSize },
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
		createJjOperationSnapshot: builder.mutation<VcsJjOperationActionResponse, WorkspaceQueryArg>({
			queryFn: async ({ workspaceId }) => {
				try {
					return {
						data: await postTrpcMutation<VcsJjOperationActionResponse>(
							"vcs.createJjOperationSnapshot",
							{},
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
			queryFn: async ({ workspaceId, operationId }) => {
				try {
					return {
						data: await postTrpcMutation<VcsJjOperationActionResponse>(
							"vcs.revertJjOperation",
							{ operationId },
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
	useGetVcsDiffQuery,
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
