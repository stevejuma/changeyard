import { useMemo, useState } from "react";

import type {
	QueryState,
	RuntimeGitLogRequest,
	RuntimeGitLogResponse,
} from "@/runtime/types";
import { toRuntimeQueryState, useGetRepositoryLogQuery } from "@/runtime/vcs-api";

export function useRtkPaginatedRepositoryLog({
	input,
	message,
	enabled,
	workspaceId,
	workspacePath,
	pageSize = 50,
}: {
	input: Omit<RuntimeGitLogRequest, "maxCount" | "skip">;
	message: string;
	enabled: boolean;
	workspaceId?: string | null;
	workspacePath?: string | null;
	pageSize?: number;
}): {
	state: QueryState<RuntimeGitLogResponse>;
	isLoadingMore: boolean;
	hasMore: boolean;
	loadMore: () => void;
	refresh: () => void;
} {
	const inputKey = JSON.stringify(input ?? {});
	const stableInput = useMemo(
		() => JSON.parse(inputKey) as Omit<RuntimeGitLogRequest, "maxCount" | "skip">,
		[inputKey],
	);
	const [loadedCountByInput, setLoadedCountByInput] = useState<Record<string, number>>({});
	const [cursorByInput, setCursorByInput] = useState<Record<string, string | null>>({});
	const [fallbackSkipByInput, setFallbackSkipByInput] = useState<Record<string, number>>({});
	const loadedCount = loadedCountByInput[inputKey] ?? pageSize;
	const cursor = cursorByInput[inputKey] ?? null;
	const fallbackSkip = fallbackSkipByInput[inputKey] ?? 0;
	const result = useGetRepositoryLogQuery(
		{
			workspaceId: workspaceId ?? "",
			workspacePath,
			input: {
				...stableInput,
				maxCount: pageSize,
				skip: cursor ? undefined : fallbackSkip,
				cursor,
				pageSize,
			},
		},
		{ skip: !enabled || !workspaceId },
	);
	const state = toRuntimeQueryState<RuntimeGitLogResponse>(result, message);
	const hasMore = state.status === "ready" && state.data.ok && (state.data.hasMore ?? state.data.commits.length < state.data.totalCount);
	const isLoadingMore =
		result.isFetching &&
		state.status === "ready" &&
		state.data.ok &&
		state.data.commits.length < loadedCount;

	return {
		state,
		isLoadingMore,
		hasMore,
		loadMore: () => {
			if (state.status !== "ready" || !state.data.ok || isLoadingMore || !hasMore) {
				return;
			}
			setLoadedCountByInput((current) => ({
				...current,
				[inputKey]: state.data.commits.length + pageSize,
			}));
			const nextCursor = state.data.nextCursor ?? null;
			setCursorByInput((current) => ({
				...current,
				[inputKey]: nextCursor,
			}));
			if (!nextCursor) {
				setFallbackSkipByInput((current) => ({
					...current,
					[inputKey]: state.data.commits.length,
				}));
			}
		},
		refresh: () => {
			setLoadedCountByInput((current) => ({ ...current, [inputKey]: pageSize }));
			setCursorByInput((current) => ({ ...current, [inputKey]: null }));
			setFallbackSkipByInput((current) => ({ ...current, [inputKey]: 0 }));
			void result.refetch();
		},
	};
}
