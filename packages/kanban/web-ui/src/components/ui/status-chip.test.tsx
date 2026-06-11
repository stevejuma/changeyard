import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ChangeStatusChip, PlanningGateStatusChip, TaskColumnStatusChip } from "@/components/ui/status-chip";

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

describe("StatusChip", () => {
	it("renders readable change status labels", () => {
		const element = render(<ChangeStatusChip status="changes_requested" />);
		expect(element.textContent).toContain("Changes Requested");
	});

	it("renders task column and planning gate statuses as chips", () => {
		const element = render(
			<div>
				<TaskColumnStatusChip columnId="review" />
				<PlanningGateStatusChip status="pending" />
			</div>,
		);
		expect(element.textContent).toContain("Review");
		expect(element.textContent).toContain("Pending");
	});
});
