import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import { fetchTrpcQuery, postTrpcMutation, TrpcHttpError } from "@/runtime/trpc-client";
import type {
	RuntimeChangeyardBoardFileDiffRequest,
	RuntimeChangeyardBoardFileDiffResponse,
	RuntimeChangeyardBoardFilesRequest,
	RuntimeChangeyardBoardFilesResponse,
	RuntimeChangeyardBoardSummaryResponse,
	RuntimeChangeyardChangeActionResponse,
	RuntimeChangeyardChangeCreateRequest,
	RuntimeChangeyardChangeDependencyRequest,
	RuntimeChangeyardChangeDetail,
	RuntimeChangeyardChangeGetRequest,
	RuntimeChangeyardChangeListItem,
	RuntimeChangeyardChangeUpdateBodyRequest,
	RuntimeChangeyardChangeUpdateStatusRequest,
	RuntimeChangeyardCompleteRequest,
	RuntimeChangeyardProjectConfig,
	RuntimeChangeyardReviewCompleteRequest,
	RuntimeChangeyardReviewDetail,
	RuntimeChangeyardReviewGetRequest,
	RuntimeChangeyardReviewListRequest,
	RuntimeChangeyardReviewListResponse,
	RuntimeChangeyardReviewUpdateRequest,
	RuntimeChangeyardUpdateProjectConfigRequest,
	RuntimeConfigResponse,
	RuntimeConfigSaveRequest,
	RuntimeDirectoryListRequest,
	RuntimeDirectoryListResponse,
	RuntimeProjectAddRequest,
	RuntimeProjectAddResponse,
	RuntimeProjectDirectoryPickerResponse,
	RuntimeProjectRemoveResponse,
	RuntimeProjectsResponse,
	RuntimeStateStreamMessage,
	RuntimeVcsPullRequestChecksResponse,
	RuntimeVcsPullRequestDetails,
	RuntimeVcsPullRequestSelector,
	RuntimeVcsPullRequestUpdateRequest,
	RuntimeWorkspaceChangesResponse,
	RuntimeWorkspaceStateResponse,
	RuntimeWorkspaceStateSaveRequest,
} from "@/runtime/types";
import {
	isChangeyardChangeMarkdownEventPath,
	normalizeKanbanEventPath,
} from "@/utils/changeyard-workspace-events";

export type KanbanApiTag =
	| "Projects"
	| "WorkspaceState"
	| "RuntimeConfig"
	| "ChangeyardProjectConfig"
	| "ChangeList"
	| "ChangeDetail"
	| "ChangeBoardSummary"
	| "ChangeBoardFiles"
	| "ChangeBoardFileDiff"
	| "ChangeWorkspaceChanges"
	| "ChangeReviews"
	| "PullRequests"
	| "PullRequestChecks"
	| "Directory";

type WorkspaceQueryArg = {
	workspaceId: string;
	workspacePath?: string | null;
};

type OptionalWorkspaceQueryArg = {
	workspaceId?: string | null;
	workspacePath?: string | null;
};

type ChangeQueryArg = WorkspaceQueryArg & RuntimeChangeyardChangeGetRequest;

type PullRequestSelectorArg = WorkspaceQueryArg & {
	input: Omit<RuntimeVcsPullRequestSelector, "workspacePath">;
};

type PullRequestUpdateArg = WorkspaceQueryArg & {
	input: Omit<RuntimeVcsPullRequestUpdateRequest, "workspacePath">;
};

type ChangeMutationArg<TInput> = WorkspaceQueryArg & {
	input: TInput;
};

type ChangeBoardFilesArg = WorkspaceQueryArg & {
	input: RuntimeChangeyardBoardFilesRequest;
};

type ChangeBoardFileDiffArg = WorkspaceQueryArg & {
	input: RuntimeChangeyardBoardFileDiffRequest;
};

