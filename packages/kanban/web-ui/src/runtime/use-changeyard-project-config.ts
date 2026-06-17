import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback, useState } from "react";

import { useGetChangeyardProjectConfigQuery, useSaveChangeyardProjectConfigMutation } from "@/runtime/kanban-api";
import type { RuntimeChangeyardProjectConfig } from "@/runtime/types";

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
	const configQuery = useGetChangeyardProjectConfigQuery(
		open && workspaceId !== null ? { workspaceId } : skipToken,
	);
	const [saveChangeyardProjectConfigMutation] = useSaveChangeyardProjectConfigMutation();

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
				const saved = await saveChangeyardProjectConfigMutation({ workspaceId, input }).unwrap();
				return saved;
			} catch {
				return null;
			} finally {
				setIsSaving(false);
			}
		},
		[saveChangeyardProjectConfigMutation, workspaceId],
	);

	const refresh = useCallback(() => {
		void configQuery.refetch();
	}, [configQuery.refetch]);

	return {
		config: configQuery.data ?? initialConfig,
		isLoading: open && workspaceId !== null ? configQuery.isLoading && configQuery.data === undefined && initialConfig === null : false,
		isSaving,
		refresh,
		save,
	};
}
