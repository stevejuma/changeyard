import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkdownMessageEditor } from "@/components/ui/markdown-message-editor";

vi.mock("@uiw/react-markdown-preview", () => ({
	default: ({ source }: { source: string }) => <article>{source}</article>,
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
	root?.unmount();
	root = null;
	container?.remove();
	container = null;
	vi.restoreAllMocks();
});

function render(element: ReactElement): HTMLDivElement {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
	return container;
}

describe("MarkdownMessageEditor", () => {
	it("applies toolbar markdown actions to the selected text", () => {
		const onChange = vi.fn();
		const element = render(<MarkdownMessageEditor value="Ship it" onChange={onChange} />);
		const textarea = element.querySelector("textarea");
		expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
		if (!(textarea instanceof HTMLTextAreaElement)) {
			throw new Error("Expected editor textarea.");
		}
		textarea.setSelectionRange(0, 4);

		act(() => {
			element.querySelector<HTMLButtonElement>('button[aria-label="Bold"]')?.click();
		});

		expect(onChange).toHaveBeenCalledWith("**Ship** it");
	});

	it("switches between write and preview tabs", async () => {
		const element = render(<MarkdownMessageEditor value="**Ready**" onChange={() => {}} />);
		expect(element.querySelector("textarea")).not.toBeNull();

		await act(async () => {
			element.querySelectorAll("button")[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(element.querySelector("textarea")).toBeNull();
		expect(element.textContent).toContain("**Ready**");
	});
});
