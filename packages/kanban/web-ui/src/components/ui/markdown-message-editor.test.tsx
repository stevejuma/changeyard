import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkdownMessageEditor, toggleMarkdownTaskListItem } from "@/components/ui/markdown-message-editor";

vi.mock("@uiw/react-markdown-preview", () => ({
	default: ({ source }: { source: string }) => (
		<article>
			{source.split("\n").map((line, index) => {
				const taskMatch = line.match(/^(\s*(?:[-+*]|\d+[.)])\s+\[)( |x|X)(\]\s+)(.*)$/);
				if (!taskMatch) {
					return <p key={index}>{line}</p>;
				}
				return (
					<label key={index}>
						<input type="checkbox" checked={(taskMatch[2] ?? "").toLowerCase() === "x"} disabled readOnly />
						{taskMatch[4] ?? ""}
					</label>
				);
			})}
		</article>
	),
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
	it("toggles the requested markdown task-list item", () => {
		const source = "- [ ] First\r\n- [x] Second\n1. [ ] Third";

		expect(toggleMarkdownTaskListItem(source, 0, true)).toBe("- [x] First\r\n- [x] Second\n1. [ ] Third");
		expect(toggleMarkdownTaskListItem(source, 1, false)).toBe("- [ ] First\r\n- [ ] Second\n1. [ ] Third");
		expect(toggleMarkdownTaskListItem(source, 2, true)).toBe("- [ ] First\r\n- [x] Second\n1. [x] Third");
		expect(toggleMarkdownTaskListItem(source, 3, true)).toBe(source);
	});

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

	it("can render preview first with padded preview content", () => {
		const element = render(<MarkdownMessageEditor value="# Ready" onChange={() => {}} mode="preview" previewFirst />);
		const buttons = Array.from(element.querySelectorAll("button")).map((button) => button.textContent);
		const preview = element.querySelector(".cy-markdown-preview");

		expect(buttons.slice(0, 2)).toEqual(["Preview", "Write"]);
		expect(preview?.classList.contains("px-6")).toBe(true);
		expect(preview?.classList.contains("py-5")).toBe(true);
	});

	it("rounds the toolbar edge elements with the editor frame", () => {
		const element = render(<MarkdownMessageEditor value="Ready" onChange={() => {}} />);
		const toolbar = element.querySelector('[data-testid="markdown-editor-toolbar"]');
		const firstTab = toolbar?.querySelector("button");
		const characterCount = toolbar?.querySelector('[data-testid="markdown-editor-character-count"]');

		expect(toolbar?.classList.contains("rounded-t-lg")).toBe(true);
		expect(toolbar?.classList.contains("overflow-hidden")).toBe(true);
		expect(firstTab?.classList.contains("rounded-tl-lg")).toBe(true);
		expect(characterCount?.classList.contains("rounded-tr-lg")).toBe(true);
	});

	it("updates markdown when a preview task-list checkbox changes", async () => {
		const onChange = vi.fn();
		const onTaskListToggle = vi.fn();
		const element = render(
			<MarkdownMessageEditor
				value={"- [ ] First\n- [x] Second"}
				onChange={onChange}
				onTaskListToggle={onTaskListToggle}
				mode="preview"
				previewFirst
			/>,
		);

		await act(async () => {
			await Promise.resolve();
			await Promise.resolve();
		});

		const checkbox = element.querySelector<HTMLInputElement>("input[type='checkbox']");
		expect(checkbox).toBeInstanceOf(HTMLInputElement);
		expect(checkbox?.disabled).toBe(false);

		await act(async () => {
			checkbox?.click();
			await Promise.resolve();
		});

		expect(onChange).toHaveBeenCalledWith("- [x] First\n- [x] Second");
		expect(onTaskListToggle).toHaveBeenCalledWith("- [x] First\n- [x] Second");
	});
});
