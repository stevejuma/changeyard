import { Camera, Clock3, GitCommit, History, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FileStatusGlyph, StatusChip } from "@/components/ui/status-chip";
import {
	findFileByPath,
	getFirstFilePath,
	VcsCollapsedColumn,
	VcsColumn,
	VcsFileDiffColumn,
	VcsInlineFileSection,
	type VcsFileChange,
} from "@/components/vcs-file-columns";
import { DiagnosticsPanel, EmptyState, QueryGate } from "@/components/vcs-panels";
import { NoProjectSelected, SelectProjectButton, VcsShell, type VcsShellProjectState } from "@/components/vcs-shell";
import type {
	QueryState,
	RuntimeGitCommitDiffResponse,
	VcsJjOperationCommit,
	VcsJjOperationDiffResponse,
	VcsJjOperationEntry,
	VcsJjOperationFile,
	VcsJjOperationsResponse,
} from "@/runtime/types";
import { usePaginatedJjOperationDiff, usePaginatedJjOperations, useTrpcInputQuery } from "@/runtime/trpc-client";
import {
	readVcsFileViewMode,
	readVcsNumberPreference,
	VCS_LAYOUT_STORAGE_KEYS,
	writeVcsFileViewMode,
	writeVcsNumberPreference,
	type VcsFileViewMode,
} from "@/utils/vcs-ui-preferences";

type HistoryColumnId = "operations" | "commits";

const SELECTED_OPERATION_MARKER_CLASS =
	"relative before:absolute before:left-0 before:top-1/2 before:h-12 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:content-['']";

const HISTORY_COLUMN_LIMITS = {
	operations: { min: 340, max: 640, fallback: 430, key: VCS_LAYOUT_STORAGE_KEYS.historyOperationsWidth },
	commits: { min: 420, max: 820, fallback: 520, key: VCS_LAYOUT_STORAGE_KEYS.historyCommitsWidth },
	diff: { min: 420, max: 980, fallback: 640, key: VCS_LAYOUT_STORAGE_KEYS.historyDiffWidth },
} as const;

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

function formatRelativeTime(timestamp: string | null): string {
	if (!timestamp) {
		return "unknown";
	}
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return "unknown";
	}
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
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

