import { describe, expect, it } from "vitest";

import { unsupportedChangeMoveMessage } from "@/utils/change-move-error";

describe("unsupportedChangeMoveMessage", () => {
	it("explains why ready-for-PR changes cannot be dragged directly to done", () => {
		expect(unsupportedChangeMoveMessage("CY-0019", "ready_for_pr", "done")).toBe(
			"CY-0019 is ready for PR, but Done is only for approved or merged changes. Start a review first, or use Land to merge the ready-for-PR workspace.",
		);
	});

	it("uses readable labels for generic unsupported moves", () => {
		expect(unsupportedChangeMoveMessage("CY-0019", "blocked", "done")).toBe(
			"Cannot move CY-0019 from Blocked to Done. Use the change lifecycle action for this transition.",
		);
	});
});
