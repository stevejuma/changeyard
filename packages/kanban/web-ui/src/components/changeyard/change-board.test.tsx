import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChangeBoard } from "@/components/changeyard/change-board";
import { clearChangeBoardCaches } from "@/components/changeyard/change-board-cache";
import type { RuntimeChangeyardChangeListItem, RuntimeTaskSessionSummary } from "@/runtime/types";
import { LocalStorageKey } from "@/storage/local-storage-store";
import type { BoardData } from "@/types";

const dndMock = vi.hoisted(() => ({
	onDragStart: null as ((start: { draggableId: string }) => void) | null,
	onDragEnd: null as ((result: { draggableId: string; source: { droppableId: string }; destination: { droppableId: string } | null }) => void) | null,
}));

const runtimeMock = vi.hoisted(() => ({
	getBoardSummary: vi.fn(),
	getBoardFiles: vi.fn(),
	getBoardFileDiff: vi.fn(),
	updatePullRequest: vi.fn(),
}));

vi.mock("@/runtime/kanban-api", () => ({
	useLazyGetChangeBoardSummaryQuery: () => [
		(arg: { id: string }) => ({
			unwrap: async () => await runtimeMock.getBoardSummary({ id: arg.id }),
		}),
	],
	useLazyGetChangeBoardFilesQuery: () => [
		(arg: { input: unknown }) => ({
			unwrap: async () => await runtimeMock.getBoardFiles(arg.input),
		}),
	],
	useLazyGetChangeBoardFileDiffQuery: () => [
		(arg: { input: unknown }) => ({
			unwrap: async () => await runtimeMock.getBoardFileDiff(arg.input),
		}),
	],
	useGetPullRequestDetailsQuery: () => ({
		data: undefined,
		isFetching: false,
		isError: false,
		error: undefined,
		refetch: vi.fn(),
	}),
	useGetPullRequestChecksQuery: () => ({
		data: undefined,
		isFetching: false,
		isError: false,
		error: undefined,
		refetch: vi.fn(),
	}),
	useUpdatePullRequestMutation: () => [
		(arg: { input: unknown }) => ({
			unwrap: async () => await runtimeMock.updatePullRequest(arg.input),
		}),
		{ isLoading: false },
	],
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
			isDragDisabled,
		}: {
			children: (provided: {
				innerRef: () => void;
				draggableProps: Record<string, string>;
				dragHandleProps: Record<string, string>;
			}, snapshot: { isDragging: boolean }) => ReactNode;
			draggableId: string;
			isDragDisabled?: boolean;
		}): React.ReactElement => (
			<div data-draggable-id={draggableId} data-drag-disabled={isDragDisabled ? "true" : "false"}>
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
	updatedAt = "2026-06-11T12:00:00.000Z",
): RuntimeChangeyardChangeListItem {
	return {
		id,
		title,
		type: "feature",
		status,
		path: `.changeyard/changes/${id}.md`,
		base: { revision: "main" },
		labels: [],
		planning,
		updatedAt,
		dependencies: { blockedBy: [], blocks: [] },
		workspace: { path: `.changeyard/workspaces/${id}/repo`, branch: `cy/${id}` },
	};
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	if (!setter) {
		throw new Error("Expected native input value setter.");
	}
	setter.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function createSessionSummary(taskId: string, overrides: Partial<RuntimeTaskSessionSummary> = {}): RuntimeTaskSessionSummary {
	return {
		taskId,
		state: "running",
		mode: null,
		agentId: "codex",
		workspacePath: "/repo",
		pid: null,
		startedAt: 1,
		updatedAt: 2,
		lastOutputAt: null,
		reviewReason: null,
		exitCode: null,
		lastHookAt: null,
		latestHookActivity: null,
		externalSession: {
			provider: "codex",
			sessionId: "thread-123",
			transcriptPath: null,
			resumeCommand: ["codex", "resume", "thread-123"],
			source: "cli",
		},
		...overrides,
	};
}

describe("ChangeBoard", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		runtimeMock.updatePullRequest.mockResolvedValue({
			number: 1,
			url: null,
			provider: "unknown",
			title: "",
			body: "",
			headBranch: null,
			baseBranch: null,
			state: null,
			author: null,
			updatedAt: null,
		});
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		window.localStorage.clear();
		clearChangeBoardCaches();
		runtimeMock.getBoardSummary.mockReset();
		runtimeMock.getBoardFiles.mockReset();
		runtimeMock.getBoardFileDiff.mockReset();
		runtimeMock.updatePullRequest.mockReset();
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
		expect(container.textContent).not.toContain("openspec-lite normal · draft");
		expect(container.textContent).not.toContain(".changeyard/workspaces/CY-0001/repo");
		expect(container.querySelector('button[aria-label="More actions for CY-0001"]')).toBeTruthy();

		const plannedButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "planned");
		expect(plannedButton).toBeTruthy();
		plannedButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(onFilterChange).toHaveBeenCalledWith("planned");
	});

	it("renders PR metadata and keeps secondary PR actions in the kebab", async () => {
		const board: BoardData = {
			columns: [
				{ id: "backlog", title: "Backlog", cards: [] },
				{ id: "in_progress", title: "In Progress", cards: [] },
				{ id: "review", title: "Review", cards: [] },
				{ id: "trash", title: "Done", cards: [] },
			],
			dependencies: [],
		};
		const change = {
			...createChange("CY-0002", "PR-backed change", null, "ready_for_pr"),
			remote: {
				provider: "github",
				pullRequestNumber: 2,
				pullRequestUrl: "https://example.test/pull/2",
			},
		};
		const onOpenPullRequestDetails = vi.fn();

		await act(async () => {
			root.render(
				<ChangeBoard
					board={board}
					changes={[createChange("CY-0001", "No PR change", null), change]}
					filter="all"
					selectedChangeId={null}
					selectedTaskId={null}
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
					onCreateChange={vi.fn()}
					onCreateTask={vi.fn()}
					onMoveChange={vi.fn()}
					onOpenPullRequestDetails={onOpenPullRequestDetails}
					workspaceId="workspace-1"
				/>,
			);
		});

		const prCard = container.querySelector('[data-change-id="CY-0002"]');
		const noPrCard = container.querySelector('[data-change-id="CY-0001"]');
		expect(container.textContent).toContain("PR #2");
		expect(container.textContent).toContain("View PR");
		expect(container.textContent).toContain("Checks unknown");
		expect(container.textContent).not.toContain("No checks");
		expect(noPrCard?.textContent).not.toContain("View PR");
		expect(prCard?.querySelectorAll("button")).toHaveLength(3);

		const trigger = prCard?.querySelector<HTMLButtonElement>('button[aria-label="More actions for CY-0002"]');
		await act(async () => {
			const pointerDown =
				typeof PointerEvent === "function"
					? new PointerEvent("pointerdown", { bubbles: true, button: 0 })
					: new MouseEvent("pointerdown", { bubbles: true, button: 0 });
			trigger?.dispatchEvent(pointerDown);
			trigger?.click();
			await Promise.resolve();
		});

		expect(document.body.textContent).toContain("Copy PR link");
		expect(document.body.textContent).toContain("Refresh PR checks");
		expect(document.body.textContent).toContain("Edit PR description");

		const editItem = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) =>
			item.textContent?.includes("Edit PR description"),
		);
		await act(async () => {
			editItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onOpenPullRequestDetails).toHaveBeenCalledWith("CY-0002", "edit");
	});

	it("filters visible board cards from the header search and clears inline", async () => {
		const board: BoardData = {
			columns: [
				{
					id: "backlog",
					title: "Backlog",
					cards: [
						{
							id: "task-1",
							title: "Legacy parser task",
							prompt: "Update parser fixtures",
							startInPlanMode: false,
							baseRef: "main",
							createdAt: 1,
							updatedAt: 1,
						},
						{
							id: "task-2",
							title: "Billing task",
							prompt: "Billing task",
							startInPlanMode: false,
							baseRef: "main",
							createdAt: 1,
							updatedAt: 2,
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
					changes={[
						createChange("CY-0001", "Parser validation", null),
						createChange("CY-0002", "Billing update", null),
					]}
					filter="all"
					selectedChangeId={null}
					selectedTaskId={null}
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="Search board cards"]');
		expect(searchInput).toBeTruthy();

		await act(async () => {
			setNativeInputValue(searchInput!, "parser");
			await Promise.resolve();
		});

		expect(container.querySelector('[data-task-id="task-1"]')).toBeTruthy();
		expect(container.querySelector('[data-change-id="CY-0001"]')).toBeTruthy();
		expect(container.querySelector('[data-task-id="task-2"]')).toBeNull();
		expect(container.querySelector('[data-change-id="CY-0002"]')).toBeNull();
		expect(container.querySelector('[data-draggable-id="task:task-1"]')?.getAttribute("data-drag-disabled")).toBe("true");

		const clearButton = container.querySelector<HTMLButtonElement>('button[aria-label="Clear board search"]');
		expect(clearButton).toBeTruthy();

		await act(async () => {
			clearButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
		});

		expect(searchInput!.value).toBe("");
		expect(container.querySelector('[data-task-id="task-2"]')).toBeTruthy();
		expect(container.querySelector('[data-change-id="CY-0002"]')).toBeTruthy();
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

	it("orders changes in each column by most recent update first", () => {
		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[
						createChange("CY-0001", "Older change", null, "ready", "2026-06-10T12:00:00.000Z"),
						createChange("CY-0002", "Newest change", null, "ready", "2026-06-12T12:00:00.000Z"),
						createChange("CY-0003", "Middle change", null, "ready", "2026-06-11T12:00:00.000Z"),
					]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		const text = container.textContent ?? "";
		expect(text.indexOf("Newest change")).toBeLessThan(text.indexOf("Middle change"));
		expect(text.indexOf("Middle change")).toBeLessThan(text.indexOf("Older change"));
	});

	it("orders tasks in each column by most recent update first", () => {
		act(() => {
			root.render(
				<ChangeBoard
					board={{
						columns: [
							{
								id: "backlog",
								title: "Backlog",
								cards: [
									{
										id: "task-old",
										title: "Older task",
										prompt: "Older task",
										startInPlanMode: false,
										baseRef: "main",
										createdAt: 1,
										updatedAt: 1,
									},
									{
										id: "task-new",
										title: "Newest task",
										prompt: "Newest task",
										startInPlanMode: false,
										baseRef: "main",
										createdAt: 1,
										updatedAt: 3,
									},
									{
										id: "task-mid",
										title: "Middle task",
										prompt: "Middle task",
										startInPlanMode: false,
										baseRef: "main",
										createdAt: 1,
										updatedAt: 2,
									},
								],
							},
						],
						dependencies: [],
					}}
					changes={[]}
					filter="all"
					selectedChangeId={null}
					selectedTaskId={null}
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		const text = container.textContent ?? "";
		expect(text.indexOf("Newest task")).toBeLessThan(text.indexOf("Middle task"));
		expect(text.indexOf("Middle task")).toBeLessThan(text.indexOf("Older task"));
	});

	it("keeps rendering websocket-backed tasks while canonical changes are loading", () => {
		act(() => {
			root.render(
				<ChangeBoard
					board={{
						columns: [
							{
								id: "backlog",
								title: "Backlog",
								cards: [
									{
										id: "task-1",
										title: "Visible task",
										prompt: "Visible task",
										startInPlanMode: false,
										baseRef: "main",
										createdAt: 1,
										updatedAt: 1,
									},
								],
							},
						],
						dependencies: [],
					}}
					changes={[]}
					filter="all"
					selectedChangeId={null}
					selectedTaskId={null}
					isLoading
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		expect(container.textContent).toContain("Loading changes...");
		expect(container.textContent).toContain("Visible task");
		expect(container.textContent).not.toContain("Loading canonical change files");
	});

	it("renders attached session state on canonical change cards", () => {
		const onSelectChange = vi.fn();
		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					taskSessions={{ "CY-0001": createSessionSummary("CY-0001") }}
					onFilterChange={vi.fn()}
					onSelectChange={onSelectChange}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		expect(container.textContent).toContain("Quick change");
		expect(container.textContent).toContain("codex");
		expect(container.textContent).toContain("running");

		const cardButton = container.querySelector('[data-change-id="CY-0001"] [role="button"]');
		expect(cardButton).toBeTruthy();
		cardButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(onSelectChange).toHaveBeenCalledWith("CY-0001");
	});

	it("opens the agent view for resumed change sessions without an external session marker", () => {
		const onSelectChange = vi.fn();
		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					workspaceId="project-1"
					taskSessions={{ "CY-0001": createSessionSummary("CY-0001", { externalSession: null }) }}
					onFilterChange={vi.fn()}
					onSelectChange={onSelectChange}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		const cardButton = container.querySelector('[data-change-id="CY-0001"] [role="button"]');
		expect(cardButton).toBeTruthy();
		cardButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(onSelectChange).toHaveBeenCalledWith("CY-0001");
		expect(runtimeMock.getBoardSummary).not.toHaveBeenCalled();
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

	it("uses only the normal divider border on selected change cards", () => {
		runtimeMock.getBoardSummary.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			workspaceHead: "head",
			baseRevision: "main",
			commits: [],
			files: { count: 0, additions: 0, deletions: 0 },
		});

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Selected change", null, "in_progress")]}
					filter="changes"
					selectedChangeId="CY-0001"
					selectedTaskId={null}
					workspaceId="project-1"
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		const card = container.querySelector('[data-change-id="CY-0001"]');
		expect(card).toBeInstanceOf(HTMLElement);
		expect(card?.classList.contains("kb-change-card-selected")).toBe(false);
		expect(card?.classList.contains("border")).toBe(true);
		expect(card?.classList.contains("border-divider")).toBe(true);
		expect(card?.querySelector(".bg-accent")).toBeInstanceOf(HTMLElement);
	});

	it("does not request board summary data before a change card is selected", () => {
		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					workspaceId="project-1"
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		expect(runtimeMock.getBoardSummary).not.toHaveBeenCalled();
		expect(runtimeMock.getBoardFiles).not.toHaveBeenCalled();
	});

	it("selecting a change header lazily loads the board summary once", async () => {
		runtimeMock.getBoardSummary.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			workspaceHead: "head",
			baseRevision: "main",
			commits: [],
			files: { count: 1, additions: 2, deletions: 1 },
		});
		runtimeMock.getBoardFiles.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: "all",
			files: [{ path: "src/change.ts", status: "modified", additions: 2, deletions: 1 }],
		});
		runtimeMock.getBoardFileDiff.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: "all",
			path: "src/change.ts",
			file: {
				path: "src/change.ts",
				status: "modified",
				additions: 2,
				deletions: 1,
				oldText: "const value = 1;\n",
				newText: "const value = 2;\n",
			},
		});

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					workspaceId="project-1"
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		const header = container.querySelector('[data-change-id="CY-0001"] [role="button"]');
		await act(async () => {
			header?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(runtimeMock.getBoardSummary).toHaveBeenCalledTimes(1);
		expect(container.textContent).toContain("All Changes");
		expect(runtimeMock.getBoardFiles).toHaveBeenCalledWith({ id: "CY-0001", scope: "all" });
		expect(runtimeMock.getBoardFileDiff).toHaveBeenCalledWith({
			id: "CY-0001",
			scope: "all",
			path: "src/change.ts",
		});

		await act(async () => {
			header?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
		});
		await act(async () => {
			header?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(runtimeMock.getBoardSummary).toHaveBeenCalledTimes(1);
	});

	it("does not render object placeholders for structured file-list errors", async () => {
		runtimeMock.getBoardSummary.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			workspaceHead: "head",
			baseRevision: "main",
			commits: [],
			files: { count: 0, additions: 0, deletions: 0 },
		});
		runtimeMock.getBoardFiles.mockRejectedValue(new Error("[object Object]"));

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					workspaceId="project-1"
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		await act(async () => {
			container.querySelector('[data-change-id="CY-0001"] [role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(container.textContent).toContain("Failed to load files.");
		expect(container.textContent).not.toContain("[object Object]");
	});

	it("shows one workspace deleted badge for unknown workspace errors", async () => {
		runtimeMock.getBoardSummary.mockRejectedValue(new Error("Unknown workspace ID: project-1"));

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null, "ready_for_pr")]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					workspaceId="project-1"
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		await act(async () => {
			container.querySelector('[data-change-id="CY-0001"] [role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(runtimeMock.getBoardSummary).toHaveBeenCalledTimes(1);
		expect((container.textContent?.match(/Workspace deleted/g) ?? []).length).toBe(1);
		expect(container.textContent).not.toContain("Unknown workspace ID");
		expect(container.textContent).not.toContain("All Changes");
	});

	it("shows a single workspace deleted badge without raw workspace errors", async () => {
		runtimeMock.getBoardSummary.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			workspaceHead: null,
			baseRevision: "main",
			commits: [],
			files: { count: 0, additions: 0, deletions: 0 },
			source: { kind: "workspace_deleted", label: "Workspace deleted" },
		});

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Missing workspace", null, "in_progress")]}
					filter="changes"
					selectedChangeId="CY-0001"
					selectedTaskId={null}
					workspaceId="project-1"
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		const text = container.textContent ?? "";
		expect(text.match(/Workspace deleted/g) ?? []).toHaveLength(1);
		expect(text).not.toContain("No commits found");
		expect(text).not.toContain("Failed to run Jujutsu");
	});

	it("refreshes selected change files when the workspace event version changes", async () => {
		runtimeMock.getBoardSummary.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			workspaceHead: "head",
			baseRevision: "main",
			commits: [],
			files: { count: 1, additions: 2, deletions: 1 },
		});
		runtimeMock.getBoardFiles.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: "all",
			files: [{ path: "src/change.ts", status: "modified", additions: 2, deletions: 1 }],
		});
		runtimeMock.getBoardFileDiff.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: "all",
			path: "src/change.ts",
			file: {
				path: "src/change.ts",
				status: "modified",
				additions: 2,
				deletions: 1,
				oldText: "const value = 1;\n",
				newText: "const value = 2;\n",
			},
		});
		const change = createChange("CY-0001", "Quick change", null);
		const props = {
			board: { columns: [], dependencies: [] },
			changes: [change],
			filter: "changes" as const,
			selectedChangeId: null,
			selectedTaskId: null,
			workspaceId: "project-1",
			onFilterChange: vi.fn(),
			onSelectChange: vi.fn(),
			onSelectTask: vi.fn(),
		};

		act(() => {
			root.render(<ChangeBoard {...props} workspaceEventVersions={{ "CY-0001": 0 }} />);
		});

		await act(async () => {
			container.querySelector('[data-change-id="CY-0001"] [role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(runtimeMock.getBoardSummary).toHaveBeenCalledTimes(1);
		expect(runtimeMock.getBoardFiles).toHaveBeenCalledTimes(1);

		await act(async () => {
			root.render(<ChangeBoard {...props} workspaceEventVersions={{ "CY-0001": 1 }} />);
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(runtimeMock.getBoardSummary.mock.calls.length).toBeGreaterThan(1);
		expect(runtimeMock.getBoardFiles.mock.calls.length).toBeGreaterThan(1);
		expect(runtimeMock.getBoardFiles).toHaveBeenLastCalledWith({ id: "CY-0001", scope: "all" });
	});

	it("selecting a change header opens all changes and selects the first file", async () => {
		runtimeMock.getBoardSummary.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			workspaceHead: "head",
			baseRevision: "main",
			commits: [],
			files: { count: 1, additions: 2, deletions: 1 },
		});
		runtimeMock.getBoardFiles.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: "all",
			files: [{ path: "src/change.ts", status: "modified", additions: 2, deletions: 1 }],
		});
		runtimeMock.getBoardFileDiff.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: "all",
			path: "src/change.ts",
			file: {
				path: "src/change.ts",
				status: "modified",
				additions: 2,
				deletions: 1,
				oldText: "const oldValue = 1;\n",
				newText: "const newValue = 2;\n",
			},
		});

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					workspaceId="project-1"
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		await act(async () => {
			container.querySelector('[data-change-id="CY-0001"] [role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(runtimeMock.getBoardFiles).toHaveBeenCalledWith({ id: "CY-0001", scope: "all" });
		expect(runtimeMock.getBoardFileDiff).toHaveBeenCalledWith({
			id: "CY-0001",
			scope: "all",
			path: "src/change.ts",
		});
		expect(container.textContent).toContain("src/change.ts");
		expect(container.querySelector('[data-testid="change-board-file-diff-panel"]')).toBeTruthy();
		expect(container.textContent).toContain("const oldValue = 1;");

		const selectedFileRow = container.querySelector('[data-file-path="src/change.ts"]');
		expect(selectedFileRow?.classList.contains("kb-file-tree-row-selected")).toBe(true);
		expect(selectedFileRow?.querySelector('[title="src/change.ts"]')?.classList.contains("text-text-primary")).toBe(true);
		const fileDeltas = Array.from(selectedFileRow?.querySelectorAll("span") ?? []);
		expect(fileDeltas.find((span) => span.textContent === "+2")?.classList.contains("text-text-primary")).toBe(true);
		expect(fileDeltas.find((span) => span.textContent === "-1")?.classList.contains("text-text-primary")).toBe(true);
	});

	it("switches board file lists to package mode and collapses compacted folders", async () => {
		runtimeMock.getBoardSummary.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			workspaceHead: "head",
			baseRevision: "main",
			commits: [],
			files: { count: 1, additions: 1, deletions: 1 },
		});
		runtimeMock.getBoardFiles.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: "all",
			files: [{ path: "src/nested/change.ts", status: "modified", additions: 1, deletions: 1 }],
		});
		runtimeMock.getBoardFileDiff.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: "all",
			path: "src/nested/change.ts",
			file: {
				path: "src/nested/change.ts",
				status: "modified",
				additions: 1,
				deletions: 1,
				oldText: "const value = 1;\n",
				newText: "const value = 2;\n",
			},
		});

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					workspaceId="project-1"
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		await act(async () => {
			container.querySelector('[data-change-id="CY-0001"] [role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		await act(async () => {
			container.querySelector<HTMLButtonElement>('button[aria-label="Show files as packages"]')?.click();
		});

		expect(window.localStorage.getItem(LocalStorageKey.ChangeBoardAllFilesViewMode)).toBe("package");
		const compactFolder = Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"))
			.find((button) => button.textContent?.includes("src/nested"));
		expect(compactFolder).toBeTruthy();
		expect(compactFolder?.getAttribute("aria-expanded")).toBe("true");
		expect(container.querySelector(".kb-file-type-icon svg")).not.toBeNull();

		await act(async () => {
			compactFolder?.click();
		});

		const collapsedFolder = Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"))
			.find((button) => button.textContent?.includes("src/nested"));
		expect(collapsedFolder?.getAttribute("aria-expanded")).toBe("false");
	});

	it("selecting a commit lazily loads only that commit's files", async () => {
		runtimeMock.getBoardSummary.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			workspaceHead: "head",
			baseRevision: "main",
			commits: [
				{
					hash: "abc123",
					shortHash: "abc123",
					authorName: "Agent",
					authorEmail: "agent@example.com",
					date: "2026-06-11T00:00:00Z",
					message: "implement lazy cards",
					parentHashes: [],
				},
			],
			files: { count: 0, additions: 0, deletions: 0 },
		});
		runtimeMock.getBoardFiles.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: { commitHash: "abc123" },
			files: [{ path: "src/card.tsx", status: "added", additions: 10, deletions: 0 }],
		});
		runtimeMock.getBoardFileDiff.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: { commitHash: "abc123" },
			path: "src/card.tsx",
			file: {
				path: "src/card.tsx",
				status: "added",
				additions: 10,
				deletions: 0,
				oldText: null,
				newText: "export const card = true;\n",
			},
		});

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					workspaceId="project-1"
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		await act(async () => {
			container.querySelector('[data-change-id="CY-0001"] [role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
		});
		await act(async () => {
			Array.from(container.querySelectorAll("button"))
				.find((button) => button.textContent?.includes("implement lazy cards"))
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
		});

		expect(runtimeMock.getBoardFiles).toHaveBeenCalledWith({ id: "CY-0001", scope: { commitHash: "abc123" } });
		expect(runtimeMock.getBoardFileDiff).toHaveBeenCalledWith({
			id: "CY-0001",
			scope: { commitHash: "abc123" },
			path: "src/card.tsx",
		});
		expect(container.textContent).toContain("src/card.tsx");
		expect(container.querySelector('[data-testid="change-board-file-diff-panel"]')).toBeTruthy();
		expect(container.querySelector('button[aria-label="More actions for commit abc123"]')).toBeTruthy();
	});

	it("clicking an expanded file lazily opens a diff column", async () => {
		runtimeMock.getBoardSummary.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			workspaceHead: "head",
			baseRevision: "main",
			commits: [],
			files: { count: 1, additions: 1, deletions: 1 },
		});
		runtimeMock.getBoardFiles.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: "all",
			files: [{ path: "src/change.ts", status: "modified", additions: 1, deletions: 1 }],
		});
		runtimeMock.getBoardFileDiff.mockResolvedValue({
			ok: true,
			changeId: "CY-0001",
			version: "v1",
			scope: "all",
			path: "src/change.ts",
			file: {
				path: "src/change.ts",
				status: "modified",
				additions: 1,
				deletions: 1,
				oldText: "const value = 1;\n",
				newText: "const value = 2;\n",
			},
		});

		act(() => {
			root.render(
				<ChangeBoard
					board={{ columns: [], dependencies: [] }}
					changes={[createChange("CY-0001", "Quick change", null)]}
					filter="changes"
					selectedChangeId={null}
					selectedTaskId={null}
					workspaceId="project-1"
					onFilterChange={vi.fn()}
					onSelectChange={vi.fn()}
					onSelectTask={vi.fn()}
				/>,
			);
		});

		await act(async () => {
			container.querySelector('[data-change-id="CY-0001"] [role="button"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
		});
		await act(async () => {
			Array.from(container.querySelectorAll("button"))
				.find((button) => button.textContent?.includes("All Changes"))
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
		});
		await act(async () => {
			Array.from(container.querySelectorAll("button"))
				.find((button) => button.textContent?.includes("src/change.ts"))
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
		});

		expect(runtimeMock.getBoardFileDiff).toHaveBeenCalledWith({
			id: "CY-0001",
			scope: "all",
			path: "src/change.ts",
		});
		expect(container.querySelector('[data-testid="change-board-file-diff-panel"]')).toBeTruthy();
		expect(container.textContent).toContain("const value = 1;");
		expect(container.textContent).toContain("const value = 2;");
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