function toFileChanges(diffState: QueryState<RuntimeGitCommitDiffResponse>): VcsFileChange[] {
	if (diffState.status !== "ready" || !diffState.data.ok) {
		return [];
	}
	return diffState.data.files;
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
	const operationsQuery = usePaginatedJjOperations({
		message: "Failed to load JJ operation history.",
		enabled: Boolean(workspaceId),
		workspaceId,
		pageSize: 50,
	});
	const [collapsedColumns, setCollapsedColumns] = useState<Record<HistoryColumnId, boolean>>({
		operations: false,
		commits: false,
	});
	const [columnWidths, setColumnWidths] = useState(() => ({
		operations: readVcsNumberPreference(HISTORY_COLUMN_LIMITS.operations.key, HISTORY_COLUMN_LIMITS.operations.fallback, HISTORY_COLUMN_LIMITS.operations.min, HISTORY_COLUMN_LIMITS.operations.max),
		commits: readVcsNumberPreference(HISTORY_COLUMN_LIMITS.commits.key, HISTORY_COLUMN_LIMITS.commits.fallback, HISTORY_COLUMN_LIMITS.commits.min, HISTORY_COLUMN_LIMITS.commits.max),
		diff: readVcsNumberPreference(HISTORY_COLUMN_LIMITS.diff.key, HISTORY_COLUMN_LIMITS.diff.fallback, HISTORY_COLUMN_LIMITS.diff.min, HISTORY_COLUMN_LIMITS.diff.max),
	}));
	const [fileViewMode, setFileViewMode] = useState<VcsFileViewMode>(() => readVcsFileViewMode());
	const [selectedOperationId, setSelectedOperationId] = useState<string | null>(() => readQueryParam("operation"));
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(() => readQueryParam("commit"));
	const [selectedFilePath, setSelectedFilePath] = useState<string | null>(() => readQueryParam("file"));
	const [hasUserClearedOperation, setHasUserClearedOperation] = useState(false);
	const [hasUserClearedFile, setHasUserClearedFile] = useState(false);
	const [isFileSectionCollapsed, setFileSectionCollapsed] = useState(false);

	const operationDiffQuery = usePaginatedJjOperationDiff({
		operationId: selectedOperationId,
		message: "Failed to load operation details.",
		enabled: Boolean(workspaceId && selectedOperationId),
		workspaceId,
		pageSize: 50,
	});
	const commitDiffQuery = useTrpcInputQuery<RuntimeGitCommitDiffResponse>(
		"workspace.getRepositoryCommitDiff",
		{ commitHash: selectedCommitHash ?? "" },
		"Failed to load commit diff.",
		Boolean(workspaceId && selectedCommitHash),
		workspaceId,
	);
	const files = toFileChanges(commitDiffQuery.state);
	const selectedFile = findFileByPath(files, selectedFilePath);

	useEffect(() => {
		if (operationsQuery.state.status !== "ready") {
			return;
		}
		if (hasUserClearedOperation) {
			return;
		}
		const hasSelected = selectedOperationId
			? operationsQuery.state.data.operations.some((operation) => operation.id === selectedOperationId)
			: false;
		if (!hasSelected) {
			const nextOperationId = operationsQuery.state.data.operations[0]?.id ?? null;
			setSelectedOperationId(nextOperationId);
			setSelectedCommitHash(null);
			setSelectedFilePath(null);
			writeQueryParam("operation", nextOperationId);
			writeQueryParam("commit", null);
			writeQueryParam("file", null);
		}
	}, [hasUserClearedOperation, operationsQuery.state, selectedOperationId]);

	useEffect(() => {
		if (operationDiffQuery.state.status !== "ready") {
			return;
		}
		if (!selectedCommitHash) {
			return;
		}
		const hasSelectedCommit = operationDiffQuery.state.data.commits.some((commit) => commit.hash === selectedCommitHash);
		if (!hasSelectedCommit) {
			setSelectedCommitHash(null);
			setSelectedFilePath(null);
			writeQueryParam("commit", null);
			writeQueryParam("file", null);
		}
	}, [operationDiffQuery.state, selectedCommitHash]);

	useEffect(() => {
		if (isFileSectionCollapsed || commitDiffQuery.state.status !== "ready" || !commitDiffQuery.state.data.ok) {
			return;
		}
		if (hasUserClearedFile) {
			return;
		}
		const nextFiles = commitDiffQuery.state.data.files;
		if (nextFiles.length === 0) {
			if (selectedFilePath) {
				setSelectedFilePath(null);
				writeQueryParam("file", null);
			}
			return;
		}
		if (selectedFilePath && nextFiles.some((file) => file.path === selectedFilePath)) {
			return;
		}
		const nextFilePath = getFirstFilePath(nextFiles);
		setSelectedFilePath(nextFilePath);
		writeQueryParam("file", nextFilePath);
	}, [commitDiffQuery.state, hasUserClearedFile, isFileSectionCollapsed, selectedFilePath]);

	function selectOperation(operation: VcsJjOperationEntry): void {
		if (selectedOperationId === operation.id) {
			setSelectedOperationId(null);
			setSelectedCommitHash(null);
			setSelectedFilePath(null);
			setHasUserClearedOperation(true);
			setHasUserClearedFile(true);
			setFileSectionCollapsed(false);
			writeQueryParam("operation", null);
			writeQueryParam("commit", null);
			writeQueryParam("file", null);
			return;
		}
		setSelectedOperationId(operation.id);
		setSelectedCommitHash(null);
		setSelectedFilePath(null);
		setHasUserClearedOperation(false);
		setHasUserClearedFile(false);
		setFileSectionCollapsed(false);
		writeQueryParam("operation", operation.id);
		writeQueryParam("commit", null);
		writeQueryParam("file", null);
		setCollapsedColumns((current) => ({ ...current, commits: false }));
	}

	function selectCommit(commit: VcsJjOperationCommit): void {
		if (selectedCommitHash === commit.hash) {
			setSelectedCommitHash(null);
			setSelectedFilePath(null);
			setHasUserClearedFile(true);
			setFileSectionCollapsed(false);
			writeQueryParam("commit", null);
			writeQueryParam("file", null);
			return;
		}
		setSelectedCommitHash(commit.hash);
		setSelectedFilePath(null);
		setHasUserClearedFile(false);
		setFileSectionCollapsed(false);
		writeQueryParam("commit", commit.hash);
		writeQueryParam("file", null);
	}

	function selectFile(path: string): void {
		if (selectedFilePath === path) {
			setSelectedFilePath(null);
			setHasUserClearedFile(true);
			writeQueryParam("file", null);
			return;
		}
		setSelectedFilePath(path);
		setHasUserClearedFile(false);
		writeQueryParam("file", path);
	}

	function setColumnWidth(column: keyof typeof columnWidths, width: number): void {
		const limits = HISTORY_COLUMN_LIMITS[column];
		const normalized = writeVcsNumberPreference(limits.key, width, limits.min, limits.max);
		setColumnWidths((current) => ({ ...current, [column]: normalized }));
	}

	function changeFileViewMode(mode: VcsFileViewMode): void {
		setFileViewMode(writeVcsFileViewMode(mode));
	}

	function changeFileSectionCollapsed(collapsed: boolean): void {
		setFileSectionCollapsed(collapsed);
		if (collapsed) {
			setSelectedFilePath(null);
			setHasUserClearedFile(true);
			writeQueryParam("file", null);
			return;
		}
		setHasUserClearedFile(false);
		const nextFilePath = getFirstFilePath(files);
		if (nextFilePath) {
			setSelectedFilePath(nextFilePath);
			writeQueryParam("file", nextFilePath);
		}
	}

	return (
		<VcsShell
			projectState={projectState}
			currentPath={currentPath}
			title="History"
			subtitle="JJ operation log, snapshots, commits, and file changes"
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
				<QueryGate
					state={operationsQuery.state}
					loading="Loading operation history."
					loadingFallback={<HistoryLoadingLayout columnWidths={columnWidths} />}
					errorTitle="Operation history failed"
				>
					{(operations) => (
						<HistoryReady
							operations={operations}
							isLoadingMoreOperations={operationsQuery.isLoadingMore}
							hasMoreOperations={operationsQuery.hasMore}
							selectedOperationId={selectedOperationId}
							operationState={operationDiffQuery.state}
							isLoadingMoreOperationCommits={operationDiffQuery.isLoadingMore}
							hasMoreOperationCommits={operationDiffQuery.hasMore}
							selectedCommitHash={selectedCommitHash}
							selectedFilePath={selectedFilePath}
							selectedFile={selectedFile}
							commitDiffState={commitDiffQuery.state}
							collapsedColumns={collapsedColumns}
							columnWidths={columnWidths}
							fileViewMode={fileViewMode}
							isFileSectionCollapsed={isFileSectionCollapsed}
							onColumnCollapsedChange={(column, collapsed) => setCollapsedColumns((current) => ({ ...current, [column]: collapsed }))}
							onColumnWidthChange={setColumnWidth}
							onFileViewModeChange={changeFileViewMode}
							onFileSectionCollapsedChange={changeFileSectionCollapsed}
							onLoadMoreOperations={operationsQuery.loadMore}
							onLoadMoreOperationCommits={operationDiffQuery.loadMore}
							onSelectOperation={selectOperation}
							onSelectCommit={selectCommit}
							onSelectFile={selectFile}
							onCloseDiff={() => {
								setSelectedFilePath(null);
								setHasUserClearedFile(true);
								writeQueryParam("file", null);
							}}
						/>
					)}
				</QueryGate>
			)}
		</VcsShell>
	);
}

