import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChangeDetailDialog } from "@/components/changeyard/change-detail-dialog";
import type { RuntimeChangeyardChangeDetail } from "@/runtime/types";

const mockUseRuntimeChangeWorkspaceChanges = vi.fn();
const mockDiffViewerPanel = vi.fn();

vi.mock("@/runtime/use-runtime-change-workspace-changes", () => ({
	useRuntimeChangeWorkspaceChanges: (...args: unknown[]) => mockUseRuntimeChangeWorkspaceChanges(...args),
}));

vi.mock("@/components/markdown-document", () => ({
	MarkdownDocumentEditor: ({ value }: { value: string }) => <textarea value={value} readOnly />,
	MarkdownDocumentPreview: ({ source }: { source: string }) => <article>{source}</article>,
}));

vi.mock("@/components/detail-panels/diff-viewer-panel", () => ({
	DiffViewerPanel: (props: { selectedPath: string | null }) => {
		mockDiffViewerPanel(props);
		return <div data-testid="diff-viewer-panel">{props.selectedPath}</div>;
	},
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function createChange(overrides: Partial<RuntimeChangeyardChangeDetail> = {}): RuntimeChangeyardChangeDetail {
	return {
		id: "CY-9999",
		title: "Polish details",
		type: "agent-task",
		status: "in_progress",
		path: ".changeyard/changes/CY-9999-polish-details.md",
		labels: ["ui"],
		dependencies: { blockedBy: [], blocks: [] },
		updatedAt: "2026-06-11T12:00:00.000Z",
		planning: null,
		remote: { provider: "noop" },
		workspace: { path: ".changeyard/workspaces/CY-9999/repo", branch: "cy/CY-9999" },
		body: "# Plan\n\nShip it.",
		sections: [],
		...overrides,
	};
}

function createPlanning(): NonNullable<RuntimeChangeyardChangeDetail["planning"]> {
	return {
		model: "openspec-lite",
		strictness: "normal",
		phase: "draft",
		gates: {
			proposal: "pass",
			tasks: "pending",
		},
		gateSummary: {
			pass: 1,
			pending: 1,
			fail: 0,
			skipped: 0,
			warning: 0,
		},
		presentSections: ["proposal", "tasks"],
		missingSections: [],
		nextAction: "Complete pending planning gate: tasks",
		errors: [],
	};
}

function render(element: ReactElement): void {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
}

function isVisibleInJsdom(element: Element): boolean {
	let current: Element | null = element;
	while (current) {
		if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") {
			return false;
		}
		const htmlElement = current as HTMLElement;
		if (htmlElement.style.display === "none" || htmlElement.style.visibility === "hidden") {
			return false;
		}
		current = current.parentElement;
	}
	return true;
}

beforeEach(() => {
	mockUseRuntimeChangeWorkspaceChanges.mockReturnValue({
		changes: { repoRoot: "/repo", generatedAt: Date.now(), files: [] },
		isLoading: false,
		isRuntimeAvailable: true,
		refresh: vi.fn(),
	});
});

afterEach(() => {
	root?.unmount();
	root = null;
	container?.remove();
	container = null;
	document.body.innerHTML = "";
	vi.clearAllMocks();
});

describe("ChangeDetailDialog", () => {
	it("shows valid lifecycle actions in the header", () => {
		const onRunAction = vi.fn();
		render(
			<ChangeDetailDialog
				change={createChange()}
				open
				workspaceId="project-1"
				onOpenChange={vi.fn()}
				onRunAction={onRunAction}
				onSaveBody={vi.fn()}
			/>,
		);

		expect(document.body.textContent).toContain("Verify");
		expect(document.body.textContent).toContain("Complete");
	});

	it("renders the changes tab empty state for a started change without file changes", () => {
		render(
			<ChangeDetailDialog
				change={createChange()}
				open
				workspaceId="project-1"
				onOpenChange={vi.fn()}
				onRunAction={vi.fn()}
				onSaveBody={vi.fn()}
			/>,
		);

		const changesButton = Array.from(document.body.querySelectorAll("button")).find(
			(button) => button.textContent === "Changes",
		);
		expect(changesButton).toBeInstanceOf(HTMLButtonElement);
		act(() => {
			changesButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(document.body.textContent).toContain("No workspace file changes recorded");
		expect(mockUseRuntimeChangeWorkspaceChanges).toHaveBeenCalledWith("CY-9999", "project-1", expect.any(Number));
	});

	it("renders planning gates as continuous property rows", () => {
		render(
			<ChangeDetailDialog
				change={createChange({ planning: createPlanning() })}
				open
				workspaceId="project-1"
				onOpenChange={vi.fn()}
				onRunAction={vi.fn()}
				onSaveBody={vi.fn()}
			/>,
		);

		expect(document.body.textContent).toContain("Planning Gates");
		expect(document.body.textContent).toContain("Proposal");
		expect(document.body.textContent).toContain("Pass");
		expect(document.body.textContent).toContain("Tasks");
		expect(document.body.textContent).toContain("Pending");
		expect(document.body.textContent).toContain("Next Action");
		expect(document.body.textContent).toContain("Complete pending planning gate: tasks");
	});

	it("renders a visible file explorer in the changes tab and selects diffs from it", () => {
		mockUseRuntimeChangeWorkspaceChanges.mockReturnValue({
			changes: {
				repoRoot: "/repo",
				generatedAt: Date.now(),
				files: [
					{
						path: "src/app.ts",
						status: "modified",
						additions: 4,
						deletions: 1,
						oldText: "old app",
						newText: "new app",
					},
					{
						path: "src/view.tsx",
						status: "modified",
						additions: 8,
						deletions: 2,
						oldText: "old view",
						newText: "new view",
					},
				],
			},
			isLoading: false,
			isRuntimeAvailable: true,
			refresh: vi.fn(),
		});

		render(
			<ChangeDetailDialog
				change={createChange()}
				open
				workspaceId="project-1"
				onOpenChange={vi.fn()}
				onRunAction={vi.fn()}
				onSaveBody={vi.fn()}
			/>,
		);

		const changesButton = Array.from(document.body.querySelectorAll("button")).find(
			(button) => button.textContent === "Changes",
		);
		act(() => {
			changesButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		const viewFileButton = Array.from(document.body.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("view.tsx"),
		);
		expect(viewFileButton).toBeInstanceOf(HTMLButtonElement);
		if (!(viewFileButton instanceof HTMLButtonElement)) {
			throw new Error("Expected view.tsx file button");
		}
		expect(isVisibleInJsdom(viewFileButton)).toBe(true);

		act(() => {
			viewFileButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(mockDiffViewerPanel).toHaveBeenCalledWith(expect.objectContaining({ selectedPath: "src/view.tsx" }));
		expect(document.querySelector("[data-testid='diff-viewer-panel']")?.textContent).toContain("src/view.tsx");
	});
});
