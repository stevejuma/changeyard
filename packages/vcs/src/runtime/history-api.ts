import { useMemo, useState } from "react";

import type {
	QueryState,
	VcsJjOperationDiffResponse,
	VcsJjOperationsResponse,
} from "@/runtime/types";
import {
	toRuntimeQueryState,
	useGetJjOperationDiffQuery,
	useGetJjOperationsQuery,
} from "@/runtime/vcs-api";

export function useRtkPaginatedJjOperations({
	message,
	enabled,
	workspaceId,
	pageSize = 50,
}: {
	message: string;
	enabled: boolean;
	workspaceId?: string | null;
	pageSize?: number;
}): {
	state: QueryState<VcsJjOperationsResponse>;
	isLoadingMore: boolean;
	hasMore: boolean;
	loadMore: () => void;
	refresh: () => void;
} {
	const [limit, setLimit] = useState(pageSize);
	const result = useGetJjOperationsQuery(
		{ workspaceId: workspaceId ?? "", limit },
		{ skip: !enabled || !workspaceId },
	);
	const state = toRuntimeQueryState<VcsJjOperationsResponse>(result, message);
	const hasMore = state.status === "ready" && state.data.hasMore;
	const isLoadingMore =
		result.isFetching &&
		state.status === "ready" &&
		state.data.requestedLimit < limit;

	return {
		state,
		isLoadingMore,
		hasMore,
		loadMore: () => {
			if (state.status !== "ready" || isLoadingMore || !hasMore) {
				return;
			}
			setLimit(state.data.operations.length + pageSize);
		},
		refresh: () => void result.refetch(),
	};
}

export function useRtkPaginatedJjOperationDiff({
	operationId,
	message,
	enabled,
	workspaceId,
	pageSize = 50,
}: {
	operationId: string | null;
	message: string;
	enabled: boolean;
	workspaceId?: string | null;
	pageSize?: number;
}): {
	state: QueryState<VcsJjOperationDiffResponse>;
	isLoadingMore: boolean;
	hasMore: boolean;
	loadMore: () => void;
	refresh: () => void;
} {
	const [loadedCommitCountByOperation, setLoadedCommitCountByOperation] = useState<Record<string, number>>({});
	const commitLimit = operationId ? loadedCommitCountByOperation[operationId] ?? pageSize : pageSize;
	const result = useGetJjOperationDiffQuery(
		{
			workspaceId: workspaceId ?? "",
			operationId: operationId ?? "",
			commitSkip: 0,
			commitLimit,
		},
		{ skip: !enabled || !workspaceId || !operationId },
	);
	const state = toRuntimeQueryState<VcsJjOperationDiffResponse>(result, message);
	const hasMore = state.status === "ready" && state.data.hasMoreCommits;
	const isLoadingMore =
		result.isFetching &&
		state.status === "ready" &&
		state.data.commitLimit < commitLimit;

	const normalizedState = useMemo<QueryState<VcsJjOperationDiffResponse>>(() => {
		if (operationId || enabled) {
			return state;
		}
		return { status: "loading" };
	}, [enabled, operationId, state]);

	return {
		state: normalizedState,
		isLoadingMore,
		hasMore,
		loadMore: () => {
			if (state.status !== "ready" || isLoadingMore || !hasMore || !operationId) {
				return;
			}
			setLoadedCommitCountByOperation((current) => ({
				...current,
				[operationId]: state.data.commits.length + pageSize,
			}));
		},
		refresh: () => void result.refetch(),
	};
}
