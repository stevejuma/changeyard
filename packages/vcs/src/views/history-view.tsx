import { Camera, Clock3, GitCommit, History, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FileStatusChip, StatusChip } from "@/components/ui/status-chip";
import { DiagnosticsPanel, EmptyState, Panel, QueryGate } from "@/components/vcs-panels";
import { NoProjectSelected, SelectProjectButton, VcsShell, type VcsShellProjectState } from "@/components/vcs-shell";
import type {
	QueryState,
	VcsJjOperationDiffResponse,
	VcsJjOperationEntry,
	VcsJjOperationsResponse,
} from "@/runtime/types";
import { useTrpcInputQuery } from "@/runtime/trpc-client";

function readQueryParam(name: string): string | null {
	return new URLSearchParams(window.location.search).get(name)?.trim() || null;
}

function writeQueryParam(name: string, value: string | null): void {
	const url = new URL(window.location.href);
	if (value) {
		url.searchParams.set(name, value);
	} else {
		url.searchParams.delete(name);
	}
	window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function formatDateGroup(timestamp: string | null): string {
	if (!timestamp) {
		return "Unknown date";
	}
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return "Unknown date";
	}
	return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function formatTime(timestamp: string | null): string {
	if (!timestamp) {
		return "--:--";
	}
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return "--:--";
	}
	return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function HistoryView({
	currentPath,
	projectState,
	workspaceId,
}: {
	currentPath: string;
	projectState: VcsShellProjectState;
	workspaceId: string | null;
}): React.ReactElement {
	const operationsQuery = useTrpcInputQuery<VcsJjOperationsResponse>(
		"vcs.jjOperations",
		{ limit: 50 },
		"Failed to load JJ operation history.",
		Boolean(workspaceId),
		workspaceId,
	);
	const [selectedOperationId, setSelectedOperationId] = useState<string | null>(() => readQueryParam("operation"));
	const operationDiffQuery = useTrpcInputQuery<VcsJjOperationDiffResponse>(
		"vcs.jjOperationDiff",
		{ operationId: selectedOperationId ?? "" },
		"Failed to load operation details.",
		Boolean(workspaceId && selectedOperationId),
		workspaceId,
	);

	useEffect(() => {
		if (operationsQuery.state.status !== "ready") {
			return;
		}
		const hasSelected = selectedOperationId
			? operationsQuery.state.data.operations.some((operation) => operation.id === selectedOperationId)
			: false;
		if (!hasSelected) {
			const nextOperationId = operationsQuery.state.data.operations[0]?.id ?? null;
			setSelectedOperationId(nextOperationId);
			writeQueryParam("operation", nextOperationId);
		}
	}, [operationsQuery.state, selectedOperationId]);

	function selectOperation(operation: VcsJjOperationEntry): void {
		setSelectedOperationId(operation.id);
		writeQueryParam("operation", operation.id);
	}

	return (
		<VcsShell
			projectState={projectState}
			currentPath={currentPath}
			title="History"
			subtitle="JJ operations timeline and details"
			kicker={<StatusChip label="Read only" tone="blue" />}
			actions={
				<Button variant="default" size="sm" icon={<Camera size={14} />} disabled title="Snapshot support is not wired yet">
					Create snapshot
				</Button>
			}
		>
			{!workspaceId ? (
				<NoProjectSelected action={<SelectProjectButton onClick={projectState.onAddProject} />}>
					Select a project to show JJ operation history for that workspace.
				</NoProjectSelected>
			) : (
				<QueryGate state={operationsQuery.state} loading="Loading operation history." errorTitle="Operation history failed">
					{(operations) => (
						<HistoryReady
							operations={operations}
							selectedOperationId={selectedOperationId}
							diffState={operationDiffQuery.state}
							onSelectOperation={selectOperation}
						/>
					)}
				</QueryGate>
			)}
		</VcsShell>
	);
}

function HistoryReady({
	operations,
	selectedOperationId,
	diffState,
	onSelectOperation,
}: {
	operations: VcsJjOperationsResponse;
	selectedOperationId: string | null;
	diffState: QueryState<VcsJjOperationDiffResponse>;
	onSelectOperation: (operation: VcsJjOperationEntry) => void;
}): React.ReactElement {
	const selectedOperation = operations.operations.find((operation) => operation.id === selectedOperationId) ?? null;
	const groupedOperations = useMemo(() => {
		const groups = new Map<string, VcsJjOperationEntry[]>();
		for (const operation of operations.operations) {
			const key = formatDateGroup(operation.timestamp);
			groups.set(key, [...(groups.get(key) ?? []), operation]);
		}
		return [...groups.entries()];
	}, [operations.operations]);

	return (
		<div className="flex h-full min-h-0">
			<aside className="flex w-[430px] shrink-0 flex-col overflow-hidden border-r border-divider bg-surface-1">
				<header className="flex min-h-[49px] items-center justify-between border-b border-border px-3">
					<div className="flex items-center gap-2">
						<History size={16} className="text-text-tertiary" />
						<h2 className="text-sm font-semibold text-text-primary">Operations history</h2>
					</div>
					<StatusChip label={`${operations.operations.length}`} tone="neutral" />
				</header>
				<div className="min-h-0 flex-1 overflow-y-auto">
					{operations.operations.length === 0 ? (
						<div className="p-3">
							<EmptyState title="No operations">No JJ operation entries were returned.</EmptyState>
						</div>
					) : (
						groupedOperations.map(([group, entries]) => (
							<section key={group} className="border-b border-border">
								<header className="bg-surface-0 px-3 py-2 text-center text-xs font-medium text-text-tertiary">
									{group}
								</header>
								{entries.map((operation) => (
									<OperationRow
										key={operation.id}
										operation={operation}
										selected={operation.id === selectedOperationId}
										onSelect={() => onSelectOperation(operation)}
									/>
								))}
							</section>
						))
					)}
				</div>
			</aside>
			<section
				className="min-w-0 flex-1 overflow-auto p-3"
				style={{
					backgroundImage: "radial-gradient(color-mix(in srgb, var(--color-text-tertiary) 18%, transparent) 1px, transparent 1px)",
					backgroundSize: "10px 10px",
				}}
			>
				<OperationDetailPanel operation={selectedOperation} state={diffState} />
				<DiagnosticsPanel diagnostics={operations.diagnostics} />
			</section>
		</div>
	);
}

function OperationRow({
	operation,
	selected,
	onSelect,
}: {
	operation: VcsJjOperationEntry;
	selected: boolean;
	onSelect: () => void;
}): React.ReactElement {
	return (
		<button
			type="button"
			className={cn(
				"grid w-full grid-cols-[72px_24px_minmax(0,1fr)] gap-2 border-l-2 px-3 py-3 text-left hover:bg-surface-2",
				selected ? "border-accent bg-surface-2" : "border-transparent",
			)}
			onClick={onSelect}
		>
			<div className="pt-0.5 text-right text-xs text-text-tertiary">{formatTime(operation.timestamp)}</div>
			<div className="relative flex justify-center">
				<span className="absolute bottom-[-13px] top-[-13px] w-px bg-border-bright" />
				<span className="relative mt-1 grid h-4 w-4 place-items-center rounded-full border border-border-bright bg-surface-1 text-text-tertiary">
					<Clock3 size={10} />
				</span>
			</div>
			<div className="min-w-0">
				<div className="truncate text-sm font-semibold text-text-primary">{operation.description}</div>
				<div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
					<code>{operation.shortId}</code>
					{operation.user ? <span>{operation.user}</span> : null}
					{operation.files.length > 0 ? <span>{operation.files.length} files</span> : null}
				</div>
				{operation.files.length > 0 ? (
					<div className="mt-2 grid gap-1">
						{operation.files.slice(0, 4).map((file) => (
							<div key={`${file.status}:${file.path}`} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface-0 px-2 py-1 text-xs">
								<FileStatusChip status={file.status} />
								<span className="truncate text-text-secondary">{file.path}</span>
							</div>
						))}
						{operation.files.length > 4 ? (
							<div className="text-xs text-text-tertiary">Show {operation.files.length - 4} more files</div>
						) : null}
					</div>
				) : null}
			</div>
		</button>
	);
}

function OperationDetailPanel({
	operation,
	state,
}: {
	operation: VcsJjOperationEntry | null;
	state: QueryState<VcsJjOperationDiffResponse>;
}): React.ReactElement {
	if (!operation) {
		return (
			<Panel title="Operation detail" className="min-h-[520px]">
				<EmptyState title="Select an operation">Choose an operation to inspect files and diff output.</EmptyState>
			</Panel>
		);
	}
	return (
		<Panel
			title={operation.description}
			actions={
				<div className="flex items-center gap-1.5">
					<StatusChip label={operation.restoreEligible ? "Restore eligible" : "Read only"} tone={operation.restoreEligible ? "gold" : "neutral"} icon={<RotateCcw size={12} />} />
					<code className="text-xs text-text-tertiary">{operation.shortId}</code>
				</div>
			}
			className="min-h-[520px] overflow-hidden"
		>
			{state.status === "loading" ? <EmptyState title="Loading operation">Reading JJ operation details.</EmptyState> : null}
			{state.status === "error" ? <EmptyState title="Operation unavailable">{state.message}</EmptyState> : null}
			{state.status === "ready" ? (
				<div className="grid max-h-[calc(100vh-150px)] min-h-[480px] grid-rows-[auto_1fr] overflow-hidden">
					<div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
						{state.data.files.length === 0 ? (
							<span className="text-xs text-text-tertiary">No affected files were parsed from JJ output.</span>
						) : (
							state.data.files.map((file) => (
								<div key={`${file.status}:${file.path}`} className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-surface-0 px-2 py-1 text-xs">
									<FileStatusChip status={file.status} />
									<span className="max-w-[260px] truncate text-text-secondary">{file.path}</span>
								</div>
							))
						)}
					</div>
					<div className="overflow-auto pt-3">
						<pre className="min-h-full rounded-md border border-border bg-surface-0 p-3 font-mono text-[11px] leading-5 text-text-secondary">
							{state.data.patch || state.data.summary || "No operation diff output is available."}
						</pre>
						<DiagnosticsPanel diagnostics={state.data.diagnostics} />
					</div>
				</div>
			) : null}
		</Panel>
	);
}
