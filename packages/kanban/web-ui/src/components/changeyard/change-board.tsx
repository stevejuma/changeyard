import {
	DragDropContext,
	Draggable,
	Droppable,
	type DragStart,
	type DropResult,
} from "@hello-pangea/dnd";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Copy,
	FileText,
	FolderTree,
	GitCommitVertical,
	GitPullRequest,
	List,
	MoreHorizontal,
	Plus,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	Fragment,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	type ReactElement,
	type ReactNode,
} from "react";

import { BoardCard } from "@/components/board-card";
import { DependencyOverlay } from "@/components/dependencies/dependency-overlay";
import { useDependencyLinking } from "@/components/dependencies/use-dependency-linking";
import {
	getChangeBoardFilesCacheKey,
	getChangeBoardSummaryCacheKey,
	readCachedChangeBoardFiles,
	readCachedChangeBoardSummary,
	writeCachedChangeBoardFiles,
	writeCachedChangeBoardSummary,
} from "@/components/changeyard/change-board-cache";
import { PlanningBadge } from "@/components/changeyard/planning-badge";
import { buildUnifiedDiffRows, parsePatchToRows, ReadOnlyUnifiedDiff } from "@/components/shared/diff-renderer";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ColumnIndicator } from "@/components/ui/column-indicator";
import { ChangeStatusChip, StatusChip } from "@/components/ui/status-chip";
import { getRuntimeTrpcClient } from "@/runtime/trpc-client";
import type {
	RuntimeChangeyardBoardFilesResponse,
	RuntimeChangeyardBoardFilesScope,
	RuntimeChangeyardBoardFileDiffResponse,
	RuntimeChangeyardBoardFileSummary,
	RuntimeChangeyardBoardSummaryResponse,
	RuntimeChangeyardChangeListItem,
	RuntimeTaskSessionSummary,
} from "@/runtime/types";
import { LocalStorageKey, readLocalStorageItem, writeLocalStorageItem } from "@/storage/local-storage-store";
import type { BoardCard as BoardCardModel, BoardColumnId, BoardData, DependencyEdge, DependencyNodeId } from "@/types";
import { buildFileTree, type FileTreeNode } from "@/utils/file-tree";

export type ChangeBoardFilter = "all" | "changes" | "planned";
export type ChangeColumnId = "backlog" | "ready" | "in_progress" | "blocked" | "review" | "done" | "abandoned";

const CHANGE_CARD_PREFIX = "change:";
const TASK_CARD_PREFIX = "task:";
const EXPANDED_COLUMN_WIDTH = 342;
const MIN_EXPANDED_COLUMN_WIDTH = 310;
const MAX_EXPANDED_COLUMN_WIDTH = 520;
const COLLAPSED_COLUMN_WIDTH = 36;
const COLUMN_GAP = 12;

const CHANGE_COLUMNS: Array<{ id: ChangeColumnId; title: string; statuses: string[] }> = [
	{ id: "backlog", title: "Backlog", statuses: ["draft"] },
	{ id: "ready", title: "Ready", statuses: ["ready", "synced"] },
	{ id: "in_progress", title: "In Progress", statuses: ["in_progress", "changes_requested"] },
	{ id: "blocked", title: "Blocked", statuses: ["blocked"] },
	{ id: "review", title: "Review / PR", statuses: ["ready_for_pr", "pr_open", "in_review"] },
	{ id: "done", title: "Done", statuses: ["approved", "merged"] },
	{ id: "abandoned", title: "Abandoned", statuses: ["abandoned"] },
];

function encodeChangeNodeId(changeId: string): DependencyNodeId {
	return `change:${changeId}`;
}

function decodeChangeNodeId(nodeId: DependencyNodeId): string | null {
	return nodeId.startsWith("change:") ? nodeId.slice(7) : null;
}

function buildChangeDependencyEdges(changes: RuntimeChangeyardChangeListItem[]): DependencyEdge[] {
	return changes.flatMap((change) =>
		change.dependencies.blockedBy.map((blockedByChangeId) => ({
			id: `change-link:${change.id}:${blockedByChangeId}`,
			fromNodeId: encodeChangeNodeId(change.id),
			toNodeId: encodeChangeNodeId(blockedByChangeId),
			createdAt: 0,
		})),
	);
}

function canCreateChangeDependency(
	changes: RuntimeChangeyardChangeListItem[],
	changeId: string,
	blockedByChangeId: string,
): boolean {
	if (!changeId || !blockedByChangeId || changeId === blockedByChangeId) {
		return false;
	}
	const changeById = new Map(changes.map((change) => [change.id, change] as const));
	const source = changeById.get(changeId);
	const target = changeById.get(blockedByChangeId);
	if (!source || !target) {
		return false;
	}
	if (source.dependencies.blockedBy.includes(blockedByChangeId)) {
		return false;
	}
	const pending = [...target.dependencies.blockedBy];
	const seen = new Set<string>();
	while (pending.length > 0) {
		const current = pending.pop();
		if (!current || seen.has(current)) {
			continue;
		}
		if (current === changeId) {
			return false;
		}
		seen.add(current);
		const next = changeById.get(current);
		if (next) {
			pending.push(...next.dependencies.blockedBy);
		}
	}
	return true;
}

function columnForStatus(status: string): ChangeColumnId {
	for (const column of CHANGE_COLUMNS) {
		if (column.statuses.includes(status)) {
			return column.id;
		}
	}
	return "backlog";
}

function isPlannedChange(change: RuntimeChangeyardChangeListItem): boolean {
	return change.planning !== null;
}

function filterChanges(changes: RuntimeChangeyardChangeListItem[], filter: ChangeBoardFilter): RuntimeChangeyardChangeListItem[] {
	switch (filter) {
		case "changes":
			return changes.filter((change) => !isPlannedChange(change));
		case "planned":
			return changes.filter((change) => isPlannedChange(change));
		default:
			return changes;
	}
}

function mapTaskColumnToChangeColumn(taskColumnId: string): ChangeColumnId {
	switch (taskColumnId) {
		case "backlog":
			return "backlog";
		case "in_progress":
			return "in_progress";
		case "review":
			return "review";
		case "trash":
			return "abandoned";
		default:
			return "backlog";
	}
}

function mapChangeColumnToTaskColumn(changeColumnId: ChangeColumnId): BoardColumnId | null {
	switch (changeColumnId) {
		case "backlog":
			return "backlog";
		case "in_progress":
			return "in_progress";
		case "review":
			return "review";
		case "abandoned":
			return "trash";
		default:
			return null;
	}
}

function encodeChangeDraggableId(changeId: string): string {
	return `${CHANGE_CARD_PREFIX}${changeId}`;
}

function encodeTaskDraggableId(taskId: string): string {
	return `${TASK_CARD_PREFIX}${taskId}`;
}

function decodeDraggableId(draggableId: string): { kind: "change" | "task"; id: string } | null {
	if (draggableId.startsWith(CHANGE_CARD_PREFIX)) {
		return { kind: "change", id: draggableId.slice(CHANGE_CARD_PREFIX.length) };
	}
	if (draggableId.startsWith(TASK_CARD_PREFIX)) {
		return { kind: "task", id: draggableId.slice(TASK_CARD_PREFIX.length) };
	}
	return null;
}

