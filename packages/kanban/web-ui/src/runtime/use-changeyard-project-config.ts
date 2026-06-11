import { useCallback, useEffect, useRef, useState } from "react";

import {
	fetchChangeyardProjectConfig,
	saveChangeyardProjectConfig,
} from "@/runtime/runtime-config-query";
import type { RuntimeChangeyardProjectConfig } from "@/runtime/types";
import { useTrpcQuery } from "@/runtime/use-trpc-query";

export interface UseChangeyardProjectConfigResult {
	config: RuntimeChangeyardProjectConfig | null;
	isLoading: boolean;
	isSaving: boolean;
	refresh: () => void;
	save: (input: {
		providerType?: "noop" | "local-folder" | "forgejo" | "github" | "gitlab";
		vcsEngine?: "plain-copy" | "jj" | "git-worktree";
		vcsFallback?: "plain-copy" | "jj" | "git-worktree";
		projectDefaultBase?: string;
		planningDefaultProfile?: "none" | "openspec-lite";
		planningDefaultStrictness?: "normal" | "strict";
		planningAllowQuickChanges?: boolean;
		planningQuickChangeCheckProfile?: string;
	}) => Promise<RuntimeChangeyardProjectConfig | null>;
}

export function useChangeyardProjectConfig(
	open: boolean,
	workspaceId: string | null,
	initialConfig: RuntimeChangeyardProjectConfig | null = null,
): UseChangeyardProjectConfigResult {
	const [isSaving, setIsSaving] = useState(false);
	const previousWorkspaceIdRef = useRef<string | null>(null);
	const queryFn = useCallback(async () => {
		if (!workspaceId) {
			throw new Error("Missing project.");
		}
		return await fetchChangeyardProjectConfig(workspaceId);
	}, [workspaceId]);
	const configQuery = useTrpcQuery<RuntimeChangeyardProjectConfig>({
		enabled: open && workspaceId !== null,
		queryFn,
		retainDataOnError: true,
	});
	const setConfigData = configQuery.setData;

	useEffect(() => {
		const workspaceChanged = previousWorkspaceIdRef.current !== workspaceId;
		previousWorkspaceIdRef.current = workspaceId;
		if (workspaceChanged) {
			setConfigData(initialConfig);
			return;
		}
		if (configQuery.data === null && initialConfig !== null) {
			setConfigData(initialConfig);
		}
	}, [configQuery.data, initialConfig, setConfigData, workspaceId]);

	const save = useCallback(
		async (input: {
			providerType?: "noop" | "local-folder" | "forgejo" | "github" | "gitlab";
			vcsEngine?: "plain-copy" | "jj" | "git-worktree";
			vcsFallback?: "plain-copy" | "jj" | "git-worktree";
			projectDefaultBase?: string;
			planningDefaultProfile?: "none" | "openspec-lite";
			planningDefaultStrictness?: "normal" | "strict";
			planningAllowQuickChanges?: boolean;
			planningQuickChangeCheckProfile?: string;
		}): Promise<RuntimeChangeyardProjectConfig | null> => {
			if (!workspaceId) {
				return null;
			}
			setIsSaving(true);
			try {
				const saved = await saveChangeyardProjectConfig(workspaceId, input);
				setConfigData(saved);
				return saved;
			} catch {
				return null;
			} finally {
				setIsSaving(false);
			}
		},
		[setConfigData, workspaceId],
	);

	const refresh = useCallback(() => {
		void configQuery.refetch();
	}, [configQuery.refetch]);

	return {
		config: configQuery.data ?? initialConfig,
		isLoading: open && workspaceId !== null ? configQuery.isLoading && configQuery.data === null && initialConfig === null : false,
		isSaving,
		refresh,
		save,
	};
}