function HistoryLoadingLayout({
	columnWidths,
}: {
	columnWidths: Record<HistoryColumnId | "diff", number>;
}): React.ReactElement {
	return (
		<div className="flex h-full min-h-0 flex-col bg-surface-0">
			<div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3">
				<div className="flex h-full min-h-0 gap-3">
					<VcsColumn
						id="operations"
						title="Operations history"
						width={columnWidths.operations}
						minWidth={HISTORY_COLUMN_LIMITS.operations.min}
						maxWidth={HISTORY_COLUMN_LIMITS.operations.max}
						onCollapse={() => undefined}
						onWidthChange={() => undefined}
					>
						<OperationRowsSkeleton />
					</VcsColumn>
					<VcsColumn
						id="commits"
						title="Operation commits"
						width={columnWidths.commits}
						minWidth={HISTORY_COLUMN_LIMITS.commits.min}
						maxWidth={HISTORY_COLUMN_LIMITS.commits.max}
						onCollapse={() => undefined}
						onWidthChange={() => undefined}
					>
						<CommitRowsSkeleton />
					</VcsColumn>
				</div>
			</div>
		</div>
	);
}

function OperationRowsSkeleton({ rows = 9 }: { rows?: number }): React.ReactElement {
	return (
		<div className="py-1">
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="grid grid-cols-[72px_24px_minmax(0,1fr)] gap-2 border-b border-divider px-3 py-3">
					<div className="flex justify-end pt-0.5">
						<div className="kb-skeleton h-3 w-12" />
					</div>
					<div className="relative flex justify-center">
						<span className="absolute bottom-[-13px] top-[-13px] w-px bg-border" />
						<span className="kb-skeleton relative mt-1 h-4 w-4 rounded-full" />
					</div>
					<div className="min-w-0">
						<div className="kb-skeleton h-4 w-4/5" />
						<div className="mt-2 flex gap-2">
							<div className="kb-skeleton h-3 w-14" />
							<div className="kb-skeleton h-3 w-20" />
						</div>
						<div className="kb-skeleton mt-2 h-5 w-24 rounded-full" />
					</div>
				</div>
			))}
		</div>
	);
}

