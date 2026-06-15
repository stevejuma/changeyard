import { useCallback, useMemo, useState } from "react";

import { showAppToast } from "@/components/app-toaster";
import { postTrpcMutation } from "@/runtime/trpc-client";
import type { RuntimeCommandRunResponse } from "@/runtime/types";
import {
	buildOpenCommand,
	getOpenTargetOption,
	getOpenTargetOptions,
	loadPersistedOpenTarget,
	type OpenTargetId,
	type OpenTargetOption,
	persistOpenTarget,
	resolveOpenTargetPlatform,
} from "@/utils/open-targets";

interface UseOpenWorkspaceParams {
	currentProjectId: string | null;
	workspacePath?: string | null;
}

interface UseOpenWorkspaceResult {
	openTargetOptions: readonly OpenTargetOption[];
	selectedOpenTargetId: OpenTargetId;
	onSelectOpenTarget: (targetId: OpenTargetId) => void;
	onOpenWorkspace: () => void;
	canOpenWorkspace: boolean;
	isOpeningWorkspace: boolean;
}

function getFirstOutputLine(output: string): string | null {
	return (
		output
			.split("\n")
			.map((line) => line.trim())
			.find(Boolean) ?? null
	);
}

export function useOpenWorkspace({ currentProjectId, workspacePath }: UseOpenWorkspaceParams): UseOpenWorkspaceResult {
	const openTargetPlatform = resolveOpenTargetPlatform();
	const openTargetOptions = useMemo(() => getOpenTargetOptions(openTargetPlatform), [openTargetPlatform]);
	const [preferredOpenTargetId, setPreferredOpenTargetId] = useState<OpenTargetId>(() =>
		loadPersistedOpenTarget(openTargetPlatform),
	);
	const [isOpeningWorkspace, setIsOpeningWorkspace] = useState(false);
	const selectedOpenTarget = useMemo(
		() => getOpenTargetOption(preferredOpenTargetId, openTargetPlatform),
		[openTargetPlatform, preferredOpenTargetId],
	);
	const canOpenWorkspace = Boolean(currentProjectId && workspacePath);

	const onSelectOpenTarget = useCallback(
		(targetId: OpenTargetId) => {
			if (!openTargetOptions.some((option) => option.id === targetId)) {
				return;
			}
			setPreferredOpenTargetId(targetId);
			persistOpenTarget(targetId);
		},
		[openTargetOptions],
	);

	const showOpenFailureToast = useCallback(
		(message: string) => {
			showAppToast(
				{
					intent: "danger",
					icon: "error",
					message: `Could not open in ${selectedOpenTarget.label}: ${message}`,
					timeout: 6000,
				},
				"open-workspace-failed",
			);
		},
		[selectedOpenTarget.label],
	);

	const onOpenWorkspace = useCallback(() => {
		if (isOpeningWorkspace || !currentProjectId || !workspacePath) {
			return;
		}

		void (async () => {
			setIsOpeningWorkspace(true);
			try {
				const payload = await postTrpcMutation<RuntimeCommandRunResponse>(
					"runtime.runCommand",
					{ command: buildOpenCommand(selectedOpenTarget.id, workspacePath, openTargetPlatform) },
					currentProjectId,
				);
				if (payload.exitCode !== 0) {
					const details = getFirstOutputLine(payload.combinedOutput) ?? `Exited with code ${payload.exitCode}.`;
					showOpenFailureToast(details);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				showOpenFailureToast(message);
			} finally {
				setIsOpeningWorkspace(false);
			}
		})();
	}, [
		currentProjectId,
		isOpeningWorkspace,
		openTargetPlatform,
		selectedOpenTarget.id,
		showOpenFailureToast,
		workspacePath,
	]);

	return {
		openTargetOptions,
		selectedOpenTargetId: selectedOpenTarget.id,
		onSelectOpenTarget,
		onOpenWorkspace,
		canOpenWorkspace,
		isOpeningWorkspace,
	};
}
