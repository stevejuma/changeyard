import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChangeBoard } from "@/components/changeyard/change-board";
import type { RuntimeChangeyardChangeListItem } from "@/runtime/types";
import type { BoardData } from "@/types";

const dndMock = vi.hoisted(() => ({
	onDragStart: null as ((start: { draggableId: string }) => void) | null,
	onDragEnd: null as ((result: { draggableId: string; source: { droppableId: string }; destination: { droppableId: string } | null }) => void) | null,
}));

vi.mock("@hello-pangea/dnd", async () => {
	const React = await vi.importActual<typeof import("react")>("react");

	return {
		DragDropContext: ({
			children,
			onDragStart,
			onDragEnd,
		}: {
			children: ReactNode;
			onDragStart?: NonNullable<typeof dndMock.onDragStart>;
			onDragEnd: NonNullable<typeof dndMock.onDragEnd>;
		}): React.ReactElement => {
			dndMock.onDragStart = onDragStart ?? null;
			dndMock.onDragEnd = onDragEnd;
			return <>{children}</>;
		},
		Droppable: ({
			children,
			droppableId,
			isDropDisabled,
		}: {
			children: (provided: { innerRef: () => void; droppableProps: Record<string, never>; placeholder: null }) => ReactNode;
			droppableId: string;
			isDropDisabled?: boolean;
		}): React.ReactElement => (
			<div data-droppable-id={droppableId} data-drop-disabled={isDropDisabled ? "true" : "false"}>
				{children({
					innerRef: () => {},
					droppableProps: {},
					placeholder: null,
				})}
			</div>
		),
		Draggable: ({
			children,
			draggableId,
		}: {
			children: (provided: {
				innerRef: () => void;
				draggableProps: Record<string, string>;
				dragHandleProps: Record<string, string>;
			}, snapshot: { isDragging: boolean }) => ReactNode;
			draggableId: string;
		}): React.ReactElement => (
			<div data-draggable-id={draggableId}>
				{children({
					innerRef: () => {},
					draggableProps: { "data-draggable-props": draggableId },
					dragHandleProps: { "data-drag-handle-props": draggableId },
				}, { isDragging: false })}
			</div>
		),
	};
});

function createChange(
	id: string,
	title: string,
	planning: RuntimeChangeyardChangeListItem["planning"],
	status = "ready",
): RuntimeChangeyardChangeListItem {
	return {
		id,
		title,
		type: "feature",
		status,
		path: `.changeyard/changes/${id}.md`,
		labels: [],
		planning,
	};
}

describe("ChangeBoard", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		window.localStorage.clear();
		dndMock.onDragStart = null;
		dndMock.onDragEnd = null;
	});

	it("renders tasks in All mode and filters to planned changes", () => {
		const onFilterChange = vi.fn();
		const board: BoardData = {
			columns: [
				{
					id: "backlog",
					title: "Backlog",
					cards: [
						{
							id: "task-1",
							title: "Legacy task",
							prompt: "Legacy task",
							startInPlanMode: false,
							baseRef: "main",
							createdAt: 1,
							updatedAt: 1,
						},
					],
				},
				{ id: "in_progress", title: "In Progress", cards: [] },
				{ id: "review", title: "Review", cards: [] },
				{ id: "trash", title: "Done", cards: [] },
			],
			dependencies: [],
		};

		act(() => {
			root.render(
				<ChangeBoard
					board={board}
					changes={[
						createChange("CY-0001", "Quick change", null),
						createChange("CY-0002", "Planned change", {
							model: "openspec-lite",
							strictness: "normal",
							phase: "draft",
							gates: {},
							gateSummary: { pass: 0, pending: 1, fail: 0, skipped: 0, warning: 0 },
							presentSections: [],
							missingSections: [],
							nextAction: null,
							errors: [],
						}),
					]}
					filter="all"
					selectedChangeId={null}
					selectedTaskId={null}
					onFilterChange={onFilterChange}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
					onCreateChange={vi.fn()}
					onCreateTask={vi.fn()}
					onMoveChange={vi.fn()}
				/>,
			);
		});

		expect(container.textContent).toContain("Legacy task");
		expect(container.textContent).toContain("Quick change");
		expect(container.textContent).toContain("Planned change");

		const plannedButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "planned");
		expect(plannedButton).toBeTruthy();
		plannedButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(onFilterChange).toHaveBeenCalledWith("planned");
	});

	it("forwards drag moves for canonical changes", () => {
		const onMoveChange = vi.fn();

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
					onMoveChange={onMoveChange}
				/>,
			);
		});

		act(() => {
			dndMock.onDragEnd?.({
				draggableId: "change:CY-0001",
				source: { droppableId: "ready" },
				destination: { droppableId: "in_progress" },
			});
		});

		expect(onMoveChange).toHaveBeenCalledWith("CY-0001", "in_progress");
	});

	it("opens change details from the details button", () => {
		const onSelectChange = vi.fn();

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					onFilterChange={vi.fn()}
					onSelectChange={onSelectChange}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		const detailsButton = container.querySelector('button[aria-label="View details for CY-0001"]');
		expect(detailsButton).toBeTruthy();
		detailsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(onSelectChange).toHaveBeenCalledWith("CY-0001");
	});

	it("shows the change details button in the abandoned column", () => {
		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0007", "Abandoned change", null, "abandoned")]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		expect(container.querySelector('button[aria-label="View details for CY-0007"]')).toBeTruthy();
	});

	it("collapses empty columns by default and persists explicit expansion", () => {
		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Ready change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		expect(container.querySelector('button[aria-label="Expand Backlog column"]')).toBeTruthy();
		const expandBacklog = container.querySelector('button[aria-label="Expand Backlog column"]');
		act(() => {
			expandBacklog?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(container.querySelector('button[aria-label="Collapse Backlog column"]')).toBeTruthy();
		expect(window.localStorage.getItem("kanban.change-board-collapsed-columns.v1")).toContain('"backlog":false');
	});

	it("routes typed task drags through the task move handler", () => {
		const onMoveTask = vi.fn();
		const board: BoardData = {
			columns: [
				{
					id: "backlog",
					title: "Backlog",
					cards: [
						{
							id: "task-1",
							title: "Legacy task",
							prompt: "Legacy task",
							startInPlanMode: false,
							baseRef: "main",
							createdAt: 1,
							updatedAt: 1,
						},
					],
				},
			],
			dependencies: [],
		};

		act(() => {
			root.render(
				<ChangeBoard
					board={board}
					changes={[]}
					filter="all"
					selectedChangeId={null}
					selectedTaskId={null}
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
					onMoveTask={onMoveTask}
				/>,
			);
		});

		act(() => {
			dndMock.onDragEnd?.({
				draggableId: "task:task-1",
				source: { droppableId: "backlog" },
				destination: { droppableId: "in_progress" },
			});
		});

		expect(onMoveTask).toHaveBeenCalledWith(
			expect.objectContaining({
				draggableId: "task-1",
				source: expect.objectContaining({ droppableId: "backlog" }),
				destination: expect.objectContaining({ droppableId: "in_progress" }),
			}),
		);
	});
});
