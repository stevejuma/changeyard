import { useCallback, useEffect } from "react";

import { getRuntimeTrpcClient } from "@/runtime/trpc-client";
import type { RuntimeWorkspaceChangesResponse } from "@/runtime/types";
import { useTrpcQuery } from "@/runtime/use-trpc-query";

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
): UseRuntimeChangeWorkspaceChangesResult {
	const hasWorkspaceScope = changeId !== null && workspaceId !== null;
	const queryFn = useCallback(async () => {
		if (!changeId || !workspaceId) {
			throw new Error("Missing change workspace scope.");
		}
		const trpcClient = getRuntimeTrpcClient(workspaceId);
		return await trpcClient.changes.getWorkspaceChanges.query({ id: changeId });
	}, [changeId, workspaceId]);

	const changesQuery = useTrpcQuery<RuntimeWorkspaceChangesResponse>({
		enabled: hasWorkspaceScope,
		queryFn,
	});

	const refresh = useCallback(async () => {
		if (!hasWorkspaceScope) {
			return;
		}
		await changesQuery.refetch();
	}, [changesQuery.refetch, hasWorkspaceScope]);

	useEffect(() => {
		if (!hasWorkspaceScope || pollIntervalMs == null) {
			return;
		}
		const interval = window.setInterval(() => {
			void changesQuery.refetch();
		}, pollIntervalMs);
		return () => {
			window.clearInterval(interval);
		};
	}, [changesQuery.refetch, hasWorkspaceScope, pollIntervalMs]);

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
		changes: changesQuery.data,
		isLoading: changesQuery.isLoading,
		isRuntimeAvailable: !changesQuery.isError,
		refresh,
	};
}