function HistoryReady({
	operations,
	isLoadingMoreOperations,
	hasMoreOperations,
	selectedOperationId,
	operationState,
	isLoadingMoreOperationCommits,
	hasMoreOperationCommits,
	selectedCommitHash,
	selectedFilePath,
	selectedFile,
	commitDiffState,
	collapsedColumns,
	columnWidths,
	fileViewMode,
	isFileSectionCollapsed,
	onColumnCollapsedChange,
	onColumnWidthChange,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onLoadMoreOperations,
	onLoadMoreOperationCommits,
	onSelectOperation,
	onSelectCommit,
	onSelectFile,
	onCloseDiff,
}: {
	operations: VcsJjOperationsResponse;
	isLoadingMoreOperations: boolean;
	hasMoreOperations: boolean;
	selectedOperationId: string | null;
	operationState: QueryState<VcsJjOperationDiffResponse>;
	isLoadingMoreOperationCommits: boolean;
	hasMoreOperationCommits: boolean;
	selectedCommitHash: string | null;
	selectedFilePath: string | null;
	selectedFile: VcsFileChange | null;
	commitDiffState: QueryState<RuntimeGitCommitDiffResponse>;
	collapsedColumns: Record<HistoryColumnId, boolean>;
	columnWidths: Record<HistoryColumnId | "diff", number>;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onColumnCollapsedChange: (column: HistoryColumnId, collapsed: boolean) => void;
	onColumnWidthChange: (column: HistoryColumnId | "diff", width: number) => void;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onLoadMoreOperations: () => void;
	onLoadMoreOperationCommits: () => void;
	onSelectOperation: (operation: VcsJjOperationEntry) => void;
	onSelectCommit: (commit: VcsJjOperationCommit) => void;
	onSelectFile: (path: string) => void;
	onCloseDiff: () => void;
}): React.ReactElement {
	const selectedOperation = operations.operations.find((operation) => operation.id === selectedOperationId) ?? null;
	const operationCommitCount = operationState.status === "ready" ? operationState.data.totalCommitCount : undefined;

	return (
		<div className="flex h-full min-h-0 flex-col bg-surface-0">
			<div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3">
				<div className="flex h-full min-h-0 gap-3">
					{collapsedColumns.operations ? (
						<VcsCollapsedColumn
							label="History"
							count={operations.operations.length}
							onExpand={() => onColumnCollapsedChange("operations", false)}
						/>
					) : (
						<VcsColumn
							id="operations"
							title="Operations history"
							count={operations.operations.length}
							width={columnWidths.operations}
							minWidth={HISTORY_COLUMN_LIMITS.operations.min}
							maxWidth={HISTORY_COLUMN_LIMITS.operations.max}
							onCollapse={() => onColumnCollapsedChange("operations", true)}
							onWidthChange={(width) => onColumnWidthChange("operations", width)}
							onScrollNearEnd={hasMoreOperations ? onLoadMoreOperations : undefined}
						>
							<OperationsColumnContent
								operations={operations.operations}
								isLoadingMore={isLoadingMoreOperations}
								hasMore={hasMoreOperations}
								selectedOperationId={selectedOperationId}
								onLoadMore={onLoadMoreOperations}
								onSelectOperation={onSelectOperation}
							/>
						</VcsColumn>
					)}
					{collapsedColumns.commits ? (
						<VcsCollapsedColumn
							label="Commits"
							count={operationCommitCount}
							onExpand={() => onColumnCollapsedChange("commits", false)}
						/>
					) : (
						<VcsColumn
							id="commits"
							title={selectedOperation?.description ?? "Operation commits"}
							count={operationCommitCount}
							width={columnWidths.commits}
							minWidth={HISTORY_COLUMN_LIMITS.commits.min}
							maxWidth={HISTORY_COLUMN_LIMITS.commits.max}
							onCollapse={() => onColumnCollapsedChange("commits", true)}
							onWidthChange={(width) => onColumnWidthChange("commits", width)}
							onScrollNearEnd={hasMoreOperationCommits ? onLoadMoreOperationCommits : undefined}
						>
							<OperationCommitGraphColumn
								operation={selectedOperation}
								state={operationState}
								isLoadingMore={isLoadingMoreOperationCommits}
								hasMore={hasMoreOperationCommits}
								commitDiffState={commitDiffState}
								selectedCommitHash={selectedCommitHash}
								selectedFilePath={selectedFilePath}
								fileViewMode={fileViewMode}
								isFileSectionCollapsed={isFileSectionCollapsed}
								onFileViewModeChange={onFileViewModeChange}
								onFileSectionCollapsedChange={onFileSectionCollapsedChange}
								onLoadMore={onLoadMoreOperationCommits}
								onSelectCommit={onSelectCommit}
								onSelectFile={onSelectFile}
							/>
						</VcsColumn>
					)}
					{selectedFile ? (
						<VcsFileDiffColumn
							file={selectedFile}
							width={columnWidths.diff}
							minWidth={HISTORY_COLUMN_LIMITS.diff.min}
							maxWidth={HISTORY_COLUMN_LIMITS.diff.max}
							onWidthChange={(width) => onColumnWidthChange("diff", width)}
							onClose={onCloseDiff}
						/>
					) : null}
				</div>
			</div>
			{operations.diagnostics.length > 0 ? (
				<div className="shrink-0 px-3 pb-3">
					<DiagnosticsPanel diagnostics={operations.diagnostics} />
				</div>
			) : null}
		</div>
	);
}

