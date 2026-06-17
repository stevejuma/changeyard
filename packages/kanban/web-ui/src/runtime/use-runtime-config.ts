import { useCallback, useEffect, useRef, useState } from "react";

import { useGetRuntimeConfigQuery, useSaveRuntimeConfigMutation } from "@/runtime/kanban-api";
import type { RuntimeAgentId, RuntimeConfigResponse, RuntimeProjectShortcut } from "@/runtime/types";

export interface UseRuntimeConfigResult {
	config: RuntimeConfigResponse | null;
	isLoading: boolean;
	isSaving: boolean;
	refresh: () => void;
	save: (nextConfig: {
		selectedAgentId?: RuntimeAgentId;
		selectedShortcutLabel?: string | null;
		agentAutonomousModeEnabled?: boolean;
		shortcuts?: RuntimeProjectShortcut[];
		readyForReviewNotificationsEnabled?: boolean;
		commitPromptTemplate?: string;
		openPrPromptTemplate?: string;
	}) => Promise<RuntimeConfigResponse | null>;
}

export function useRuntimeConfig(
	open: boolean,
	workspaceId: string | null,
	initialConfig: RuntimeConfigResponse | null = null,
): UseRuntimeConfigResult {
	const [isSaving, setIsSaving] = useState(false);
	const previousWorkspaceIdRef = useRef<string | null>(null);
	const didRetryAfterInitialErrorRef = useRef(false);
	const lastLoggedErrorKeyRef = useRef<string | null>(null);
	const configQuery = useGetRuntimeConfigQuery({ workspaceId }, { skip: !open });
	const [saveRuntimeConfigMutation] = useSaveRuntimeConfigMutation();

	useEffect(() => {
		const workspaceChanged = previousWorkspaceIdRef.current !== workspaceId;
		previousWorkspaceIdRef.current = workspaceId;
		if (workspaceChanged) {
			didRetryAfterInitialErrorRef.current = false;
			lastLoggedErrorKeyRef.current = null;
		}
	}, [workspaceId]);

	useEffect(() => {
		if (!open || configQuery.data !== undefined || initialConfig !== null) {
			didRetryAfterInitialErrorRef.current = false;
			lastLoggedErrorKeyRef.current = null;
			return;
		}
		if (!configQuery.isError) {
			return;
		}
		const scopeLabel = workspaceId ?? "global";
		const message = configQuery.error instanceof Error ? configQuery.error.message : "Unknown runtime config load error.";
		const errorKey = `${scopeLabel}:${message}`;
		if (lastLoggedErrorKeyRef.current !== errorKey) {
			console.warn(`[kanban][settings] runtime.getConfig failed for scope ${scopeLabel}: ${message}`);
			lastLoggedErrorKeyRef.current = errorKey;
		}
		if (didRetryAfterInitialErrorRef.current) {
			return;
		}
		didRetryAfterInitialErrorRef.current = true;
		console.warn(`[kanban][settings] Retrying runtime.getConfig once for scope ${scopeLabel}.`);
		void configQuery.refetch();
	}, [configQuery.data, configQuery.error, configQuery.isError, configQuery.refetch, initialConfig, open, workspaceId]);

	const save = useCallback(
		async (nextConfig: {
			selectedAgentId?: RuntimeAgentId;
			selectedShortcutLabel?: string | null;
			agentAutonomousModeEnabled?: boolean;
			shortcuts?: RuntimeProjectShortcut[];
			readyForReviewNotificationsEnabled?: boolean;
			commitPromptTemplate?: string;
			openPrPromptTemplate?: string;
		}): Promise<RuntimeConfigResponse | null> => {
			setIsSaving(true);
			try {
				const saved = await saveRuntimeConfigMutation({ workspaceId, input: nextConfig }).unwrap();
				return saved;
			} catch {
				return null;
			} finally {
				setIsSaving(false);
			}
		},
		[saveRuntimeConfigMutation, workspaceId],
	);

	const refresh = useCallback(() => {
		void configQuery.refetch();
	}, [configQuery.refetch]);

	return {
		config: configQuery.data ?? initialConfig,
		isLoading: open ? configQuery.isLoading && configQuery.data === undefined && initialConfig === null : false,
		isSaving,
		refresh,
		save,
	};
}
