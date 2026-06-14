import { ArrowRight, Columns3, GitBranch, MonitorCheck, RotateCcw } from "lucide-react";
import { useState, type ReactElement } from "react";

import { showAppToast } from "@/components/app-toaster";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { KANBAN_BASE_PATH } from "@/hooks/app-utils";
import { getRuntimeTrpcClient } from "@/runtime/trpc-client";
import { useRuntimeStateStream } from "@/runtime/use-runtime-state-stream";

const CLIENT_SURFACE_LABELS = {
	dashboard: "Dashboard",
	kanban: "Kanban",
	vcs: "VCS",
	tui: "TUI",
	api: "API",
	unknown: "Unknown",
} as const;

function projectKanbanHref(projectId: string | null): string {
	return projectId ? `${KANBAN_BASE_PATH}/${encodeURIComponent(projectId)}` : KANBAN_BASE_PATH;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRestartedHub(): Promise<boolean> {
	const startedAt = Date.now();
	const deadline = startedAt + 30_000;
	let sawUnavailable = false;
	while (Date.now() < deadline) {
		try {
			const response = await fetch("/api/health", { cache: "no-store" });
			if (response.ok && (sawUnavailable || Date.now() - startedAt > 2000)) {
				return true;
			}
		} catch {
			sawUnavailable = true;
		}
		await sleep(500);
	}
	return false;
}

export default function Dashboard(): ReactElement {
	const [isRestarting, setIsRestarting] = useState(false);
	const {
		currentProjectId,
		projects,
		workspaceState,
		streamError,
		isRuntimeDisconnected,
		hasReceivedSnapshot,
		hubClients,
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
	const clientCounts = hubClients?.bySurface ?? {
		dashboard: 0,
		kanban: 0,
		vcs: 0,
		tui: 0,
		api: 0,
		unknown: 0,
	};
	const handleRestartHub = async () => {
		if (isRestarting) {
			return;
		}
		setIsRestarting(true);
		try {
			const response = await getRuntimeTrpcClient(null).runtime.restartHub.mutate();
			if (!response.ok) {
				throw new Error(response.message);
			}
			showAppToast({ intent: "primary", message: response.message, timeout: 3000 });
			const restarted = await waitForRestartedHub();
			if (!restarted) {
				throw new Error("Hub restart was requested, but the runtime did not become healthy again.");
			}
			window.location.reload();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			showAppToast({ intent: "danger", icon: "warning-sign", message, timeout: 7000 });
			setIsRestarting(false);
		}
	};

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
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="default"
							size="sm"
							icon={isRestarting ? <Spinner size={14} /> : <RotateCcw size={14} />}
							onClick={handleRestartHub}
							disabled={isRestarting}
						>
							{isRestarting ? "Restarting" : "Restart"}
						</Button>
						<div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm">
							{hasReceivedSnapshot ? <MonitorCheck size={16} /> : <Spinner size={16} />}
							<span>{statusLabel}</span>
						</div>
					</div>
				</header>

				{streamError ? (
					<section className="rounded-md border border-[var(--color-status-red)] bg-[color-mix(in_srgb,var(--color-status-red)_10%,transparent)] p-4 text-sm text-[var(--color-status-red)]">
						{streamError}
					</section>
				) : null}

				<section className="grid gap-3 md:grid-cols-4">
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
					<div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
						<div className="text-xs uppercase text-[var(--color-text-muted)]">Connected Clients</div>
						<div className="mt-2 text-3xl font-semibold">{hubClients?.total ?? 0}</div>
					</div>
				</section>

				<section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 className="text-sm font-semibold">Hub Clients</h2>
							<p className="mt-1 text-xs text-[var(--color-text-muted)]">
								Live browser and terminal clients connected to this runtime.
							</p>
						</div>
						<div className="text-xs text-[var(--color-text-muted)]">{hubClients?.total ?? 0} connected</div>
					</div>
					<div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
						{Object.entries(CLIENT_SURFACE_LABELS).map(([surface, label]) => (
							<div
								key={surface}
								className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
							>
								<div className="text-[11px] uppercase text-[var(--color-text-muted)]">{label}</div>
								<div className="mt-1 text-xl font-semibold">
									{clientCounts[surface as keyof typeof clientCounts] ?? 0}
								</div>
							</div>
						))}
					</div>
					{hubClients?.clients?.length ? (
						<div className="mt-4 divide-y divide-[var(--color-border)] overflow-hidden rounded-md border border-[var(--color-border)]">
							{hubClients.clients.slice(-6).map((client) => (
								<div key={client.id} className="grid gap-2 px-3 py-2 text-xs sm:grid-cols-[100px_1fr_120px]">
									<span className="font-medium text-[var(--color-text-primary)]">
										{CLIENT_SURFACE_LABELS[client.surface]}
									</span>
									<span className="truncate text-[var(--color-text-secondary)]">
										{client.workspaceId ?? "No workspace"}
									</span>
									<span className="text-[var(--color-text-muted)]">
										{new Date(client.connectedAt).toLocaleTimeString()}
									</span>
								</div>
							))}
						</div>
					) : null}
				</section>

				<section className="grid gap-4 md:grid-cols-2">
					<a
						href={projectKanbanHref(activeProject?.id ?? null)}
						data-changeyard-surface-link
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
						data-changeyard-surface-link
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
							data-changeyard-surface-link
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
