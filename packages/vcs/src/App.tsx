import { useEffect, useMemo, useState } from "react";

import { AddProjectDialog } from "@/components/add-project-dialog";
import { notifyError, showAppToast } from "@/components/app-toaster";
import { resolveVcsRoute } from "@/routes";
import type {
	RuntimeProjectAddRequest,
	RuntimeProjectAddResponse,
	RuntimeProjectDirectoryPickerResponse,
	RuntimeProjectRemoveResponse,
	RuntimeProjectsResponse,
	VcsDetectResponse,
	VcsJjDiffResponse,
	VcsJjStateResponse,
} from "@/runtime/types";
import { postTrpcMutation, useTrpcQuery } from "@/runtime/trpc-client";
import { BranchesView } from "@/views/branches-view";
import { HistoryView } from "@/views/history-view";
import { JjBoardView } from "@/views/jj-board-view";
import { LandingView } from "@/views/landing-view";
import { SettingsView } from "@/views/settings-view";
import { isLocalhostAccess } from "@/utils/localhost-detection";
import {
	readVcsBooleanPreference,
	VCS_LAYOUT_STORAGE_KEYS,
	writeVcsBooleanPreference,
} from "@/utils/vcs-ui-preferences";

const DIRECTORY_PICKER_UNAVAILABLE_MARKERS = [
	"could not open directory picker",
	'install "zenity" or "kdialog"',
	'install powershell ("powershell" or "pwsh")',
	'command "osascript" is not available',
] as const;

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

function readWorkspaceIdFromLocation(): string | null {
	const params = new URLSearchParams(window.location.search);
	return params.get("workspaceId")?.trim() || null;
}

function writeWorkspaceIdToLocation(workspaceId: string | null): void {
	const url = new URL(window.location.href);
	if (workspaceId) {
		url.searchParams.set("workspaceId", workspaceId);
	} else {
		url.searchParams.delete("workspaceId");
	}
	window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function App(): React.ReactElement {
	const currentPath = window.location.pathname;
	const route = resolveVcsRoute(currentPath);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => readWorkspaceIdFromLocation());
	const [isProjectNavCollapsed, setProjectNavCollapsedState] = useState(() =>
		readVcsBooleanPreference(VCS_LAYOUT_STORAGE_KEYS.projectNavCollapsed, false),
	);
	const [removingProjectId, setRemovingProjectId] = useState<string | null>(null);
	const [optimisticallyRemovedProjectIds, setOptimisticallyRemovedProjectIds] = useState<Set<string>>(() => new Set());
	const [isAddProjectDialogOpen, setAddProjectDialogOpen] = useState(false);
	const [pendingNativeGitInitPath, setPendingNativeGitInitPath] = useState<string | null>(null);

	const projectsQuery = useTrpcQuery<RuntimeProjectsResponse>(
		"projects.list",
		"Failed to load projects.",
		selectedProjectId,
	);
	const workspaceId = selectedProjectId ?? (projectsQuery.state.status === "ready" ? projectsQuery.state.data.currentProjectId : null);
	const currentProject = useMemo(() => {
		if (projectsQuery.state.status !== "ready" || !workspaceId) {
			return null;
		}
		return projectsQuery.state.data.projects.find((project) => project.id === workspaceId) ?? null;
	}, [projectsQuery.state, workspaceId]);
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
		if (selectedProjectId || projectsQuery.state.status !== "ready") {
			return;
		}
		const nextProjectId = projectsQuery.state.data.currentProjectId ?? projectsQuery.state.data.projects[0]?.id ?? null;
		if (nextProjectId) {
			setSelectedProjectId(nextProjectId);
			writeWorkspaceIdToLocation(nextProjectId);
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
		writeWorkspaceIdToLocation(projectId);
	}

	function setProjectNavCollapsed(collapsed: boolean): void {
		setProjectNavCollapsedState(writeVcsBooleanPreference(VCS_LAYOUT_STORAGE_KEYS.projectNavCollapsed, collapsed));
	}

	function handleAddProjectSuccess(projectId: string): void {
		setPendingNativeGitInitPath(null);
		selectProject(projectId);
		projectsQuery.refresh();
	}

	async function addProject(): Promise<void> {
		setPendingNativeGitInitPath(null);
		if (!isLocalhostAccess()) {
			setAddProjectDialogOpen(true);
			return;
		}

		try {
			const picked = await postTrpcMutation<RuntimeProjectDirectoryPickerResponse>(
				"projects.pickDirectory",
				{},
				workspaceId,
			);
			if (picked.ok && picked.path) {
				const added = await postTrpcMutation<RuntimeProjectAddResponse>(
					"projects.add",
					{ path: picked.path } satisfies RuntimeProjectAddRequest,
					workspaceId,
				);
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
			const result = await postTrpcMutation<RuntimeProjectRemoveResponse>(
				"projects.remove",
				{ projectId },
				workspaceId,
			);
			if (!result.ok) {
				throw new Error(result.error ?? "Could not remove project.");
			}
			if (workspaceId === projectId) {
				setSelectedProjectId(null);
				writeWorkspaceIdToLocation(null);
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
		writeWorkspaceIdToLocation(workspaceId);
		const projectIdsToRemove = new Set(projectsToRemove.map((project) => project.id));
		setOptimisticallyRemovedProjectIds(projectIdsToRemove);
		try {
			for (const project of projectsToRemove) {
				setRemovingProjectId(project.id);
				const result = await postTrpcMutation<RuntimeProjectRemoveResponse>(
					"projects.remove",
					{ projectId: project.id },
					workspaceId,
				);
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

	const projectState = {
		projectsState: visibleProjectsState,
		currentProject,
		currentProjectId: workspaceId,
		removingProjectId,
		isProjectNavCollapsed,
		onProjectNavCollapsedChange: setProjectNavCollapsed,
		onSelectProject: selectProject,
		onAddProject: () => void addProject(),
		onRemoveProject: removeProject,
		onClearOtherProjects: clearOtherProjects,
	};
	const hasWorkspace = Boolean(workspaceId);
	const detectQuery = useTrpcQuery<VcsDetectResponse>("vcs.detect", "Failed to load VCS detection.", workspaceId, hasWorkspace);
	const jjDiffQuery = useTrpcQuery<VcsJjDiffResponse>("vcs.jjDiff", "Failed to load JJ diff.", workspaceId, hasWorkspace);
	const jjStateQuery = useTrpcQuery<VcsJjStateResponse>("vcs.jjState", "Failed to load JJ state.", workspaceId, hasWorkspace);

	let routedView: React.ReactElement;
	switch (route.kind) {
		case "jj-board":
			routedView = (
				<JjBoardView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
					state={jjStateQuery.state}
					refreshState={jjStateQuery.refresh}
					diffState={jjDiffQuery.state}
					refreshDiff={jjDiffQuery.refresh}
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
			routedView = (
				<SettingsView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
					state={detectQuery.state}
				/>
			);
			break;
		default:
			routedView = (
				<LandingView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
					state={detectQuery.state}
				/>
			);
			break;
	}

	return (
		<>
			{routedView}
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
		</>
	);
}
