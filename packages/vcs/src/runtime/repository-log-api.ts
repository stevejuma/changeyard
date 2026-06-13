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
	pageSize = 50,
}: {
	input: Omit<RuntimeGitLogRequest, "maxCount" | "skip">;
	message: string;
	enabled: boolean;
	workspaceId?: string | null;
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
	const loadedCount = loadedCountByInput[inputKey] ?? pageSize;
	const result = useGetRepositoryLogQuery(
		{
			workspaceId: workspaceId ?? "",
			input: {
				...stableInput,
				maxCount: pageSize,
				skip: Math.max(0, loadedCount - pageSize),
			},
		},
		{ skip: !enabled || !workspaceId },
	);
	const state = toRuntimeQueryState<RuntimeGitLogResponse>(result, message);
	const hasMore = state.status === "ready" && state.data.ok && state.data.commits.length < state.data.totalCount;
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
		},
		refresh: () => void result.refetch(),
	};
}
