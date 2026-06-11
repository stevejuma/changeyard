import {
	DragDropContext,
	Draggable,
	Droppable,
	type DropResult,
} from "@hello-pangea/dnd";
import { FileText, Plus } from "lucide-react";
import type { ReactElement } from "react";

import { PlanningBadge } from "@/components/changeyard/planning-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import type { RuntimeChangeyardChangeListItem } from "@/runtime/types";
import type { BoardData } from "@/types";

export type ChangeBoardFilter = "all" | "changes" | "planned";
export type ChangeColumnId = "backlog" | "ready" | "in_progress" | "blocked" | "review" | "done" | "abandoned";

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

export function ChangeBoard({
	board,
	changes,
	filter,
	selectedChangeId,
	selectedTaskId,
	isLoading = false,
	onFilterChange,
	onSelectChange,
	onSelectTask,
	onCreateChange,
	onCreateTask,
	onMoveChange,
}: {
	board: BoardData;
	changes: RuntimeChangeyardChangeListItem[];
	filter: ChangeBoardFilter;
	selectedChangeId: string | null;
	selectedTaskId: string | null;
	isLoading?: boolean;
	onFilterChange: (nextFilter: ChangeBoardFilter) => void;
	onSelectChange: (changeId: string) => void;
	onSelectTask: (taskId: string) => void;
	onCreateChange?: () => void;
	onCreateTask?: () => void;
	onMoveChange?: (changeId: string, targetColumnId: ChangeColumnId) => void;
}): ReactElement {
	const filteredChanges = filterChanges(changes, filter);
	const groupedChanges = new Map<ChangeColumnId, RuntimeChangeyardChangeListItem[]>();
	const groupedTasks = new Map<ChangeColumnId, BoardData["columns"][number]["cards"]>();
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
				{onCreateTask && filter === "all" ? (
					<Button variant="ghost" size="sm" onClick={onCreateTask} className="h-7">
						Task
					</Button>
				) : null}
				{onCreateChange ? (
					<Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={onCreateChange} className="h-7">
						Change
					</Button>
				) : null}
			</div>
			{isLoading ? (
				<p className="text-sm text-text-secondary">Loading canonical change files…</p>
			) : (
				<DragDropContext
					onDragEnd={(result: DropResult) => {
						const destination = result.destination;
						if (!destination) {
							return;
						}
						if (destination.droppableId === result.source.droppableId) {
							return;
						}
						onMoveChange?.(result.draggableId, destination.droppableId as ChangeColumnId);
					}}
				>
					<div className="flex min-h-0 gap-3 overflow-x-auto pb-1">
						{CHANGE_COLUMNS.map((column) => {
							const taskCards = groupedTasks.get(column.id) ?? [];
							const changeCards = groupedChanges.get(column.id) ?? [];
							return (
								<section
									key={column.id}
									className="flex min-h-[240px] w-[280px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
								>
									<div className="flex items-center justify-between border-b border-divider px-3 py-2">
										<div className="flex items-center gap-2">
											<span className="text-sm font-semibold text-text-primary">{column.title}</span>
											<span className="text-xs text-text-secondary">{taskCards.length + changeCards.length}</span>
										</div>
									</div>
									<Droppable droppableId={column.id}>
										{(provided) => (
											<div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
												{taskCards.map((task) => {
													const selected = task.id === selectedTaskId;
													return (
														<button
															key={`task-${task.id}`}
															type="button"
															onClick={() => onSelectTask(task.id)}
															className={cn(
																"rounded-lg border px-3 py-2 text-left transition-colors",
																selected
																	? "border-accent bg-surface-2"
																	: "border-divider bg-surface-0 hover:bg-surface-2",
															)}
														>
															<div className="mb-1 flex items-start justify-between gap-2">
																<span className="line-clamp-2 text-sm font-semibold text-text-primary">{task.title}</span>
																<span className="shrink-0 text-[11px] uppercase tracking-wide text-text-tertiary">
																	{task.id}
																</span>
															</div>
															<p className="text-xs text-text-secondary">Task</p>
														</button>
													);
												})}
												{changeCards.map((change, index) => {
													const selected = change.id === selectedChangeId;
													return (
														<Draggable key={change.id} draggableId={change.id} index={index}>
															{(draggableProvided) => (
																<button
																	ref={draggableProvided.innerRef}
																	{...draggableProvided.draggableProps}
																	{...draggableProvided.dragHandleProps}
																	type="button"
																	onClick={() => onSelectChange(change.id)}
																	className={cn(
																		"rounded-lg border px-3 py-2 text-left transition-colors",
																		selected
																			? "border-accent bg-surface-2"
																			: "border-divider bg-surface-0 hover:bg-surface-2",
																	)}
																>
																	<div className="mb-1 flex items-start justify-between gap-2">
																		<span className="line-clamp-2 text-sm font-semibold text-text-primary">{change.title}</span>
																		<span className="shrink-0 text-[11px] uppercase tracking-wide text-text-tertiary">
																			{change.id}
																		</span>
																	</div>
																	<p className="mb-2 text-xs text-text-secondary">
																		{change.status} · {change.type}
																	</p>
																	<div className="flex flex-wrap items-center gap-2">
																		<PlanningBadge planning={change.planning} />
																		{change.workspace?.path ? (
																			<span className="truncate text-[11px] text-text-tertiary">{change.workspace.path}</span>
																		) : null}
																	</div>
																</button>
															)}
														</Draggable>
													);
												})}
												{taskCards.length === 0 && changeCards.length === 0 ? (
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
				</DragDropContext>
			)}
		</section>
	);
}
