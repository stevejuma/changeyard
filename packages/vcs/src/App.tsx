import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { resolveWorkspaceProjectPath } from "@changeyard/web-ui";

import { AddProjectDialog } from "@/components/add-project-dialog";
import { notifyError, showAppToast } from "@/components/app-toaster";
import { FModeNavigation } from "@/components/f-mode-navigation";
import { resolveVcsRoute } from "@/routes";
import type {
	RuntimeGitSyncAction,
	RuntimeProjectAddRequest,
	RuntimeProjectSummary,
	RuntimeProjectWorkspaceSummary,
	RuntimeProjectsResponse,
	VcsDetectResponse,
} from "@/runtime/types";
import {
	toRuntimeCurrentQueryState,
	toRuntimeQueryState,
	useAddProjectMutation,
	useGetProjectsQuery,
	useGetVcsDiffQuery,
	useGetVcsDetectQuery,
	useGetVcsWorkspaceStateQuery,
	usePickProjectDirectoryMutation,
	useRemoveProjectMutation,
	useRunGitSyncActionMutation,
} from "@/runtime/vcs-api";
import type { VcsDiffResult, VcsWorkspaceState } from "@/vcs-workspace-contracts";
import type { VcsShellProjectState } from "@/components/vcs-shell";
import { shouldUseNativeDirectoryPicker } from "@/utils/localhost-detection";
import { withWorkspaceParam } from "@/utils/vcs-navigation";
import {
	VCS_F_MODE_ENABLED_STORAGE_KEY,
	readVcsBooleanPreference,
	readVcsMergeEditorPreferences,
	VCS_LAYOUT_STORAGE_KEYS,
	writeVcsBooleanPreference,
	writeVcsMergeEditorPreferences,
	type VcsMergeEditorPreferences,
} from "@/utils/vcs-ui-preferences";
import { readVcsQueryParam, useVcsRouter } from "@/utils/vcs-router";
import "@changeyard/merge/styles.css";

const WorkspaceView = lazy(async () => {
	const mod = await import("@/views/jj-board-view");
	return { default: mod.WorkspaceView };
});
const BranchesView = lazy(async () => {
	const mod = await import("@/views/branches-view");
	return { default: mod.BranchesView };
});
const HistoryView = lazy(async () => {
	const mod = await import("@/views/history-view");
	return { default: mod.HistoryView };
});
const SettingsDialog = lazy(async () => {
	const mod = await import("@/views/settings-view");
	return { default: mod.SettingsDialog };
});

function VcsRouteLoading(): React.ReactElement {
	return <div className="min-h-48 animate-pulse rounded-md bg-surface-1" role="status" aria-label="Loading VCS view" />;
}

function VcsRouteBoundary({ children }: { children: React.ReactNode }): React.ReactElement {
	return <Suspense fallback={<VcsRouteLoading />}>{children}</Suspense>;
}

const DIRECTORY_PICKER_UNAVAILABLE_MARKERS = [
	"could not open directory picker",
	'install "zenity" or "kdialog"',
	'install powershell ("powershell" or "pwsh")',
	'command "osascript" is not available',
] as const;

function findProjectWorkspaceByPath(
	project: RuntimeProjectSummary | null,
	workspacePath: string | null,
): { workspace: RuntimeProjectWorkspaceSummary; path: string } | null {
	if (!project || !workspacePath) {
		return null;
	}
	for (const workspace of project.workspaces ?? []) {
		if (workspace.name === "default") {
			continue;
		}
		const resolvedPath = resolveWorkspaceProjectPath(project.path, workspace);
		if (resolvedPath === workspacePath) {
			return { workspace, path: resolvedPath };
		}
	}
	return null;
}

function isDirectoryPickerUnavailableError(message: string | null | undefined): boolean {
	if (!message) {
		return false;
	}
	const normalized = message.trim().toLowerCase();
	if (!normalized) {
		return false;
	}
	return DIRECTORY_PICKER_UNAVAILABLE_MARKERS.some((marker) => normalized.includes(marker));
}

