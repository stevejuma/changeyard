// Main React composition root for the browser app.
// Keep this file focused on wiring top-level hooks and surfaces together, and
// push runtime-specific orchestration down into hooks and service modules.
import { FolderOpen } from "lucide-react";
import type { ReactElement } from "react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { notifyError, showAppToast } from "@/components/app-toaster";
import { ChangeBoard, type ChangeBoardFilter, type ChangeColumnId } from "@/components/changeyard/change-board";
import type { ChangeDetailAction } from "@/components/changeyard/change-detail-dialog";
import { ProjectNavigationPanel } from "@/components/project-navigation-panel";
import type { RuntimeSettingsSection } from "@/components/runtime-settings-dialog";
import { TaskInlineCreateCard } from "@/components/task-inline-create-card";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogBody,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { UpdateNotificationController } from "@/components/update-notification-controller";
import { createInitialBoardData } from "@/data/board-data";
import { createIdleTaskSession } from "@/hooks/app-utils";
import { KanbanAccessBlockedFallback } from "@/hooks/kanban-access-blocked-fallback";
import { RuntimeDisconnectedFallback } from "@/hooks/runtime-disconnected-fallback";
import { useAppHotkeys } from "@/hooks/use-app-hotkeys";
import { useBoardInteractions } from "@/hooks/use-board-interactions";
import { useChangeyardChanges } from "@/hooks/use-changeyard-changes";
import { useDebugTools } from "@/hooks/use-debug-tools";
import { useDetailTaskNavigation } from "@/hooks/use-detail-task-navigation";
import { useDocumentVisibility } from "@/hooks/use-document-visibility";
import { useFeaturebaseFeedbackWidget } from "@/hooks/use-featurebase-feedback-widget";
import { useGitActions } from "@/hooks/use-git-actions";
import { useHomeSidebarAgentPanel } from "@/hooks/use-home-sidebar-agent-panel";
import { useKanbanAccessGate } from "@/hooks/use-kanban-access-gate";
import { useOpenWorkspace } from "@/hooks/use-open-workspace";
import { parseRemovedProjectPathFromStreamError, useProjectNavigation } from "@/hooks/use-project-navigation";
import { useProjectUiState } from "@/hooks/use-project-ui-state";
import { useReviewReadyNotifications } from "@/hooks/use-review-ready-notifications";
import { useShortcutActions } from "@/hooks/use-shortcut-actions";
import { useStartupOnboarding } from "@/hooks/use-startup-onboarding";
import { useTaskBranchOptions } from "@/hooks/use-task-branch-options";
import { useTaskEditor } from "@/hooks/use-task-editor";
import { useTaskSessions } from "@/hooks/use-task-sessions";
import { useTaskStartActions } from "@/hooks/use-task-start-actions";
import { useTerminalPanels } from "@/hooks/use-terminal-panels";
import { useWorkspaceSync } from "@/hooks/use-workspace-sync";
import { LayoutCustomizationsProvider } from "@/resize/layout-customizations";
import { ResizableBottomPane } from "@/resize/resizable-bottom-pane";
import { useProjectNavigationLayout } from "@/resize/use-project-navigation-layout";
import {
	getTaskAgentNavbarHint,
	isTaskAgentSetupSatisfied,
	selectLatestTaskChatMessageForTask,
	selectTaskChatMessagesForTask,
} from "@/runtime/native-agent";
import type {
	RuntimeClineReasoningEffort,
	RuntimeChangeyardChangeDetail,
	RuntimeChangeyardChangeListItem,
	RuntimeTaskSessionSummary,
} from "@/runtime/types";
import { getRuntimeTrpcClient, readTrpcConflictUpdatedAt } from "@/runtime/trpc-client";
import { useRuntimeProjectConfig } from "@/runtime/use-runtime-project-config";
import { useChangeyardProjectConfig } from "@/runtime/use-changeyard-project-config";
import { useTerminalConnectionReady } from "@/runtime/use-terminal-connection-ready";
import { useWorkspacePersistence } from "@/runtime/use-workspace-persistence";
import { saveWorkspaceState } from "@/runtime/workspace-state-query";
import { applyTaskDetailClineSettingsChange, findCardSelection } from "@/state/board-state";
import {
	getTaskWorkspaceInfo,
	getTaskWorkspaceSnapshot,
	replaceWorkspaceMetadata,
	resetWorkspaceMetadataStore,
} from "@/stores/workspace-metadata-store";
import { useTerminalThemeColors } from "@/terminal/theme-colors";
import type { BoardCard, BoardColumn, BoardColumnId, BoardData, CardSelection } from "@/types";
import { unsupportedChangeMoveMessage } from "@/utils/change-move-error";
import {
	findAffectedWorkspaceChangeIds,
	isChangeMarkdownEventPathForChange,
	isChangeyardChangeMarkdownEventPath,
	normalizeKanbanEventPath,
} from "@/utils/changeyard-workspace-events";

const CardDetailView = lazy(async () => {
	const mod = await import("@/components/card-detail-view");
	return { default: mod.CardDetailView };
});
const ChangeDetailDialog = lazy(async () => {
	const mod = await import("@/components/changeyard/change-detail-dialog");
	return { default: mod.ChangeDetailDialog };
});
const ChangeReviewModal = lazy(async () => {
	const mod = await import("@/components/changeyard/change-review-modal");
	return { default: mod.ChangeReviewModal };
});
const AgentTerminalPanel = lazy(async () => {
	const mod = await import("@/components/detail-panels/agent-terminal-panel");
	return { default: mod.AgentTerminalPanel };
});
const AddProjectDialog = lazy(async () => {
	const mod = await import("@/components/add-project-dialog");
	return { default: mod.AddProjectDialog };
});
const ClearTrashDialog = lazy(async () => {
	const mod = await import("@/components/clear-trash-dialog");
	return { default: mod.ClearTrashDialog };
});
const CreateChangeDialog = lazy(async () => {
	const mod = await import("@/components/changeyard/create-change-dialog");
	return { default: mod.CreateChangeDialog };
});
const DebugDialog = lazy(async () => {
	const mod = await import("@/components/debug-dialog");
	return { default: mod.DebugDialog };
});
const GitHistoryView = lazy(async () => {
	const mod = await import("@/components/git-history-view");
	return { default: mod.GitHistoryView };
});
const RuntimeSettingsDialog = lazy(async () => {
	const mod = await import("@/components/runtime-settings-dialog");
	return { default: mod.RuntimeSettingsDialog };
});
const StartupOnboardingDialog = lazy(async () => {
	const mod = await import("@/components/startup-onboarding-dialog");
	return { default: mod.StartupOnboardingDialog };
});
const TaskCreateDialog = lazy(async () => {
	const mod = await import("@/components/task-create-dialog");
	return { default: mod.TaskCreateDialog };
});

const TASK_DETAIL_COLUMNS: Array<{ id: BoardColumnId; title: string }> = [
	{ id: "backlog", title: "Backlog" },
	{ id: "in_progress", title: "In Progress" },
	{ id: "review", title: "Review" },
	{ id: "trash", title: "Done" },
];

function mapChangeStatusToTaskColumnId(status: string): BoardColumnId {
	switch (status) {
		case "in_progress":
		case "changes_requested":
			return "in_progress";
		case "ready_for_pr":
		case "pr_open":
		case "in_review":
		case "approved":
		case "merged":
			return "review";
		case "abandoned":
			return "trash";
		default:
			return "backlog";
	}
}

function buildChangeSessionSelection({
	change,
	detail,
	summary,
}: {
	change: RuntimeChangeyardChangeListItem;
	detail: RuntimeChangeyardChangeDetail | null;
	summary: RuntimeTaskSessionSummary;
}): CardSelection {
	const columnId = mapChangeStatusToTaskColumnId(change.status);
	const timestamp = Date.parse(detail?.updatedAt ?? change.updatedAt ?? "") || summary.updatedAt || Date.now();
	const card: BoardCard = {
		id: change.id,
		title: change.title,
		prompt: detail?.body ?? change.title,
		startInPlanMode: false,
		autoReviewEnabled: false,
		autoReviewMode: "commit",
		agentId: summary.agentId ?? undefined,
		baseRef: change.base?.revision ?? "main",
		createdAt: timestamp,
		updatedAt: timestamp,
	};
	const allColumns: BoardColumn[] = TASK_DETAIL_COLUMNS.map((column) => ({
		...column,
		cards: column.id === columnId ? [card] : [],
	}));
	const column = allColumns.find((candidate) => candidate.id === columnId) ?? allColumns[0]!;
	return { card, column, allColumns };
}