function readCollapsedColumnPreferences(): Partial<Record<ChangeColumnId, boolean>> {
	const raw = readLocalStorageItem(LocalStorageKey.ChangeBoardCollapsedColumns);
	if (!raw) {
		return {};
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") {
			return {};
		}
		const next: Partial<Record<ChangeColumnId, boolean>> = {};
		for (const column of CHANGE_COLUMNS) {
			const value = (parsed as Record<string, unknown>)[column.id];
			if (typeof value === "boolean") {
				next[column.id] = value;
			}
		}
		return next;
	} catch {
		return {};
	}
}

function writeCollapsedColumnPreferences(preferences: Partial<Record<ChangeColumnId, boolean>>): void {
	writeLocalStorageItem(LocalStorageKey.ChangeBoardCollapsedColumns, JSON.stringify(preferences));
}

function clampColumnWidth(width: number): number {
	return Math.min(MAX_EXPANDED_COLUMN_WIDTH, Math.max(MIN_EXPANDED_COLUMN_WIDTH, Math.round(width)));
}

function readColumnWidthPreferences(): Partial<Record<ChangeColumnId, number>> {
	const raw = readLocalStorageItem(LocalStorageKey.ChangeBoardColumnWidths);
	if (!raw) {
		return {};
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") {
			return {};
		}
		const next: Partial<Record<ChangeColumnId, number>> = {};
		for (const column of CHANGE_COLUMNS) {
			const value = (parsed as Record<string, unknown>)[column.id];
			if (typeof value === "number" && Number.isFinite(value)) {
				next[column.id] = clampColumnWidth(value);
			}
		}
		return next;
	} catch {
		return {};
	}
}

function writeColumnWidthPreferences(preferences: Partial<Record<ChangeColumnId, number>>): void {
	writeLocalStorageItem(LocalStorageKey.ChangeBoardColumnWidths, JSON.stringify(preferences));
}

type BoardFileViewMode = "list" | "tree";
type SelectedBoardFile = {
	changeId: string;
	columnId: ChangeColumnId;
	scopeKey: string;
	scope: RuntimeChangeyardBoardFilesScope;
	path: string;
};
const DEFAULT_DIFF_PANEL_WIDTH = 520;
const MIN_DIFF_PANEL_WIDTH = 360;
const MAX_DIFF_PANEL_WIDTH = 820;

function formatDelta(value: number, prefix: "+" | "-"): string {
	return value > 0 ? `${prefix}${value}` : `${prefix}0`;
}

function scopeLabel(scope: RuntimeChangeyardBoardFilesScope): string {
	return scope === "all" ? "All Changes" : "Changed files";
}

function BoardFilesToggle({
	mode,
	onModeChange,
}: {
	mode: BoardFileViewMode;
	onModeChange: (mode: BoardFileViewMode) => void;
}): ReactElement {
	return (
		<div className="inline-flex shrink-0 rounded-md border border-divider bg-surface-0 p-0.5">
			<button
				type="button"
				aria-label="Show files as list"
				title="List"
				onClick={(event) => {
					event.stopPropagation();
					onModeChange("list");
				}}
				className={cn(
					"grid h-6 w-6 place-items-center rounded border border-transparent text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary",
					mode === "list" ? "border-accent/30 bg-accent/15 text-accent" : null,
				)}
			>
				<List size={14} />
			</button>
			<button
				type="button"
				aria-label="Show files as folders"
				title="Folder tree"
				onClick={(event) => {
					event.stopPropagation();
					onModeChange("tree");
				}}
				className={cn(
					"grid h-6 w-6 place-items-center rounded border border-transparent text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary",
					mode === "tree" ? "border-accent/30 bg-accent/15 text-accent" : null,
				)}
			>
				<FolderTree size={14} />
			</button>
		</div>
	);
}

function FileStatusGlyph({ status }: { status: RuntimeChangeyardBoardFileSummary["status"] }): ReactElement {
	const label = status.charAt(0).toUpperCase();
	const tone =
		status === "added" || status === "untracked"
			? "bg-status-green/15 text-status-green"
			: status === "deleted"
				? "bg-status-red/15 text-status-red"
				: status === "renamed" || status === "copied"
					? "bg-status-gold/15 text-status-gold"
					: "bg-status-blue/10 text-status-blue";
	return (
		<span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold", tone)}>
			{label}
		</span>
	);
}

function getBoardScopeKey(scope: RuntimeChangeyardBoardFilesScope): string {
	return scope === "all" ? "all" : `commit:${scope.commitHash}`;
}

type CopyMenuItem = {
	label: string;
	value: string | null | undefined;
};

function copyText(value: string): void {
	void navigator.clipboard?.writeText(value).catch(() => {
		// Ignore clipboard failures.
	});
}

function CopyKebabMenu({
	label,
	items,
}: {
	label: string;
	items: CopyMenuItem[];
}): ReactElement {
	const availableItems = items.filter((item): item is { label: string; value: string } => Boolean(item.value));
	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				<Button
					variant="ghost"
					size="sm"
					icon={<MoreHorizontal size={16} />}
					aria-label={label}
					title={label}
					className="h-7 w-7 shrink-0 px-0"
					onClick={(event) => {
						event.stopPropagation();
					}}
				/>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content
					side="bottom"
					align="end"
					sideOffset={4}
					className="z-50 min-w-[180px] rounded-md border border-border-bright bg-surface-1 p-1 shadow-lg"
					onCloseAutoFocus={(event) => event.preventDefault()}
				>
					<div className="px-2 pb-1 pt-1 text-[11px] font-medium text-text-tertiary">Copy</div>
					{availableItems.length > 0 ? (
						availableItems.map((item) => (
							<DropdownMenu.Item
								key={`${item.label}:${item.value}`}
								className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] text-text-primary outline-none data-[highlighted]:bg-surface-3"
								onSelect={() => copyText(item.value)}
							>
								<Copy size={12} className="shrink-0 text-text-tertiary" />
								<span className="truncate">{item.label}</span>
							</DropdownMenu.Item>
						))
					) : (
						<div className="px-2 py-1.5 text-[12px] text-text-tertiary">No values available</div>
					)}
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

function BoardFileRow({
	file,
	depth = 0,
	selected = false,
	onSelect,
}: {
	file: RuntimeChangeyardBoardFileSummary;
	depth?: number;
	selected?: boolean;
	onSelect: (file: RuntimeChangeyardBoardFileSummary) => void;
}): ReactElement {
	return (
		<button
			type="button"
			className={cn(
				"group flex w-full min-w-0 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-[12px] transition-colors hover:bg-surface-3",
				selected ? "bg-surface-3" : null,
			)}
			style={{ paddingLeft: 6 + depth * 12 }}
			onClick={(event) => {
				event.stopPropagation();
				onSelect(file);
			}}
		>
			<FileStatusGlyph status={file.status} />
			<span className="min-w-0 flex-1 truncate text-text-secondary" title={file.path}>
				{file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path}
			</span>
			<span className="shrink-0 text-green-600">{formatDelta(file.additions, "+")}</span>
			<span className="shrink-0 text-red-600">{formatDelta(file.deletions, "-")}</span>
		</button>
	);
}