function OperationsColumnContent({
	operations,
	isLoadingMore,
	hasMore,
	selectedOperationId,
	onLoadMore,
	onSelectOperation,
}: {
	operations: VcsJjOperationEntry[];
	isLoadingMore: boolean;
	hasMore: boolean;
	selectedOperationId: string | null;
	onLoadMore: () => void;
	onSelectOperation: (operation: VcsJjOperationEntry) => void;
}): React.ReactElement {
	const groupedOperations = useMemo(() => {
		const groups = new Map<string, VcsJjOperationEntry[]>();
		for (const operation of operations) {
			const key = formatDateGroup(operation.timestamp);
			groups.set(key, [...(groups.get(key) ?? []), operation]);
		}
		return [...groups.entries()];
	}, [operations]);

	if (operations.length === 0) {
		return (
			<div className="p-3">
				<EmptyState title="No operations">No JJ operation entries were returned.</EmptyState>
			</div>
		);
	}

	return (
		<div>
			{groupedOperations.map(([group, entries]) => (
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
			))}
			{hasMore || isLoadingMore ? (
				<div className="border-t border-divider p-2">
					<button
						type="button"
						className="flex h-8 w-full items-center justify-center rounded-md border border-border bg-surface-0 text-xs font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary disabled:opacity-60"
						disabled={isLoadingMore}
						onClick={onLoadMore}
					>
						{isLoadingMore ? "Loading more operations..." : "Load more operations"}
					</button>
				</div>
			) : null}
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
				"grid w-full grid-cols-[72px_24px_minmax(0,1fr)] gap-2 px-3 py-3 text-left hover:bg-surface-2",
				selected && "bg-surface-2",
				selected && SELECTED_OPERATION_MARKER_CLASS,
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
				<div className="mt-2">
					<StatusChip
						label={operation.restoreEligible ? "Restore eligible" : "Snapshot"}
						tone={operation.restoreEligible ? "gold" : "neutral"}
						icon={<RotateCcw size={12} />}
					/>
				</div>
			</div>
		</button>
	);
}

