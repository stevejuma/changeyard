import { describe, expect, it } from "vitest";

import { tagsForRuntimeStreamMessage } from "@/runtime/kanban-api";
import type { RuntimeStateStreamMessage } from "@/runtime/types";

describe("tagsForRuntimeStreamMessage", () => {
	it("invalidates project and workspace state tags for workspace state events", () => {
		expect(tagsForRuntimeStreamMessage({ type: "workspace_state_updated" } as RuntimeStateStreamMessage)).toEqual([
			"WorkspaceState",
			"Projects",
		]);
		expect(tagsForRuntimeStreamMessage({ type: "task_sessions_updated" } as RuntimeStateStreamMessage)).toEqual([
			"WorkspaceState",
			"Projects",
		]);
	});

	it("invalidates list, detail, board, and review tags for changed change markdown files", () => {
		expect(
			tagsForRuntimeStreamMessage({
				type: "vcs_project_event",
				workspaceId: "project-1",
				topic: "project://project-1/worktree_changes",
				kind: "worktree_changes",
				paths: [
					".changeyard/changes/CY-0024-adopt-rtk-query-for-kanban-core-data.md",
					"src/app.tsx",
					".changeyard/changes/CY-0025.md",
				],
				changedAt: 10,
				version: 1,
			} as RuntimeStateStreamMessage),
		).toEqual([
			"ChangeList",
			"ChangeList",
			{ type: "ChangeDetail", id: "CY-0024" },
			{ type: "ChangeBoardSummary", id: "CY-0024" },
			{ type: "ChangeBoardFiles", id: "CY-0024" },
			{ type: "ChangeBoardFileDiff", id: "CY-0024" },
			"ChangeReviews",
			"ChangeList",
			{ type: "ChangeDetail", id: "CY-0025" },
			{ type: "ChangeBoardSummary", id: "CY-0025" },
			{ type: "ChangeBoardFiles", id: "CY-0025" },
			{ type: "ChangeBoardFileDiff", id: "CY-0025" },
			"ChangeReviews",
		]);
	});

	it("ignores unrelated VCS project events", () => {
		expect(
			tagsForRuntimeStreamMessage({
				type: "vcs_project_event",
				workspaceId: "project-1",
				topic: "project://project-1/vcs/head",
				kind: "vcs/head",
				paths: [".changeyard/changes/CY-0024-adopt-rtk-query-for-kanban-core-data.md"],
				changedAt: 10,
				version: 1,
			} as RuntimeStateStreamMessage),
		).toEqual([]);
	});
});