function FileTreeRows({
	nodes,
	filesByPath,
	selectedPath,
	onFileSelect,
	depth = 0,
}: {
	nodes: FileTreeNode[];
	filesByPath: Map<string, RuntimeChangeyardBoardFileSummary>;
	selectedPath: string | null;
	onFileSelect: (file: RuntimeChangeyardBoardFileSummary) => void;
	depth?: number;
}): ReactElement {
	return (
		<>
			{nodes.map((node) => {
				if (node.type === "file") {
					const file = filesByPath.get(node.path);
					return file ? (
						<BoardFileRow
							key={node.path}
							file={file}
							depth={depth}
							selected={selectedPath === file.path}
							onSelect={onFileSelect}
						/>
					) : null;
				}
				return (
					<div key={node.path}>
						<div
							className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface-3"
							style={{ paddingLeft: 6 + depth * 12 }}
						>
							<FolderTree size={13} className="shrink-0" />
							<span className="truncate">{node.name}</span>
						</div>
						<FileTreeRows
							nodes={node.children}
							filesByPath={filesByPath}
							selectedPath={selectedPath}
							onFileSelect={onFileSelect}
							depth={depth + 1}
						/>
					</div>
				);
			})}
		</>
	);
}

function BoardFileList({
	files,
	mode,
	selectedPath,
	onFileSelect,
}: {
	files: RuntimeChangeyardBoardFileSummary[];
	mode: BoardFileViewMode;
	selectedPath: string | null;
	onFileSelect: (file: RuntimeChangeyardBoardFileSummary) => void;
}): ReactElement {
	if (files.length === 0) {
		return <div className="px-2 py-2 text-[12px] text-text-tertiary">No changed files.</div>;
	}
	if (mode === "tree") {
		const filesByPath = new Map(files.map((file) => [file.path, file]));
		return (
			<FileTreeRows
				nodes={buildFileTree(files.map((file) => file.path))}
				filesByPath={filesByPath}
				selectedPath={selectedPath}
				onFileSelect={onFileSelect}
			/>
		);
	}
	return (
		<>
			{files.map((file) => (
				<BoardFileRow
					key={`${file.previousPath ?? ""}:${file.path}`}
					file={file}
					selected={selectedPath === file.path}
					onSelect={onFileSelect}
				/>
			))}
		</>
	);
}

function BoardColumnDiffPanel({
	selectedFile,
	diff,
	isLoading,
	error,
	width,
	onResizeStart,
}: {
	selectedFile: SelectedBoardFile;
	diff: RuntimeChangeyardBoardFileDiffResponse | null;
	isLoading: boolean;
	error: Error | null;
	width: number;
	onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
}): ReactElement {
	const rows = diff?.patch
		? parsePatchToRows(diff.patch)
		: diff?.file
			? buildUnifiedDiffRows(diff.file.oldText, diff.file.newText ?? "")
			: [];
	return (
		<section
			data-testid="change-board-file-diff-panel"
			className="relative flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
			style={{ width, minWidth: width }}
		>
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize file diff panel"
				title="Resize diff panel"
				className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-accent/35"
				onPointerDown={onResizeStart}
			/>
			<div className="flex min-h-10 items-center gap-2 border-b border-divider px-3 py-2">
				<FileText size={14} className="shrink-0 text-text-tertiary" />
				<span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-text-primary" title={selectedFile.path}>
					{selectedFile.path}
				</span>
				{diff?.file ? (
					<span className="shrink-0 text-[11px] text-text-tertiary">
						<span className="text-green-600">+{diff.file.additions}</span>{" "}
						<span className="text-red-600">-{diff.file.deletions}</span>
					</span>
				) : null}
			</div>
			<div className="min-h-0 flex-1 overflow-auto p-2">
				{isLoading ? (
					<div className="px-2 py-2 text-[12px] text-text-tertiary">Loading diff...</div>
				) : error ? (
					<div className="px-2 py-2 text-[12px] text-red-600">{error.message}</div>
				) : rows.length > 0 ? (
					<div className="overflow-hidden rounded-md border border-border bg-surface-0">
						<ReadOnlyUnifiedDiff rows={rows} path={selectedFile.path} />
					</div>
				) : (
					<div className="px-2 py-2 text-[12px] text-text-tertiary">No textual diff available.</div>
				)}
			</div>
		</section>
	);
}