type ReviewGetArg = WorkspaceQueryArg & {
	input: RuntimeChangeyardReviewGetRequest;
};

type ReviewListArg = WorkspaceQueryArg & {
	input: RuntimeChangeyardReviewListRequest;
};

type ReviewMutationArg<TInput> = WorkspaceQueryArg & {
	input: TInput;
};

type ProjectDirectoryQueryArg = OptionalWorkspaceQueryArg & {
	input?: RuntimeDirectoryListRequest;
};

type AddProjectArg = OptionalWorkspaceQueryArg & {
	input: RuntimeProjectAddRequest;
};

type RemoveProjectArg = OptionalWorkspaceQueryArg & {
	projectId: string;
};

type SaveWorkspaceStateArg = WorkspaceQueryArg & {
	input: RuntimeWorkspaceStateSaveRequest;
};

type RuntimeConfigArg = OptionalWorkspaceQueryArg;

type SaveRuntimeConfigArg = OptionalWorkspaceQueryArg & {
	input: RuntimeConfigSaveRequest;
};

type UpdateChangeyardProjectConfigArg = WorkspaceQueryArg & {
	input: RuntimeChangeyardUpdateProjectConfigRequest;
};

type RtkResult<T> = {
	data?: T;
	currentData?: T;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error?: unknown;
};

export interface KanbanQueryError {
	message: string;
	status?: number;
	code?: string;
	conflictRevision?: number | null;
	conflictUpdatedAt?: string | null;
}

export type RuntimeQueryState<T> =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };

function toKanbanQueryError(error: unknown): KanbanQueryError {
	if (error instanceof TrpcHttpError) {
		return {
			message: error.message,
			status: error.status,
			code: error.data?.code,
			conflictRevision: error.data?.conflictRevision ?? null,
			conflictUpdatedAt: error.data?.conflictUpdatedAt ?? null,
		};
	}
	if (error instanceof Error) {
		return { message: error.message };
	}
	if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
		return { message: error.message };
	}
	return { message: "Request failed." };
}

function errorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
		return error.message;
	}
	return fallback;
}

export function toRuntimeQueryState<T>(result: RtkResult<T>, message: string): RuntimeQueryState<T> {
	if (result.data !== undefined) {
		return { status: "ready", data: result.data };
	}
	if (result.isError) {
		return { status: "error", message: errorMessage(result.error, message) };
	}
	return { status: "loading" };
}

export function toRuntimeCurrentQueryState<T>(result: RtkResult<T>, message: string): RuntimeQueryState<T> {
	if (result.currentData !== undefined) {
		return { status: "ready", data: result.currentData };
	}
	if (result.isError) {
		return { status: "error", message: errorMessage(result.error, message) };
	}
	return { status: "loading" };
}

function changeDetailTag(changeId: string) {
	return { type: "ChangeDetail" as const, id: changeId };
}

function changeBoardTags(changeId: string) {
	return [
		{ type: "ChangeBoardSummary" as const, id: changeId },
		{ type: "ChangeBoardFiles" as const, id: changeId },
		{ type: "ChangeBoardFileDiff" as const, id: changeId },
		{ type: "ChangeWorkspaceChanges" as const, id: changeId },
	];
}

function tagsForChangedChange(changeId: string) {
	return ["ChangeList" as const, changeDetailTag(changeId), ...changeBoardTags(changeId), "ChangeReviews" as const];
}

function changeIdFromMarkdownEventPath(input: string): string | null {
	const eventPath = normalizeKanbanEventPath(input);
	if (!isChangeyardChangeMarkdownEventPath(eventPath)) {
		return null;
	}
	const fileName = eventPath.split("/").pop() ?? "";
	const match = /^(CY-\d+)(?:-|\.md$)/.exec(fileName);
	return match?.[1] ?? null;
}

