import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChangeReviewModal } from "@/components/changeyard/change-review-modal";
import type { RuntimeChangeyardChangeDetail, RuntimeChangeyardReviewDetail } from "@/runtime/types";

vi.mock("@uiw/react-markdown-preview", () => ({
	default: ({ source }: { source: string }) => <article>{source}</article>,
}));

const {
	mockReviewList,
	mockReviewGet,
	mockReviewStart,
	mockReviewUpdate,
	mockReviewComplete,
	mockGetBoardSummary,
	mockGetBoardFiles,
	mockGetBoardFileDiff,
} = vi.hoisted(() => ({
	mockReviewList: vi.fn(),
	mockReviewGet: vi.fn(),
	mockReviewStart: vi.fn(),
	mockReviewUpdate: vi.fn(),
	mockReviewComplete: vi.fn(),
	mockGetBoardSummary: vi.fn(),
	mockGetBoardFiles: vi.fn(),
	mockGetBoardFileDiff: vi.fn(),
}));
const mockUseRuntimeChangeWorkspaceChanges = vi.hoisted(() =>
	vi.fn(() => ({
		changes: {
			repoRoot: "/repo",
			generatedAt: 1,
			files: [
				{
					path: "src/example.ts",
					status: "modified",
					additions: 1,
					deletions: 1,
					oldText: "const value = 1;\n",
					newText: "const value = 2;\n",
				},
			],
		},
		isLoading: false,
		isRuntimeAvailable: true,
		refresh: vi.fn(),
	})),
);

vi.mock("@/runtime/kanban-api", () => {
	const skippedQuery = {
		currentData: undefined,
		data: undefined,
		isLoading: false,
		isFetching: false,
		isError: false,
		error: null,
		refetch: vi.fn(async () => ({ data: undefined })),
	};
	const queryResult = (value: unknown) => ({
		currentData: value,
		data: value,
		isLoading: false,
		isFetching: false,
		isError: false,
		error: null,
		refetch: vi.fn(async () => ({ data: value })),
	});
	const unwrapMutation =
		(handler: (input: unknown) => unknown | Promise<unknown>) => (arg: { input?: unknown; id?: unknown }) => ({
		unwrap: async () => await handler(arg.input ?? arg.id ?? arg),
	});
	const hasKey = (arg: unknown, key: string): arg is Record<string, unknown> =>
		typeof arg === "object" && arg !== null && key in arg;

	return {
		useReviewListQuery: (arg: unknown) =>
			hasKey(arg, "input") ? queryResult(mockReviewList(arg.input)) : skippedQuery,
		useReviewGetQuery: (arg: unknown) =>
			hasKey(arg, "input") ? queryResult(mockReviewGet(arg.input)) : skippedQuery,
		useGetChangeBoardSummaryQuery: (arg: unknown) =>
			hasKey(arg, "id") ? queryResult(mockGetBoardSummary({ id: arg.id })) : skippedQuery,
		useGetChangeBoardFilesQuery: (arg: unknown) =>
			hasKey(arg, "input") ? queryResult(mockGetBoardFiles(arg.input)) : skippedQuery,
		useGetChangeBoardFileDiffQuery: (arg: unknown) =>
			hasKey(arg, "input") ? queryResult(mockGetBoardFileDiff(arg.input)) : skippedQuery,
		useReviewStartMutation: () => [unwrapMutation(mockReviewStart), { isLoading: false }],
		useReviewUpdateMutation: () => [unwrapMutation(mockReviewUpdate), { isLoading: false }],
		useReviewCompleteMutation: () => [unwrapMutation(mockReviewComplete), { isLoading: false }],
	};
});

vi.mock("@/runtime/use-runtime-change-workspace-changes", () => ({
	useRuntimeChangeWorkspaceChanges: (...args: Parameters<typeof mockUseRuntimeChangeWorkspaceChanges>) =>
		mockUseRuntimeChangeWorkspaceChanges(...args),
}));

const change = {
	id: "CY-0001",
	title: "Reviewable change",
	status: "in_review",
	type: "agent-task",
	path: ".changeyard/changes/CY-0001-reviewable-change.md",
	body: "",
	labels: [],
	dependencies: { blockedBy: [], blocks: [] },
	sections: [],
	workspace: { path: "/repo/.changeyard/workspaces/CY-0001/repo", branch: "cy/CY-0001" },
	planning: null,
	createdAt: "2026-06-17T10:00:00.000Z",
	updatedAt: "2026-06-17T10:00:00.000Z",
} as RuntimeChangeyardChangeDetail;

