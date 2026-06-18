import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronLeft, ChevronRight, Ellipsis, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	formatProjectPath,
	ProjectWorkspaceList,
	resolveWorkspaceProjectPath,
} from "@changeyard/web-ui";

import { Button } from "@/components/ui/button";
import { ClineIcon } from "@/components/ui/cline-icon";
import { cn } from "@/components/ui/cn";
import {
	AlertDialog,
	AlertDialogBody,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { QueryState, RuntimeProjectSummary } from "@/runtime/types";

const COLLAPSED_WIDTH = 52;
const EXPANDED_WIDTH = 260;

interface TaskCountBadge {
	id: string;
	title: string;
	shortLabel: string;
	toneClassName: string;
	count: number;
}

function projectBadgeCount(project: RuntimeProjectSummary): number {
	return project.taskCounts.backlog + project.taskCounts.in_progress + project.taskCounts.review;
}

export function VcsProjectNavigationPanel({
	projectsState,
	currentProjectId,
	removingProjectId,
	isCollapsed,
	onCollapsedChange,
	onSelectProject,
	activeWorkspacePath,
	onSelectProjectWorkspace,
	onAddProject,
	onRemoveProject,
	onClearOtherProjects,
}: {
	projectsState: QueryState<{ currentProjectId: string | null; projects: RuntimeProjectSummary[] }>;
	currentProjectId: string | null;
	removingProjectId: string | null;
	isCollapsed: boolean;
	onCollapsedChange: (collapsed: boolean) => void;
	onSelectProject: (projectId: string) => void;
	activeWorkspacePath: string | null;
	onSelectProjectWorkspace: (projectId: string, workspacePath: string) => void;
	onAddProject: () => void;
	onRemoveProject: (projectId: string) => Promise<boolean>;
	onClearOtherProjects: () => Promise<boolean>;
}): React.ReactElement {
	const [isHeaderMenuOpen, setHeaderMenuOpen] = useState(false);
	const [pendingProjectRemoval, setPendingProjectRemoval] = useState<RuntimeProjectSummary | null>(null);
	const [isClearOtherProjectsOpen, setClearOtherProjectsOpen] = useState(false);
	const [isClearingOtherProjects, setClearingOtherProjects] = useState(false);
	const currentProject =
		projectsState.status === "ready"
			? projectsState.data.projects.find((project) => project.id === currentProjectId) ?? null
			: null;
	const removableProjectCount =
		projectsState.status === "ready"
			? projectsState.data.projects.filter((project) => project.id !== currentProjectId).length
			: 0;
	const isProjectRemovalPending = pendingProjectRemoval !== null && removingProjectId === pendingProjectRemoval.id;
	const pendingProjectTaskCount = pendingProjectRemoval
		? pendingProjectRemoval.taskCounts.backlog +
			pendingProjectRemoval.taskCounts.in_progress +
			pendingProjectRemoval.taskCounts.review +
			pendingProjectRemoval.taskCounts.trash
		: 0;

	if (isCollapsed) {
		return (
			<aside
				className="flex min-h-0 shrink-0 flex-col items-center border-r border-divider bg-surface-1 py-2"
				style={{ width: COLLAPSED_WIDTH }}
			>
				<button
					type="button"
					aria-label="Expand project navigation"
					title="Expand projects"
					className="grid h-9 w-9 place-items-center rounded-md text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
					onClick={() => onCollapsedChange(false)}
				>
					<ChevronRight size={16} />
				</button>
				<button
					type="button"
					title={currentProject?.name ?? "Projects"}
					className="mt-2 flex min-h-0 flex-1 items-center justify-center rounded-md border border-transparent px-1.5 py-2 text-text-secondary hover:border-border hover:bg-surface-2 hover:text-text-primary"
					onClick={() => onCollapsedChange(false)}
				>
					<span className={cn("max-h-full truncate text-[12px] font-semibold [writing-mode:vertical-rl]", currentProject && "text-accent")}>
						{currentProject?.name ?? "Projects"}
					</span>
				</button>
				<button
					type="button"
					aria-label="Add project"
					title="Add project"
					className="mt-auto grid h-9 w-9 place-items-center rounded-md text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
					onClick={onAddProject}
				>
					<Plus size={16} />
				</button>
			</aside>
		);
	}

	return (
		<aside
			className="flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-divider bg-surface-1"
			style={{ width: EXPANDED_WIDTH }}
		>
			<header className="flex min-h-[49px] items-center justify-between px-3">
				<div className="flex min-w-0 items-center gap-2">
					<ClineIcon size={18} className="shrink-0 text-text-primary" />
					<div className="flex min-w-0 items-baseline gap-1.5 text-base font-semibold text-text-primary">
						<span className="truncate">ChangeYard</span>
						<span className="shrink-0 text-xs font-normal text-text-secondary">v{__APP_VERSION__}</span>
					</div>
				</div>
				<div className="relative flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						icon={<Ellipsis size={16} />}
						aria-label="Project navigation menu"
						title="Project menu"
						onClick={() => setHeaderMenuOpen((open) => !open)}
					/>
					<Button
						variant="ghost"
						size="sm"
						icon={<ChevronLeft size={16} />}
						aria-label="Collapse project navigation"
						title="Collapse projects"
						onClick={() => onCollapsedChange(true)}
					/>
					{isHeaderMenuOpen ? (
						<div className="absolute right-0 top-9 z-50 w-56 rounded-md border border-border bg-surface-2 p-1 shadow-xl">
							<button
								type="button"
								className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary disabled:cursor-default disabled:opacity-50"
								disabled={!currentProjectId || removableProjectCount === 0}
								onClick={() => {
									setHeaderMenuOpen(false);
									setClearOtherProjectsOpen(true);
								}}
							>
								<span>Clear all but current</span>
								<span className="text-text-tertiary">{removableProjectCount}</span>
							</button>
						</div>
					) : null}
				</div>
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-1">
				{projectsState.status === "loading" ? (
					<div className="space-y-1" aria-label="Loading projects" role="status">
						{Array.from({ length: 5 }, (_, index) => (
							<ProjectRowSkeleton key={`project-row-skeleton-${index}`} />
						))}
					</div>
				) : null}
				{projectsState.status === "error" ? (
					<div className="rounded-md border border-status-red/40 bg-status-red/10 p-2 text-xs text-status-red">
						{projectsState.message}
					</div>
				) : null}
				{projectsState.status === "ready" && projectsState.data.projects.length === 0 ? (
					<div className="rounded-md border border-dashed border-border-bright bg-surface-0 p-3 text-sm text-text-secondary">
						Add a Git or JJ project to load the VCS interface.
					</div>
				) : null}
				{projectsState.status === "ready"
					? projectsState.data.projects
							.slice()
							.sort((a, b) => {
								if (a.id === currentProjectId) return -1;
								if (b.id === currentProjectId) return 1;
								return a.path.localeCompare(b.path);
							})
							.map((project) => (
								<ProjectRow
										key={project.id}
										project={project}
										isCurrent={project.id === currentProjectId}
										activeWorkspacePath={activeWorkspacePath}
										removingProjectId={removingProjectId}
										onSelect={onSelectProject}
										onSelectWorkspace={onSelectProjectWorkspace}
										onRemove={(projectId) => {
											const found = projectsState.data.projects.find((item) => item.id === projectId);
										if (!found) {
											return;
										}
										setPendingProjectRemoval(found);
									}}
								/>
							))
					: null}
				{projectsState.status !== "loading" ? (
					<button
						type="button"
						className="kb-project-row flex cursor-pointer items-center gap-1.5 rounded-md text-text-secondary hover:text-text-primary"
						style={{ padding: "6px 8px" }}
						onClick={onAddProject}
						disabled={removingProjectId !== null}
					>
						<Plus size={14} className="shrink-0" />
						<span className="text-sm">Add Project</span>
					</button>
				) : null}
			</div>
			<AlertDialog
				open={pendingProjectRemoval !== null}
				onOpenChange={(open) => {
					if (!open && !isProjectRemovalPending) {
						setPendingProjectRemoval(null);
					}
				}}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>Remove Project</AlertDialogTitle>
				</AlertDialogHeader>
				<AlertDialogBody>
					<AlertDialogDescription asChild>
						<div className="flex flex-col gap-3">
							<p>{pendingProjectRemoval ? pendingProjectRemoval.name : "This project"}</p>
							<p className="text-text-primary">
								This will delete all project tasks ({pendingProjectTaskCount}), remove task workspaces/worktrees,
								and stop any running processes for this project.
							</p>
							<p className="text-text-primary">This action cannot be undone.</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogBody>
				<AlertDialogFooter>
					<AlertDialogCancel asChild>
						<Button
							variant="default"
							disabled={isProjectRemovalPending}
							onClick={() => {
								if (!isProjectRemovalPending) {
									setPendingProjectRemoval(null);
								}
							}}
						>
							Cancel
						</Button>
					</AlertDialogCancel>
					<Button
						variant="danger"
						disabled={isProjectRemovalPending}
						onClick={async () => {
							if (!pendingProjectRemoval) {
								return;
							}
							const removed = await onRemoveProject(pendingProjectRemoval.id);
							if (removed) {
								setPendingProjectRemoval(null);
							}
						}}
					>
						{isProjectRemovalPending ? (
							<>
								<Spinner size={14} />
								Removing...
							</>
						) : (
							"Remove Project"
						)}
					</Button>
				</AlertDialogFooter>
			</AlertDialog>
			<AlertDialog
				open={isClearOtherProjectsOpen}
				onOpenChange={(open) => {
					if (!open && !isClearingOtherProjects) {
						setClearOtherProjectsOpen(false);
					}
				}}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>Clear Other Projects</AlertDialogTitle>
				</AlertDialogHeader>
				<AlertDialogBody>
					<AlertDialogDescription asChild>
						<div className="flex flex-col gap-3">
							<p className="text-text-primary">
								This will remove {removableProjectCount} other project{removableProjectCount === 1 ? "" : "s"} from
								ChangeYard. The current project will stay selected.
							</p>
							<p className="text-text-primary">This action cannot be undone.</p>
						</div>
					</AlertDialogDescription>
				</AlertDialogBody>
				<AlertDialogFooter>
					<AlertDialogCancel asChild>
						<Button
							variant="default"
							disabled={isClearingOtherProjects}
							onClick={() => {
								if (!isClearingOtherProjects) {
									setClearOtherProjectsOpen(false);
								}
							}}
						>
							Cancel
						</Button>
					</AlertDialogCancel>
					<Button
						variant="danger"
						disabled={isClearingOtherProjects || removableProjectCount === 0}
						onClick={async () => {
							setClearingOtherProjects(true);
							try {
								const cleared = await onClearOtherProjects();
								if (cleared) {
									setClearOtherProjectsOpen(false);
								}
							} finally {
								setClearingOtherProjects(false);
							}
						}}
					>
						{isClearingOtherProjects ? (
							<>
								<Spinner size={14} />
								Removing...
							</>
						) : (
							"Clear Other Projects"
						)}
					</Button>
				</AlertDialogFooter>
			</AlertDialog>
		</aside>
	);
}

function ProjectRowSkeleton(): React.ReactElement {
	return (
		<div className="flex items-center gap-1.5" style={{ padding: "6px 8px" }}>
			<div className="min-w-0 flex-1">
				<div className="kb-skeleton h-3.5 w-3/5 rounded-sm" />
				<div className="mt-1.5 kb-skeleton h-2.5 w-11/12 rounded-sm" />
				<div className="mt-1.5 flex gap-1">
					<div className="kb-skeleton h-[18px] w-8 rounded-full" />
					<div className="kb-skeleton h-[18px] w-8 rounded-full" />
				</div>
			</div>
		</div>
	);
}

function ProjectRow({
	project,
	isCurrent,
	activeWorkspacePath,
	removingProjectId,
	onSelect,
	onSelectWorkspace,
	onRemove,
}: {
	project: RuntimeProjectSummary;
	isCurrent: boolean;
	activeWorkspacePath: string | null;
	removingProjectId: string | null;
	onSelect: (id: string) => void;
	onSelectWorkspace: (id: string, workspacePath: string) => void;
	onRemove: (id: string) => void;
}): React.ReactElement {
	const displayPath = formatProjectPath(project.path);
	const isRemovingProject = removingProjectId === project.id;
	const hasAnyProjectRemoval = removingProjectId !== null;
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isWorkspacesOpen, setWorkspacesOpen] = useState(isCurrent);
	const workspaces = (project.workspaces ?? []).filter((workspace) => workspace.name !== "default");
	const hasWorkspaces = workspaces.length > 0;
	const wasCurrentRef = useRef(isCurrent);
	const showWorkspaceToggle = hasWorkspaces;
	const hasActiveWorkspace = Boolean(isCurrent && activeWorkspacePath && workspaces.some((workspace) => resolveWorkspaceProjectPath(project.path, workspace) === activeWorkspacePath));
	useEffect(() => {
		if (isCurrent && !wasCurrentRef.current && hasWorkspaces) {
			setWorkspacesOpen(true);
		}
		wasCurrentRef.current = isCurrent;
	}, [hasWorkspaces, isCurrent]);
	const taskCountBadges: TaskCountBadge[] = [
		{
			id: "backlog",
			title: "Backlog",
			shortLabel: "B",
			toneClassName: "bg-text-primary/15 text-text-primary",
			count: project.taskCounts.backlog,
		},
		{
			id: "in_progress",
			title: "In Progress",
			shortLabel: "IP",
			toneClassName: "bg-accent/20 text-accent",
			count: project.taskCounts.in_progress,
		},
		{
			id: "review",
			title: "Review",
			shortLabel: "R",
			toneClassName: "bg-accent-2/20 text-accent-2",
			count: project.taskCounts.review,
		},
		{
			id: "trash",
			title: "Done",
			shortLabel: "D",
			toneClassName: "bg-status-red/20 text-status-red",
			count: project.taskCounts.trash,
		},
	].filter((item) => item.count > 0);

	return (
		<div className="vcs-project-nav-item">
			<div
				role="button"
				tabIndex={0}
				onClick={() => {
					if (isCurrent && hasWorkspaces) {
						setWorkspacesOpen((open) => !open);
						return;
					}
					onSelect(project.id);
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						if (isCurrent && hasWorkspaces) {
							setWorkspacesOpen((open) => !open);
						} else {
							onSelect(project.id);
						}
					}
				}}
				className={cn(
					"kb-project-row cursor-pointer rounded-md",
					isCurrent && !hasActiveWorkspace && "kb-project-row-selected",
					isCurrent && hasActiveWorkspace && "cy-project-row-parent-active",
				)}
				style={{
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "6px 8px",
				}}
			>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center gap-2">
						{showWorkspaceToggle ? (
							<button
								type="button"
								aria-label={isWorkspacesOpen ? "Collapse workspaces" : "Expand workspaces"}
								title={isWorkspacesOpen ? "Collapse workspaces" : "Expand workspaces"}
								className={cn(
									"cy-project-row-chevron",
									isWorkspacesOpen && "is-open",
									isCurrent && !hasActiveWorkspace && "is-selected",
								)}
								onClick={(event) => {
									event.stopPropagation();
									setWorkspacesOpen((open) => !open);
								}}
							>
								<ChevronRight size={12} />
							</button>
						) : null}
						<div
							className={cn(
								"min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium",
								isCurrent && !hasActiveWorkspace ? "kb-selected-fg" : "text-text-primary",
							)}
						>
							{project.name}
						</div>
					</div>
					<div
						className={cn(
							"overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px]",
							isCurrent && !hasActiveWorkspace ? "kb-selected-muted-fg" : "text-text-secondary",
						)}
					>
						{displayPath}
					</div>
					{taskCountBadges.length > 0 ? (
						<div className="mt-1 flex gap-1">
							{taskCountBadges.map((badge) => (
								<span
									key={badge.id}
									className={cn(
										"inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium",
										isCurrent && !hasActiveWorkspace ? "kb-selected-subtle-bg kb-selected-fg" : badge.toneClassName,
									)}
									title={badge.title}
								>
									<span>{badge.shortLabel}</span>
									<span style={{ opacity: 0.4 }}>|</span>
									<span>{badge.count}</span>
								</span>
							))}
						</div>
					) : null}
				</div>
				<div className="kb-project-row-actions flex items-center" style={isMenuOpen ? { opacity: 1 } : undefined}>
					<DropdownMenu.Root open={isMenuOpen} onOpenChange={setIsMenuOpen}>
						<DropdownMenu.Trigger asChild>
							<Button
								variant="ghost"
								size="sm"
								icon={isRemovingProject ? <Spinner size={12} /> : <Ellipsis size={14} />}
								disabled={hasAnyProjectRemoval && !isRemovingProject}
								className={
									isCurrent && !hasActiveWorkspace
										? "text-accent-fg hover:bg-accent-fg/20 hover:text-accent-fg active:bg-accent-fg/30"
										: undefined
								}
								onClick={(event) => {
									event.stopPropagation();
								}}
								aria-label="Project actions"
							/>
						</DropdownMenu.Trigger>
						<DropdownMenu.Portal>
							<DropdownMenu.Content
								side="bottom"
								align="end"
								sideOffset={4}
								className="z-50 min-w-[140px] rounded-md border border-border-bright bg-surface-1 p-1 shadow-lg"
								onCloseAutoFocus={(event) => event.preventDefault()}
							>
								<DropdownMenu.Item
									className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-status-red outline-none data-[highlighted]:bg-surface-3"
									onSelect={() => onRemove(project.id)}
								>
									Delete
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Portal>
					</DropdownMenu.Root>
				</div>
			</div>
			{hasWorkspaces && isWorkspacesOpen ? (
				<ProjectWorkspaceList
					projectPath={project.path}
					workspaces={workspaces}
					activeWorkspacePath={activeWorkspacePath}
					onSelectWorkspace={(projectPath) => onSelectWorkspace(project.id, projectPath)}
				/>
			) : null}
		</div>
		);
	}
