import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseGitHistoryDataResult } from "@/components/git-history/use-git-history-data";
import { GitHistoryView } from "@/components/git-history-view";
import { LocalStorageKey } from "@/storage/local-storage-store";

const mockGitRefsPanel = vi.fn((_props: { panelWidth: number }) => <div data-testid="git-refs-panel" />);
const mockGitCommitListPanel = vi.fn((_props: { panelWidth: number }) => <div data-testid="git-commit-list-panel" />);
const mockGitCommitDiffPanel = vi.fn(
	(_props: { diffContentPanelWidth: number; fileTreePanelWidth: number; isFileTreePanelCollapsed: boolean }) => (
		<div data-testid="git-commit-diff-panel" />
	),
);

vi.mock("@/components/git-history/git-refs-panel", () => ({
	GitRefsPanel: (props: { panelWidth: number }) => mockGitRefsPanel(props),
}));

vi.mock("@/components/git-history/git-commit-list-panel", () => ({
	GitCommitListPanel: (props: { panelWidth: number }) => mockGitCommitListPanel(props),
}));

vi.mock("@/components/git-history/git-commit-diff-panel", () => ({
	GitCommitDiffPanel: (
		props: { diffContentPanelWidth: number; fileTreePanelWidth: number; isFileTreePanelCollapsed: boolean },
	) => mockGitCommitDiffPanel(props),
}));

vi.mock("@/resize/layout-customizations", () => ({
	useLayoutResetEffect: () => {},
}));

function createGitHistory(): UseGitHistoryDataResult {
	return {
		viewMode: "working-copy",
		refs: [],
		activeRef: null,
		refsErrorMessage: null,
		isRefsLoading: false,
		workingCopyFileCount: 0,
		hasWorkingCopy: false,
		commits: [],
		totalCommitCount: 0,
		selectedCommitHash: null,
		selectedCommit: null,
		isLogLoading: false,
		isLoadingMoreCommits: false,
		logErrorMessage: null,
		diffSource: null,
		isDiffLoading: false,
		diffErrorMessage: null,
		selectedDiffPath: null,
		selectWorkingCopy: () => {},
		selectRef: () => {},
		selectCommit: () => {},
		selectDiffPath: () => {},
		loadMoreCommits: () => {},
		refresh: () => {},
	};
}

describe("GitHistoryView", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;
	let currentOffsetWidth: number;
	let offsetWidthSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		previousActEnvironment = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
			.IS_REACT_ACT_ENVIRONMENT;
		(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		currentOffsetWidth = 900;
		offsetWidthSpy = vi.spyOn(HTMLDivElement.prototype, "offsetWidth", "get").mockImplementation(function offsetWidth(
			this: HTMLDivElement,
		) {
			if (this.dataset.testid === "git-refs-panel") {
				return 0;
			}
			return currentOffsetWidth;
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		window.localStorage.clear();
		mockGitRefsPanel.mockClear();
		mockGitCommitListPanel.mockClear();
		mockGitCommitDiffPanel.mockClear();
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		offsetWidthSpy.mockRestore();
		container.remove();
		window.localStorage.clear();
		mockGitRefsPanel.mockClear();
		mockGitCommitListPanel.mockClear();
		mockGitCommitDiffPanel.mockClear();
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		} else {
			(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
				previousActEnvironment;
		}
	});

	it("uses persisted widths without clamping them to the viewport", async () => {
		window.localStorage.setItem(LocalStorageKey.GitHistoryRefsPanelWidth, "400");
		window.localStorage.setItem(LocalStorageKey.GitHistoryCommitsPanelWidth, "500");
		window.localStorage.setItem(LocalStorageKey.GitHistoryDiffContentPanelWidth, "720");
		window.localStorage.setItem(LocalStorageKey.GitDiffFileTreePanelWidth, "280");

		await act(async () => {
			root.render(<GitHistoryView workspaceId="workspace-1" gitHistory={createGitHistory()} />);
		});

		const historyCanvas = container.querySelector('[data-testid="git-history-canvas"]');
		expect(historyCanvas).toBeInstanceOf(HTMLDivElement);
		expect(mockGitRefsPanel).toHaveBeenCalled();
		expect(mockGitCommitListPanel).toHaveBeenCalled();
		expect(mockGitCommitDiffPanel).toHaveBeenCalled();
		expect(mockGitRefsPanel.mock.calls.at(-1)?.[0]).toMatchObject({ panelWidth: 400 });
		expect(mockGitCommitListPanel.mock.calls.at(-1)?.[0]).toMatchObject({ panelWidth: 500 });
		expect(mockGitCommitDiffPanel.mock.calls.at(-1)?.[0]).toMatchObject({
			diffContentPanelWidth: 720,
			fileTreePanelWidth: 280,
			isFileTreePanelCollapsed: false,
		});
		expect((historyCanvas as HTMLDivElement).style.width).toBe("1903px");
		expect(window.localStorage.getItem(LocalStorageKey.GitHistoryRefsPanelWidth)).toBe("400");
		expect(window.localStorage.getItem(LocalStorageKey.GitHistoryCommitsPanelWidth)).toBe("500");
		expect(window.localStorage.getItem(LocalStorageKey.GitHistoryDiffContentPanelWidth)).toBe("720");
		expect(window.localStorage.getItem(LocalStorageKey.GitDiffFileTreePanelWidth)).toBe("280");
	});
});
