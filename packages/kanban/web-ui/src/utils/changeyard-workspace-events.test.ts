import { describe, expect, it } from "vitest";

import type { RuntimeChangeyardChangeListItem } from "@/runtime/types";
import {
	findAffectedWorkspaceChangeIds,
	isChangeyardChangeMarkdownEventPath,
} from "@/utils/changeyard-workspace-events";

function createChange(id: string, workspacePath: string): RuntimeChangeyardChangeListItem {
	return {
		id,
		title: id,
		type: "feature",
		status: "in_progress",
		path: `.changeyard/changes/${id}.md`,
		base: { revision: "main" },
		labels: [],
		planning: null,
		dependencies: { blockedBy: [], blocks: [] },
		workspace: { path: workspacePath, branch: `cy/${id}` },
	};
}

describe("Changeyard workspace event helpers", () => {
	it("detects root and workspace Changeyard change markdown paths", () => {
		expect(isChangeyardChangeMarkdownEventPath(".changeyard/changes/CY-0001-test.md")).toBe(true);
		expect(
			isChangeyardChangeMarkdownEventPath(
				".changeyard/workspaces/CY-0001/repo/.changeyard/changes/CY-0001-test.md",
			),
		).toBe(true);
		expect(isChangeyardChangeMarkdownEventPath(".changeyard/workspaces/CY-0001/repo/src/file.ts")).toBe(false);
	});

	it("matches relative and absolute change workspace paths against project-relative events", () => {
		const changes = [
			createChange("CY-0001", ".changeyard/workspaces/CY-0001/repo"),
			createChange("CY-0002", "/repo/.changeyard/workspaces/CY-0002/repo"),
			createChange("CY-0003", ".changeyard/workspaces/CY-0003/repo"),
		];

		expect(
			findAffectedWorkspaceChangeIds(
				changes,
				[
					".changeyard/workspaces/CY-0001/repo/src/file.ts",
					".changeyard/workspaces/CY-0002/repo/.changeyard/changes/CY-0002-test.md",
				],
				"/repo",
			),
		).toEqual(["CY-0001", "CY-0002"]);
	});
});
