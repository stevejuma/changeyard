import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateChangeDialog } from "@/components/changeyard/create-change-dialog";

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
	const prototype = Object.getPrototypeOf(element) as { value?: string };
	const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
	descriptor?.set?.call(element, value);
}

describe("CreateChangeDialog", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		document.body.innerHTML = "";
	});

	it("uses the shared creation surface and submits change-specific fields", () => {
		const onCreate = vi.fn();

		act(() => {
			root.render(
				<CreateChangeDialog
					open
					branchOptions={[
						{ value: "main", label: "main" },
						{ value: "abc123", label: "abc123" },
					]}
					defaultBaseRevision="main"
					onOpenChange={vi.fn()}
					onCreate={onCreate}
				/>,
			);
		});

		expect(document.body.textContent).toContain("New change");
		const composer = document.body.querySelector<HTMLTextAreaElement>('textarea[placeholder="Describe the change..."]');
		expect(composer).toBeTruthy();

		act(() => {
			setNativeValue(composer!, "Unify board layout");
			composer!.dispatchEvent(new Event("input", { bubbles: true }));
		});

		const selects = document.body.querySelectorAll<HTMLSelectElement>("select");
		act(() => {
			setNativeValue(selects[0]!, "bug");
			selects[0]!.dispatchEvent(new Event("change", { bubbles: true }));
			setNativeValue(selects[1]!, "high");
			selects[1]!.dispatchEvent(new Event("change", { bubbles: true }));
			setNativeValue(selects[2]!, "openspec-lite");
			selects[2]!.dispatchEvent(new Event("change", { bubbles: true }));
		});

		const labelsInput = Array.from(document.body.querySelectorAll("input")).find(
			(input) => input.getAttribute("placeholder") === "agent-ready, ui",
		);
		act(() => {
			setNativeValue(labelsInput!, "ui, regression");
			labelsInput!.dispatchEvent(new Event("input", { bubbles: true }));
		});

		const createButton = Array.from(document.body.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Create"),
		);
		act(() => {
			createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(onCreate).toHaveBeenCalledWith(
			{
				template: "bug",
				title: "Unify board layout",
				priority: "high",
				baseRevision: "main",
				labels: ["ui", "regression"],
				planning: "openspec-lite",
				strict: false,
			},
			{ keepDialogOpen: false },
		);
	});
});
