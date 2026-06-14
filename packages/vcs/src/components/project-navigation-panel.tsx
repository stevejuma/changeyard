import { ChevronLeft, ChevronRight, Ellipsis, FolderGit2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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

function projectBadgeCount(project: RuntimeProjectSummary): number {
	return project.taskCounts.backlog + project.taskCounts.in_progress + project.taskCounts.review;
}

function formatProjectPath(path: string): string {
	const home = typeof window !== "undefined" ? "" : "";
	return home && path.startsWith(home) ? path.replace(home, "~") : path;
}

export function VcsProjectNavigationPanel({
	projectsState,
	currentProjectId,
	removingProjectId,
	isCollapsed,
	onCollapsedChange,
	onSelectProject,
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
			<header className="flex min-h-[49px] items-center justify-between border-b border-border px-3">
				<div className="flex min-w-0 items-center gap-2">
					<div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-accent">
						<FolderGit2 size={16} />
					</div>
					<div className="min-w-0">
						<div className="truncate text-sm font-semibold text-text-primary">ChangeYard</div>
						<div className="text-xs text-text-tertiary">Projects</div>
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
			<div className="min-h-0 flex-1 overflow-y-auto p-2">
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
							.map((project) => {
								const isCurrent = project.id === currentProjectId;
								const isRemoving = removingProjectId === project.id;
								return (
									<div
										key={project.id}
										className={cn(
											"group mb-1 rounded-md border border-transparent",
											isCurrent ? "border-border-bright bg-surface-2" : "hover:border-border hover:bg-surface-2",
										)}
									>
										<button
											type="button"
											className="flex w-full min-w-0 cursor-pointer items-start gap-2 rounded-md border-0 bg-transparent px-2 py-2 text-left"
											onClick={() => onSelectProject(project.id)}
										>
											<FolderGit2 size={15} className={cn("mt-0.5 shrink-0 text-text-tertiary", isCurrent && "text-accent")} />
											<span className="min-w-0 flex-1">
												<span className="block truncate text-sm font-medium text-text-primary">{project.name}</span>
												<span className="block truncate text-[11px] text-text-tertiary">
													{formatProjectPath(project.path)}
												</span>
												<span className="mt-1 block text-[11px] text-text-tertiary">
													{projectBadgeCount(project)} active tasks
												</span>
											</span>
										</button>
										<div className="flex items-center justify-end border-t border-border px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100">
											<Button
												variant="ghost"
												size="sm"
												icon={isRemoving ? <Spinner size={12} /> : <Trash2 size={12} />}
												disabled={isRemoving}
												aria-label={`Remove ${project.name}`}
												title={`Remove ${project.name}`}
												onClick={() => setPendingProjectRemoval(project)}
											/>
										</div>
									</div>
								);
							})
					: null}
			</div>
			<footer className="border-t border-border p-2">
				<Button variant="default" size="sm" icon={<Plus size={14} />} className="w-full justify-center" onClick={onAddProject}>
					Add Project
				</Button>
			</footer>
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
		<div className="mb-1 rounded-md border border-transparent px-2 py-2">
			<div className="flex min-w-0 items-start gap-2">
				<div className="kb-skeleton mt-0.5 h-[15px] w-[15px] shrink-0 rounded" />
				<div className="min-w-0 flex-1">
					<div className="kb-skeleton h-4 w-3/5" />
					<div className="mt-1.5 kb-skeleton h-3 w-11/12" />
					<div className="mt-2 kb-skeleton h-3 w-24" />
				</div>
			</div>
		</div>
	);
}
