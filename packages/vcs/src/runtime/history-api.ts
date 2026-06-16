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
	workspacePath,
	pageSize = 50,
}: {
	message: string;
	enabled: boolean;
	workspaceId?: string | null;
	workspacePath?: string | null;
	pageSize?: number;
}): {
	state: QueryState<VcsJjOperationsResponse>;
	isLoadingMore: boolean;
	hasMore: boolean;
	loadMore: () => void;
	refresh: () => void;
	} {
	const [cursor, setCursor] = useState<string | null>(null);
	const result = useGetJjOperationsQuery(
		{ workspaceId: workspaceId ?? "", workspacePath, cursor, pageSize },
		{ skip: !enabled || !workspaceId },
	);
	const state = toRuntimeQueryState<VcsJjOperationsResponse>(result, message);
	const hasMore = state.status === "ready" && state.data.hasMore;
	const isLoadingMore =
		result.isFetching &&
		state.status === "ready" &&
		Boolean(cursor);

	return {
		state,
		isLoadingMore,
		hasMore,
		loadMore: () => {
			if (state.status !== "ready" || isLoadingMore || !hasMore) {
				return;
			}
			setCursor(state.data.nextCursor ?? null);
		},
		refresh: () => {
			setCursor(null);
			if (enabled && workspaceId) {
				void result.refetch();
			}
		},
	};
}

export function useRtkPaginatedJjOperationDiff({
	operationId,
	message,
	enabled,
	workspaceId,
	workspacePath,
	pageSize = 50,
}: {
	operationId: string | null;
	message: string;
	enabled: boolean;
	workspaceId?: string | null;
	workspacePath?: string | null;
	pageSize?: number;
}): {
	state: QueryState<VcsJjOperationDiffResponse>;
	isLoadingMore: boolean;
	hasMore: boolean;
	loadMore: () => void;
	refresh: () => void;
	} {
	const [cursorByOperation, setCursorByOperation] = useState<Record<string, string | null>>({});
	const cursor = operationId ? cursorByOperation[operationId] ?? null : null;
	const result = useGetJjOperationDiffQuery(
		{
			workspaceId: workspaceId ?? "",
			workspacePath,
			operationId: operationId ?? "",
			cursor,
			pageSize,
		},
		{ skip: !enabled || !workspaceId || !operationId },
	);
	const state = toRuntimeQueryState<VcsJjOperationDiffResponse>(result, message);
	const hasMore = state.status === "ready" && state.data.hasMoreCommits;
	const isLoadingMore =
		result.isFetching &&
		state.status === "ready" &&
		Boolean(cursor);

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
			setCursorByOperation((current) => ({
				...current,
				[operationId]: state.data.nextCursor ?? null,
			}));
		},
		refresh: () => {
			if (operationId) {
				setCursorByOperation((current) => ({ ...current, [operationId]: null }));
			}
			if (enabled && workspaceId && operationId) {
				void result.refetch();
			}
		},
	};
}
