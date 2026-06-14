import { ArrowRight, Columns3, GitBranch, MonitorCheck } from "lucide-react";
import type { ReactElement } from "react";

import { Spinner } from "@/components/ui/spinner";
import { KANBAN_BASE_PATH } from "@/hooks/app-utils";
import { useRuntimeStateStream } from "@/runtime/use-runtime-state-stream";

function projectKanbanHref(projectId: string | null): string {
	return projectId ? `${KANBAN_BASE_PATH}/${encodeURIComponent(projectId)}` : KANBAN_BASE_PATH;
}

export default function Dashboard(): ReactElement {
	const {
		currentProjectId,
		projects,
		workspaceState,
		streamError,
		isRuntimeDisconnected,
		hasReceivedSnapshot,
	} = useRuntimeStateStream(null);
	const activeProject = projects.find((project) => project.id === currentProjectId) ?? projects[0] ?? null;
	const taskCounts = workspaceState?.board.columns.reduce(
		(counts, column) => {
			counts.total += column.cards.length;
			if (column.id === "in_progress") counts.active += column.cards.length;
			if (column.id === "review") counts.review += column.cards.length;
			return counts;
		},
		{ total: 0, active: 0, review: 0 },
	) ?? { total: 0, active: 0, review: 0 };
	const statusLabel = isRuntimeDisconnected ? "Disconnected" : hasReceivedSnapshot ? "Online" : "Connecting";

	return (
		<main className="min-h-screen bg-[var(--color-surface-0)] text-[var(--color-text-primary)]">
			<div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-6">
				<header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border)] pb-5">
					<div>
						<h1 className="text-2xl font-semibold tracking-normal">Changeyard</h1>
						<p className="mt-1 text-sm text-[var(--color-text-secondary)]">
							Runtime dashboard for the current workspace.
						</p>
					</div>
					<div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm">
						{hasReceivedSnapshot ? <MonitorCheck size={16} /> : <Spinner size={16} />}
						<span>{statusLabel}</span>
					</div>
				</header>

				{streamError ? (
					<section className="rounded-md border border-[var(--color-status-red)] bg-[color-mix(in_srgb,var(--color-status-red)_10%,transparent)] p-4 text-sm text-[var(--color-status-red)]">
						{streamError}
					</section>
				) : null}

				<section className="grid gap-3 md:grid-cols-3">
					<div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
						<div className="text-xs uppercase text-[var(--color-text-muted)]">Projects</div>
						<div className="mt-2 text-3xl font-semibold">{projects.length}</div>
					</div>
					<div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
						<div className="text-xs uppercase text-[var(--color-text-muted)]">Active Tasks</div>
						<div className="mt-2 text-3xl font-semibold">{taskCounts.active}</div>
					</div>
					<div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
						<div className="text-xs uppercase text-[var(--color-text-muted)]">Ready For Review</div>
						<div className="mt-2 text-3xl font-semibold">{taskCounts.review}</div>
					</div>
				</section>

				<section className="grid gap-4 md:grid-cols-2">
					<a
						href={projectKanbanHref(activeProject?.id ?? null)}
						className="group rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5 transition hover:border-[var(--color-accent)]"
					>
						<div className="flex items-center justify-between gap-4">
							<div className="flex items-center gap-3">
								<div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
									<Columns3 size={18} />
								</div>
								<div>
									<h2 className="text-base font-semibold">Kanban</h2>
									<p className="mt-1 text-sm text-[var(--color-text-secondary)]">
										Tasks, agents, changes, and project workflow.
									</p>
								</div>
							</div>
							<ArrowRight className="transition group-hover:translate-x-0.5" size={18} />
						</div>
					</a>

					<a
						href="/vcs"
						className="group rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5 transition hover:border-[var(--color-accent)]"
					>
						<div className="flex items-center justify-between gap-4">
							<div className="flex items-center gap-3">
								<div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
									<GitBranch size={18} />
								</div>
								<div>
									<h2 className="text-base font-semibold">VCS</h2>
									<p className="mt-1 text-sm text-[var(--color-text-secondary)]">
										Workspace, branches, commits, diffs, and operations.
									</p>
								</div>
							</div>
							<ArrowRight className="transition group-hover:translate-x-0.5" size={18} />
						</div>
					</a>
				</section>

				<section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<div className="text-sm font-medium">{activeProject?.name ?? "No active project"}</div>
							<div className="mt-1 text-xs text-[var(--color-text-muted)]">
								{activeProject?.path ?? "Add a project from the Kanban workspace to begin."}
							</div>
						</div>
						<a
							href={projectKanbanHref(activeProject?.id ?? null)}
							className="inline-flex h-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 text-xs font-medium hover:bg-[var(--color-surface-3)]"
						>
							Open Kanban
						</a>
					</div>
					<div className="mt-4 text-sm text-[var(--color-text-secondary)]">
						{taskCounts.total} tasks tracked in the active workspace.
					</div>
				</section>
			</div>
		</main>
	);
}
