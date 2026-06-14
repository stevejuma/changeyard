import { GitBranch, History, Layers3, LayoutDashboard, Settings, Terminal, Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { VcsProjectNavigationPanel } from "@/components/project-navigation-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { VcsConsolePanel } from "@/components/vcs-console-panel";
import { ResizableBottomPane } from "@/resize/resizable-bottom-pane";
import type { QueryState, RuntimeProjectSummary, RuntimeProjectsResponse } from "@/runtime/types";
import { readVcsNumberPreference, VCS_LAYOUT_STORAGE_KEYS, writeVcsNumberPreference } from "@/utils/vcs-ui-preferences";
import { isVcsNavItemActive, withWorkspaceParam } from "@/utils/vcs-navigation";
import { shouldHandleVcsLinkClick, useVcsRouter } from "@/utils/vcs-router";

const navItems = [
	{ href: "/vcs/jj", label: "Workspace", icon: Layers3 },
	{ href: "/vcs/jj/branches", label: "Branches", icon: GitBranch },
	{ href: "/vcs/jj/history", label: "History", icon: History },
] as const;

const surfaceLinks = [
	{ href: "/", label: "Dashboard", icon: LayoutDashboard },
	{ href: "/kanban", label: "Kanban", icon: Workflow },
] as const;

const CONSOLE_HEIGHT_LIMITS = {
	min: 220,
	max: 760,
	fallback: 280,
	key: VCS_LAYOUT_STORAGE_KEYS.consoleHeight,
} as const;

export type VcsShellProjectState = {
	projectsState: QueryState<RuntimeProjectsResponse>;
	currentProject: RuntimeProjectSummary | null;
	currentProjectId: string | null;
	removingProjectId: string | null;
	isProjectNavCollapsed: boolean;
	onProjectNavCollapsedChange: (collapsed: boolean) => void;
	onSelectProject: (projectId: string) => void;
	onAddProject: () => void;
	onRemoveProject: (projectId: string) => Promise<boolean>;
	onClearOtherProjects: () => Promise<boolean>;
	onOpenSettings: () => void;
};

export function VcsShell({
	projectState,
	currentPath,
	title: _title,
	subtitle: _subtitle,
	kicker: _kicker,
	actions,
	children,
}: {
	projectState: VcsShellProjectState;
	currentPath: string;
	title: string;
	subtitle?: ReactNode;
	kicker?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
}): React.ReactElement {
	const { navigate } = useVcsRouter();
	const [isConsoleOpen, setConsoleOpen] = useState(false);
	const [consoleHeight, setConsoleHeight] = useState(() =>
		readVcsNumberPreference(CONSOLE_HEIGHT_LIMITS.key, CONSOLE_HEIGHT_LIMITS.fallback, CONSOLE_HEIGHT_LIMITS.min, CONSOLE_HEIGHT_LIMITS.max),
	);
	const projectName = projectState.currentProject?.name ?? "No project selected";

	return (
		<div className="flex h-screen min-h-0 bg-surface-0 text-text-primary">
			<VcsProjectNavigationPanel
				projectsState={projectState.projectsState}
				currentProjectId={projectState.currentProjectId}
				removingProjectId={projectState.removingProjectId}
				isCollapsed={projectState.isProjectNavCollapsed}
				onCollapsedChange={projectState.onProjectNavCollapsedChange}
				onSelectProject={projectState.onSelectProject}
				onAddProject={projectState.onAddProject}
				onRemoveProject={projectState.onRemoveProject}
				onClearOtherProjects={projectState.onClearOtherProjects}
			/>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex min-h-[49px] shrink-0 items-center justify-between gap-3 border-b border-divider bg-surface-1 px-3">
					<div className="flex min-w-0 items-center gap-3">
						<div className="min-w-0">
							<h1 className="truncate text-sm font-semibold text-text-primary">{projectName}</h1>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<nav className="hidden items-center gap-1 lg:flex" aria-label="VCS views">
							{navItems.map((item) => {
								const Icon = item.icon;
								const active = isVcsNavItemActive(item.href, currentPath);
								const href = withWorkspaceParam(item.href, projectState.currentProjectId);
								return (
									<a
										key={item.href}
										href={href}
										onClick={(event) => {
											if (!shouldHandleVcsLinkClick(event)) {
												return;
											}
											event.preventDefault();
											navigate(href);
										}}
										aria-current={active ? "page" : undefined}
										className={cn(
											"inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary",
											active && "bg-surface-3 text-text-primary",
										)}
									>
										<Icon size={14} />
										<span>{item.label}</span>
									</a>
								);
							})}
						</nav>
						<div className="hidden h-5 w-px bg-border lg:block" />
						<nav className="hidden items-center gap-1 lg:flex" aria-label="Changeyard surfaces">
							{surfaceLinks.map((item) => {
								const Icon = item.icon;
								return (
									<a
										key={item.href}
										href={item.href}
										data-changeyard-surface-link
										className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary"
									>
										<Icon size={14} />
										<span>{item.label}</span>
									</a>
								);
							})}
						</nav>
						{actions}
						<Button
							variant="ghost"
							size="sm"
							icon={<Settings size={14} />}
							aria-label="Open settings"
							title="Open settings"
							onClick={projectState.onOpenSettings}
						>
							Settings
						</Button>
						<Button
							variant="default"
							size="sm"
							icon={<Terminal size={14} />}
							disabled={!projectState.currentProjectId}
							aria-label={isConsoleOpen ? "Close console" : "Open console"}
							title={projectState.currentProjectId ? (isConsoleOpen ? "Close console" : "Open console") : "Select a project to open console"}
							onClick={() => setConsoleOpen((current) => !current)}
						/>
					</div>
				</header>
				<nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface-1 px-2 py-2 lg:hidden" aria-label="VCS views">
					{navItems.map((item) => {
						const Icon = item.icon;
						const active = isVcsNavItemActive(item.href, currentPath);
						const href = withWorkspaceParam(item.href, projectState.currentProjectId);
						return (
							<a
								key={item.href}
								href={href}
								onClick={(event) => {
									if (!shouldHandleVcsLinkClick(event)) {
										return;
									}
									event.preventDefault();
									navigate(href);
								}}
								className={cn(
									"inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium",
									active
										? "border-border-bright bg-surface-3 text-text-primary"
										: "border-transparent bg-transparent text-text-secondary hover:bg-surface-3 hover:text-text-primary",
								)}
							>
								<Icon size={14} />
								{item.label}
							</a>
						);
					})}
					<button
						type="button"
						onClick={projectState.onOpenSettings}
						className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary"
					>
						<Settings size={14} />
						Settings
					</button>
					{surfaceLinks.map((item) => {
						const Icon = item.icon;
						return (
							<a
								key={item.href}
								href={item.href}
								data-changeyard-surface-link
								className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary"
							>
								<Icon size={14} />
								{item.label}
							</a>
						);
					})}
				</nav>
				<main className="min-h-0 flex-1 overflow-hidden bg-surface-0">{children}</main>
				{isConsoleOpen ? (
					<ResizableBottomPane
						minHeight={CONSOLE_HEIGHT_LIMITS.min}
						initialHeight={consoleHeight}
						onHeightChange={(height) => {
							const normalized = writeVcsNumberPreference(
								CONSOLE_HEIGHT_LIMITS.key,
								height,
								CONSOLE_HEIGHT_LIMITS.min,
								CONSOLE_HEIGHT_LIMITS.max,
							);
							setConsoleHeight(normalized);
						}}
					>
						<VcsConsolePanel
							workspaceId={projectState.currentProjectId}
							workspaceName={projectState.currentProject?.name ?? null}
							onClose={() => setConsoleOpen(false)}
						/>
					</ResizableBottomPane>
				) : null}
			</div>
		</div>
	);
}

export function NoProjectSelected({
	title = "Select a project",
	children = "Choose a Git or JJ project from the project rail to load VCS data.",
	action,
}: {
	title?: string;
	children?: ReactNode;
	action?: ReactNode;
}): React.ReactElement {
	return (
		<div className="flex h-full items-center justify-center p-4">
			<div className="w-full max-w-md rounded-lg border border-border bg-surface-1 p-4 text-center shadow-sm">
				<div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-md border border-border bg-surface-2 text-accent">
					<Workflow size={18} />
				</div>
				<h2 className="text-sm font-semibold text-text-primary">{title}</h2>
				<div className="mt-2 text-[13px] leading-5 text-text-secondary">{children}</div>
				{action ? <div className="mt-3 flex justify-center">{action}</div> : null}
			</div>
		</div>
	);
}

export function SelectProjectButton({ onClick }: { onClick: () => void }): React.ReactElement {
	return (
		<Button variant="primary" size="sm" onClick={onClick}>
			Add Project
		</Button>
	);
}
