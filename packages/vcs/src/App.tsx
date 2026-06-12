import { useEffect, useMemo, useState } from "react";

import { resolveVcsRoute } from "@/routes";
import type {
	RuntimeProjectAddResponse,
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
	const [isProjectNavCollapsed, setProjectNavCollapsed] = useState(false);
	const [removingProjectId, setRemovingProjectId] = useState<string | null>(null);

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

	function selectProject(projectId: string): void {
		setSelectedProjectId(projectId);
		writeWorkspaceIdToLocation(projectId);
	}

	async function addProject(): Promise<void> {
		const rawPath = window.prompt("Project path");
		const projectPath = rawPath?.trim();
		if (!projectPath) {
			return;
		}
		const result = await postTrpcMutation<RuntimeProjectAddResponse>(
			"projects.add",
			{ path: projectPath },
			workspaceId,
		);
		if (!result.ok || !result.project) {
			window.alert(result.error ?? "Could not add project.");
			return;
		}
		selectProject(result.project.id);
		projectsQuery.refresh();
	}

	async function removeProject(projectId: string): Promise<void> {
		const projectName = projectsQuery.state.status === "ready"
			? projectsQuery.state.data.projects.find((project) => project.id === projectId)?.name
			: null;
		if (!window.confirm(`Remove ${projectName ?? "this project"} from ChangeYard?`)) {
			return;
		}
		setRemovingProjectId(projectId);
		try {
			const result = await postTrpcMutation<RuntimeProjectRemoveResponse>(
				"projects.remove",
				{ projectId },
				workspaceId,
			);
			if (!result.ok) {
				window.alert(result.error ?? "Could not remove project.");
				return;
			}
			if (workspaceId === projectId) {
				setSelectedProjectId(null);
				writeWorkspaceIdToLocation(null);
			}
			projectsQuery.refresh();
		} finally {
			setRemovingProjectId(null);
		}
	}

	const projectState = {
		projectsState: projectsQuery.state,
		currentProject,
		currentProjectId: workspaceId,
		removingProjectId,
		isProjectNavCollapsed,
		onProjectNavCollapsedChange: setProjectNavCollapsed,
		onSelectProject: selectProject,
		onAddProject: () => void addProject(),
		onRemoveProject: (projectId: string) => void removeProject(projectId),
	};
	const hasWorkspace = Boolean(workspaceId);
	const detectQuery = useTrpcQuery<VcsDetectResponse>("vcs.detect", "Failed to load VCS detection.", workspaceId, hasWorkspace);
	const jjDiffQuery = useTrpcQuery<VcsJjDiffResponse>("vcs.jjDiff", "Failed to load JJ diff.", workspaceId, hasWorkspace);
	const jjStateQuery = useTrpcQuery<VcsJjStateResponse>("vcs.jjState", "Failed to load JJ state.", workspaceId, hasWorkspace);

	switch (route.kind) {
		case "jj-board":
			return (
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
		case "jj-branches":
			return (
				<BranchesView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
				/>
			);
		case "jj-history":
			return (
				<HistoryView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
				/>
			);
		case "settings":
			return (
				<SettingsView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
					state={detectQuery.state}
				/>
			);
		default:
			return (
				<LandingView
					currentPath={currentPath}
					projectState={projectState}
					workspaceId={workspaceId}
					state={detectQuery.state}
				/>
			);
	}
}
