import { describe, expect, it } from "vitest";

import type { RuntimeChangeyardChangeListItem, RuntimeTaskSessionSummary } from "@/runtime/types";
import { buildChangeSessionSelection } from "./change-session-selection";

describe("buildChangeSessionSelection", () => {
	it("maps a review-ready Changeyard change into the review task column", () => {
		const selection = buildChangeSessionSelection({
			change: {
				id: "CY-0042",
				title: "Validate provider output",
				status: "ready_for_pr",
				updatedAt: "2026-07-14T12:00:00.000Z",
				base: { revision: "main" },
			} as RuntimeChangeyardChangeListItem,
			detail: null,
			summary: { updatedAt: 1_000, state: "idle" } as RuntimeTaskSessionSummary,
		});

		expect(selection.column.id).toBe("review");
		expect(selection.card.baseRef).toBe("main");
		expect(selection.allColumns.find((column) => column.id === "review")?.cards).toHaveLength(1);
	});
});