function OperationCommitGraphColumn({
	operation,
	state,
	isLoadingMore,
	hasMore,
	commitDiffState,
	selectedCommitHash,
	selectedFilePath,
	fileViewMode,
	isFileSectionCollapsed,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onLoadMore,
	onSelectCommit,
	onSelectFile,
}: {
	operation: VcsJjOperationEntry | null;
	state: QueryState<VcsJjOperationDiffResponse>;
	isLoadingMore: boolean;
	hasMore: boolean;
	commitDiffState: QueryState<RuntimeGitCommitDiffResponse>;
	selectedCommitHash: string | null;
	selectedFilePath: string | null;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onLoadMore: () => void;
	onSelectCommit: (commit: VcsJjOperationCommit) => void;
	onSelectFile: (path: string) => void;
}): React.ReactElement {
	if (!operation) {
		return (
			<div className="p-3">
				<EmptyState title="Select a snapshot">Choose an operation to show its commit graph.</EmptyState>
			</div>
		);
	}
	if (state.status === "loading") {
		return <CommitRowsSkeleton />;
	}
	if (state.status === "error") {
		return (
			<div className="p-3">
				<EmptyState title="Commit graph unavailable">{state.message}</EmptyState>
			</div>
		);
	}
	if (state.data.commits.length === 0) {
		return (
			<div className="grid gap-3 p-3">
				<EmptyState title="No commit graph">
					JJ did not return commits for this operation. Affected files are still listed when available.
				</EmptyState>
				<OperationAffectedFiles files={state.data.files} />
				<DiagnosticsPanel diagnostics={state.data.diagnostics} />
			</div>
		);
	}

	const selectedFiles = toFileChanges(commitDiffState);
	const selectedError =
		commitDiffState.status === "error"
			? commitDiffState.message
			: commitDiffState.status === "ready" && !commitDiffState.data.ok
				? commitDiffState.data.error ?? "The selected commit diff could not be read."
				: null;

	return (
		<div className="py-1">
			{state.data.commits.map((commit, index) => {
				const selected = selectedCommitHash === commit.hash;
				return (
					<div key={commit.hash} className={cn("border-b border-divider last:border-b-0", selected && "bg-surface-2")}>
						<button
							type="button"
							className="relative flex w-full min-w-0 gap-3 px-3 py-3 text-left hover:bg-surface-2"
							onClick={() => onSelectCommit(commit)}
						>
							{selected ? <span aria-hidden className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-accent" /> : null}
							<div className="relative flex w-7 shrink-0 justify-center">
								<span className="absolute bottom-[-13px] top-[-13px] w-px bg-accent/70" />
								<span
									className={cn(
										"relative mt-1 grid h-3 w-3 place-items-center rounded-full border border-accent bg-surface-1",
										index === 0 && "bg-accent",
									)}
								/>
							</div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium text-text-primary">{commit.message || "Untitled commit"}</div>
								<div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-tertiary">
									<GitCommit size={12} />
									<code>{commit.changeId ?? commit.shortHash}</code>
									{commit.authorName ? <span>{commit.authorName}</span> : null}
									<span>{formatRelativeTime(commit.date)}</span>
								</div>
							</div>
						</button>
						{selected ? (
							<VcsInlineFileSection
								title="Changed files"
								files={selectedFiles}
								selectedPath={selectedFilePath}
								isLoading={commitDiffState.status === "loading"}
								errorMessage={selectedError}
								viewMode={fileViewMode}
								onViewModeChange={onFileViewModeChange}
								collapsed={isFileSectionCollapsed}
								onCollapsedChange={onFileSectionCollapsedChange}
								onSelectPath={onSelectFile}
							/>
						) : null}
					</div>
				);
			})}
			{hasMore || isLoadingMore ? (
				<div className="border-t border-divider p-2">
					<button
						type="button"
						className="flex h-8 w-full items-center justify-center rounded-md border border-border bg-surface-0 text-xs font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary disabled:opacity-60"
						disabled={isLoadingMore}
						onClick={onLoadMore}
					>
						{isLoadingMore ? "Loading more commits..." : "Load more commits"}
					</button>
				</div>
			) : null}
			<DiagnosticsPanel diagnostics={state.data.diagnostics} />
		</div>
	);
}

function CommitRowsSkeleton({ rows = 10 }: { rows?: number }): React.ReactElement {
	return (
		<div className="py-1">
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="flex min-w-0 gap-3 border-b border-divider px-3 py-3">
					<div className="relative flex w-7 shrink-0 justify-center">
						<span className="absolute bottom-[-13px] top-[-13px] w-px bg-border" />
						<span className="kb-skeleton relative mt-1 h-3 w-3 rounded-full" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="kb-skeleton h-4 w-4/5" />
						<div className="mt-2 flex gap-2">
							<div className="kb-skeleton h-3 w-14" />
							<div className="kb-skeleton h-3 w-20" />
							<div className="kb-skeleton h-3 w-16" />
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

function OperationAffectedFiles({ files }: { files: VcsJjOperationFile[] }): React.ReactElement | null {
	if (files.length === 0) {
		return null;
	}
	return (
		<div className="rounded-lg border border-border bg-surface-1">
			<header className="border-b border-border px-3 py-2 text-sm font-semibold text-text-primary">
				Affected files
			</header>
			<div className="grid gap-1 p-2">
				{files.map((file) => (
					<div key={`${file.status}:${file.path}`} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface-0 px-2 py-1.5 text-xs">
						<FileStatusGlyph status={file.status} />
						<span className="truncate text-text-secondary">{file.path}</span>
					</div>
				))}
			</div>
		</div>
	);
}
