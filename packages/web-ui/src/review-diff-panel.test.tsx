import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewDiffPanel, type DiffLineComment, type ReviewDiffFileChange } from "./review-diff-panel";

vi.mock("react-hotkeys-hook", () => ({
	useHotkeys: () => undefined,
}));

vi.mock("@uiw/react-markdown-preview", () => ({
	default: ({ source }: { source: string }) => <article>{source}</article>,
}));

describe("ReviewDiffPanel", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;
	let previousRequestAnimationFrame: typeof requestAnimationFrame | undefined;

	beforeEach(() => {
		previousRequestAnimationFrame = globalThis.requestAnimationFrame;
		globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
			callback(0);
			return 0;
		}) as typeof requestAnimationFrame;
		previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
			.IS_REACT_ACT_ENVIRONMENT;
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		vi.restoreAllMocks();
		container.remove();
		if (previousRequestAnimationFrame) {
			globalThis.requestAnimationFrame = previousRequestAnimationFrame;
		} else {
			Reflect.deleteProperty(globalThis, "requestAnimationFrame");
		}
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		} else {
			(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
				previousActEnvironment;
		}
	});

	it("renders all files and read-only PR comments inline", async () => {
		const files: ReviewDiffFileChange[] = [
			{
				path: "src/a.ts",
				status: "modified",
				additions: 1,
				deletions: 0,
				oldText: "const a = 1;\n",
				newText: "const a = 2;\n",
			},
			{
				path: "src/b.ts",
				status: "modified",
				additions: 1,
				deletions: 0,
				oldText: "const b = 1;\n",
				newText: "const b = 2;\n",
			},
		];
		const readOnlyComments: DiffLineComment[] = [
			{
				id: "comment-1",
				filePath: "src/a.ts",
				lineNumber: 1,
				lineText: "",
				variant: "added",
				comment: "Can we keep this stable?",
				author: "Ada",
				authorAssociation: "AUTHOR",
				readOnly: true,
			},
		];

		await act(async () => {
			root.render(
				<ReviewDiffPanel
					workspaceFiles={files}
					selectedPath={null}
					onSelectedPathChange={() => {}}
					comments={new Map()}
					onCommentsChange={() => {}}
					readOnlyComments={readOnlyComments}
				/>,
			);
		});

		expect(container.querySelectorAll(".kb-diff-file-section")).toHaveLength(2);
		expect(container.textContent).toContain("src/a.ts");
		expect(container.textContent).toContain("src/b.ts");
		expect(container.textContent).toContain("Ada");
		expect(container.textContent).toContain("Can we keep this stable?");
		expect(container.querySelector('[aria-label^="Edit comment"]')).toBeNull();
	});

	it("can render without owning vertical scroll", async () => {
		const files: ReviewDiffFileChange[] = [
			{
				path: "src/a.ts",
				status: "modified",
				additions: 1,
				deletions: 0,
				oldText: "const a = 1;\n",
				newText: "const a = 2;\n",
			},
		];

		await act(async () => {
			root.render(
				<ReviewDiffPanel
					workspaceFiles={files}
					selectedPath={null}
					onSelectedPathChange={() => {}}
					comments={new Map()}
					onCommentsChange={() => {}}
					useInternalScroll={false}
				/>,
			);
		});

		const rootElement = container.firstElementChild as HTMLElement | null;
		const diffContainer = container.querySelector(".kb-diff-file-section")?.parentElement as HTMLElement | null;
		expect(rootElement?.style.background).toBe("transparent");
		expect(diffContainer?.style.overflowY).toBe("visible");
		expect(diffContainer?.style.padding).toBe("0px");
	});
});
