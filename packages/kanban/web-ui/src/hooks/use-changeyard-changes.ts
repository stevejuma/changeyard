import { useCallback } from "react";

import { getRuntimeTrpcClient } from "@/runtime/trpc-client";
import type { RuntimeChangeyardChangeDetail, RuntimeChangeyardChangeListItem } from "@/runtime/types";
import { useTrpcQuery } from "@/runtime/use-trpc-query";

export interface UseChangeyardChangesResult {
	changeyardChanges: RuntimeChangeyardChangeListItem[];
	isChangeyardChangesLoading: boolean;
	refetchChangeyardChanges: () => Promise<RuntimeChangeyardChangeListItem[] | null>;
	selectedChangeDetail: RuntimeChangeyardChangeDetail | null;
	refetchSelectedChangeDetail: () => Promise<RuntimeChangeyardChangeDetail | null>;
	setSelectedChangeDetail: (nextData: RuntimeChangeyardChangeDetail | null) => void;
}

export function useChangeyardChanges(
	currentProjectId: string | null,
	selectedChangeId: string | null,
): UseChangeyardChangesResult {
	const listQueryFn = useCallback(async () => {
		if (!currentProjectId) {
			throw new Error("Missing project.");
		}
		return (await getRuntimeTrpcClient(currentProjectId).changes.list.query()).changes;
	}, [currentProjectId]);
	const {
		data: changeyardChangesData,
		isLoading: isChangeyardChangesLoading,
		refetch: refetchChangeyardChanges,
	} = useTrpcQuery<RuntimeChangeyardChangeListItem[]>({
		enabled: currentProjectId !== null,
		queryFn: listQueryFn,
	});

	const selectedChangeDetailQueryFn = useCallback(async () => {
		if (!currentProjectId || !selectedChangeId) {
			throw new Error("Missing change selection.");
		}
		return await getRuntimeTrpcClient(currentProjectId).changes.get.query({ id: selectedChangeId });
	}, [currentProjectId, selectedChangeId]);
	const {
		data: selectedChangeDetail,
		refetch: refetchSelectedChangeDetail,
		setData: setSelectedChangeDetail,
	} = useTrpcQuery<RuntimeChangeyardChangeDetail | null>({
		enabled: currentProjectId !== null && selectedChangeId !== null,
		queryFn: selectedChangeDetailQueryFn,
		retainDataOnError: true,
	});

	return {
		changeyardChanges: changeyardChangesData ?? [],
		isChangeyardChangesLoading,
		refetchChangeyardChanges,
		selectedChangeDetail,
		refetchSelectedChangeDetail,
		setSelectedChangeDetail,
	};
}