export function tagsForRuntimeStreamMessage(
	message: RuntimeStateStreamMessage,
): Array<KanbanApiTag | { type: KanbanApiTag; id: string }> {
	switch (message.type) {
		case "projects_updated":
			return ["Projects"];
		case "workspace_state_updated":
		case "task_sessions_updated":
			return ["WorkspaceState", "Projects"];
		case "mcp_auth_updated":
		case "cline_session_context_updated":
			return ["RuntimeConfig"];
		case "vcs_project_event": {
			if (message.kind !== "worktree_changes") {
				return [];
			}
			const tags: Array<KanbanApiTag | { type: KanbanApiTag; id: string }> = [];
			const changeIds = new Set<string>();
			for (const path of message.paths) {
				const changeId = changeIdFromMarkdownEventPath(path);
				if (changeId) {
					changeIds.add(changeId);
				}
			}
			if (changeIds.size > 0) {
				tags.push("ChangeList");
				for (const changeId of changeIds) {
					tags.push(...tagsForChangedChange(changeId));
				}
			}
			return tags;
		}
		default:
			return [];
	}
}

async function query<T>(
	path: string,
	input: unknown,
	workspaceId: string | null | undefined,
	signal?: AbortSignal,
	workspacePath?: string | null,
) {
	return await fetchTrpcQuery<T>(path, input, workspaceId ?? null, { signal, workspacePath });
}

async function mutation<T>(
	path: string,
	input: unknown,
	workspaceId: string | null | undefined,
	workspacePath?: string | null,
) {
	return await postTrpcMutation<T>(path, input, workspaceId ?? null, workspacePath);
}

