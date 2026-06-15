import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenWorkspaceButton } from "@/components/open-workspace-button";
import type { OpenTargetOption } from "@/utils/open-targets";

const vscodeOption: OpenTargetOption = {
	id: "vscode",
	label: "VS Code",
	iconSrc: "/assets/vscode.svg",
};

describe("OpenWorkspaceButton", () => {
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
		container.remove();
		if (previousActEnvironment === undefined) {
			delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
		} else {
			(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
				previousActEnvironment;
		}
	});

	it("uses theme variables for the open target icon filter so light themes keep contrast", async () => {
		await act(async () => {
			root.render(
				<OpenWorkspaceButton
					options={[vscodeOption]}
					selectedOptionId="vscode"
					disabled={false}
					loading={false}
					onOpen={vi.fn()}
					onSelectOption={vi.fn()}
				/>,
			);
		});

		const openButton = container.querySelector('button[aria-label="Open in VS Code"]');
		expect(openButton).toBeInstanceOf(HTMLButtonElement);
		const icon = openButton?.querySelector("img[aria-hidden='true']");
		expect(icon).toBeInstanceOf(HTMLImageElement);
		expect((icon as HTMLImageElement | null)?.src).toContain("/assets/vscode.svg");
		expect(icon?.className).toBe("kb-open-target-icon");
		expect((icon as HTMLElement | null)?.style.filter).toBe("");
		expect((icon as HTMLElement | null)?.style.opacity).toBe("");
	});
});
