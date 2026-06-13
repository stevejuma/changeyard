import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import { fetchTrpcQuery } from "@/runtime/trpc-client";
import type {
	QueryState,
	RuntimeGitCommitDiffResponse,
	RuntimeStateStreamVcsProjectEventMessage,
	RuntimeVcsProjectEventKind,
	VcsJjDiffResponse,
	VcsJjInventoryResponse,
	VcsJjStateResponse,
} from "@/runtime/types";
import { subscribeToVcsProjectEvents } from "@/runtime/vcs-events";

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
	| "CommitChanges";

type WorkspaceQueryArg = {
	workspaceId: string;
};

type CommitDiffQueryArg = WorkspaceQueryArg & {
	commitHash: string;
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

function tagsForVcsEvent(kind: RuntimeVcsProjectEventKind): VcsApiTag[] {
	switch (kind) {
		case "worktree_changes":
			return ["WorktreeChanges", "Diff", "CommitChanges", "Stacks", "StackDetails", "BranchListing", "BranchDetails", "DivergentBookmarks"];
		case "vcs/head":
			return ["HeadSha", "Stacks", "StackDetails", "BranchDetails", "Diff", "CommitChanges"];
		case "vcs/activity":
			return ["Stacks", "StackDetails", "BranchListing", "BranchDetails", "BaseBranchData", "DivergentBookmarks", "HeadSha"];
		case "vcs/fetch":
			return ["BranchListing", "BaseBranchData", "DivergentBookmarks"];
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
	],
	endpoints: (builder) => ({
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
	}),
});

export const {
	useGetJjStateQuery,
	useGetJjDiffQuery,
	useGetJjInventoryQuery,
	useGetRepositoryCommitDiffQuery,
} = vcsApi;
