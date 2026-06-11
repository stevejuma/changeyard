import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkdownDocumentEditor, MarkdownDocumentPreview } from "@/components/markdown-document";

vi.mock("@uiw/react-markdown-editor", () => {
	function MockMarkdownEditor({
		value,
		onChange,
	}: {
		value: string;
		onChange: (value?: string) => void;
	}) {
		return (
			<div>
				<textarea value={value} readOnly />
				<button type="button" onClick={() => onChange("Updated")}>
					Update
				</button>
			</div>
		);
	}
	MockMarkdownEditor.Markdown = ({ source }: { source: string }) => <article>{source}</article>;
	return {
		default: MockMarkdownEditor,
	};
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
	root?.unmount();
	root = null;
	container?.remove();
	container = null;
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

describe("MarkdownDocument", () => {
	it("updates markdown through the shared editor wrapper", () => {
		const onChange = vi.fn();
		const element = render(<MarkdownDocumentEditor value="# Title" onChange={onChange} />);
		const textarea = element.querySelector("textarea");
		expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
		if (!(textarea instanceof HTMLTextAreaElement)) {
			throw new Error("Expected markdown textarea");
		}
		const button = element.querySelector("button");
		expect(button).toBeInstanceOf(HTMLButtonElement);
		act(() => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onChange).toHaveBeenCalledWith("Updated");
	});

	it("renders preview content and empty state", () => {
		const preview = render(<MarkdownDocumentPreview source="**Ready**" />);
		expect(preview.textContent).toContain("**Ready**");
		root?.unmount();
		root = null;
		preview.remove();
		container = null;

		const empty = render(<MarkdownDocumentPreview source="" emptyLabel="Nothing yet" />);
		expect(empty.textContent).toContain("Nothing yet");
	});
});
