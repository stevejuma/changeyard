import {
	DragDropContext,
	Draggable,
	Droppable,
	type DragStart,
	type DropResult,
} from "@hello-pangea/dnd";
import { ChevronLeft, ChevronRight, FileText, Plus } from "lucide-react";
import { useMemo, useState, type ReactElement, type ReactNode } from "react";

import { BoardCard } from "@/components/board-card";
import { PlanningBadge } from "@/components/changeyard/planning-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ColumnIndicator } from "@/components/ui/column-indicator";
import { PathDisplay } from "@/components/ui/path-display";
import { ChangeStatusChip, StatusChip } from "@/components/ui/status-chip";
import type { RuntimeChangeyardChangeListItem, RuntimeTaskSessionSummary } from "@/runtime/types";
import { LocalStorageKey, readLocalStorageItem, writeLocalStorageItem } from "@/storage/local-storage-store";
import type { BoardCard as BoardCardModel, BoardColumnId, BoardData } from "@/types";

export type ChangeBoardFilter = "all" | "changes" | "planned";
export type ChangeColumnId = "backlog" | "ready" | "in_progress" | "blocked" | "review" | "done" | "abandoned";

const CHANGE_CARD_PREFIX = "change:";
const TASK_CARD_PREFIX = "task:";
const EXPANDED_COLUMN_WIDTH = 292;
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

function ChangeCard({
	change,
	index,
	selected,
	repoRoot,
	onOpenDetails,
}: {
	change: RuntimeChangeyardChangeListItem;
	index: number;
	selected: boolean;
	repoRoot?: string | null;
	onOpenDetails: (changeId: string) => void;
}): ReactElement {
	return (
		<Draggable draggableId={encodeChangeDraggableId(change.id)} index={index}>
			{(provided, snapshot) => (
				<div
					ref={provided.innerRef}
					{...provided.draggableProps}
					{...provided.dragHandleProps}
					data-change-id={change.id}
					className={cn(
						"rounded-lg border px-3 py-2 text-left transition-colors",
						selected ? "border-accent bg-surface-2" : "border-divider bg-surface-0 hover:bg-surface-2",
					)}
					style={{
						...provided.draggableProps.style,
						marginBottom: 6,
						cursor: snapshot.isDragging ? "grabbing" : "grab",
					}}
				>
					<div className="mb-1 flex items-start justify-between gap-2">
						<span className="line-clamp-2 text-sm font-semibold text-text-primary">{change.title}</span>
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
					<div className="mb-2 flex items-center justify-between gap-2">
						<div className="flex min-w-0 flex-wrap items-center gap-1.5">
							<ChangeStatusChip status={change.status} />
							<StatusChip label={change.type} />
						</div>
						<span className="shrink-0 text-[11px] uppercase tracking-wide text-text-tertiary">{change.id}</span>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<PlanningBadge planning={change.planning} />
						{change.workspace?.path ? (
							<PathDisplay
								path={change.workspace.path}
								repoRoot={repoRoot}
								className="truncate text-[11px] text-text-tertiary"
							/>
						) : null}
					</div>
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
	defaultClineModelId?: string | null;
}): ReactElement {
	const [collapsedPreferences, setCollapsedPreferences] = useState(readCollapsedColumnPreferences);
	const [activeDragKind, setActiveDragKind] = useState<"change" | "task" | null>(null);
	const filteredChanges = filterChanges(changes, filter);
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
			collapsed: collapsedPreferences[column.id] ?? count === 0,
		};
	});
	const canvasWidth = useMemo(
		() =>
			columnModels.reduce((total, column) => total + (column.collapsed ? COLLAPSED_COLUMN_WIDTH : EXPANDED_COLUMN_WIDTH), 0) +
			COLUMN_GAP * Math.max(columnModels.length - 1, 0),
		[columnModels],
	);

	const setColumnCollapsed = (columnId: ChangeColumnId, collapsed: boolean) => {
		setCollapsedPreferences((current) => {
			const next = { ...current, [columnId]: collapsed };
			writeCollapsedColumnPreferences(next);
			return next;
		});
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
						className="kb-board kb-dependency-surface"
						style={{ overflowX: "auto", overflowY: "hidden", padding: 0 }}
					>
						<div
							data-testid="change-board-canvas"
							className="flex min-h-full"
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
									<section
										key={column.id}
										data-column-id={column.id}
										className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
										style={{ width: EXPANDED_COLUMN_WIDTH, minWidth: EXPANDED_COLUMN_WIDTH }}
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
															selected={change.id === selectedChangeId}
															repoRoot={workspacePath}
															onOpenDetails={onSelectChange}
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
									</section>
								);
							})}
						</div>
					</div>
				</DragDropContext>
			)}
		</section>
	);
}