function ChangeFileBanner({
	scope,
	summary,
	filesResponse,
	isExpanded,
	isLoading,
	error,
	viewMode,
	onToggle,
	onViewModeChange,
	onLoad,
	selectedFile,
	onFileSelect,
}: {
	scope: RuntimeChangeyardBoardFilesScope;
	summary: RuntimeChangeyardBoardSummaryResponse | null;
	filesResponse: RuntimeChangeyardBoardFilesResponse | null;
	isExpanded: boolean;
	isLoading: boolean;
	error: Error | null;
	viewMode: BoardFileViewMode;
	onToggle: () => void;
	onViewModeChange: (mode: BoardFileViewMode) => void;
	onLoad: () => void;
	selectedFile: SelectedBoardFile | null;
	onFileSelect: (scope: RuntimeChangeyardBoardFilesScope, file: RuntimeChangeyardBoardFileSummary) => void;
}): ReactElement {
	const loadedFiles = filesResponse?.files ?? [];
	const aggregateStats = scope === "all" ? summary?.files : null;
	const fileCount = aggregateStats?.count ?? loadedFiles.length;
	const additions = aggregateStats?.additions ?? loadedFiles.reduce((total, file) => total + file.additions, 0);
	const deletions = aggregateStats?.deletions ?? loadedFiles.reduce((total, file) => total + file.deletions, 0);

	return (
		<div className="mx-2 mb-2 rounded-lg border border-divider bg-surface-0">
			<button
				type="button"
				className="flex w-full items-center gap-2 px-2 py-2 text-left"
				onClick={(event) => {
					event.stopPropagation();
					if (!isExpanded) {
						onLoad();
					}
					onToggle();
				}}
			>
				{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
				<span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{scopeLabel(scope)}</span>
				<span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold">{fileCount}</span>
				<span className="text-[12px] font-medium text-green-600">{formatDelta(additions, "+")}</span>
				<span className="text-[12px] font-medium text-red-600">{formatDelta(deletions, "-")}</span>
				<BoardFilesToggle mode={viewMode} onModeChange={onViewModeChange} />
			</button>
			{isExpanded ? (
				<div className="border-t border-divider">
					{isLoading ? (
						<div className="px-2 py-2 text-[12px] text-text-tertiary">Loading files...</div>
					) : error ? (
						<div className="px-2 py-2 text-[12px] text-red-600">{error.message}</div>
					) : (
						<div className="max-h-[250px] overflow-y-auto px-1 py-1">
							<BoardFileList
								files={loadedFiles}
								mode={viewMode}
								selectedPath={selectedFile?.scopeKey === getBoardScopeKey(scope) ? selectedFile.path : null}
								onFileSelect={(file) => onFileSelect(scope, file)}
							/>
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}

function ChangeCard({
	change,
	index,
	selected,
	workspaceId,
	workspaceEventVersion,
	columnId,
	selectedFile,
	onSelectCard,
	onOpenDetails,
	onFileSelect,
	onCommitUnselect,
	onDependencyPointerDown,
	onDependencyPointerEnter,
	isDependencySource,
	isDependencyTarget,
	isDependencyLinking,
}: {
	change: RuntimeChangeyardChangeListItem;
	index: number;
	selected: boolean;
	workspaceId?: string | null;
	workspaceEventVersion: number;
	columnId: ChangeColumnId;
	selectedFile: SelectedBoardFile | null;
	onSelectCard: (changeId: string) => void;
	onOpenDetails: (changeId: string) => void;
	onFileSelect: (
		input: Pick<SelectedBoardFile, "changeId" | "columnId" | "scopeKey" | "scope" | "path">,
	) => void;
	onCommitUnselect: (changeId: string, commitHash: string) => void;
	onDependencyPointerDown?: (nodeId: DependencyNodeId, event: ReactMouseEvent<HTMLElement>) => void;
	onDependencyPointerEnter?: (nodeId: DependencyNodeId) => void;
	isDependencySource?: boolean;
	isDependencyTarget?: boolean;
	isDependencyLinking?: boolean;
}): ReactElement {
	const [summary, setSummary] = useState<RuntimeChangeyardBoardSummaryResponse | null>(null);
	const [summaryLoading, setSummaryLoading] = useState(false);
	const [summaryError, setSummaryError] = useState<Error | null>(null);
	const [allFiles, setAllFiles] = useState<RuntimeChangeyardBoardFilesResponse | null>(null);
	const [allFilesLoading, setAllFilesLoading] = useState(false);
	const [allFilesError, setAllFilesError] = useState<Error | null>(null);
	const [allFilesExpanded, setAllFilesExpanded] = useState(false);
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
	const [expandedCommitHash, setExpandedCommitHash] = useState<string | null>(null);
	const [commitFiles, setCommitFiles] = useState<Record<string, RuntimeChangeyardBoardFilesResponse | null>>({});
	const [commitFileLoading, setCommitFileLoading] = useState<Record<string, boolean>>({});
	const [commitFileErrors, setCommitFileErrors] = useState<Record<string, Error | null>>({});
	const [allFilesMode, setAllFilesMode] = useState<BoardFileViewMode>("list");
	const [commitFilesMode, setCommitFilesMode] = useState<BoardFileViewMode>("list");
	const summaryCacheKey = useMemo(
		() => getChangeBoardSummaryCacheKey(workspaceId ?? null, change, workspaceEventVersion),
		[workspaceEventVersion, workspaceId, change],
	);
	const summaryRequestRef = useRef<Promise<RuntimeChangeyardBoardSummaryResponse | null> | null>(null);
	const previousWorkspaceEventVersionRef = useRef(workspaceEventVersion);

	const loadSummary = useCallback(async () => {
		if (summaryRequestRef.current) {
			return summaryRequestRef.current;
		}
		const cached = readCachedChangeBoardSummary(summaryCacheKey);
		if (cached) {
			setSummary(cached);
			setSummaryError(null);
			setSummaryLoading(false);
			return cached;
		}
		setSummaryLoading(true);
		setSummaryError(null);
		const request = (async () => {
			const response = await getRuntimeTrpcClient(workspaceId ?? null).changes.getBoardSummary.query({ id: change.id });
			writeCachedChangeBoardSummary(summaryCacheKey, response);
			setSummary(response);
			return response;
		})();
		summaryRequestRef.current = request;
		try {
			return await request;
		} catch (error) {
			const nextError = error instanceof Error ? error : new Error(String(error));
			setSummaryError(nextError);
			return null;
		} finally {
			summaryRequestRef.current = null;
			setSummaryLoading(false);
		}
	}, [change.id, summaryCacheKey, workspaceId]);

	const fetchFiles = useCallback(
		async (
			scope: RuntimeChangeyardBoardFilesScope,
			activeSummary: RuntimeChangeyardBoardSummaryResponse,
		): Promise<RuntimeChangeyardBoardFilesResponse> => {
			const filesCacheKey = getChangeBoardFilesCacheKey(summaryCacheKey, activeSummary.version, scope);
			const cached = readCachedChangeBoardFiles(filesCacheKey);
			if (cached) {
				return cached;
			}
			const response = await getRuntimeTrpcClient(workspaceId ?? null).changes.getBoardFiles.query({
				id: change.id,
				scope,
			});
			writeCachedChangeBoardFiles(filesCacheKey, response);
			return response;
		},
		[change.id, summaryCacheKey, workspaceId],
	);

	const loadFiles = useCallback(
		async (scope: RuntimeChangeyardBoardFilesScope) => {
			const activeSummary = summary ?? (await loadSummary());
			if (!activeSummary) {
				return null;
			}
			return await fetchFiles(scope, activeSummary);
		},
		[fetchFiles, loadSummary, summary],
	);

	const loadAllFiles = useCallback(async (): Promise<RuntimeChangeyardBoardFilesResponse | null> => {
		if (allFilesLoading) {
			return allFiles;
		}
		setAllFilesLoading(true);
		setAllFilesError(null);
		try {
			const response = await loadFiles("all");
			setAllFiles(response);
			return response;
		} catch (error) {
			setAllFilesError(error instanceof Error ? error : new Error(String(error)));
			return null;
		} finally {
			setAllFilesLoading(false);
		}
	}, [allFiles, allFilesLoading, loadFiles]);

	const loadCommitFiles = useCallback(
		async (commitHash: string): Promise<RuntimeChangeyardBoardFilesResponse | null> => {
			if (commitFileLoading[commitHash]) {
				return commitFiles[commitHash] ?? null;
			}
			setCommitFileLoading((current) => ({ ...current, [commitHash]: true }));
			setCommitFileErrors((current) => ({ ...current, [commitHash]: null }));
			try {
				const response = await loadFiles({ commitHash });
				setCommitFiles((current) => ({ ...current, [commitHash]: response }));
				return response;
			} catch (error) {
				setCommitFileErrors((current) => ({
					...current,
					[commitHash]: error instanceof Error ? error : new Error(String(error)),
				}));
				return null;
			} finally {
				setCommitFileLoading((current) => ({ ...current, [commitHash]: false }));
			}
		},
		[commitFileLoading, commitFiles, loadFiles],
	);

	useEffect(() => {
		if (selected) {
			void loadSummary();
		}
	}, [loadSummary, selected]);

	useEffect(() => {
		if (previousWorkspaceEventVersionRef.current === workspaceEventVersion) {
			return;
		}
		previousWorkspaceEventVersionRef.current = workspaceEventVersion;
		summaryRequestRef.current = null;
		setSummary(null);
		setSummaryError(null);
		setAllFiles(null);
		setAllFilesError(null);
		setCommitFiles({});
		setCommitFileErrors({});
		if (!selected) {
			return;
		}
		void loadSummary().then((nextSummary) => {
			if (!nextSummary) {
				return;
			}
			if (allFilesExpanded) {
				setAllFilesLoading(true);
				void fetchFiles("all", nextSummary)
					.then((response) => {
						setAllFiles(response);
					})
					.catch((error: unknown) => {
						setAllFilesError(error instanceof Error ? error : new Error(String(error)));
					})
					.finally(() => {
						setAllFilesLoading(false);
					});
			}
			if (expandedCommitHash) {
				setCommitFileLoading((current) => ({ ...current, [expandedCommitHash]: true }));
				void fetchFiles({ commitHash: expandedCommitHash }, nextSummary)
					.then((response) => {
						setCommitFiles((current) => ({ ...current, [expandedCommitHash]: response }));
					})
					.catch((error: unknown) => {
						setCommitFileErrors((current) => ({
							...current,
							[expandedCommitHash]: error instanceof Error ? error : new Error(String(error)),
						}));
					})
					.finally(() => {
						setCommitFileLoading((current) => ({ ...current, [expandedCommitHash]: false }));
					});
			}
		});
	}, [allFilesExpanded, expandedCommitHash, fetchFiles, loadSummary, selected, workspaceEventVersion]);

	const selectFirstAllChangesFile = useCallback(() => {
		setAllFilesExpanded(true);
		void loadAllFiles().then((response) => {
			const firstFile = response?.files[0] ?? allFiles?.files[0] ?? null;
			if (!firstFile) {
				return;
			}
			onFileSelect({
				changeId: change.id,
				columnId,
				scopeKey: "all",
				scope: "all",
				path: firstFile.path,
			});
		});
	}, [allFiles, change.id, columnId, loadAllFiles, onFileSelect]);

	const handleCardSelect = () => {
		const hadCommitSelection = selectedCommitHash !== null;
		if (hadCommitSelection) {
			setSelectedCommitHash(null);
			setExpandedCommitHash(null);
		}
		if (selected && !hadCommitSelection) {
			onSelectCard(change.id);
			return;
		}
		if (!selected) {
			onSelectCard(change.id);
		}
		selectFirstAllChangesFile();
	};

	const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleCardSelect();
		}
	};

	const handleCommitSelect = (commitHash: string) => {
		setAllFilesExpanded(false);
		setSelectedCommitHash(commitHash);
		if (expandedCommitHash !== commitHash) {
			setExpandedCommitHash(commitHash);
		}
		void loadCommitFiles(commitHash).then((response) => {
			const firstFile = response?.files[0] ?? commitFiles[commitHash]?.files[0] ?? null;
			if (!firstFile) {
				return;
			}
			const scope = { commitHash };
			onFileSelect({
				changeId: change.id,
				columnId,
				scopeKey: getBoardScopeKey(scope),
				scope,
				path: firstFile.path,
			});
		});
	};

	return (
		<Draggable draggableId={encodeChangeDraggableId(change.id)} index={index}>
			{(provided, snapshot) => (
				<div
					ref={provided.innerRef}
					{...provided.draggableProps}
					{...provided.dragHandleProps}
					data-change-id={change.id}
					data-dependency-node-id={encodeChangeNodeId(change.id)}
					data-column-id={columnId}
					className={cn(
						"overflow-hidden rounded-lg border text-left transition-colors",
						selected && selectedCommitHash === null ? "border-divider bg-surface-2" : "border-divider bg-surface-0 hover:bg-surface-2",
						isDependencySource ? "kb-board-card-dependency-source" : null,
						isDependencyTarget ? "kb-board-card-dependency-target" : null,
					)}
					onMouseDownCapture={(event) => {
						if (!event.metaKey && !event.ctrlKey) {
							return;
						}
						const target = event.target as HTMLElement | null;
						if (target?.closest("button, a, input, textarea, [contenteditable='true']")) {
							return;
						}
						event.preventDefault();
						event.stopPropagation();
						onDependencyPointerDown?.(encodeChangeNodeId(change.id), event);
					}}
					onMouseEnter={() => {
						onDependencyPointerEnter?.(encodeChangeNodeId(change.id));
					}}
					onMouseMove={() => {
						if (!isDependencyLinking) {
							return;
						}
						onDependencyPointerEnter?.(encodeChangeNodeId(change.id));
					}}
					style={{
						...provided.draggableProps.style,
						marginBottom: 6,
						flexShrink: 0,
						cursor: snapshot.isDragging ? "grabbing" : "grab",
					}}
				>
					<div className="relative flex items-start gap-2 px-3 py-2">
						{selected && selectedCommitHash === null ? (
							<span
								aria-hidden
								className="absolute left-0 top-1/2 h-12 w-1 -translate-y-1/2 rounded-r-full bg-accent"
							/>
						) : null}
						<div
							role="button"
							tabIndex={0}
							className="min-w-0 flex-1"
							onClick={handleCardSelect}
							onKeyDown={handleHeaderKeyDown}
						>
							<div className="flex min-w-0 items-center gap-2">
								<span className="line-clamp-2 text-sm font-semibold text-text-primary">{change.title}</span>
							</div>
							<div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[12px] text-text-secondary">
								{change.workspace?.branch ? <span className="truncate">{change.workspace.branch}</span> : null}
								{change.workspace?.branch ? <span aria-hidden>•</span> : null}
								<ChangeStatusChip status={change.status} />
								{change.remote?.pullRequestUrl ? (
									<StatusChip label="PR" icon={<GitPullRequest size={12} />} tone="green" />
								) : null}
								<StatusChip label="No checks" />
							</div>
						</div>
						<Button
							variant="ghost"
							size="sm"
							icon={<FileText size={16} />}
							aria-label={`View details for ${change.id}`}
							title="View details"
							onClick={(event) => {
								event.stopPropagation();
								onOpenDetails(change.id);
							}}
							className="h-8 w-8 shrink-0 px-0"
						/>
					</div>
					{selected ? (
						<ChangeFileBanner
							scope="all"
							summary={summary}
							filesResponse={allFiles}
							isExpanded={allFilesExpanded}
							isLoading={summaryLoading || allFilesLoading}
							error={summaryError ?? allFilesError}
							viewMode={allFilesMode}
							onToggle={() => setAllFilesExpanded((current) => !current)}
							onViewModeChange={setAllFilesMode}
							onLoad={loadAllFiles}
							selectedFile={selectedFile}
							onFileSelect={(scope, file) => {
								onFileSelect({
									changeId: change.id,
									columnId,
									scopeKey: getBoardScopeKey(scope),
									scope,
									path: file.path,
								});
							}}
						/>
					) : null}
					<div className="flex items-center gap-2 border-y border-divider bg-surface-1 px-3 py-2">
						<StatusChip label={change.type} />
						<PlanningBadge planning={change.planning} />
						<span className="min-w-0 flex-1" />
						<CopyKebabMenu
							label={`More actions for ${change.id}`}
							items={[
								{ label: "Workspace Path", value: change.workspace?.path },
								{ label: "Git Hash", value: summary?.workspaceHead },
								{ label: "Change Id", value: change.id },
								{ label: "Change File", value: change.path },
								{ label: "Base Revision", value: change.base?.revision },
								{ label: "Branch", value: change.workspace?.branch },
								{ label: "Title", value: change.title },
							]}
						/>
					</div>
					{selected ? (
						<div className="py-1">
							{summaryLoading ? (
								<div className="px-3 py-2 text-[12px] text-text-tertiary">Loading commits...</div>
							) : summaryError ? (
								<div className="px-3 py-2 text-[12px] text-red-600">{summaryError.message}</div>
							) : summary?.commits.length ? (
								summary.commits.map((commit) => {
									const commitSelected = selectedCommitHash === commit.hash;
									const commitExpanded = expandedCommitHash === commit.hash;
									return (
										<div key={commit.hash} className={cn("border-t border-divider first:border-t-0", commitSelected ? "bg-surface-2" : null)}>
											<div
												className={cn(
													"relative flex w-full min-w-0 items-center gap-2 hover:bg-surface-2",
													commitSelected ? "bg-surface-2" : null,
												)}
											>
												{commitSelected ? (
													<span
														aria-hidden
														className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-accent"
													/>
												) : null}
												<button
													type="button"
													className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
													onClick={(event) => {
														event.stopPropagation();
														handleCommitSelect(commit.hash);
													}}
												>
													<GitCommitVertical size={14} className="shrink-0 text-text-tertiary" />
													<span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{commit.message}</span>
													<span className="shrink-0 text-[11px] text-text-tertiary">{commit.shortHash}</span>
												</button>
												<div className="pr-2">
													<CopyKebabMenu
														label={`More actions for commit ${commit.shortHash}`}
														items={[
															{ label: "Git Hash", value: commit.hash },
															{ label: "Short Hash", value: commit.shortHash },
															{ label: "Commit Message", value: commit.message },
															{ label: "Author", value: commit.authorName },
															{ label: "Author Email", value: commit.authorEmail },
															{ label: "Commit Date", value: commit.date },
															{ label: "Change Id", value: change.id },
															{ label: "Workspace Path", value: change.workspace?.path },
														]}
													/>
												</div>
											</div>
											{commitExpanded ? (
												<ChangeFileBanner
													scope={{ commitHash: commit.hash }}
													summary={summary}
													filesResponse={commitFiles[commit.hash] ?? null}
													isExpanded
													isLoading={commitFileLoading[commit.hash] ?? false}
													error={commitFileErrors[commit.hash] ?? null}
													viewMode={commitFilesMode}
													onToggle={() => {
														setExpandedCommitHash(null);
														onCommitUnselect(change.id, commit.hash);
													}}
													onViewModeChange={setCommitFilesMode}
													onLoad={() => {
														void loadCommitFiles(commit.hash);
													}}
													selectedFile={selectedFile}
													onFileSelect={(scope, file) => {
														onFileSelect({
															changeId: change.id,
															columnId,
															scopeKey: getBoardScopeKey(scope),
															scope,
															path: file.path,
														});
													}}
												/>
											) : null}
										</div>
									);
								})
							) : (
								<div className="px-3 py-2 text-[12px] text-text-tertiary">
									{summary?.error ?? "No commits found for this change."}
								</div>
							)}
						</div>
					) : null}
				</div>
			)}
		</Draggable>
	);
}

function CollapsedChangeColumn({
	columnId,
	title,
	count,
	isDropDisabled,
	onToggle,
	children,
}: {
	columnId: ChangeColumnId;
	title: string;
	count: number;
	isDropDisabled?: boolean;
	onToggle: () => void;
	children: (provided: { innerRef: (element: HTMLElement | null) => void; droppableProps: Record<string, unknown>; placeholder: ReactNode }) => ReactNode;
}): ReactElement {
	return (
		<Droppable droppableId={columnId} isDropDisabled={isDropDisabled}>
			{(provided) => (
				<div
					ref={provided.innerRef}
					{...provided.droppableProps}
					data-column-id={columnId}
					className="flex shrink-0 overflow-hidden border border-border bg-surface-1"
					style={{ width: COLLAPSED_COLUMN_WIDTH, minWidth: COLLAPSED_COLUMN_WIDTH, borderRadius: 8 }}
				>
					<button
						type="button"
						aria-label={`Expand ${title} column`}
						title={`${title} (${count})`}
						onClick={onToggle}
						className="flex flex-1 flex-col items-center justify-start gap-2 px-1 py-2 text-text-secondary hover:text-text-primary"
					>
						<ColumnIndicator columnId={columnId} />
						<span className="inline-flex items-center gap-1 text-[11px] font-semibold [writing-mode:vertical-rl]">
							<span>{title}</span>
							<span className="font-medium text-text-tertiary">{count}</span>
						</span>
						<ChevronRight size={14} />
					</button>
					{children({
						innerRef: () => {},
						droppableProps: {},
						placeholder: provided.placeholder,
					})}
				</div>
			)}
		</Droppable>
	);
}

export function ChangeBoard({
	board,
	changes,
	filter,
	selectedChangeId,
	selectedTaskId,
	isLoading = false,
	taskSessions = {},
	onFilterChange,
	onSelectChange,
	onSelectTask,
	onCreateChange,
	onCreateTask,
	onMoveChange,
	onLinkChange,
	onUnlinkChange,
	onMoveTask,
	onStartTask,
	onCommitTask,
	onOpenPrTask,
	onCancelAutomaticTaskAction,
	onMoveToTrashTask,
	onRestoreFromTrashTask,
	commitTaskLoadingById,
	openPrTaskLoadingById,
	moveToTrashLoadingById,
	workspacePath,
	workspaceId,
	workspaceEventVersions = {},
	defaultClineModelId,
}: {
	board: BoardData;
	changes: RuntimeChangeyardChangeListItem[];
	filter: ChangeBoardFilter;
	selectedChangeId: string | null;
	selectedTaskId: string | null;
	isLoading?: boolean;
	taskSessions?: Record<string, RuntimeTaskSessionSummary>;
	onFilterChange: (nextFilter: ChangeBoardFilter) => void;
	onSelectChange: (changeId: string) => void;
	onSelectTask: (taskId: string) => void;
	onCreateChange?: () => void;
	onCreateTask?: () => void;
	onMoveChange?: (changeId: string, targetColumnId: ChangeColumnId) => void;
	onLinkChange?: (changeId: string, blockedByChangeId: string) => void;
	onUnlinkChange?: (changeId: string, blockedByChangeId: string) => void;
	onMoveTask?: (result: DropResult) => void;
	onStartTask?: (taskId: string) => void;
	onCommitTask?: (taskId: string) => void;
	onOpenPrTask?: (taskId: string) => void;
	onCancelAutomaticTaskAction?: (taskId: string) => void;
	onMoveToTrashTask?: (taskId: string) => void;
	onRestoreFromTrashTask?: (taskId: string) => void;
	commitTaskLoadingById?: Record<string, boolean>;
	openPrTaskLoadingById?: Record<string, boolean>;
	moveToTrashLoadingById?: Record<string, boolean>;
	workspacePath?: string | null;
	workspaceId?: string | null;
	workspaceEventVersions?: Record<string, number>;
	defaultClineModelId?: string | null;
}): ReactElement {
	const [collapsedPreferences, setCollapsedPreferences] = useState(readCollapsedColumnPreferences);
	const [columnWidthPreferences, setColumnWidthPreferences] = useState(readColumnWidthPreferences);
	const [activeDragKind, setActiveDragKind] = useState<"change" | "task" | null>(null);
	const [selectedBoardChangeId, setSelectedBoardChangeId] = useState<string | null>(selectedChangeId);
	const [selectedFile, setSelectedFile] = useState<SelectedBoardFile | null>(null);
	const [fileDiff, setFileDiff] = useState<RuntimeChangeyardBoardFileDiffResponse | null>(null);
	const [fileDiffLoading, setFileDiffLoading] = useState(false);
	const [fileDiffError, setFileDiffError] = useState<Error | null>(null);
	const [diffPanelWidth, setDiffPanelWidth] = useState(DEFAULT_DIFF_PANEL_WIDTH);
	const boardSurfaceRef = useRef<HTMLDivElement | null>(null);
	const filteredChanges = filterChanges(changes, filter);
	const changeDependencyEdges = useMemo(() => buildChangeDependencyEdges(filteredChanges), [filteredChanges]);
	const dependencyLinking = useDependencyLinking({
		canLinkNodes: (fromNodeId, toNodeId) => {
			const fromChangeId = decodeChangeNodeId(fromNodeId);
			const toChangeId = decodeChangeNodeId(toNodeId);
			if (!fromChangeId || !toChangeId) {
				return false;
			}
			return canCreateChangeDependency(filteredChanges, fromChangeId, toChangeId);
		},
		onCreateDependency: (fromNodeId, toNodeId) => {
			const fromChangeId = decodeChangeNodeId(fromNodeId);
			const toChangeId = decodeChangeNodeId(toNodeId);
			if (!fromChangeId || !toChangeId) {
				return;
			}
			onLinkChange?.(fromChangeId, toChangeId);
		},
	});
	const groupedChanges = new Map<ChangeColumnId, RuntimeChangeyardChangeListItem[]>();
	const groupedTasks = new Map<ChangeColumnId, BoardCardModel[]>();

	for (const column of CHANGE_COLUMNS) {
		groupedChanges.set(column.id, []);
		groupedTasks.set(column.id, []);
	}
	for (const change of filteredChanges) {
		groupedChanges.get(columnForStatus(change.status))?.push(change);
	}
	if (filter === "all") {
		for (const column of board.columns) {
			groupedTasks.get(mapTaskColumnToChangeColumn(column.id))?.push(...column.cards);
		}
	}

	const columnModels = CHANGE_COLUMNS.map((column) => {
		const tasks = groupedTasks.get(column.id) ?? [];
		const columnChanges = groupedChanges.get(column.id) ?? [];
		const count = tasks.length + columnChanges.length;
		return {
			...column,
			tasks,
			changes: columnChanges,
			count,
			width: columnWidthPreferences[column.id] ?? EXPANDED_COLUMN_WIDTH,
			collapsed: collapsedPreferences[column.id] ?? count === 0,
		};
	});
	const canvasWidth = useMemo(
		() =>
			columnModels.reduce((total, column) => total + (column.collapsed ? COLLAPSED_COLUMN_WIDTH : column.width), 0) +
			(selectedFile ? diffPanelWidth + COLUMN_GAP : 0) +
			COLUMN_GAP * Math.max(columnModels.length - 1, 0),
		[columnModels, diffPanelWidth, selectedFile],
	);

	const setColumnCollapsed = (columnId: ChangeColumnId, collapsed: boolean) => {
		setCollapsedPreferences((current) => {
			const next = { ...current, [columnId]: collapsed };
			writeCollapsedColumnPreferences(next);
			return next;
		});
	};

	const handleDeleteDependency = (dependencyId: string) => {
		const match = dependencyId.match(/^change-link:([^:]+):([^:]+)$/);
		if (!match) {
			return;
		}
		onUnlinkChange?.(match[1] ?? "", match[2] ?? "");
	};

	const handleDragStart = (start: DragStart) => {
		setActiveDragKind(decodeDraggableId(start.draggableId)?.kind ?? null);
	};

	const handleDragEnd = (result: DropResult) => {
		setActiveDragKind(null);
		const destination = result.destination;
		if (!destination) {
			return;
		}
		const decoded = decodeDraggableId(result.draggableId);
		if (!decoded) {
			return;
		}
		if (decoded.kind === "change") {
			if (destination.droppableId === result.source.droppableId) {
				return;
			}
			onMoveChange?.(decoded.id, destination.droppableId as ChangeColumnId);
			return;
		}
		const sourceColumnId = mapChangeColumnToTaskColumn(result.source.droppableId as ChangeColumnId);
		const destinationColumnId = mapChangeColumnToTaskColumn(destination.droppableId as ChangeColumnId);
		if (!sourceColumnId || !destinationColumnId) {
			return;
		}
		onMoveTask?.({
			...result,
			draggableId: decoded.id,
			source: { ...result.source, droppableId: sourceColumnId },
			destination: { ...destination, droppableId: destinationColumnId },
		});
	};

	const handleSelectBoardChange = (changeId: string) => {
		setSelectedBoardChangeId((current) => {
			if (current !== changeId) {
				setSelectedFile((file) => (file?.changeId === changeId ? file : null));
				setFileDiff(null);
				setFileDiffError(null);
				setFileDiffLoading(false);
				return changeId;
			}
			setSelectedFile((file) => (file?.changeId === changeId ? null : file));
			setFileDiff(null);
			setFileDiffError(null);
			setFileDiffLoading(false);
			return null;
		});
	};

	const setColumnWidth = (columnId: ChangeColumnId, width: number) => {
		setColumnWidthPreferences((current) => {
			const next = { ...current, [columnId]: clampColumnWidth(width) };
			writeColumnWidthPreferences(next);
			return next;
		});
	};

	const handleColumnResizeStart = (
		event: ReactPointerEvent<HTMLDivElement>,
		columnId: ChangeColumnId,
		startWidth: number,
	) => {
		event.preventDefault();
		event.stopPropagation();
		const startX = event.clientX;
		const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
			setColumnWidth(columnId, startWidth + moveEvent.clientX - startX);
		};
		const handlePointerUp = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};
		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};

	const handleDiffPanelResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		const startX = event.clientX;
		const startWidth = diffPanelWidth;
		const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
			setDiffPanelWidth(
				Math.min(MAX_DIFF_PANEL_WIDTH, Math.max(MIN_DIFF_PANEL_WIDTH, Math.round(startWidth + moveEvent.clientX - startX))),
			);
		};
		const handlePointerUp = () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};
		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	};

	const handleBoardFileSelect = (nextFile: SelectedBoardFile) => {
		setSelectedFile(nextFile);
		setFileDiff(null);
		setFileDiffLoading(true);
		setFileDiffError(null);
		Promise.resolve(
			getRuntimeTrpcClient(workspaceId ?? null).changes.getBoardFileDiff.query({
				id: nextFile.changeId,
				scope: nextFile.scope,
				path: nextFile.path,
			}),
		)
			.then((response) => {
				if (!response) {
					setFileDiff(null);
					setFileDiffLoading(false);
					return;
				}
				setFileDiff(response);
				setFileDiffLoading(false);
			})
			.catch((error: unknown) => {
				setFileDiffError(error instanceof Error ? error : new Error(String(error)));
				setFileDiffLoading(false);
			});
	};

	const handleCommitUnselect = (changeId: string, commitHash: string) => {
		setSelectedFile((current) => {
			if (current?.changeId === changeId && current.scopeKey === `commit:${commitHash}`) {
				setFileDiff(null);
				setFileDiffError(null);
				setFileDiffLoading(false);
				return null;
			}
			return current;
		});
	};

	const selectedFileWorkspaceEventVersion = selectedFile ? (workspaceEventVersions[selectedFile.changeId] ?? 0) : 0;
	const previousSelectedFileWorkspaceEventVersionRef = useRef(selectedFileWorkspaceEventVersion);
	useEffect(() => {
		if (previousSelectedFileWorkspaceEventVersionRef.current === selectedFileWorkspaceEventVersion) {
			return;
		}
		previousSelectedFileWorkspaceEventVersionRef.current = selectedFileWorkspaceEventVersion;
		if (!selectedFile) {
			return;
		}
		setSelectedFile(null);
		setFileDiff(null);
		setFileDiffError(null);
		setFileDiffLoading(false);
	}, [selectedFile, selectedFileWorkspaceEventVersion]);

	return (
		<section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-0 px-3 py-3">
			<div className="mb-3 flex flex-wrap items-center gap-2">
				<div className="flex items-center gap-2">
					<FileText size={14} className="text-text-secondary" />
					<h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Board</h2>
				</div>
				<div className="ml-auto inline-flex rounded-lg border border-divider bg-surface-1 p-1">
					{(["all", "changes", "planned"] as const).map((option) => (
						<button
							key={option}
							type="button"
							onClick={() => {
								if (option !== filter) {
									onFilterChange(option);
								}
							}}
							className={cn(
								"rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
								option === filter ? "bg-surface-2 text-text-primary" : "text-text-secondary hover:text-text-primary",
							)}
						>
							{option}
						</button>
					))}
				</div>
				{onCreateChange ? (
					<Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={onCreateChange} className="h-7">
						Change
					</Button>
				) : null}
			</div>
			{isLoading ? (
				<p className="text-sm text-text-secondary">Loading canonical change files...</p>
			) : (
				<DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
					<div
						ref={boardSurfaceRef}
						className="kb-board kb-dependency-surface"
						style={{ overflowX: "auto", overflowY: "hidden", padding: 0 }}
					>
						<div
							data-testid="change-board-canvas"
							className="flex h-full min-h-0"
							style={{ width: canvasWidth, minWidth: canvasWidth, flex: "0 0 auto", gap: COLUMN_GAP }}
						>
							{columnModels.map((column) => {
								const canCreateTask = filter === "all" && column.id === "backlog" && onCreateTask;
								const taskDropColumnId = mapChangeColumnToTaskColumn(column.id);
								const isDropDisabled = activeDragKind === "task" && taskDropColumnId === null;
								if (column.collapsed) {
									return (
										<CollapsedChangeColumn
											key={column.id}
											columnId={column.id}
											title={column.title}
											count={column.count}
											isDropDisabled={isDropDisabled}
											onToggle={() => setColumnCollapsed(column.id, false)}
										>
											{() => null}
										</CollapsedChangeColumn>
									);
								}
								return (
									<Fragment key={column.id}>
										<section
											data-column-id={column.id}
											className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
											style={{ width: column.width, minWidth: column.width }}
										>
										<div className="flex h-10 items-center justify-between px-3">
											<div className="flex min-w-0 items-center gap-2">
												<ColumnIndicator columnId={column.id} />
												<span className="truncate text-sm font-semibold">{column.title}</span>
												<span className="text-xs text-text-secondary">{column.count}</span>
											</div>
											<Button
												variant="ghost"
												size="sm"
												icon={<ChevronLeft size={14} />}
												aria-label={`Collapse ${column.title} column`}
												title={`Collapse ${column.title}`}
												onClick={() => setColumnCollapsed(column.id, true)}
											/>
										</div>
										<Droppable droppableId={column.id} isDropDisabled={isDropDisabled}>
											{(provided) => (
												<div ref={provided.innerRef} {...provided.droppableProps} className="kb-column-cards">
													{canCreateTask ? (
														<Button
															icon={<Plus size={14} />}
															aria-label="Create task"
															fill
															onClick={onCreateTask}
															style={{ marginBottom: 6, flexShrink: 0 }}
														>
															<span className="inline-flex items-center gap-1.5">
																<span>Create task</span>
																<span aria-hidden className="text-text-secondary">
																	(c)
																</span>
															</span>
														</Button>
													) : null}
													{column.tasks.map((task, index) => (
														<BoardCard
															key={task.id}
															card={task}
															index={index}
															draggableId={encodeTaskDraggableId(task.id)}
															columnId={taskDropColumnId ?? "backlog"}
															sessionSummary={taskSessions[task.id]}
															selected={task.id === selectedTaskId}
															onClick={() => onSelectTask(task.id)}
															onStart={onStartTask}
															onCommit={onCommitTask}
															onOpenPr={onOpenPrTask}
															onCancelAutomaticAction={onCancelAutomaticTaskAction}
															onMoveToTrash={onMoveToTrashTask}
															onRestoreFromTrash={onRestoreFromTrashTask}
															isCommitLoading={commitTaskLoadingById?.[task.id] ?? false}
															isOpenPrLoading={openPrTaskLoadingById?.[task.id] ?? false}
															isMoveToTrashLoading={moveToTrashLoadingById?.[task.id] ?? false}
															workspacePath={workspacePath}
															defaultClineModelId={defaultClineModelId}
														/>
													))}
													{column.changes.map((change, index) => (
														<ChangeCard
															key={change.id}
															change={change}
															index={column.tasks.length + index}
															selected={change.id === selectedBoardChangeId}
															workspaceId={workspaceId}
															workspaceEventVersion={workspaceEventVersions[change.id] ?? 0}
															columnId={column.id}
															selectedFile={selectedFile?.changeId === change.id ? selectedFile : null}
															onSelectCard={handleSelectBoardChange}
															onOpenDetails={onSelectChange}
															onFileSelect={handleBoardFileSelect}
															onCommitUnselect={handleCommitUnselect}
															onDependencyPointerDown={dependencyLinking.onDependencyPointerDown}
															onDependencyPointerEnter={dependencyLinking.onDependencyPointerEnter}
															isDependencySource={dependencyLinking.draft?.sourceNodeId === encodeChangeNodeId(change.id)}
															isDependencyTarget={dependencyLinking.draft?.targetNodeId === encodeChangeNodeId(change.id)}
															isDependencyLinking={dependencyLinking.draft !== null}
														/>
													))}
													{column.count === 0 ? (
														<div className="rounded-md border border-dashed border-divider px-3 py-4 text-sm text-text-secondary">
															No items
														</div>
													) : null}
													{provided.placeholder}
												</div>
											)}
										</Droppable>
										<div
											role="separator"
											aria-orientation="vertical"
											aria-label={`Resize ${column.title} column`}
											title="Resize column"
											className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-accent/35"
											onPointerDown={(event) => handleColumnResizeStart(event, column.id, column.width)}
										/>
										</section>
										{selectedFile?.columnId === column.id ? (
											<BoardColumnDiffPanel
												key={`${column.id}-file-diff-panel`}
												selectedFile={selectedFile}
												diff={fileDiff}
												isLoading={fileDiffLoading}
												error={fileDiffError}
												width={diffPanelWidth}
												onResizeStart={handleDiffPanelResizeStart}
											/>
										) : null}
									</Fragment>
								);
							})}
						</div>
						<DependencyOverlay
							containerRef={boardSurfaceRef}
							dependencies={changeDependencyEdges}
							draft={dependencyLinking.draft}
							activeNodeId={selectedBoardChangeId ? encodeChangeNodeId(selectedBoardChangeId) : null}
							activeNodeEffectiveColumnId={
								selectedBoardChangeId
									? columnForStatus(
											filteredChanges.find((change) => change.id === selectedBoardChangeId)?.status ?? "draft",
										)
									: null
							}
							columnOrder={CHANGE_COLUMNS.map((column) => column.id)}
							onDeleteDependency={handleDeleteDependency}
						/>
					</div>
				</DragDropContext>
			)}
		</section>
	);
}
