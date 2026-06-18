import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback } from "react";
import { useDispatch } from "react-redux";

import { kanbanApi, useGetChangeQuery, useListChangesQuery } from "@/runtime/kanban-api";
import type { KanbanStoreDispatch } from "@/runtime/kanban-store";
import type { RuntimeChangeyardChangeDetail, RuntimeChangeyardChangeListItem } from "@/runtime/types";

export interface UseChangeyardChangesResult {
	changeyardChanges: RuntimeChangeyardChangeListItem[];
	isChangeyardChangesLoading: boolean;
	refetchChangeyardChanges: () => Promise<RuntimeChangeyardChangeListItem[] | null>;
	selectedChangeDetail: RuntimeChangeyardChangeDetail | null;
	isSelectedChangeLoading: boolean;
	isSelectedChangeFetching: boolean;
	refetchSelectedChangeDetail: () => Promise<RuntimeChangeyardChangeDetail | null>;
	setSelectedChangeDetail: (nextData: RuntimeChangeyardChangeDetail | null) => void;
}

export function useChangeyardChanges(
	currentProjectId: string | null,
	selectedChangeId: string | null,
	workspacePath: string | null = null,
): UseChangeyardChangesResult {
	const dispatch = useDispatch<KanbanStoreDispatch>();
	const listQueryArg = currentProjectId ? { workspaceId: currentProjectId, workspacePath } : skipToken;
	const selectedChangeQueryArg =
		currentProjectId && selectedChangeId ? { workspaceId: currentProjectId, workspacePath, id: selectedChangeId } : skipToken;
	const listQuery = useListChangesQuery(listQueryArg);
	const selectedChangeQuery = useGetChangeQuery(selectedChangeQueryArg);

	const refetchChangeyardChanges = useCallback(async (): Promise<RuntimeChangeyardChangeListItem[] | null> => {
		if (!currentProjectId) {
			return null;
		}
		try {
			return await listQuery.refetch().unwrap();
		} catch {
			return null;
		}
	}, [currentProjectId, listQuery]);

	const refetchSelectedChangeDetail = useCallback(async (): Promise<RuntimeChangeyardChangeDetail | null> => {
		if (!currentProjectId || !selectedChangeId) {
			return null;
		}
		try {
			return await selectedChangeQuery.refetch().unwrap();
		} catch {
			return null;
		}
	}, [currentProjectId, selectedChangeId, selectedChangeQuery]);

	const setSelectedChangeDetail = useCallback(
		(nextData: RuntimeChangeyardChangeDetail | null) => {
			if (!currentProjectId) {
				return;
			}
			if (selectedChangeId) {
				dispatch(
					kanbanApi.util.updateQueryData(
						"getChange",
						{ workspaceId: currentProjectId, workspacePath, id: selectedChangeId },
						() => nextData,
					),
				);
			}
			if (nextData) {
				dispatch(
					kanbanApi.util.upsertQueryData(
						"getChange",
						{ workspaceId: currentProjectId, workspacePath, id: nextData.id },
						nextData,
					),
				);
			}
		},
		[currentProjectId, dispatch, selectedChangeId, workspacePath],
	);

	return {
		changeyardChanges: listQuery.data ?? [],
		isChangeyardChangesLoading: listQuery.isLoading,
		refetchChangeyardChanges,
		selectedChangeDetail: selectedChangeQuery.currentData ?? null,
		isSelectedChangeLoading: selectedChangeQuery.isLoading,
		isSelectedChangeFetching: selectedChangeQuery.isFetching,
		refetchSelectedChangeDetail,
		setSelectedChangeDetail,
	};
}
