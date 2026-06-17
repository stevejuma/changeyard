import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileListing, FileListingViewModeToggle, type FileListingViewMode } from "./file-listing";

interface TestFile {
	path: string;
	additions?: number;
	deletions?: number;
}

const files: TestFile[] = [
	{ path: "src/app.tsx", additions: 3 },
	{ path: "src/utils/config.json", deletions: 1 },
	{ path: "README.md" },
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

describe("FileListing", () => {
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

	it("renders all three mode buttons", async () => {
		const onModeChange = vi.fn();
		await act(async () => {
			root.render(<FileListingViewModeToggle mode="tree" onModeChange={onModeChange} />);
		});

		expect(container.querySelector('button[aria-label="Show files as list"]')).not.toBeNull();
		expect(container.querySelector('button[aria-label="Show files as folders"]')).not.toBeNull();
		expect(container.querySelector('button[aria-label="Show files as packages"]')).not.toBeNull();

		await act(async () => {
			container.querySelector<HTMLButtonElement>('button[aria-label="Show files as packages"]')?.click();
		});
		expect(onModeChange).toHaveBeenCalledWith("package");
	});

	it("renders material file icons in list, tree, and package modes", async () => {
		for (const mode of ["list", "tree", "package"] satisfies FileListingViewMode[]) {
			await act(async () => {
				root.render(
					<FileListing files={files} mode={mode} selectedPath={null} onSelectPath={() => {}} />,
				);
			});

			expect(container.querySelector(".kb-file-type-icon svg")).not.toBeNull();
		}
	});

	it("compacts nested folders in package mode", async () => {
		await act(async () => {
			root.render(
				<FileListing
					files={[{ path: "packages/app/src/index.ts" }]}
					mode="package"
					selectedPath={null}
					onSelectPath={() => {}}
				/>,
			);
		});

		expect(container.textContent).toContain("packages/app/src");
	});

	it("collapses and expands folder rows", async () => {
		await act(async () => {
			root.render(<FileListing files={files} mode="tree" selectedPath={null} onSelectPath={() => {}} />);
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
});
