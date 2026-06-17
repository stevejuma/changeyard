import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileTreePanel } from "@/components/detail-panels/file-tree-panel";
import type { RuntimeWorkspaceFileChange } from "@/runtime/types";

const workspaceFiles: RuntimeWorkspaceFileChange[] = [
	{
		path: "src/app.tsx",
		status: "modified",
		additions: 10,
		deletions: 2,
		oldText: "",
		newText: "",
	},
	{
		path: "src/utils/config.json",
		status: "added",
		additions: 4,
		deletions: 0,
		oldText: null,
		newText: "{}\n",
	},
	{
		path: "README.md",
		status: "modified",
		additions: 1,
		deletions: 1,
		oldText: "",
		newText: "",
	},
];

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
	const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
		candidate.textContent?.includes(text),
	);
	if (!(button instanceof HTMLButtonElement)) {
		throw new Error(`Expected to find button containing ${text}.`);
	}
	return button;
}

describe("FileTreePanel", () => {
	let container: HTMLDivElement;
	let root: Root;
	let previousActEnvironment: boolean | undefined;

	beforeEach(() => {
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
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		} else {
			(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
				previousActEnvironment;
		}
	});

	it("collapses and expands folder rows", async () => {
		await act(async () => {
			root.render(
				<FileTreePanel
					workspaceFiles={workspaceFiles}
					selectedPath="src/app.tsx"
					onSelectPath={() => {}}
					showViewModeToggle
				/>,
			);
		});

		expect(container.textContent).toContain("app.tsx");
		expect(container.textContent).toContain("config.json");

		await act(async () => {
			findButton(container, "src").click();
		});

		expect(container.textContent).not.toContain("app.tsx");
		expect(container.textContent).not.toContain("config.json");
		expect(findButton(container, "src").getAttribute("aria-expanded")).toBe("false");

		await act(async () => {
			findButton(container, "src").click();
		});

		expect(container.textContent).toContain("app.tsx");
		expect(container.textContent).toContain("config.json");
		expect(findButton(container, "src").getAttribute("aria-expanded")).toBe("true");
	});

	it("switches between folder and list views", async () => {
		const onViewModeChange = vi.fn();
		await act(async () => {
			root.render(
				<FileTreePanel
					workspaceFiles={workspaceFiles}
					selectedPath={null}
					onSelectPath={() => {}}
					showViewModeToggle
					onViewModeChange={onViewModeChange}
				/>,
			);
		});

		expect(findButton(container, "src").getAttribute("aria-expanded")).toBe("true");

		await act(async () => {
			container.querySelector<HTMLButtonElement>('button[aria-label="Show files as list"]')?.click();
		});

		expect(onViewModeChange).toHaveBeenCalledWith("list");
		expect(container.textContent).toContain("src/utils");
		expect(container.querySelector('button[aria-label="Show files as folders"]')).not.toBeNull();

		await act(async () => {
			container.querySelector<HTMLButtonElement>('button[aria-label="Show files as folders"]')?.click();
		});

		expect(onViewModeChange).toHaveBeenCalledWith("tree");
		expect(findButton(container, "src").getAttribute("aria-expanded")).toBe("true");
	});

	it("switches to package view with material file icons", async () => {
		const onViewModeChange = vi.fn();
		await act(async () => {
			root.render(
				<FileTreePanel
					workspaceFiles={[
						{
							path: "packages/app/src/index.ts",
							status: "modified",
							additions: 3,
							deletions: 1,
							oldText: "",
							newText: "",
						},
					]}
					selectedPath={null}
					onSelectPath={() => {}}
					showViewModeToggle
					onViewModeChange={onViewModeChange}
				/>,
			);
		});

		expect(container.querySelector('button[aria-label="Show files as list"]')).not.toBeNull();
		expect(container.querySelector('button[aria-label="Show files as folders"]')).not.toBeNull();
		expect(container.querySelector('button[aria-label="Show files as packages"]')).not.toBeNull();

		await act(async () => {
			container.querySelector<HTMLButtonElement>('button[aria-label="Show files as packages"]')?.click();
		});

		expect(onViewModeChange).toHaveBeenCalledWith("package");
		expect(container.textContent).toContain("packages/app/src");
		expect(container.querySelector(".kb-file-type-icon svg")).not.toBeNull();
	});
});
