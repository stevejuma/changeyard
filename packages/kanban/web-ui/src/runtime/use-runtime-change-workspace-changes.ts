import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback } from "react";

import { useGetChangeWorkspaceChangesQuery } from "@/runtime/kanban-api";
import type { RuntimeWorkspaceChangesResponse } from "@/runtime/types";

export interface UseRuntimeChangeWorkspaceChangesResult {
	changes: RuntimeWorkspaceChangesResponse | null;
	isLoading: boolean;
	isRuntimeAvailable: boolean;
	refresh: () => Promise<void>;
}

export function useRuntimeChangeWorkspaceChanges(
	changeId: string | null,
	workspaceId: string | null,
	pollIntervalMs: number | null = null,
	workspacePath: string | null = null,
): UseRuntimeChangeWorkspaceChangesResult {
	const hasWorkspaceScope = changeId !== null && workspaceId !== null;
	const queryArg = hasWorkspaceScope ? { workspaceId, workspacePath, id: changeId } : skipToken;
	const changesQuery = useGetChangeWorkspaceChangesQuery(queryArg, {
		pollingInterval: pollIntervalMs ?? 0,
		skipPollingIfUnfocused: true,
	});

	const refresh = useCallback(async () => {
		if (!hasWorkspaceScope) {
			return;
		}
		await changesQuery.refetch().unwrap();
	}, [changesQuery.refetch, hasWorkspaceScope]);

	if (!changeId) {
		return {
			changes: null,
			isLoading: false,
			isRuntimeAvailable: true,
			refresh,
		};
	}

	if (!workspaceId) {
		return {
			changes: null,
			isLoading: false,
			isRuntimeAvailable: false,
			refresh,
		};
	}

	return {
		changes: changesQuery.currentData ?? null,
		isLoading: changesQuery.isLoading || (changesQuery.isFetching && changesQuery.currentData === undefined),
		isRuntimeAvailable: !changesQuery.isError,
		refresh,
	};
}