function reviewDetail(overrides: Partial<RuntimeChangeyardReviewDetail> = {}): RuntimeChangeyardReviewDetail {
	return {
		change: "CY-0001",
		review: 1,
		status: "in_review",
		reviewer: "reviewer",
		createdAt: "2026-06-17T10:01:00.000Z",
		completedAt: null,
		path: ".changeyard/reviews/CY-0001/review-001.md",
		lastModifiedAt: "2026-06-17T10:02:00.000Z",
		summary: "",
		requiredChanges: [{ checked: false, text: "Tighten the API contract tests." }],
		inlineComments: [],
		body: "",
		...overrides,
	};
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let previousActEnvironment: boolean | undefined;

beforeEach(() => {
	previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
		.IS_REACT_ACT_ENVIRONMENT;
	(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	mockReviewList.mockReturnValue({ reviews: [reviewDetail()] });
	mockReviewGet.mockReturnValue(reviewDetail());
	mockReviewStart.mockResolvedValue(reviewDetail());
	mockReviewUpdate.mockImplementation(async (_input: unknown) => reviewDetail({ requiredChanges: [] }));
	mockReviewComplete.mockResolvedValue({ message: "Completed review", change });
	mockGetBoardSummary.mockReturnValue({
		ok: true,
		changeId: "CY-0001",
		version: "test",
		workspaceHead: "abcdef123456",
		baseRevision: "main",
		commits: [
			{
				hash: "abcdef1234567890",
				shortHash: "abcdef1",
				authorName: "Reviewer",
				authorEmail: "reviewer@example.com",
				date: "2026-06-17T10:02:00.000Z",
				message: "Add reviewed change",
				parentHashes: ["0000000"],
			},
		],
		files: { count: 1, additions: 1, deletions: 1 },
	});
	mockGetBoardFiles.mockReturnValue({
		ok: true,
		changeId: "CY-0001",
		version: "test",
		scope: { commitHash: "abcdef1234567890" },
		files: [
			{
				path: "src/example.ts",
				status: "modified",
				additions: 1,
				deletions: 1,
			},
		],
	});
	mockGetBoardFileDiff.mockReturnValue({
		ok: true,
		changeId: "CY-0001",
		version: "test",
		scope: { commitHash: "abcdef1234567890" },
		path: "src/example.ts",
		file: {
			path: "src/example.ts",
			status: "modified",
			additions: 1,
			deletions: 1,
			oldText: null,
			newText: null,
		},
		patch: "@@ -1 +1 @@\n-const value = 1;\n+const value = 2;\n",
	});
	mockUseRuntimeChangeWorkspaceChanges.mockImplementation(() => ({
		changes: {
			repoRoot: "/repo",
			generatedAt: 1,
			files: [
				{
					path: "src/example.ts",
					status: "modified",
					additions: 1,
					deletions: 1,
					oldText: "const value = 1;\n",
					newText: "const value = 2;\n",
				},
			],
		},
		isLoading: false,
		isRuntimeAvailable: true,
		refresh: vi.fn(),
	}));
	mockUseRuntimeChangeWorkspaceChanges.mockClear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	root = null;
	container?.remove();
	container = null;
	vi.restoreAllMocks();
	if (previousActEnvironment === undefined) {
		delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	} else {
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
	}
});

async function renderReview(element: ReactElement): Promise<HTMLDivElement> {
	if (!container) {
		throw new Error("Missing test container.");
	}
	await act(async () => {
		root?.render(element);
	});
	await act(async () => {
		await Promise.resolve();
	});
	return container;
}

describe("ChangeReviewModal", () => {
	it("loads workspace changes without background polling", async () => {
		await renderReview(
			<ChangeReviewModal
				open
				change={change}
				changes={[change]}
				workspaceId="changeyard"
				onOpenChange={() => {}}
				onSelectChange={() => {}}
				onReviewChanged={() => {}}
			/>,
		);

		expect(mockUseRuntimeChangeWorkspaceChanges).toHaveBeenCalledWith("CY-0001", "changeyard", null, null);
	});

	it("shows skeletons instead of visible file loading text while workspace changes load", async () => {
		mockUseRuntimeChangeWorkspaceChanges.mockImplementation(() => ({
			changes: null as never,
			isLoading: true,
			isRuntimeAvailable: true,
			refresh: vi.fn(),
		}));

		const element = await renderReview(
			<ChangeReviewModal
				open
				change={change}
				changes={[change]}
				workspaceId="changeyard"
				onOpenChange={() => {}}
				onSelectChange={() => {}}
				onReviewChanged={() => {}}
			/>,
		);

		expect(element.textContent).not.toContain("Loading file changes");
		expect(element.textContent).not.toContain("Loading diff");
		expect(element.textContent).not.toContain("Loading files");
		expect(element.querySelector('[aria-label="Loading file changes"]')).not.toBeNull();
		expect(element.querySelector('[aria-label="Loading file diff"]')).not.toBeNull();
	});

	it("renders required changes as deleteable Radix checkbox rows", async () => {
		const element = await renderReview(
			<ChangeReviewModal
				open
				change={change}
				changes={[change]}
				workspaceId="changeyard"
				onOpenChange={() => {}}
				onSelectChange={() => {}}
				onReviewChanged={() => {}}
			/>,
		);

		expect(element.textContent).toContain("Required changes");
		expect(element.textContent).toContain("Tighten the API contract tests.");
		expect(element.querySelector('[role="checkbox"]')).not.toBeNull();

		await act(async () => {
			element.querySelector<HTMLButtonElement>('button[aria-label="Delete required change 1"]')?.click();
		});
		await act(async () => {
			Array.from(element.querySelectorAll("button")).find((button) => button.textContent === "Save Draft")?.click();
		});

		expect(mockReviewUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				requiredChanges: [],
			}),
		);
	});

	it("renders referenced required changes with markdown preview, resolve, and diff navigation", async () => {
		const detail = reviewDetail({
			requiredChanges: [{ checked: false, text: "src/example.ts:1: **Tighten** this value." }],
		});
		mockReviewList.mockReturnValue({ reviews: [detail] });
		mockReviewGet.mockReturnValue(detail);
		mockReviewUpdate.mockImplementation(async (input: { requiredChanges: RuntimeChangeyardReviewDetail["requiredChanges"] }) =>
			reviewDetail({ requiredChanges: input.requiredChanges }),
		);

		const element = await renderReview(
			<ChangeReviewModal
				open
				change={change}
				changes={[change]}
				workspaceId="changeyard"
				onOpenChange={() => {}}
				onSelectChange={() => {}}
				onReviewChanged={() => {}}
			/>,
		);

		expect(element.textContent).toContain("src/example.ts:1");
		expect(element.textContent).toContain("const value = 2;");
		expect(element.textContent).toContain("**Tighten** this value.");
		expect(element.querySelector('button[aria-label="View required change src/example.ts:1 in diff"]')).not.toBeNull();

		await act(async () => {
			element.querySelector<HTMLButtonElement>('button[aria-label="Resolve required change 1"]')?.click();
		});
		await act(async () => {
			Array.from(element.querySelectorAll("button")).find((button) => button.textContent === "Save Draft")?.click();
		});

		expect(mockReviewUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				requiredChanges: [{ checked: true, text: "src/example.ts:1: **Tighten** this value." }],
			}),
		);

		await act(async () => {
			element.querySelector<HTMLButtonElement>('button[aria-label="Edit required change 1"]')?.click();
		});

		expect(element.querySelector("textarea")).not.toBeNull();
	});

	it("lists commits in conversation and opens a selected commit file diff", async () => {
		const element = await renderReview(
			<ChangeReviewModal
				open
				change={change}
				changes={[change]}
				workspaceId="changeyard"
				onOpenChange={() => {}}
				onSelectChange={() => {}}
				onReviewChanged={() => {}}
			/>,
		);

		expect(element.textContent).toContain("Commits");
		expect(element.textContent).toContain("Add reviewed change");
		expect(element.textContent).toContain("abcdef1");

		await act(async () => {
			element.querySelector<HTMLButtonElement>('button[aria-label="Expand commit abcdef1"]')?.click();
			await Promise.resolve();
		});

		expect(mockGetBoardFiles).toHaveBeenCalledWith({
			id: "CY-0001",
			scope: { commitHash: "abcdef1234567890" },
		});
		expect(element.textContent).toContain("src/example.ts");

		await act(async () => {
			element.querySelector<HTMLButtonElement>('button[aria-label="View diff for src/example.ts"]')?.click();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(mockGetBoardFileDiff).toHaveBeenCalledWith({
			id: "CY-0001",
			scope: { commitHash: "abcdef1234567890" },
			path: "src/example.ts",
		});
		expect(element.textContent).toContain("Commit Diff");
		expect(element.textContent).toContain("const value = 2;");
	});

	it("offers to mark a no-workspace reviewable change done without a review", async () => {
		const onMarkDone = vi.fn();
		mockReviewList.mockReturnValue({ reviews: [] });
		mockGetBoardSummary.mockReturnValue({
			ok: true,
			changeId: "CY-0001",
			version: "test",
			workspaceHead: null,
			baseRevision: "main",
			commits: [],
			files: { count: 0, additions: 0, deletions: 0 },
			error: "Change workspace has not been started.",
		});
		const noWorkspaceChange = {
			...change,
			status: "ready_for_pr",
			workspace: undefined,
		} as RuntimeChangeyardChangeDetail;

		const element = await renderReview(
			<ChangeReviewModal
				open
				change={noWorkspaceChange}
				changes={[noWorkspaceChange]}
				workspaceId="changeyard"
				onOpenChange={() => {}}
				onSelectChange={() => {}}
				onReviewChanged={() => {}}
				onMarkDone={onMarkDone}
			/>,
		);

		expect(element.textContent).toContain("This change does not have a workspace to review.");

		await act(async () => {
			Array.from(element.querySelectorAll("button")).find((button) => button.textContent === "Mark Done")?.click();
			await Promise.resolve();
		});

		expect(onMarkDone).toHaveBeenCalledWith("CY-0001", "approved");
	});

	it("offers to mark a reviewable change done when no commit is available", async () => {
		const onMarkDone = vi.fn();
		mockReviewList.mockReturnValue({ reviews: [] });
		mockGetBoardSummary.mockReturnValue({
			ok: true,
			changeId: "CY-0001",
			version: "test",
			workspaceHead: "abcdef123456",
			baseRevision: "main",
			commits: [],
			files: { count: 0, additions: 0, deletions: 0 },
		});

		const element = await renderReview(
			<ChangeReviewModal
				open
				change={change}
				changes={[change]}
				workspaceId="changeyard"
				onOpenChange={() => {}}
				onSelectChange={() => {}}
				onReviewChanged={() => {}}
				onMarkDone={onMarkDone}
			/>,
		);

		expect(element.textContent).toContain("No reviewable commit was found for this change.");

		await act(async () => {
			Array.from(element.querySelectorAll("button")).find((button) => button.textContent === "Mark Done")?.click();
			await Promise.resolve();
		});

		expect(onMarkDone).toHaveBeenCalledWith("CY-0001", "approved");
	});

	it("opens the submit review dialog with decision choices", async () => {
		const element = await renderReview(
			<ChangeReviewModal
				open
				change={change}
				changes={[change]}
				workspaceId="changeyard"
				onOpenChange={() => {}}
				onSelectChange={() => {}}
				onReviewChanged={() => {}}
			/>,
		);

		await act(async () => {
			Array.from(element.querySelectorAll("button")).find((button) => button.textContent === "Submit review")?.click();
		});

		expect(document.body.textContent).toContain("Finish your review");
		expect(document.body.textContent).toContain("Comment");
		expect(document.body.textContent).toContain("Approve");
		expect(document.body.textContent).toContain("Request changes");
		expect(document.body.querySelector('[role="radiogroup"]')).not.toBeNull();
		expect(document.body.querySelector("textarea")).not.toBeNull();
	});

	it("shows inline conversation comments with an affected line snippet and diff navigation link", async () => {
		const detail = reviewDetail({
			requiredChanges: [],
			inlineComments: [{ path: "src/example.ts", line: 1, body: "Check this value." }],
		});
		mockReviewList.mockReturnValue({ reviews: [detail] });
		mockReviewGet.mockReturnValue(detail);

		const element = await renderReview(
			<ChangeReviewModal
				open
				change={change}
				changes={[change]}
				workspaceId="changeyard"
				onOpenChange={() => {}}
				onSelectChange={() => {}}
				onReviewChanged={() => {}}
			/>,
		);

		expect(element.textContent).toContain("src/example.ts:1");
		expect(element.textContent).toContain("R1");
		expect(element.textContent).toContain("const value = 2;");
		expect(element.textContent).toContain("Check this value.");
		expect(element.querySelector('button[aria-label="View src/example.ts:1 in diff"]')).not.toBeNull();

		await act(async () => {
			element.querySelector<HTMLButtonElement>('button[aria-label="View src/example.ts:1 in diff"]')?.click();
		});
	});
});
