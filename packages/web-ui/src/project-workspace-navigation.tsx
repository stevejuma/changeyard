import type { ReactElement } from "react";

import { cn } from "./cn";

export type ProjectWorkspaceNavigationWorkspace = {
	id: string;
	title: string;
	status?: string;
	engine?: string;
	name?: string;
	path?: string;
	branch?: string;
};

export function formatProjectPath(path: string): string {
	const home = typeof window !== "undefined" ? "" : "";
	return home && path.startsWith(home) ? path.replace(home, "~") : path;
}

export function workspaceDisplayName(workspace: ProjectWorkspaceNavigationWorkspace): string {
	return workspace.name ?? workspace.branch ?? workspace.title;
}

export function resolveWorkspaceProjectPath(
	projectPath: string,
	workspace: ProjectWorkspaceNavigationWorkspace,
): string | null {
	if (!workspace.path) {
		return null;
	}
	if (/^(?:\/|[a-zA-Z]:[\\/])/.test(workspace.path)) {
		return workspace.path;
	}
	const basePath = projectPath.replace(/[\\/]+$/, "");
	const relativePath = workspace.path.replace(/^[.][\\/]/, "");
	return `${basePath}/${relativePath}`;
}

export function workspaceDetail(
	projectPath: string,
	workspace: ProjectWorkspaceNavigationWorkspace,
): string {
	const workspacePath = workspace.path ? resolveWorkspaceProjectPath(projectPath, workspace) : null;
	if (workspacePath) {
		return formatProjectPath(workspacePath);
	}
	return workspace.branch ?? workspace.engine ?? workspace.status ?? "";
}

export function ProjectWorkspaceList({
	projectPath,
	workspaces,
	activeWorkspacePath,
	onSelectWorkspace,
	className,
}: {
	projectPath: string;
	workspaces: ProjectWorkspaceNavigationWorkspace[];
	activeWorkspacePath: string | null;
	onSelectWorkspace: (workspacePath: string) => void;
	className?: string;
}): ReactElement | null {
	const visibleWorkspaces = workspaces.filter((workspace) => workspace.name !== "default");
	if (visibleWorkspaces.length === 0) {
		return null;
	}
	return (
		<div className={cn("cy-project-workspace-list", className)}>
			{visibleWorkspaces.map((workspace) => {
				const projectWorkspacePath = resolveWorkspaceProjectPath(projectPath, workspace);
				const detail = workspaceDetail(projectPath, workspace);
				const isActive = Boolean(projectWorkspacePath && projectWorkspacePath === activeWorkspacePath);
				return (
					<button
						type="button"
						key={workspace.id}
						className={cn("cy-project-workspace-item", isActive && "is-active")}
						disabled={!projectWorkspacePath}
						onClick={() => {
							if (projectWorkspacePath) {
								onSelectWorkspace(projectWorkspacePath);
							}
						}}
						title={detail ? `${workspace.title} · ${detail}` : workspace.title}
					>
						<div className="cy-project-workspace-name">{workspaceDisplayName(workspace)}</div>
						{detail ? <div className="cy-project-workspace-detail">{detail}</div> : null}
					</button>
				);
			})}
		</div>
	);
}