export const kanbanApi = createApi({
	reducerPath: "kanbanApi",
	baseQuery: fakeBaseQuery(),
	tagTypes: [
		"Projects",
		"WorkspaceState",
		"RuntimeConfig",
		"ChangeyardProjectConfig",
		"ChangeList",
		"ChangeDetail",
		"ChangeBoardSummary",
		"ChangeBoardFiles",
		"ChangeBoardFileDiff",
		"ChangeWorkspaceChanges",
		"ChangeReviews",
		"PullRequests",
		"PullRequestChecks",
		"Directory",
	],
	endpoints: (builder) => ({
		getProjects: builder.query<RuntimeProjectsResponse, void>({
			queryFn: async (_arg, { signal }) => {
				try {
					return { data: await query<RuntimeProjectsResponse>("projects.list", {}, null, signal) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: ["Projects"],
		}),
		pickProjectDirectory: builder.mutation<RuntimeProjectDirectoryPickerResponse, OptionalWorkspaceQueryArg | void>({
			queryFn: async (arg) => {
				try {
					return {
						data: await mutation<RuntimeProjectDirectoryPickerResponse>(
							"projects.pickDirectory",
							{},
							arg?.workspaceId ?? null,
						),
					};
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
		}),
		addProject: builder.mutation<RuntimeProjectAddResponse, AddProjectArg>({
			queryFn: async ({ workspaceId, input }) => {
				try {
					return { data: await mutation<RuntimeProjectAddResponse>("projects.add", input, workspaceId ?? null) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: ["Projects"],
		}),
		removeProject: builder.mutation<RuntimeProjectRemoveResponse, RemoveProjectArg>({
			queryFn: async ({ workspaceId, projectId }) => {
				try {
					return { data: await mutation<RuntimeProjectRemoveResponse>("projects.remove", { projectId }, workspaceId ?? null) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: ["Projects", "WorkspaceState"],
		}),
		listDirectoryContents: builder.query<RuntimeDirectoryListResponse, ProjectDirectoryQueryArg>({
			queryFn: async ({ workspaceId, input }, { signal }) => {
				try {
					return {
						data: await query<RuntimeDirectoryListResponse>(
							"projects.listDirectoryContents",
							input ?? {},
							workspaceId ?? null,
							signal,
						),
					};
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: ["Directory"],
		}),
		getWorkspaceState: builder.query<RuntimeWorkspaceStateResponse, WorkspaceQueryArg>({
			queryFn: async ({ workspaceId, workspacePath }, { signal }) => {
				try {
					return { data: await query<RuntimeWorkspaceStateResponse>("workspace.getState", {}, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: ["WorkspaceState"],
		}),
		saveWorkspaceState: builder.mutation<RuntimeWorkspaceStateResponse, SaveWorkspaceStateArg>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return { data: await mutation<RuntimeWorkspaceStateResponse>("workspace.saveState", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: ["WorkspaceState", "Projects"],
		}),
		getRuntimeConfig: builder.query<RuntimeConfigResponse, RuntimeConfigArg>({
			queryFn: async ({ workspaceId }, { signal }) => {
				try {
					return { data: await query<RuntimeConfigResponse>("runtime.getConfig", {}, workspaceId ?? null, signal) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: ["RuntimeConfig"],
		}),
		saveRuntimeConfig: builder.mutation<RuntimeConfigResponse, SaveRuntimeConfigArg>({
			queryFn: async ({ workspaceId, input }) => {
				try {
					return { data: await mutation<RuntimeConfigResponse>("runtime.saveConfig", input, workspaceId ?? null) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: ["RuntimeConfig"],
		}),
		getChangeyardProjectConfig: builder.query<RuntimeChangeyardProjectConfig, WorkspaceQueryArg>({
			queryFn: async ({ workspaceId, workspacePath }, { signal }) => {
				try {
					return { data: await query<RuntimeChangeyardProjectConfig>("changes.getProjectConfig", {}, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: ["ChangeyardProjectConfig"],
		}),
		saveChangeyardProjectConfig: builder.mutation<RuntimeChangeyardProjectConfig, UpdateChangeyardProjectConfigArg>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return { data: await mutation<RuntimeChangeyardProjectConfig>("changes.updateProjectConfig", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: ["ChangeyardProjectConfig", "ChangeList", "Projects"],
		}),
		listChanges: builder.query<RuntimeChangeyardChangeListItem[], WorkspaceQueryArg>({
			queryFn: async ({ workspaceId, workspacePath }, { signal }) => {
				try {
					const response = await query<{ changes: RuntimeChangeyardChangeListItem[] }>("changes.list", {}, workspaceId, signal, workspacePath);
					return { data: response.changes };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: (result) => ["ChangeList", ...(result ?? []).map((change) => changeDetailTag(change.id))],
		}),
		getChange: builder.query<RuntimeChangeyardChangeDetail | null, ChangeQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, id }, { signal }) => {
				try {
					return { data: await query<RuntimeChangeyardChangeDetail | null>("changes.get", { id }, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: (_result, _error, arg) => [changeDetailTag(arg.id)],
		}),
		getPullRequestDetails: builder.query<RuntimeVcsPullRequestDetails, PullRequestSelectorArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return { data: await query<RuntimeVcsPullRequestDetails>("vcs.pullRequestDetails", input, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
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
					return { data: await mutation<RuntimeVcsPullRequestDetails>("vcs.updatePullRequest", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: ["PullRequests", "ChangeList"],
		}),
		getPullRequestChecks: builder.query<RuntimeVcsPullRequestChecksResponse, PullRequestSelectorArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return { data: await query<RuntimeVcsPullRequestChecksResponse>("vcs.pullRequestChecks", input, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: (_result, _error, arg) => [
				"PullRequestChecks",
				{ type: "PullRequestChecks", id: JSON.stringify(arg.input) },
			],
		}),
		getChangeWorkspaceChanges: builder.query<RuntimeWorkspaceChangesResponse, ChangeQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, id }, { signal }) => {
				try {
					return { data: await query<RuntimeWorkspaceChangesResponse>("changes.getWorkspaceChanges", { id }, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: (_result, _error, arg) => [{ type: "ChangeWorkspaceChanges", id: arg.id }],
		}),
		createChange: builder.mutation<RuntimeChangeyardChangeDetail, ChangeMutationArg<RuntimeChangeyardChangeCreateRequest>>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeDetail>("changes.create", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result) => result ? tagsForChangedChange(result.id) : ["ChangeList"],
		}),
		updateChangeStatus: builder.mutation<RuntimeChangeyardChangeDetail, ChangeMutationArg<RuntimeChangeyardChangeUpdateStatusRequest>>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeDetail>("changes.updateStatus", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => tagsForChangedChange(result?.id ?? arg.input.id),
		}),
		validateChange: builder.mutation<RuntimeChangeyardChangeDetail, ChangeQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, id }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeDetail>("changes.validate", { id }, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => tagsForChangedChange(result?.id ?? arg.id),
		}),
		syncChange: builder.mutation<RuntimeChangeyardChangeDetail, ChangeQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, id }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeDetail>("changes.sync", { id }, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => tagsForChangedChange(result?.id ?? arg.id),
		}),
		startChange: builder.mutation<RuntimeChangeyardChangeDetail, ChangeQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, id }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeDetail>("changes.start", { id }, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => ["Projects", "WorkspaceState", ...tagsForChangedChange(result?.id ?? arg.id)],
		}),
		verifyChange: builder.mutation<RuntimeChangeyardChangeActionResponse, ChangeQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, id }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeActionResponse>("changes.verify", { id }, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => tagsForChangedChange(result?.change.id ?? arg.id),
		}),
		completeChange: builder.mutation<RuntimeChangeyardChangeActionResponse, ChangeMutationArg<RuntimeChangeyardCompleteRequest>>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeActionResponse>("changes.complete", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => tagsForChangedChange(result?.change.id ?? arg.input.id),
		}),
		reviewStart: builder.mutation<RuntimeChangeyardChangeActionResponse, ChangeQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, id }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeActionResponse>("changes.reviewStart", { id }, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => [...tagsForChangedChange(result?.change.id ?? arg.id), "ChangeReviews"],
		}),
		reviewList: builder.query<RuntimeChangeyardReviewListResponse, ReviewListArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return { data: await query<RuntimeChangeyardReviewListResponse>("changes.reviewList", input, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: (_result, _error, arg) => ["ChangeReviews", { type: "ChangeReviews", id: arg.input.id }],
		}),
		reviewGet: builder.query<RuntimeChangeyardReviewDetail, ReviewGetArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return { data: await query<RuntimeChangeyardReviewDetail>("changes.reviewGet", input, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: (_result, _error, arg) => ["ChangeReviews", { type: "ChangeReviews", id: `${arg.input.id}:${arg.input.review}` }],
		}),
		reviewUpdate: builder.mutation<RuntimeChangeyardReviewDetail, ReviewMutationArg<RuntimeChangeyardReviewUpdateRequest>>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return { data: await mutation<RuntimeChangeyardReviewDetail>("changes.reviewUpdate", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (_result, _error, arg) => ["ChangeReviews", { type: "ChangeReviews", id: arg.input.id }],
		}),
		reviewComplete: builder.mutation<RuntimeChangeyardChangeActionResponse, ReviewMutationArg<RuntimeChangeyardReviewCompleteRequest>>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeActionResponse>("changes.reviewComplete", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => [...tagsForChangedChange(result?.change.id ?? arg.input.id), "ChangeReviews"],
		}),
		linkChange: builder.mutation<RuntimeChangeyardChangeDetail, ChangeMutationArg<RuntimeChangeyardChangeDependencyRequest>>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeDetail>("changes.link", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => [
				...tagsForChangedChange(result?.id ?? arg.input.changeId),
				...tagsForChangedChange(arg.input.blockedByChangeId),
			],
		}),
		unlinkChange: builder.mutation<RuntimeChangeyardChangeDetail, ChangeMutationArg<RuntimeChangeyardChangeDependencyRequest>>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeDetail>("changes.unlink", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => [
				...tagsForChangedChange(result?.id ?? arg.input.changeId),
				...tagsForChangedChange(arg.input.blockedByChangeId),
			],
		}),
		updateChangeBody: builder.mutation<RuntimeChangeyardChangeDetail, ChangeMutationArg<RuntimeChangeyardChangeUpdateBodyRequest>>({
			queryFn: async ({ workspaceId, workspacePath, input }) => {
				try {
					return { data: await mutation<RuntimeChangeyardChangeDetail>("changes.updateBody", input, workspaceId, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			invalidatesTags: (result, _error, arg) => tagsForChangedChange(result?.id ?? arg.input.id),
		}),
		getChangeBoardSummary: builder.query<RuntimeChangeyardBoardSummaryResponse, ChangeQueryArg>({
			queryFn: async ({ workspaceId, workspacePath, id }, { signal }) => {
				try {
					return { data: await query<RuntimeChangeyardBoardSummaryResponse>("changes.getBoardSummary", { id }, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: (_result, _error, arg) => [{ type: "ChangeBoardSummary", id: arg.id }],
		}),
		getChangeBoardFiles: builder.query<RuntimeChangeyardBoardFilesResponse, ChangeBoardFilesArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return { data: await query<RuntimeChangeyardBoardFilesResponse>("changes.getBoardFiles", input, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: (_result, _error, arg) => [{ type: "ChangeBoardFiles", id: arg.input.id }],
		}),
		getChangeBoardFileDiff: builder.query<RuntimeChangeyardBoardFileDiffResponse, ChangeBoardFileDiffArg>({
			queryFn: async ({ workspaceId, workspacePath, input }, { signal }) => {
				try {
					return { data: await query<RuntimeChangeyardBoardFileDiffResponse>("changes.getBoardFileDiff", input, workspaceId, signal, workspacePath) };
				} catch (error) {
					return { error: toKanbanQueryError(error) };
				}
			},
			providesTags: (_result, _error, arg) => [
				{ type: "ChangeBoardFileDiff", id: arg.input.id },
				{ type: "ChangeBoardFileDiff", id: `${arg.input.id}:${JSON.stringify(arg.input.scope)}:${arg.input.path}` },
			],
		}),
	}),
});

export const {
	useGetProjectsQuery,
	usePickProjectDirectoryMutation,
	useAddProjectMutation,
	useRemoveProjectMutation,
	useLazyListDirectoryContentsQuery,
	useGetWorkspaceStateQuery,
	useSaveWorkspaceStateMutation,
	useGetRuntimeConfigQuery,
	useSaveRuntimeConfigMutation,
	useGetChangeyardProjectConfigQuery,
	useSaveChangeyardProjectConfigMutation,
	useListChangesQuery,
	useGetChangeQuery,
	useGetPullRequestDetailsQuery,
	useUpdatePullRequestMutation,
	useGetPullRequestChecksQuery,
	useGetChangeWorkspaceChangesQuery,
	useCreateChangeMutation,
	useUpdateChangeStatusMutation,
	useValidateChangeMutation,
	useSyncChangeMutation,
	useStartChangeMutation,
	useVerifyChangeMutation,
	useCompleteChangeMutation,
	useReviewStartMutation,
	useReviewListQuery,
	useReviewGetQuery,
	useReviewUpdateMutation,
	useReviewCompleteMutation,
	useLinkChangeMutation,
	useUnlinkChangeMutation,
	useUpdateChangeBodyMutation,
	useGetChangeBoardSummaryQuery,
	useGetChangeBoardFilesQuery,
	useGetChangeBoardFileDiffQuery,
	useLazyGetChangeBoardSummaryQuery,
	useLazyGetChangeBoardFilesQuery,
	useLazyGetChangeBoardFileDiffQuery,
} = kanbanApi;
