import { useCallback } from "react";

import { useGetRuntimeConfigQuery } from "@/runtime/kanban-api";
import type { RuntimeConfigResponse } from "@/runtime/types";

export interface UseRuntimeProjectConfigResult {
	config: RuntimeConfigResponse | null;
	isLoading: boolean;
	refresh: () => void;
}

export function useRuntimeProjectConfig(workspaceId: string | null): UseRuntimeProjectConfigResult {
	const configQuery = useGetRuntimeConfigQuery(workspaceId === null ? { workspaceId: null } : { workspaceId });

	const refresh = useCallback(() => {
		void configQuery.refetch();
	}, [configQuery.refetch]);

	return {
		config: configQuery.currentData ?? null,
		isLoading: configQuery.isLoading && configQuery.currentData === undefined,
		refresh,
	};
}