export default function App(): ReactElement {
	const terminalThemeColors = useTerminalThemeColors();
	const [board, setBoard] = useState<BoardData>(() => createInitialBoardData());
	const [sessions, setSessions] = useState<Record<string, RuntimeTaskSessionSummary>>({});
	const [canPersistWorkspaceState, setCanPersistWorkspaceState] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const [settingsInitialSection, setSettingsInitialSection] = useState<RuntimeSettingsSection | null>(null);
	const [homeSidebarSection, setHomeSidebarSection] = useState<"projects" | "agent">("projects");
	const [isCreateChangeDialogOpen, setIsCreateChangeDialogOpen] = useState(false);
	const [isClearTrashDialogOpen, setIsClearTrashDialogOpen] = useState(false);
	const [isGitHistoryOpen, setIsGitHistoryOpen] = useState(false);
	const [changeBoardFilter, setChangeBoardFilter] = useState<ChangeBoardFilter>("all");
	const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
	const [selectedSessionChangeId, setSelectedSessionChangeId] = useState<string | null>(null);
	const [changeWorkspaceEventVersions, setChangeWorkspaceEventVersions] = useState<Record<string, number>>({});
	const [isChangeReviewOpen, setIsChangeReviewOpen] = useState(false);
	const [isChangeActionPending, setIsChangeActionPending] = useState(false);
	const [changeActionError, setChangeActionError] = useState<string | null>(null);
	const [pendingTaskStartAfterEditId, setPendingTaskStartAfterEditId] = useState<string | null>(null);
	const taskEditorResetRef = useRef<() => void>(() => {});
	const lastStreamErrorRef = useRef<string | null>(null);
	const lastHandledVcsProjectEventRef = useRef<string | null>(null);
	const handleProjectSwitchStart = useCallback(() => {
		setCanPersistWorkspaceState(false);
		setIsGitHistoryOpen(false);
		setPendingTaskStartAfterEditId(null);
		taskEditorResetRef.current();
	}, []);
	const {
		currentProjectId,
		projects,
		workspaceState: streamedWorkspaceState,
		workspaceMetadata,
		latestTaskChatMessage,
		taskChatMessagesByTaskId,
		latestTaskReadyForReview,
		latestVcsProjectEvent,
		latestMcpAuthStatuses,
		clineSessionContextVersion,
		streamError,
		isRuntimeDisconnected,
		hasReceivedSnapshot,
		navigationCurrentProjectId,
		removingProjectId,
		hasNoProjects,
		isProjectSwitching,
		handleSelectProject,
		handleAddProject,
		handleAddProjectSuccess,
		handleRemoveProject,
		isAddProjectDialogOpen,
		setIsAddProjectDialogOpen,
		pendingNativeGitInitPath,
		resetProjectNavigationState,
	} = useProjectNavigation({
		onProjectSwitchStart: handleProjectSwitchStart,
	});
	const activeNotificationWorkspaceId = navigationCurrentProjectId;
	const isDocumentVisible = useDocumentVisibility();
	const isInitialRuntimeLoad =
		!hasReceivedSnapshot && currentProjectId === null && projects.length === 0 && !streamError;
	const isAwaitingWorkspaceSnapshot = currentProjectId !== null && streamedWorkspaceState === null;
	const {
		config: runtimeProjectConfig,
		isLoading: isRuntimeProjectConfigLoading,
		refresh: refreshRuntimeProjectConfig,
	} = useRuntimeProjectConfig(currentProjectId);
	const { isBlocked: isKanbanAccessBlocked, refresh: refreshKanbanAccess } = useKanbanAccessGate({
		workspaceId: currentProjectId,
	});
	const isTaskAgentReady = isTaskAgentSetupSatisfied(runtimeProjectConfig);
	const settingsWorkspaceId = navigationCurrentProjectId ?? currentProjectId;
	const settingsRuntimeProjectConfig = settingsWorkspaceId === currentProjectId ? runtimeProjectConfig : null;
	const refreshSettingsRuntimeProjectConfig = refreshRuntimeProjectConfig;
	const { config: settingsChangeyardProjectConfig, refresh: refreshSettingsChangeyardProjectConfig } =
		useChangeyardProjectConfig(isSettingsOpen, settingsWorkspaceId);
	const featurebaseFeedbackState = useFeaturebaseFeedbackWidget({
		workspaceId: settingsWorkspaceId,
		clineProviderSettings: settingsRuntimeProjectConfig?.clineProviderSettings ?? null,
	});
	const {
		isStartupOnboardingDialogOpen,
		handleOpenStartupOnboardingDialog,
		handleCloseStartupOnboardingDialog,
		handleSelectOnboardingAgent,
		handleOnboardingClineSetupSaved,
	} = useStartupOnboarding({
		currentProjectId,
		runtimeProjectConfig,
		isRuntimeProjectConfigLoading,
		isTaskAgentReady,
		refreshRuntimeProjectConfig,
		refreshSettingsRuntimeProjectConfig,
	});
	const {
		debugModeEnabled,
		isDebugDialogOpen,
		isResetAllStatePending,
		handleOpenDebugDialog,
		handleShowStartupOnboardingDialog,
		handleDebugDialogOpenChange,
		handleResetAllState,
	} = useDebugTools({
		runtimeProjectConfig,
		settingsRuntimeProjectConfig,
		onOpenStartupOnboardingDialog: handleOpenStartupOnboardingDialog,
	});
	const {
		markConnectionReady: markTerminalConnectionReady,
		prepareWaitForConnection: prepareWaitForTerminalConnectionReady,
	} = useTerminalConnectionReady();
	const readyForReviewNotificationsEnabled = runtimeProjectConfig?.readyForReviewNotificationsEnabled ?? true;
	const shortcuts = runtimeProjectConfig?.shortcuts ?? [];
	const selectedShortcutLabel = useMemo(() => {
		if (shortcuts.length === 0) {
			return null;
		}
		const configured = runtimeProjectConfig?.selectedShortcutLabel ?? null;
		if (configured && shortcuts.some((shortcut) => shortcut.label === configured)) {
			return configured;
		}
		return shortcuts[0]?.label ?? null;
	}, [runtimeProjectConfig?.selectedShortcutLabel, shortcuts]);
	const {
		upsertSession,
		ensureTaskWorkspace,
		startTaskSession,
		stopTaskSession,
		sendTaskSessionInput,
		sendTaskChatMessage,
		cancelTaskChatTurn,
		fetchTaskChatMessages,
		cleanupTaskWorkspace,
		fetchTaskWorkspaceInfo,
	} = useTaskSessions({
		currentProjectId,
		setSessions,
	});

	const {
		workspacePath,
		workspaceGit,
		workspaceRevision,
		setWorkspaceRevision,
		workspaceHydrationNonce,
		isWorkspaceStateRefreshing,
		isWorkspaceMetadataPending,
		refreshWorkspaceState,
		resetWorkspaceSyncState,
	} = useWorkspaceSync({
		currentProjectId,
		streamedWorkspaceState,
		hasNoProjects,
		hasReceivedSnapshot,
		isDocumentVisible,
		setBoard,
		setSessions,
		setCanPersistWorkspaceState,
	});
	const { selectedTaskId, selectedCard, setSelectedTaskId, handleBack } = useDetailTaskNavigation({
		board,
		currentProjectId,
		isAwaitingWorkspaceSnapshot,
		isInitialRuntimeLoad,
		isProjectSwitching,
		isWorkspaceMetadataPending,
		onDetailClosed: () => {
			setIsGitHistoryOpen(false);
		},
	});

	useEffect(() => {
		replaceWorkspaceMetadata(workspaceMetadata);
	}, [workspaceMetadata]);

	useEffect(() => {
		if (!isProjectSwitching) {
			return;
		}
		resetWorkspaceMetadataStore();
	}, [isProjectSwitching]);

	const {
		displayedProjects,
		navigationProjectPath,
		shouldShowProjectLoadingState,
		isProjectListLoading,
		shouldUseNavigationPath,
	} = useProjectUiState({
		board,
		canPersistWorkspaceState,
		currentProjectId,
		projects,
		navigationCurrentProjectId,
		selectedTaskId,
		streamError,
		isProjectSwitching,
		isInitialRuntimeLoad,
		isAwaitingWorkspaceSnapshot,
		isWorkspaceMetadataPending,
		hasReceivedSnapshot,
	});
	const {
		changeyardChanges,
		isChangeyardChangesLoading,
		refetchChangeyardChanges,
		selectedChangeDetail,
		refetchSelectedChangeDetail,
		setSelectedChangeDetail,
	} = useChangeyardChanges(currentProjectId, selectedChangeId);
	const selectedSessionChangeSelection = useMemo(() => {
		if (!selectedSessionChangeId) {
			return null;
		}
		const summary = sessions[selectedSessionChangeId];
		if (!summary) {
			return null;
		}
		const change = changeyardChanges.find((candidate) => candidate.id === selectedSessionChangeId);
		if (!change) {
			return null;
		}
		return buildChangeSessionSelection({
			change,
			detail: selectedChangeDetail?.id === selectedSessionChangeId ? selectedChangeDetail : null,
			summary,
		});
	}, [changeyardChanges, selectedChangeDetail, selectedSessionChangeId, sessions]);
	const activeDetailSelection = selectedCard ?? selectedSessionChangeSelection;
	const activeDetailTaskId = activeDetailSelection?.card.id ?? null;
	const handleActiveDetailBack = useCallback(() => {
		if (selectedCard) {
			handleBack();
			return;
		}
		setSelectedSessionChangeId(null);
		setSelectedChangeId(null);
	}, [handleBack, selectedCard]);

	useReviewReadyNotifications({
		activeWorkspaceId: activeNotificationWorkspaceId,
		board,
		isDocumentVisible,
		latestTaskReadyForReview,
		taskSessions: sessions,
		readyForReviewNotificationsEnabled,
		workspacePath,
	});

	const { createTaskBranchOptions, defaultTaskBranchRef } = useTaskBranchOptions({ workspaceGit });
	const queueTaskStartAfterEdit = useCallback((taskId: string) => {
		setPendingTaskStartAfterEditId(taskId);
	}, []);

	const {
		isInlineTaskCreateOpen,
		newTaskPrompt,
		setNewTaskPrompt,
		newTaskImages,
		setNewTaskImages,
		newTaskStartInPlanMode,
		setNewTaskStartInPlanMode,
		newTaskAutoReviewEnabled,
		setNewTaskAutoReviewEnabled,
		newTaskAutoReviewMode,
		setNewTaskAutoReviewMode,
		isNewTaskStartInPlanModeDisabled,
		newTaskBranchRef,
		setNewTaskBranchRef,
		newTaskAgentId,
		setNewTaskAgentId,
		newTaskClineSettings,
		setNewTaskClineSettings,
		editingTaskId,
		editTaskPrompt,
		setEditTaskPrompt,
		editTaskImages,
		setEditTaskImages,
		editTaskStartInPlanMode,
		setEditTaskStartInPlanMode,
		editTaskAutoReviewEnabled,
		setEditTaskAutoReviewEnabled,
		editTaskAutoReviewMode,
		setEditTaskAutoReviewMode,
		isEditTaskStartInPlanModeDisabled,
		editTaskBranchRef,
		setEditTaskBranchRef,
		editTaskAgentId,
		setEditTaskAgentId,
		editTaskClineSettings,
		setEditTaskClineSettings,
		handleOpenCreateTask,
		handleCancelCreateTask,
		handleOpenEditTask,
		handleCancelEditTask,
		handleSaveEditedTask,
		handleSaveAndStartEditedTask,
		handleSaveTaskTitle,
		handleCreateTask,
		handleCreateTasks,
		resetTaskEditorState,
	} = useTaskEditor({
		board,
		setBoard,
		currentProjectId,
		createTaskBranchOptions,
		defaultTaskBranchRef,
		selectedAgentId: runtimeProjectConfig?.selectedAgentId ?? null,
		setSelectedTaskId,
		queueTaskStartAfterEdit,
	});

	useEffect(() => {
		taskEditorResetRef.current = resetTaskEditorState;
	}, [resetTaskEditorState]);

	useEffect(() => {
		if (!isProjectSwitching) {
			return;
		}
		resetWorkspaceSyncState();
	}, [isProjectSwitching, resetWorkspaceSyncState]);

	useEffect(() => {
		if (!isProjectSwitching) {
			return;
		}
		resetTaskEditorState();
	}, [isProjectSwitching, resetTaskEditorState]);

	const {
		runningGitAction,
		taskGitActionLoadingByTaskId,
		commitTaskLoadingById,
		openPrTaskLoadingById,
		agentCommitTaskLoadingById,
		agentOpenPrTaskLoadingById,
		isDiscardingHomeWorkingChanges,
		gitActionError,
		gitActionErrorTitle,
		clearGitActionError,
		gitHistory,
		runGitAction,
		switchHomeBranch,
		discardHomeWorkingChanges,
		handleCommitTask,
		handleOpenPrTask,
		handleAgentCommitTask,
		handleAgentOpenPrTask,
		runAutoReviewGitAction,
		resetGitActionState,
	} = useGitActions({
		currentProjectId,
		board,
		selectedCard,
		runtimeProjectConfig,
		sendTaskSessionInput,
		sendTaskChatMessage,
		fetchTaskWorkspaceInfo,
		isGitHistoryOpen,
		refreshWorkspaceState,
	});
	const agentCommand = runtimeProjectConfig?.effectiveCommand ?? null;
	const {
		homeTerminalTaskId,
		isHomeTerminalOpen,
		isHomeTerminalStarting,
		homeTerminalPaneHeight,
		isDetailTerminalOpen,
		detailTerminalTaskId,
		isDetailTerminalStarting,
		detailTerminalPaneHeight,
		isHomeTerminalExpanded,
		isDetailTerminalExpanded,
		setHomeTerminalPaneHeight,
		setDetailTerminalPaneHeight,
		handleToggleExpandHomeTerminal,
		handleToggleExpandDetailTerminal,
		handleToggleHomeTerminal,
		handleToggleDetailTerminal,
		handleSendAgentCommandToHomeTerminal,
		handleSendAgentCommandToDetailTerminal,
		prepareTerminalForShortcut,
		resetBottomTerminalLayoutCustomizations,
		collapseHomeTerminal,
		collapseDetailTerminal,
		closeHomeTerminal,
		closeDetailTerminal,
		resetTerminalPanelsState,
	} = useTerminalPanels({
		currentProjectId,
		selectedCard: activeDetailSelection,
		workspaceGit,
		agentCommand,
		upsertSession,
		sendTaskSessionInput,
	});
	const homeTerminalSummary = sessions[homeTerminalTaskId] ?? null;
	const homeSidebarAgentPanel = useHomeSidebarAgentPanel({
		currentProjectId,
		hasNoProjects,
		runtimeProjectConfig,
		clineSessionContextVersion,
		taskSessions: sessions,
		workspaceGit,
		latestTaskChatMessage,
		taskChatMessagesByTaskId,
	});
	const { runningShortcutLabel, handleSelectShortcutLabel, handleRunShortcut, handleCreateShortcut } =
		useShortcutActions({
			currentProjectId,
			selectedShortcutLabel: runtimeProjectConfig?.selectedShortcutLabel,
			shortcuts,
			refreshRuntimeProjectConfig,
			prepareTerminalForShortcut,
			prepareWaitForTerminalConnectionReady,
			sendTaskSessionInput,
		});

	const persistWorkspaceStateAsync = useCallback(
		async (input: { workspaceId: string; payload: Parameters<typeof saveWorkspaceState>[1] }) =>
			await saveWorkspaceState(input.workspaceId, input.payload),
		[],
	);
	const handleWorkspaceStateConflict = useCallback(() => {
		showAppToast(
			{
				intent: "warning",
				icon: "warning-sign",
				message: "Workspace changed elsewhere. Synced latest state. Retry your last edit if needed.",
				timeout: 5000,
			},
			"workspace-state-conflict",
		);
	}, []);

	useWorkspacePersistence({
		board,
		sessions,
		currentProjectId,
		workspaceRevision,
		hydrationNonce: workspaceHydrationNonce,
		canPersistWorkspaceState,
		isDocumentVisible,
		isWorkspaceStateRefreshing,
		persistWorkspaceState: persistWorkspaceStateAsync,
		refetchWorkspaceState: refreshWorkspaceState,
		onWorkspaceRevisionChange: setWorkspaceRevision,
		onWorkspaceStateConflict: handleWorkspaceStateConflict,
	});

	useEffect(() => {
		if (!streamError) {
			lastStreamErrorRef.current = null;
			return;
		}
		const removedPath = parseRemovedProjectPathFromStreamError(streamError);
		if (removedPath !== null) {
			showAppToast(
				{
					intent: "danger",
					icon: "warning-sign",
					message: removedPath
						? `Project no longer exists and was removed: ${removedPath}`
						: "Project no longer exists and was removed.",
					timeout: 6000,
				},
				`project-removed-${removedPath || "unknown"}`,
			);
			lastStreamErrorRef.current = null;
			return;
		}
		if (isRuntimeDisconnected) {
			lastStreamErrorRef.current = streamError;
			return;
		}
		if (lastStreamErrorRef.current !== streamError) {
			notifyError(streamError, { key: `error:${streamError}` });
		}
		lastStreamErrorRef.current = streamError;
	}, [isRuntimeDisconnected, streamError]);

	useEffect(() => {
		resetTaskEditorState();
		setIsCreateChangeDialogOpen(false);
		setIsClearTrashDialogOpen(false);
		setChangeBoardFilter("all");
		setSelectedChangeId(null);
		setSelectedSessionChangeId(null);
		setChangeWorkspaceEventVersions({});
		setChangeActionError(null);
		lastHandledVcsProjectEventRef.current = null;
		resetGitActionState();
		resetProjectNavigationState();
		resetTerminalPanelsState();
	}, [
		currentProjectId,
		resetGitActionState,
		resetProjectNavigationState,
		resetTaskEditorState,
		resetTerminalPanelsState,
	]);

	useEffect(() => {
		if (!selectedChangeId) {
			return;
		}
		if (changeyardChanges.some((change) => change.id === selectedChangeId)) {
			return;
		}
		setSelectedChangeId(null);
	}, [changeyardChanges, selectedChangeId]);

	useEffect(() => {
		if (!selectedSessionChangeId) {
			return;
		}
		if (changeyardChanges.some((change) => change.id === selectedSessionChangeId)) {
			return;
		}
		setSelectedSessionChangeId(null);
	}, [changeyardChanges, selectedSessionChangeId]);

	useEffect(() => {
		if (!latestVcsProjectEvent || latestVcsProjectEvent.kind !== "worktree_changes") {
			return;
		}
		const signature = [
			latestVcsProjectEvent.version,
			latestVcsProjectEvent.changedAt,
			latestVcsProjectEvent.kind,
			...latestVcsProjectEvent.paths,
		].join("\x1f");
		if (lastHandledVcsProjectEventRef.current === signature) {
			return;
		}
		lastHandledVcsProjectEventRef.current = signature;

		const eventPaths = latestVcsProjectEvent.paths.map(normalizeKanbanEventPath).filter(Boolean);
		const affectedChangeIds = findAffectedWorkspaceChangeIds(changeyardChanges, eventPaths, workspacePath);
		if (affectedChangeIds.length > 0) {
			setChangeWorkspaceEventVersions((current) => {
				const next = { ...current };
				for (const changeId of affectedChangeIds) {
					next[changeId] = (next[changeId] ?? 0) + 1;
				}
				return next;
			});
		}

		if (!eventPaths.some(isChangeyardChangeMarkdownEventPath)) {
			return;
		}

		void refetchChangeyardChanges();
		if (selectedChangeId && eventPaths.some((eventPath) => isChangeMarkdownEventPathForChange(eventPath, selectedChangeId))) {
			void refetchSelectedChangeDetail();
		}
	}, [
		changeyardChanges,
		latestVcsProjectEvent,
		refetchChangeyardChanges,
		refetchSelectedChangeDetail,
		selectedChangeId,
		workspacePath,
	]);

	const handleCreateChange = useCallback(
		async (
			input: {
				template: "feature" | "bug" | "refactor" | "agent-task" | "quick";
				title: string;
				priority?: string;
				labels?: string[];
				baseRevision?: string;
				planning?: "none" | "openspec-lite";
				strict?: boolean;
			},
			options?: { keepDialogOpen?: boolean },
		): Promise<boolean> => {
			if (!currentProjectId) {
				return false;
			}
			setIsChangeActionPending(true);
			setChangeActionError(null);
			try {
				const created = await getRuntimeTrpcClient(currentProjectId).changes.create.mutate(input);
				setSelectedChangeId(created.id);
				setSelectedChangeDetail(created);
				await refetchChangeyardChanges();
				if (!options?.keepDialogOpen) {
					setIsCreateChangeDialogOpen(false);
				}
				showAppToast({
					intent: "success",
					icon: "tick",
					message: `Created ${created.id}: ${created.title}`,
					timeout: 4000,
				});
				return true;
			} catch (error) {
				setChangeActionError(error instanceof Error ? error.message : String(error));
				return false;
			} finally {
				setIsChangeActionPending(false);
			}
		},
		[currentProjectId, refetchChangeyardChanges, setSelectedChangeDetail],
	);

	const handleReviewChanged = useCallback(
		async (change: RuntimeChangeyardChangeDetail, message: string) => {
			setSelectedChangeId(change.id);
			setSelectedChangeDetail(change);
			await refetchChangeyardChanges();
			await refetchSelectedChangeDetail();
			showAppToast({
				intent: "success",
				icon: "tick",
				message,
				timeout: 4000,
			});
		},
		[refetchChangeyardChanges, refetchSelectedChangeDetail, setSelectedChangeDetail],
	);

	const handleMarkChangeDoneFromReview = useCallback(
		async (changeId: string, status: "approved" | "merged") => {
			if (!currentProjectId) {
				return;
			}
			setIsChangeActionPending(true);
			setChangeActionError(null);
			try {
				const client = getRuntimeTrpcClient(currentProjectId);
				const nextDetail = await client.changes.updateStatus.mutate({ id: changeId, status });
				setSelectedChangeId(nextDetail.id);
				setSelectedChangeDetail(nextDetail);
				await refetchChangeyardChanges();
				await refetchSelectedChangeDetail();
				showAppToast({
					intent: "success",
					icon: "tick",
					message: `Marked ${changeId} done`,
					timeout: 4000,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setChangeActionError(message);
				throw error;
			} finally {
				setIsChangeActionPending(false);
			}
		},
		[currentProjectId, refetchChangeyardChanges, refetchSelectedChangeDetail, setSelectedChangeDetail],
	);

	const runChangeAction = useCallback(
		async (action: ChangeDetailAction, changeId: string) => {
			if (!currentProjectId) {
				return;
			}
			if (action === "review") {
				setSelectedChangeId(changeId);
				setIsChangeReviewOpen(true);
				return;
			}
			setIsChangeActionPending(true);
			setChangeActionError(null);
			try {
				const client = getRuntimeTrpcClient(currentProjectId);
				let nextDetail;
				let successMessage = "";
				switch (action) {
					case "validate":
						nextDetail = await client.changes.validate.mutate({ id: changeId });
						successMessage = `Validated ${changeId}`;
						break;
					case "sync":
						nextDetail = await client.changes.sync.mutate({ id: changeId });
						successMessage = `Synced ${changeId}`;
						break;
					case "start":
						nextDetail = await client.changes.start.mutate({ id: changeId });
						successMessage = `Started ${changeId}`;
						break;
					case "verify": {
						const response = await client.changes.verify.mutate({ id: changeId });
						nextDetail = response.change;
						successMessage = response.message;
						break;
					}
					case "complete": {
						const response = await client.changes.complete.mutate({ id: changeId, noPr: true });
						nextDetail = response.change;
						successMessage = response.message;
						break;
					}
					case "approve": {
						const response = await client.changes.reviewComplete.mutate({ id: changeId, decision: "approve" });
						nextDetail = response.change;
						successMessage = response.message;
						break;
					}
					case "requestChanges": {
						const response = await client.changes.reviewComplete.mutate({
							id: changeId,
							decision: "request-changes",
						});
						nextDetail = response.change;
						successMessage = response.message;
						break;
					}
				}
				setSelectedChangeId(nextDetail.id);
				setSelectedChangeDetail(nextDetail);
				await refetchChangeyardChanges();
				await refetchSelectedChangeDetail();
				showAppToast({
					intent: "success",
					icon: "tick",
					message: successMessage,
					timeout: 4000,
				});
			} catch (error) {
				setChangeActionError(error instanceof Error ? error.message : String(error));
			} finally {
				setIsChangeActionPending(false);
			}
		},
		[currentProjectId, refetchChangeyardChanges, refetchSelectedChangeDetail, setSelectedChangeDetail],
	);

	const handleMoveChange = useCallback(
		async (changeId: string, targetColumnId: ChangeColumnId) => {
			if (!currentProjectId) {
				return;
			}
			const current =
				(selectedChangeDetail?.id === changeId ? selectedChangeDetail : null)
				?? changeyardChanges.find((change) => change.id === changeId)
				?? null;
			if (!current) {
				setChangeActionError(`Change ${changeId} is no longer available.`);
				return;
			}

			setIsChangeActionPending(true);
			setChangeActionError(null);
			try {
				const client = getRuntimeTrpcClient(currentProjectId);
				const status = current.status;
				let nextDetail;
				let successMessage = "";
				switch (targetColumnId) {
					case "in_progress":
						if (status === "ready" || status === "synced") {
							nextDetail = await client.changes.start.mutate({ id: changeId });
							successMessage = `Started ${changeId}`;
							break;
						}
						if (status === "blocked" || status === "changes_requested") {
							nextDetail = await client.changes.updateStatus.mutate({ id: changeId, status: "in_progress" });
							successMessage = `Moved ${changeId} to in progress`;
							break;
						}
						throw new Error(unsupportedChangeMoveMessage(changeId, status, targetColumnId));
					case "blocked":
						if (status === "in_progress") {
							nextDetail = await client.changes.updateStatus.mutate({ id: changeId, status: "blocked" });
							successMessage = `Blocked ${changeId}`;
							break;
						}
						throw new Error(unsupportedChangeMoveMessage(changeId, status, targetColumnId));
					case "review": {
						if (status === "in_progress") {
							const response = await client.changes.complete.mutate({ id: changeId, noPr: true });
							nextDetail = response.change;
							successMessage = response.message;
							break;
						}
						throw new Error(unsupportedChangeMoveMessage(changeId, status, targetColumnId));
					}
					case "done": {
						if (status === "in_review") {
							const response = await client.changes.reviewComplete.mutate({ id: changeId, decision: "approve" });
							nextDetail = response.change;
							successMessage = response.message;
							break;
						}
						throw new Error(unsupportedChangeMoveMessage(changeId, status, targetColumnId));
					}
					case "abandoned":
						if (["ready", "in_progress", "ready_for_pr", "pr_open", "in_review", "changes_requested", "approved"].includes(status)) {
							nextDetail = await client.changes.updateStatus.mutate({ id: changeId, status: "abandoned" });
							successMessage = `Abandoned ${changeId}`;
							break;
						}
						throw new Error(unsupportedChangeMoveMessage(changeId, status, targetColumnId));
					case "backlog":
					case "ready":
						throw new Error(unsupportedChangeMoveMessage(changeId, status, targetColumnId));
				}
				setSelectedChangeId(nextDetail.id);
				setSelectedChangeDetail(nextDetail);
				await refetchChangeyardChanges();
				await refetchSelectedChangeDetail();
				showAppToast({
					intent: "success",
					icon: "tick",
					message: successMessage,
					timeout: 4000,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setChangeActionError(message);
				showAppToast({
					intent: "warning",
					icon: "warning-sign",
					message,
					timeout: 5000,
				});
			} finally {
				setIsChangeActionPending(false);
			}
		},
		[
			changeyardChanges,
			currentProjectId,
			refetchChangeyardChanges,
			refetchSelectedChangeDetail,
			selectedChangeDetail,
			setSelectedChangeDetail,
		],
	);

	const handleLinkChange = useCallback(
		async (changeId: string, blockedByChangeId: string) => {
			if (!currentProjectId) {
				return;
			}
			setIsChangeActionPending(true);
			setChangeActionError(null);
			try {
				const nextDetail = await getRuntimeTrpcClient(currentProjectId).changes.link.mutate({
					changeId,
					blockedByChangeId,
				});
				setSelectedChangeId(nextDetail.id);
				setSelectedChangeDetail(nextDetail);
				await refetchChangeyardChanges();
				await refetchSelectedChangeDetail();
				showAppToast({
					intent: "success",
					icon: "tick",
					message: `${changeId} now depends on ${blockedByChangeId}`,
					timeout: 4000,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setChangeActionError(message);
				showAppToast({
					intent: "warning",
					icon: "warning-sign",
					message,
					timeout: 5000,
				});
			} finally {
				setIsChangeActionPending(false);
			}
		},
		[currentProjectId, refetchChangeyardChanges, refetchSelectedChangeDetail, setSelectedChangeDetail],
	);

	const handleUnlinkChange = useCallback(
		async (changeId: string, blockedByChangeId: string) => {
			if (!currentProjectId) {
				return;
			}
			setIsChangeActionPending(true);
			setChangeActionError(null);
			try {
				const nextDetail = await getRuntimeTrpcClient(currentProjectId).changes.unlink.mutate({
					changeId,
					blockedByChangeId,
				});
				setSelectedChangeId(nextDetail.id);
				setSelectedChangeDetail(nextDetail);
				await refetchChangeyardChanges();
				await refetchSelectedChangeDetail();
				showAppToast({
					intent: "success",
					icon: "tick",
					message: `Removed dependency ${changeId} -> ${blockedByChangeId}`,
					timeout: 4000,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setChangeActionError(message);
				showAppToast({
					intent: "warning",
					icon: "warning-sign",
					message,
					timeout: 5000,
				});
			} finally {
				setIsChangeActionPending(false);
			}
		},
		[currentProjectId, refetchChangeyardChanges, refetchSelectedChangeDetail, setSelectedChangeDetail],
	);

	const handleSaveChangeBody = useCallback(
		async (input: {
			changeId: string;
			body: string;
			expectedUpdatedAt?: string | null;
		}) => {
			if (!currentProjectId) {
				return;
			}
			setIsChangeActionPending(true);
			setChangeActionError(null);
			try {
				const nextDetail = await getRuntimeTrpcClient(currentProjectId).changes.updateBody.mutate({
					id: input.changeId,
					body: input.body,
					expectedUpdatedAt: input.expectedUpdatedAt ?? null,
				});
				setSelectedChangeId(nextDetail.id);
				setSelectedChangeDetail(nextDetail);
				await refetchChangeyardChanges();
				await refetchSelectedChangeDetail();
				showAppToast({
					intent: "success",
					icon: "tick",
					message: `Saved markdown for ${nextDetail.id}`,
					timeout: 4000,
				});
			} catch (error) {
				const conflictUpdatedAt = readTrpcConflictUpdatedAt(error);
				if (conflictUpdatedAt !== null) {
					setChangeActionError(
						"Change markdown changed elsewhere. Reloaded the latest content; reapply your edit if still needed.",
					);
					await refetchChangeyardChanges();
					await refetchSelectedChangeDetail();
					showAppToast({
						intent: "warning",
						icon: "warning-sign",
						message: `Change markdown changed elsewhere at ${conflictUpdatedAt}. Latest content has been reloaded.`,
						timeout: 5000,
					});
				} else {
					setChangeActionError(error instanceof Error ? error.message : String(error));
				}
			} finally {
				setIsChangeActionPending(false);
			}
		},
		[currentProjectId, refetchChangeyardChanges, refetchSelectedChangeDetail, setSelectedChangeDetail],
	);
	useEffect(() => {
		if (activeDetailSelection) {
			return;
		}
		if (hasNoProjects || !currentProjectId) {
			if (isHomeTerminalOpen) {
				closeHomeTerminal();
			}
			return;
		}
	}, [activeDetailSelection, closeHomeTerminal, currentProjectId, hasNoProjects, isHomeTerminalOpen]);
	const showHomeBottomTerminal = !activeDetailSelection && !hasNoProjects && isHomeTerminalOpen;
	const homeTerminalSubtitle = useMemo(
		() => workspacePath ?? navigationProjectPath ?? null,
		[navigationProjectPath, workspacePath],
	);

	const handleOpenSettings = useCallback((section?: RuntimeSettingsSection) => {
		setSettingsInitialSection(section ?? null);
		setIsSettingsOpen(true);
	}, []);
	const handleToggleGitHistory = useCallback(() => {
		if (hasNoProjects) {
			return;
		}
		setIsGitHistoryOpen((current) => !current);
	}, [hasNoProjects]);
	const handleCloseGitHistory = useCallback(() => {
		setIsGitHistoryOpen(false);
	}, []);

	const {
		handleProgrammaticCardMoveReady,
		handleCreateDependency,
		handleDeleteDependency,
		handleDragEnd,
		handleStartTask,
		handleStartAllBacklogTasks,
		handleDetailTaskDragEnd,
		handleCardSelect,
		handleMoveToTrash,
		handleMoveReviewCardToTrash,
		handleRestoreTaskFromTrash,
		handleCancelAutomaticTaskAction,
		handleOpenClearTrash,
		handleConfirmClearTrash,
		handleAddReviewComments,
		handleSendReviewComments,
		moveToTrashLoadingById,
		trashTaskCount,
	} = useBoardInteractions({
		board,
		setBoard,
		sessions,
		setSessions,
		selectedCard,
		selectedTaskId,
		currentProjectId,
		setSelectedTaskId,
		setIsClearTrashDialogOpen,
		setIsGitHistoryOpen,
		stopTaskSession,
		cleanupTaskWorkspace,
		ensureTaskWorkspace,
		startTaskSession,
		fetchTaskWorkspaceInfo,
		sendTaskSessionInput,
		readyForReviewNotificationsEnabled,
		taskGitActionLoadingByTaskId,
		runAutoReviewGitAction,
	});

	const {
		handleCreateAndStartTask,
		handleCreateAndStartTasks,
		handleCreateStartAndOpenTask,
		handleStartTaskFromBoard,
		handleStartAllBacklogTasksFromBoard,
	} = useTaskStartActions({
		board,
		handleCreateTask,
		handleCreateTasks,
		handleStartTask,
		handleStartAllBacklogTasks,
		setSelectedTaskId,
	});
	useAppHotkeys({
		selectedCard: activeDetailSelection,
		isDetailTerminalOpen,
		isHomeTerminalOpen: showHomeBottomTerminal,
		isHomeGitHistoryOpen: !activeDetailSelection && isGitHistoryOpen,
		canUseCreateTaskShortcut: !hasNoProjects && currentProjectId !== null,
		handleToggleDetailTerminal,
		handleToggleHomeTerminal,
		handleToggleExpandDetailTerminal,
		handleToggleExpandHomeTerminal: handleToggleExpandHomeTerminal,
		handleOpenCreateTask,
		handleOpenSettings,
		handleToggleGitHistory,
		handleCloseGitHistory,
		onStartAllTasks: handleStartAllBacklogTasksFromBoard,
	});

	useEffect(() => {
		if (!pendingTaskStartAfterEditId) {
			return;
		}
		const selection = findCardSelection(board, pendingTaskStartAfterEditId);
		if (!selection || selection.column.id !== "backlog") {
			return;
		}
		handleStartTaskFromBoard(pendingTaskStartAfterEditId);
		setPendingTaskStartAfterEditId(null);
	}, [board, handleStartTaskFromBoard, pendingTaskStartAfterEditId]);

	const detailSession = activeDetailSelection
		? (sessions[activeDetailSelection.card.id] ?? createIdleTaskSession(activeDetailSelection.card.id))
		: null;
	const handleResumeExternalSession = useCallback(
		(taskId: string, sessionId: string) => {
			const task =
				board.columns.flatMap((column) => column.cards).find((card) => card.id === taskId) ??
				(activeDetailSelection?.card.id === taskId ? activeDetailSelection.card : null);
			if (!task) {
				notifyError("Could not resume session: task details are no longer available.");
				return;
			}
			void startTaskSession(task, { resumeSessionId: sessionId }).then((result) => {
				if (!result.ok) {
					notifyError(result.message ?? "Could not resume external session.");
					return;
				}
			});
		},
		[activeDetailSelection, board.columns, startTaskSession],
	);
	const detailTerminalSummary = detailTerminalTaskId ? (sessions[detailTerminalTaskId] ?? null) : null;
	const detailTerminalSubtitle = useMemo(() => {
		if (!activeDetailSelection) {
			return null;
		}
		return (
			getTaskWorkspaceInfo(activeDetailSelection.card.id, activeDetailSelection.card.baseRef)?.path ??
			getTaskWorkspaceSnapshot(activeDetailSelection.card.id)?.path ??
			null
		);
	}, [activeDetailSelection]);

	const runtimeHint = useMemo(() => {
		return getTaskAgentNavbarHint(runtimeProjectConfig, {
			shouldUseNavigationPath,
		});
	}, [runtimeProjectConfig, shouldUseNavigationPath]);

	const activeWorkspacePath = activeDetailSelection
		? (getTaskWorkspaceInfo(activeDetailSelection.card.id, activeDetailSelection.card.baseRef)?.path ??
			getTaskWorkspaceSnapshot(activeDetailSelection.card.id)?.path ??
			workspacePath ??
			undefined)
		: shouldUseNavigationPath
			? (navigationProjectPath ?? undefined)
			: (workspacePath ?? undefined);

	const activeWorkspaceHint = useMemo(() => {
		if (!activeDetailSelection) {
			return undefined;
		}
		const activeSelectedTaskWorkspaceInfo = getTaskWorkspaceInfo(activeDetailSelection.card.id, activeDetailSelection.card.baseRef);
		if (!activeSelectedTaskWorkspaceInfo) {
			return undefined;
		}
		if (!activeSelectedTaskWorkspaceInfo.exists) {
			return activeDetailSelection.column.id === "trash" ? "Task worktree deleted" : "Task worktree not created yet";
		}
		return undefined;
	}, [activeDetailSelection]);

	const sidebarLayout = useProjectNavigationLayout();
	const handleToggleSidebar = useCallback(() => {
		sidebarLayout.setSidebarCollapsed(!sidebarLayout.isCollapsed);
	}, [sidebarLayout]);

	const navbarWorkspacePath = hasNoProjects ? undefined : activeWorkspacePath;
	const navbarWorkspaceHint = hasNoProjects ? undefined : activeWorkspaceHint;
	const navbarRuntimeHint = hasNoProjects ? undefined : runtimeHint;
	const shouldHideProjectDependentTopBarActions =
		!activeDetailSelection && (isProjectSwitching || isAwaitingWorkspaceSnapshot || isWorkspaceMetadataPending);

	const {
		openTargetOptions,
		selectedOpenTargetId,
		onSelectOpenTarget,
		onOpenWorkspace,
		canOpenWorkspace,
		isOpeningWorkspace,
	} = useOpenWorkspace({
		currentProjectId,
		workspacePath: activeWorkspacePath,
	});
	const selectedTaskChatMessages = selectTaskChatMessagesForTask(activeDetailTaskId, taskChatMessagesByTaskId);
	const latestSelectedTaskChatMessage = selectLatestTaskChatMessageForTask(
		activeDetailTaskId,
		latestTaskChatMessage,
	);
	const defaultTaskClineProviderId =
		runtimeProjectConfig?.clineProviderSettings?.providerId ??
		runtimeProjectConfig?.clineProviderSettings?.oauthProvider ??
		null;
	const handleClineTaskSettingsChangedForTask = useCallback(
		({
			providerId,
			modelId,
			reasoningEffort,
		}: {
			providerId: string;
			modelId: string;
			reasoningEffort: RuntimeClineReasoningEffort | "";
		}) => {
			if (!selectedCard) {
				return;
			}
			const taskId = selectedCard.card.id;
			setBoard((currentBoard) => {
				const result = applyTaskDetailClineSettingsChange(
					currentBoard,
					taskId,
					{
						providerId,
						modelId,
						reasoningEffort,
					},
					{
						providerId: defaultTaskClineProviderId,
						modelId: runtimeProjectConfig?.clineProviderSettings?.modelId ?? null,
					},
				);
				return result.updated ? result.board : currentBoard;
			});
		},
		[defaultTaskClineProviderId, runtimeProjectConfig, selectedCard, setBoard],
	);

	const handleCreateDialogOpenChange = useCallback(
		(open: boolean) => {
			if (!open) {
				handleCancelCreateTask();
			}
		},
		[handleCancelCreateTask],
	);

	const inlineTaskEditor = editingTaskId ? (
		<TaskInlineCreateCard
			prompt={editTaskPrompt}
			onPromptChange={setEditTaskPrompt}
			images={editTaskImages}
			onImagesChange={setEditTaskImages}
			onCreate={handleSaveEditedTask}
			onCreateAndStart={handleSaveAndStartEditedTask}
			onCancel={handleCancelEditTask}
			startInPlanMode={editTaskStartInPlanMode}
			onStartInPlanModeChange={setEditTaskStartInPlanMode}
			startInPlanModeDisabled={isEditTaskStartInPlanModeDisabled}
			autoReviewEnabled={editTaskAutoReviewEnabled}
			onAutoReviewEnabledChange={setEditTaskAutoReviewEnabled}
			autoReviewMode={editTaskAutoReviewMode}
			onAutoReviewModeChange={setEditTaskAutoReviewMode}
			workspaceId={currentProjectId}
			branchRef={editTaskBranchRef}
			branchOptions={createTaskBranchOptions}
			onBranchRefChange={setEditTaskBranchRef}
			agentId={editTaskAgentId}
			onAgentIdChange={setEditTaskAgentId}
			clineSettings={editTaskClineSettings}
			onClineSettingsChange={setEditTaskClineSettings}
			defaultAgentId={runtimeProjectConfig?.selectedAgentId ?? null}
			defaultProviderId={defaultTaskClineProviderId}
			defaultModelId={runtimeProjectConfig?.clineProviderSettings?.modelId ?? null}
			defaultReasoningEffort={runtimeProjectConfig?.clineProviderSettings?.reasoningEffort ?? null}
			mode="edit"
			idPrefix={`inline-edit-task-${editingTaskId}`}
		/>
	) : undefined;

	if (isRuntimeDisconnected) {
		return <RuntimeDisconnectedFallback />;
	}
	if (isKanbanAccessBlocked) {
		return <KanbanAccessBlockedFallback />;
	}

	return (
		<LayoutCustomizationsProvider onResetBottomTerminalLayoutCustomizations={resetBottomTerminalLayoutCustomizations}>
			<div className="flex h-[100dvh] min-w-0 overflow-hidden">
				{!activeDetailSelection ? (
					<ProjectNavigationPanel
						projects={displayedProjects}
						isLoadingProjects={isProjectListLoading}
						currentProjectId={navigationCurrentProjectId}
						removingProjectId={removingProjectId}
						activeSection={homeSidebarSection}
						onActiveSectionChange={setHomeSidebarSection}
						canShowAgentSection={!hasNoProjects && Boolean(currentProjectId)}
						agentSectionContent={homeSidebarAgentPanel}
						selectedAgentId={settingsRuntimeProjectConfig?.selectedAgentId ?? null}
						clineProviderSettings={settingsRuntimeProjectConfig?.clineProviderSettings ?? null}
						featurebaseFeedbackState={featurebaseFeedbackState}
						onSelectProject={(projectId) => {
							void handleSelectProject(projectId);
						}}
						onRemoveProject={handleRemoveProject}
						onAddProject={() => {
							void handleAddProject();
						}}
						sidebarWidth={sidebarLayout.sidebarWidth}
						setExpandedSidebarWidth={sidebarLayout.setExpandedSidebarWidth}
						isCollapsed={sidebarLayout.isCollapsed}
						setSidebarCollapsed={sidebarLayout.setSidebarCollapsed}
					/>
				) : null}
				<div className="flex flex-col flex-1 min-w-0 overflow-hidden">
					<TopBar
						onToggleSidebar={!activeDetailSelection ? handleToggleSidebar : undefined}
						onBack={activeDetailSelection ? handleActiveDetailBack : undefined}
						workspacePath={navbarWorkspacePath}
						isWorkspacePathLoading={shouldShowProjectLoadingState}
						workspaceHint={navbarWorkspaceHint}
						runtimeHint={navbarRuntimeHint}
						selectedTaskId={activeDetailSelection?.card.id ?? null}
						selectedTaskBaseRef={activeDetailSelection?.card.baseRef ?? null}
						showHomeGitSummary={!hasNoProjects && !activeDetailSelection}
						runningGitAction={activeDetailSelection || hasNoProjects ? null : runningGitAction}
						onGitFetch={
							activeDetailSelection
								? undefined
								: () => {
										void runGitAction("fetch");
									}
						}
						onGitPull={
							activeDetailSelection
								? undefined
								: () => {
										void runGitAction("pull");
									}
						}
						onGitPush={
							activeDetailSelection
								? undefined
								: () => {
										void runGitAction("push");
									}
						}
						onToggleTerminal={
							hasNoProjects ? undefined : activeDetailSelection ? handleToggleDetailTerminal : handleToggleHomeTerminal
						}
						isTerminalOpen={activeDetailSelection ? isDetailTerminalOpen : showHomeBottomTerminal}
						isTerminalLoading={activeDetailSelection ? isDetailTerminalStarting : isHomeTerminalStarting}
						onOpenSettings={handleOpenSettings}
						showDebugButton={debugModeEnabled}
						onOpenDebugDialog={debugModeEnabled ? handleOpenDebugDialog : undefined}
						shortcuts={shortcuts}
						selectedShortcutLabel={selectedShortcutLabel}
						onSelectShortcutLabel={handleSelectShortcutLabel}
						runningShortcutLabel={runningShortcutLabel}
						onRunShortcut={handleRunShortcut}
						onCreateFirstShortcut={currentProjectId ? handleCreateShortcut : undefined}
						openTargetOptions={openTargetOptions}
						selectedOpenTargetId={selectedOpenTargetId}
						onSelectOpenTarget={onSelectOpenTarget}
						onOpenWorkspace={onOpenWorkspace}
						canOpenWorkspace={canOpenWorkspace}
						isOpeningWorkspace={isOpeningWorkspace}
						onToggleGitHistory={hasNoProjects ? undefined : handleToggleGitHistory}
						isGitHistoryOpen={isGitHistoryOpen}
						hideProjectDependentActions={shouldHideProjectDependentTopBarActions}
					/>
					<div className="relative flex flex-1 min-h-0 min-w-0 overflow-hidden">
						<div
							className="kb-home-layout"
							aria-hidden={activeDetailSelection ? true : undefined}
							style={activeDetailSelection ? { visibility: "hidden" } : undefined}
						>
							{shouldShowProjectLoadingState ? (
								<div className="flex flex-1 min-h-0 items-center justify-center bg-surface-0">
									<Spinner size={30} />
								</div>
							) : hasNoProjects ? (
								<div className="flex flex-1 min-h-0 items-center justify-center bg-surface-0 p-6">
									<div className="flex flex-col items-center justify-center gap-3 text-text-tertiary">
										<FolderOpen size={48} strokeWidth={1} />
										<h3 className="text-sm font-semibold text-text-primary">No projects yet</h3>
										<p className="text-[13px] text-text-secondary">
											Add a git repository to start using Kanban.
										</p>
										<Button
											variant="primary"
											onClick={() => {
												void handleAddProject();
											}}
										>
											Add Project
										</Button>
									</div>
								</div>
							) : (
								<div className="flex flex-1 flex-col min-h-0 min-w-0">
									<div className="flex flex-1 min-h-0 min-w-0">
										{isGitHistoryOpen ? (
											<Suspense
												fallback={
													<div className="flex flex-1 items-center justify-center bg-surface-0 text-text-secondary">
														<Spinner size={24} />
													</div>
												}
											>
												<GitHistoryView
													workspaceId={currentProjectId}
													gitHistory={gitHistory}
													onCheckoutBranch={(branch) => {
														void switchHomeBranch(branch);
													}}
													onDiscardWorkingChanges={() => {
														void discardHomeWorkingChanges();
													}}
													isDiscardWorkingChangesPending={isDiscardingHomeWorkingChanges}
												/>
											</Suspense>
										) : (
											<ChangeBoard
												board={board}
												changes={changeyardChanges}
												filter={changeBoardFilter}
												selectedChangeId={selectedChangeId}
												selectedTaskId={selectedTaskId}
												isLoading={isChangeyardChangesLoading}
												taskSessions={sessions}
												onFilterChange={setChangeBoardFilter}
												onSelectChange={(changeId) => {
													setChangeActionError(null);
													if (sessions[changeId]) {
														setSelectedSessionChangeId(changeId);
														setSelectedChangeId(changeId);
														setIsGitHistoryOpen(false);
														return;
													}
													setSelectedSessionChangeId(null);
													setSelectedChangeId(changeId);
												}}
												onSelectTask={(taskId) => {
													setSelectedSessionChangeId(null);
													setSelectedTaskId(taskId);
													setIsGitHistoryOpen(false);
												}}
												onMoveTask={handleDragEnd}
												onStartTask={handleStartTask}
												onCommitTask={handleCommitTask}
												onOpenPrTask={handleOpenPrTask}
												onCancelAutomaticTaskAction={handleCancelAutomaticTaskAction}
												onMoveToTrashTask={handleMoveReviewCardToTrash}
												onRestoreFromTrashTask={handleRestoreTaskFromTrash}
												commitTaskLoadingById={commitTaskLoadingById}
												openPrTaskLoadingById={openPrTaskLoadingById}
												moveToTrashLoadingById={moveToTrashLoadingById}
												workspacePath={workspacePath}
												workspaceId={currentProjectId}
												workspaceEventVersions={changeWorkspaceEventVersions}
												defaultClineModelId={runtimeProjectConfig?.clineProviderSettings?.modelId ?? null}
												onCreateTask={handleOpenCreateTask}
												onCreateChange={() => {
													setChangeActionError(null);
													setIsCreateChangeDialogOpen(true);
												}}
												onMoveChange={(changeId, targetColumnId) => {
													void handleMoveChange(changeId, targetColumnId);
												}}
												onLinkChange={(changeId, blockedByChangeId) => {
													void handleLinkChange(changeId, blockedByChangeId);
												}}
												onUnlinkChange={(changeId, blockedByChangeId) => {
													void handleUnlinkChange(changeId, blockedByChangeId);
												}}
											/>
										)}
									</div>
									{showHomeBottomTerminal ? (
										<ResizableBottomPane
											minHeight={200}
											initialHeight={homeTerminalPaneHeight}
											onHeightChange={setHomeTerminalPaneHeight}
											onCollapse={collapseHomeTerminal}
											isExpanded={isHomeTerminalExpanded}
										>
											<div
												style={{
													display: "flex",
													flex: "1 1 0",
													minWidth: 0,
													paddingLeft: 12,
													paddingRight: 12,
												}}
											>
												<Suspense
													fallback={
														<div className="flex flex-1 items-center justify-center bg-surface-1 text-text-secondary">
															<Spinner size={18} />
														</div>
													}
												>
													<AgentTerminalPanel
														key={`home-shell-${homeTerminalTaskId}`}
														taskId={homeTerminalTaskId}
														workspaceId={currentProjectId}
														summary={homeTerminalSummary}
														onSummary={upsertSession}
														showSessionToolbar={false}
														autoFocus
														onClose={closeHomeTerminal}
														minimalHeaderTitle="Terminal"
														minimalHeaderSubtitle={homeTerminalSubtitle}
														panelBackgroundColor="var(--color-surface-1)"
														terminalBackgroundColor={terminalThemeColors.surfaceRaised}
														cursorColor={terminalThemeColors.textPrimary}
														onConnectionReady={markTerminalConnectionReady}
														agentCommand={agentCommand}
														onSendAgentCommand={handleSendAgentCommandToHomeTerminal}
														isExpanded={isHomeTerminalExpanded}
														onToggleExpand={handleToggleExpandHomeTerminal}
													/>
												</Suspense>
											</div>
										</ResizableBottomPane>
									) : null}
								</div>
							)}
						</div>
						{activeDetailSelection && detailSession ? (
							<div className="absolute inset-0 flex min-h-0 min-w-0">
								<Suspense
									fallback={
										<div className="flex flex-1 items-center justify-center bg-surface-0 text-text-secondary">
											<Spinner size={24} />
										</div>
									}
								>
									<CardDetailView
										selection={activeDetailSelection}
										currentProjectId={currentProjectId}
										workspacePath={workspacePath}
										selectedAgentId={runtimeProjectConfig?.selectedAgentId ?? null}
										runtimeConfig={runtimeProjectConfig ?? null}
										sessionSummary={detailSession}
										taskSessions={sessions}
										onSessionSummary={upsertSession}
										onCardSelect={handleCardSelect}
										onTaskDragEnd={handleDetailTaskDragEnd}
										onCreateTask={handleOpenCreateTask}
										onStartTask={handleStartTaskFromBoard}
										onResumeExternalSession={handleResumeExternalSession}
										onStartAllTasks={handleStartAllBacklogTasksFromBoard}
										onClearTrash={handleOpenClearTrash}
										editingTaskId={editingTaskId}
										inlineTaskEditor={inlineTaskEditor}
										onEditTask={(task) => {
											handleOpenEditTask(task, { preserveDetailSelection: true });
										}}
										onSaveTaskTitle={handleSaveTaskTitle}
										onCommitTask={handleCommitTask}
										onOpenPrTask={handleOpenPrTask}
										onAgentCommitTask={handleAgentCommitTask}
										onAgentOpenPrTask={handleAgentOpenPrTask}
										commitTaskLoadingById={commitTaskLoadingById}
										openPrTaskLoadingById={openPrTaskLoadingById}
										agentCommitTaskLoadingById={agentCommitTaskLoadingById}
										agentOpenPrTaskLoadingById={agentOpenPrTaskLoadingById}
										moveToTrashLoadingById={moveToTrashLoadingById}
										onMoveReviewCardToTrash={handleMoveReviewCardToTrash}
										onRestoreTaskFromTrash={handleRestoreTaskFromTrash}
										onCancelAutomaticTaskAction={handleCancelAutomaticTaskAction}
										onAddReviewComments={(taskId: string, text: string) => {
											void handleAddReviewComments(taskId, text);
										}}
										onSendReviewComments={(taskId: string, text: string) => {
											void handleSendReviewComments(taskId, text);
										}}
										onSendClineChatMessage={sendTaskChatMessage}
										onCancelClineChatTurn={cancelTaskChatTurn}
										onLoadClineChatMessages={fetchTaskChatMessages}
										latestClineChatMessage={latestSelectedTaskChatMessage}
										streamedClineChatMessages={selectedTaskChatMessages}
										onMoveToTrash={handleMoveToTrash}
										isMoveToTrashLoading={moveToTrashLoadingById[activeDetailSelection.card.id] ?? false}
										gitHistoryPanel={
											isGitHistoryOpen ? (
												<GitHistoryView workspaceId={currentProjectId} gitHistory={gitHistory} />
											) : undefined
										}
										onCloseGitHistory={handleCloseGitHistory}
										bottomTerminalOpen={isDetailTerminalOpen}
										bottomTerminalTaskId={detailTerminalTaskId}
										bottomTerminalSummary={detailTerminalSummary}
										bottomTerminalSubtitle={detailTerminalSubtitle}
										onBottomTerminalClose={closeDetailTerminal}
										onBottomTerminalCollapse={collapseDetailTerminal}
										bottomTerminalPaneHeight={detailTerminalPaneHeight}
										onBottomTerminalPaneHeightChange={setDetailTerminalPaneHeight}
										onBottomTerminalConnectionReady={markTerminalConnectionReady}
										bottomTerminalAgentCommand={agentCommand}
										onBottomTerminalSendAgentCommand={handleSendAgentCommandToDetailTerminal}
										isBottomTerminalExpanded={isDetailTerminalExpanded}
										onBottomTerminalToggleExpand={handleToggleExpandDetailTerminal}
										isDocumentVisible={isDocumentVisible}
										onClineSettingsSaved={refreshRuntimeProjectConfig}
										onTaskClineSettingsChanged={handleClineTaskSettingsChangedForTask}
									/>
								</Suspense>
							</div>
						) : null}
					</div>
				</div>
				<Suspense fallback={null}>
					{isSettingsOpen ? (
						<RuntimeSettingsDialog
							open={isSettingsOpen}
							workspaceId={settingsWorkspaceId}
							initialConfig={settingsRuntimeProjectConfig}
							initialChangeyardProjectConfig={settingsChangeyardProjectConfig}
							liveMcpAuthStatuses={latestMcpAuthStatuses}
							initialSection={settingsInitialSection}
							onOpenChange={(nextOpen) => {
								setIsSettingsOpen(nextOpen);
								if (!nextOpen) {
									setSettingsInitialSection(null);
								}
							}}
							onSaved={() => {
								refreshSettingsRuntimeProjectConfig();
								refreshSettingsChangeyardProjectConfig();
							}}
							onAccountSwitched={refreshKanbanAccess}
						/>
					) : null}
					{isDebugDialogOpen ? (
						<DebugDialog
							open={isDebugDialogOpen}
							onOpenChange={handleDebugDialogOpenChange}
							isResetAllStatePending={isResetAllStatePending}
							onShowStartupOnboardingDialog={handleShowStartupOnboardingDialog}
							onResetAllState={handleResetAllState}
						/>
					) : null}
					{isCreateChangeDialogOpen ? (
						<CreateChangeDialog
							open={isCreateChangeDialogOpen}
							isPending={isChangeActionPending}
							error={changeActionError}
							branchOptions={createTaskBranchOptions}
							defaultBaseRevision={defaultTaskBranchRef}
							workspaceId={currentProjectId}
							onOpenChange={setIsCreateChangeDialogOpen}
							onCreate={handleCreateChange}
						/>
					) : null}
				</Suspense>
				<Suspense fallback={null}>
					{activeDetailSelection === null &&
					selectedChangeId !== null &&
					selectedChangeDetail !== null &&
					!isChangeReviewOpen ? (
						<ChangeDetailDialog
							change={selectedChangeDetail}
							open
							workspaceId={currentProjectId}
							repoRoot={workspacePath}
							sessionSummary={sessions[selectedChangeId] ?? null}
							isActionPending={isChangeActionPending}
							actionError={changeActionError}
							onOpenChange={(open) => {
								if (!open) {
									setSelectedSessionChangeId(null);
									setSelectedChangeId(null);
								}
							}}
							onRunAction={(action, changeId) => {
								void runChangeAction(action, changeId);
							}}
							onSaveBody={(input) => {
								void handleSaveChangeBody(input);
							}}
						/>
					) : null}
					{isChangeReviewOpen && activeDetailSelection === null && selectedChangeId !== null ? (
						<ChangeReviewModal
							open
							change={selectedChangeDetail}
							changes={changeyardChanges}
							workspaceId={currentProjectId}
							onOpenChange={(open) => {
								setIsChangeReviewOpen(open);
							}}
							onSelectChange={(changeId) => {
								setSelectedChangeId(changeId);
							}}
							onReviewChanged={(change, message) => {
								void handleReviewChanged(change, message);
							}}
							onMarkDone={(changeId, status) => handleMarkChangeDoneFromReview(changeId, status)}
						/>
					) : null}
				</Suspense>
				<Suspense fallback={null}>
					{isInlineTaskCreateOpen ? (
						<TaskCreateDialog
							open={isInlineTaskCreateOpen}
							onOpenChange={handleCreateDialogOpenChange}
							prompt={newTaskPrompt}
							onPromptChange={setNewTaskPrompt}
							images={newTaskImages}
							onImagesChange={setNewTaskImages}
							onCreate={handleCreateTask}
							onCreateAndStart={handleCreateAndStartTask}
							onCreateStartAndOpen={handleCreateStartAndOpenTask}
							onCreateMultiple={handleCreateTasks}
							onCreateAndStartMultiple={handleCreateAndStartTasks}
							startInPlanMode={newTaskStartInPlanMode}
							onStartInPlanModeChange={setNewTaskStartInPlanMode}
							startInPlanModeDisabled={isNewTaskStartInPlanModeDisabled}
							autoReviewEnabled={newTaskAutoReviewEnabled}
							onAutoReviewEnabledChange={setNewTaskAutoReviewEnabled}
							autoReviewMode={newTaskAutoReviewMode}
							onAutoReviewModeChange={setNewTaskAutoReviewMode}
							workspaceId={currentProjectId}
							branchRef={newTaskBranchRef}
							branchOptions={createTaskBranchOptions}
							onBranchRefChange={setNewTaskBranchRef}
							agentId={newTaskAgentId}
							onAgentIdChange={setNewTaskAgentId}
							clineSettings={newTaskClineSettings}
							onClineSettingsChange={setNewTaskClineSettings}
							defaultAgentId={runtimeProjectConfig?.selectedAgentId ?? null}
							defaultProviderId={defaultTaskClineProviderId}
							defaultModelId={runtimeProjectConfig?.clineProviderSettings?.modelId ?? null}
							defaultReasoningEffort={runtimeProjectConfig?.clineProviderSettings?.reasoningEffort ?? null}
						/>
					) : null}
					{isClearTrashDialogOpen ? (
						<ClearTrashDialog
							open={isClearTrashDialogOpen}
							taskCount={trashTaskCount}
							onCancel={() => setIsClearTrashDialogOpen(false)}
							onConfirm={handleConfirmClearTrash}
						/>
					) : null}
					{isStartupOnboardingDialogOpen ? (
						<StartupOnboardingDialog
							open={isStartupOnboardingDialogOpen}
							onClose={handleCloseStartupOnboardingDialog}
							selectedAgentId={runtimeProjectConfig?.selectedAgentId ?? null}
							agents={runtimeProjectConfig?.agents ?? []}
							clineProviderSettings={runtimeProjectConfig?.clineProviderSettings ?? null}
							workspaceId={currentProjectId}
							runtimeConfig={runtimeProjectConfig ?? null}
							onSelectAgent={handleSelectOnboardingAgent}
							onClineSetupSaved={handleOnboardingClineSetupSaved}
						/>
					) : null}
					{isAddProjectDialogOpen ? (
						<AddProjectDialog
							open={isAddProjectDialogOpen}
							onOpenChange={setIsAddProjectDialogOpen}
							onProjectAdded={handleAddProjectSuccess}
							currentProjectId={currentProjectId}
							initialGitInitPath={pendingNativeGitInitPath}
						/>
					) : null}
				</Suspense>

				<UpdateNotificationController />

				<AlertDialog
					open={gitActionError !== null}
					onOpenChange={(open) => {
						if (!open) {
							clearGitActionError();
						}
					}}
				>
					<AlertDialogHeader>
						<AlertDialogTitle>{gitActionErrorTitle}</AlertDialogTitle>
					</AlertDialogHeader>
					<AlertDialogBody>
						<p>{gitActionError?.message}</p>
						{gitActionError?.output ? (
							<pre className="max-h-[220px] overflow-auto rounded-md bg-surface-0 p-3 font-mono text-xs text-text-secondary whitespace-pre-wrap">
								{gitActionError.output}
							</pre>
						) : null}
					</AlertDialogBody>
					<AlertDialogFooter className="justify-end">
						<AlertDialogAction asChild>
							<Button variant="default" onClick={clearGitActionError}>
								Close
							</Button>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialog>
			</div>
		</LayoutCustomizationsProvider>
	);
}