export default function App(): React.ReactElement {
	const { location, navigate, setQueryParam } = useVcsRouter();
	const currentPath = location.pathname;
	const route = resolveVcsRoute(currentPath);
	const urlWorkspaceId = readVcsQueryParam(location.search, "workspaceId");
	const urlWorkspacePath = readVcsQueryParam(location.search, "workspacePath");
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => urlWorkspaceId);
	const [isProjectNavCollapsed, setProjectNavCollapsedState] = useState(() =>
		readVcsBooleanPreference(VCS_LAYOUT_STORAGE_KEYS.projectNavCollapsed, false),
	);
	const [fModeEnabled, setFModeEnabledState] = useState(() =>
		readVcsBooleanPreference(VCS_F_MODE_ENABLED_STORAGE_KEY, false),
	);
	const [mergeEditorPreferences, setMergeEditorPreferencesState] = useState<VcsMergeEditorPreferences>(() =>
		readVcsMergeEditorPreferences(),
	);
	const [removingProjectId, setRemovingProjectId] = useState<string | null>(null);
	const [optimisticallyRemovedProjectIds, setOptimisticallyRemovedProjectIds] = useState<Set<string>>(() => new Set());
	const [isAddProjectDialogOpen, setAddProjectDialogOpen] = useState(false);
	const [isSettingsOpen, setSettingsOpen] = useState(false);
	const [pendingNativeGitInitPath, setPendingNativeGitInitPath] = useState<string | null>(null);
	const [runningGitAction, setRunningGitAction] = useState<RuntimeGitSyncAction | null>(null);

	useEffect(() => {
		setSelectedProjectId(urlWorkspaceId);
	}, [urlWorkspaceId]);

	const projectsResult = useGetProjectsQuery();
	const [pickProjectDirectory] = usePickProjectDirectoryMutation();
	const [addProjectMutation] = useAddProjectMutation();
	const [removeProjectMutation] = useRemoveProjectMutation();
	const [runGitSyncActionMutation] = useRunGitSyncActionMutation();
	const projectsQuery = {
		state: toRuntimeQueryState<RuntimeProjectsResponse>(projectsResult, "Failed to load projects."),
		refresh: () => void projectsResult.refetch(),
	};
	const workspaceId = selectedProjectId ?? (projectsQuery.state.status === "ready" ? projectsQuery.state.data.currentProjectId : null);
	const currentProject = useMemo(() => {
		if (projectsQuery.state.status !== "ready" || !workspaceId) {
			return null;
		}
		return projectsQuery.state.data.projects.find((project) => project.id === workspaceId) ?? null;
	}, [projectsQuery.state, workspaceId]);
	const activeWorkspace = useMemo(
		() => findProjectWorkspaceByPath(currentProject, urlWorkspacePath),
		[currentProject, urlWorkspacePath],
	);
	const activeWorkspacePath = activeWorkspace?.path ?? null;
	const effectiveWorkspacePath = activeWorkspacePath ?? currentProject?.path ?? null;
	const visibleProjectsState = useMemo(() => {
		if (projectsQuery.state.status !== "ready" || optimisticallyRemovedProjectIds.size === 0) {
			return projectsQuery.state;
		}
		return {
			...projectsQuery.state,
			data: {
				...projectsQuery.state.data,
				projects: projectsQuery.state.data.projects.filter((project) => !optimisticallyRemovedProjectIds.has(project.id)),
			},
		};
	}, [optimisticallyRemovedProjectIds, projectsQuery.state]);

	useEffect(() => {
		if (route.kind !== "settings") {
			return;
		}
		setSettingsOpen(true);
		navigate(withWorkspaceParam("/vcs", workspaceId, activeWorkspacePath), { replace: true });
	}, [activeWorkspacePath, navigate, route.kind, workspaceId]);

	useEffect(() => {
		if (!urlWorkspacePath || projectsQuery.state.status !== "ready" || !currentProject) {
			return;
		}
		if (!findProjectWorkspaceByPath(currentProject, urlWorkspacePath)) {
			setQueryParam("workspacePath", null, { replace: true });
		}
	}, [currentProject, projectsQuery.state.status, setQueryParam, urlWorkspacePath]);

	function updateProjectLocation(projectId: string | null, workspacePath: string | null): void {
		const params = new URLSearchParams(location.search);
		if (projectId) {
			params.set("workspaceId", projectId);
		} else {
			params.delete("workspaceId");
		}
		if (workspacePath) {
			params.set("workspacePath", workspacePath);
		} else {
			params.delete("workspacePath");
		}
		const nextSearch = params.toString();
		navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`, { replace: true });
	}

	useEffect(() => {
		if (selectedProjectId || projectsQuery.state.status !== "ready") {
			return;
		}
		const nextProjectId = projectsQuery.state.data.currentProjectId ?? projectsQuery.state.data.projects[0]?.id ?? null;
		if (nextProjectId) {
			setSelectedProjectId(nextProjectId);
			updateProjectLocation(nextProjectId, null);
		}
	}, [projectsQuery.state, selectedProjectId]);

	useEffect(() => {
		if (projectsQuery.state.status !== "ready" || optimisticallyRemovedProjectIds.size === 0) {
			return;
		}
		const remainingIds = new Set(projectsQuery.state.data.projects.map((project) => project.id));
		const nextHiddenIds = new Set(
			Array.from(optimisticallyRemovedProjectIds).filter((projectId) => remainingIds.has(projectId)),
		);
		if (nextHiddenIds.size !== optimisticallyRemovedProjectIds.size) {
			setOptimisticallyRemovedProjectIds(nextHiddenIds);
		}
	}, [optimisticallyRemovedProjectIds, projectsQuery.state]);

	function selectProject(projectId: string): void {
		setSelectedProjectId(projectId);
		updateProjectLocation(projectId, null);
	}

	function selectProjectWorkspace(projectId: string, workspacePath: string): void {
		setSelectedProjectId(projectId);
		updateProjectLocation(projectId, workspacePath);
	}

	function setProjectNavCollapsed(collapsed: boolean): void {
		setProjectNavCollapsedState(writeVcsBooleanPreference(VCS_LAYOUT_STORAGE_KEYS.projectNavCollapsed, collapsed));
	}

	function setFModeEnabled(enabled: boolean): void {
		setFModeEnabledState(writeVcsBooleanPreference(VCS_F_MODE_ENABLED_STORAGE_KEY, enabled));
	}

	function updateMergeEditorPreferences(patch: Partial<VcsMergeEditorPreferences>): void {
		setMergeEditorPreferencesState((current) => writeVcsMergeEditorPreferences({ ...current, ...patch }));
	}

	function replaceMergeEditorPreferences(preferences: VcsMergeEditorPreferences): void {
		setMergeEditorPreferencesState(writeVcsMergeEditorPreferences(preferences));
	}

	function handleAddProjectSuccess(projectId: string): void {
		setPendingNativeGitInitPath(null);
		selectProject(projectId);
		projectsQuery.refresh();
	}

	async function addProject(): Promise<void> {
		setPendingNativeGitInitPath(null);
		if (!shouldUseNativeDirectoryPicker()) {
			setAddProjectDialogOpen(true);
			return;
		}

		try {
			const picked = await pickProjectDirectory({ workspaceId }).unwrap();
			if (picked.ok && picked.path) {
				const added = await addProjectMutation({
					workspaceId,
					input: { path: picked.path } satisfies RuntimeProjectAddRequest,
				}).unwrap();
				if (!added.ok || !added.project) {
					if (added.requiresGitInitialization) {
						setPendingNativeGitInitPath(picked.path);
						setAddProjectDialogOpen(true);
						return;
					}
					throw new Error(added.error ?? "Could not add project.");
				}
				handleAddProjectSuccess(added.project.id);
				return;
			}
			if (!picked.ok && picked.error === "No directory was selected.") {
				return;
			}
			if (!picked.ok && isDirectoryPickerUnavailableError(picked.error)) {
				setAddProjectDialogOpen(true);
				return;
			}
			throw new Error(picked.error ?? "Could not pick project directory.");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (isDirectoryPickerUnavailableError(message)) {
				setAddProjectDialogOpen(true);
			} else {
				showAppToast({ intent: "danger", icon: "warning-sign", message, timeout: 7000 });
			}
		}
	}

	async function removeProject(projectId: string): Promise<boolean> {
		if (removingProjectId) {
			return false;
		}
		setRemovingProjectId(projectId);
		try {
			const result = await removeProjectMutation({ projectId, workspaceId }).unwrap();
			if (!result.ok) {
				throw new Error(result.error ?? "Could not remove project.");
			}
			if (workspaceId === projectId) {
				setSelectedProjectId(null);
				updateProjectLocation(null, null);
			}
			projectsQuery.refresh();
			return true;
		} catch (error) {
			notifyError(error instanceof Error ? error.message : String(error));
			return false;
		} finally {
			setRemovingProjectId((current) => (current === projectId ? null : current));
		}
	}

	async function clearOtherProjects(): Promise<boolean> {
		if (projectsQuery.state.status !== "ready" || !workspaceId) {
			return false;
		}
		const projectsToRemove = projectsQuery.state.data.projects.filter((project) => project.id !== workspaceId);
		if (projectsToRemove.length === 0) {
			return false;
		}
		setSelectedProjectId(workspaceId);
		updateProjectLocation(workspaceId, null);
		const projectIdsToRemove = new Set(projectsToRemove.map((project) => project.id));
		setOptimisticallyRemovedProjectIds(projectIdsToRemove);
		try {
			for (const project of projectsToRemove) {
				setRemovingProjectId(project.id);
				const result = await removeProjectMutation({ projectId: project.id, workspaceId }).unwrap();
				if (!result.ok) {
					throw new Error(result.error ?? `Could not remove ${project.name}.`);
				}
			}
			projectsQuery.refresh();
			return true;
		} catch (error) {
			setOptimisticallyRemovedProjectIds(new Set());
			notifyError(error instanceof Error ? error.message : String(error));
			projectsQuery.refresh();
			return false;
		} finally {
			setRemovingProjectId(null);
		}
	}

	const hasWorkspace = Boolean(workspaceId);
	const activeWorkspaceQuery = { workspaceId: workspaceId ?? "", workspacePath: activeWorkspacePath };
	const detectResult = useGetVcsDetectQuery(activeWorkspaceQuery, { skip: !hasWorkspace });
	const workspaceDiffResult = useGetVcsDiffQuery(activeWorkspaceQuery, { skip: !hasWorkspace });
	const workspaceStateResult = useGetVcsWorkspaceStateQuery(activeWorkspaceQuery, { skip: !hasWorkspace });
	const detectQuery = {
		state: toRuntimeCurrentQueryState<VcsDetectResponse>(detectResult, "Failed to load VCS detection."),
	};
	const workspaceDiffQuery = {
		state: toRuntimeCurrentQueryState<VcsDiffResult>(workspaceDiffResult, "Failed to load workspace diff."),
	};
	const workspaceStateQuery = {
		state: toRuntimeCurrentQueryState<VcsWorkspaceState>(workspaceStateResult, "Failed to load workspace state."),
	};

	async function runHeaderGitAction(action: RuntimeGitSyncAction): Promise<void> {
		if (!workspaceId || runningGitAction) {
			return;
		}
		const currentWorkspaceState = workspaceStateQuery.state.status === "ready" ? workspaceStateQuery.state.data : null;
		const targetRef =
			action === "push"
				? currentWorkspaceState?.sync?.targetRef ?? currentWorkspaceState?.targetRef ?? null
				: null;
		setRunningGitAction(action);
		try {
			const result = await runGitSyncActionMutation({
				workspaceId,
				workspacePath: activeWorkspacePath,
				action,
				targetRef,
			}).unwrap();
			if (!result.ok) {
				notifyError(result.error ?? `${action} failed.`);
				return;
			}
			await Promise.all([workspaceStateResult.refetch(), workspaceDiffResult.refetch()]);
		} catch (error) {
			notifyError(error instanceof Error ? error.message : String(error));
		} finally {
			setRunningGitAction(null);
		}
	}

	const projectState = {
		projectsState: visibleProjectsState,
		currentProject,
		currentProjectId: workspaceId,
		activeWorkspacePath,
		removingProjectId,
		isProjectNavCollapsed,
		onProjectNavCollapsedChange: setProjectNavCollapsed,
		onSelectProject: selectProject,
		onSelectProjectWorkspace: selectProjectWorkspace,
		onAddProject: () => void addProject(),
		onRemoveProject: removeProject,
		onClearOtherProjects: clearOtherProjects,
		onOpenSettings: () => setSettingsOpen(true),
		runningGitAction,
		onGitFetch: () => void runHeaderGitAction("fetch"),
		onGitPull: () => void runHeaderGitAction("pull"),
		onGitPush: () => void runHeaderGitAction("push"),
		repositoryStatus: {
			workspacePath: effectiveWorkspacePath,
			workspaceState: workspaceStateQuery.state,
			diffState: workspaceDiffQuery.state,
		},
	};

	let routedView: React.ReactElement;
	if (hasWorkspace && workspaceStateQuery.state.status === "loading") {
		routedView = (
			<WorkspaceView
				currentPath={currentPath}
				projectState={projectState}
				workspaceId={workspaceId}
				state={workspaceStateQuery.state}
				diffState={workspaceDiffQuery.state}
				onWorkspaceStateRefresh={async () => {
					await workspaceStateResult.refetch();
				}}
				mergeEditorPreferences={mergeEditorPreferences}
				onMergeEditorPreferencesChange={updateMergeEditorPreferences}
			/>
		);
	} else {
		switch (route.kind) {
		case "jj-board":
			routedView = (
				<WorkspaceView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
					state={workspaceStateQuery.state}
					diffState={workspaceDiffQuery.state}
					onWorkspaceStateRefresh={async () => {
						await workspaceStateResult.refetch();
					}}
					mergeEditorPreferences={mergeEditorPreferences}
					onMergeEditorPreferencesChange={updateMergeEditorPreferences}
				/>
			);
			break;
		case "jj-branches":
			routedView = (
				<BranchesView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
				/>
			);
			break;
		case "jj-history":
			routedView = (
				<HistoryView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
				/>
			);
			break;
		case "settings":
		default:
			routedView = (
				<WorkspaceView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
					state={workspaceStateQuery.state}
					diffState={workspaceDiffQuery.state}
					onWorkspaceStateRefresh={async () => {
						await workspaceStateResult.refetch();
					}}
					mergeEditorPreferences={mergeEditorPreferences}
					onMergeEditorPreferencesChange={updateMergeEditorPreferences}
				/>
			);
			break;
		}
	}

	return (
		<>
			<FModeNavigation enabled={fModeEnabled} />
			<VcsRouteBoundary>{routedView}</VcsRouteBoundary>
			<AddProjectDialog
				open={isAddProjectDialogOpen}
				onOpenChange={(open) => {
					if (!open) {
						setPendingNativeGitInitPath(null);
					}
					setAddProjectDialogOpen(open);
				}}
				onProjectAdded={handleAddProjectSuccess}
				currentProjectId={workspaceId}
				initialGitInitPath={pendingNativeGitInitPath}
			/>
			{isSettingsOpen ? (
				<VcsRouteBoundary>
					<SettingsDialog
						open={isSettingsOpen}
						onOpenChange={setSettingsOpen}
						projectState={projectState}
						workspaceId={workspaceId}
						state={detectQuery.state}
						fModeEnabled={fModeEnabled}
						onFModeEnabledChange={setFModeEnabled}
						mergeEditorPreferences={mergeEditorPreferences}
						onMergeEditorPreferencesChange={replaceMergeEditorPreferences}
					/>
				</VcsRouteBoundary>
			) : null}
		</>
	);
}
