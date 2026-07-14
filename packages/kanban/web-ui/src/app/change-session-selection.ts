import type { RuntimeChangeyardChangeDetail, RuntimeChangeyardChangeListItem, RuntimeTaskSessionSummary } from "@/runtime/types";
import type { BoardCard, BoardColumn, BoardColumnId, CardSelection } from "@/types";

const TASK_DETAIL_COLUMNS: Array<{ id: BoardColumnId; title: string }> = [
	{ id: "backlog", title: "Backlog" },
	{ id: "in_progress", title: "In Progress" },
	{ id: "review", title: "Review" },
	{ id: "trash", title: "Done" },
];

function changeStatusToTaskColumnId(status: string): BoardColumnId {
	switch (status) {
		case "in_progress":
		case "changes_requested":
			return "in_progress";
		case "ready_for_pr":
		case "pr_open":
		case "in_review":
		case "approved":
		case "merged":
			return "review";
		case "abandoned":
			return "trash";
		default:
			return "backlog";
	}
}

/** Convert a Changeyard change into the task-detail selection model. */
export function buildChangeSessionSelection({
	change,
	detail,
	summary,
}: {
	change: RuntimeChangeyardChangeListItem;
	detail: RuntimeChangeyardChangeDetail | null;
	summary: RuntimeTaskSessionSummary;
}): CardSelection {
	const columnId = changeStatusToTaskColumnId(change.status);
	const timestamp = Date.parse(detail?.updatedAt ?? change.updatedAt ?? "") || summary.updatedAt || Date.now();
	const card: BoardCard = {
		id: change.id,
		title: change.title,
		prompt: detail?.body ?? change.title,
		startInPlanMode: false,
		autoReviewEnabled: false,
		autoReviewMode: "commit",
		agentId: summary.agentId ?? undefined,
		baseRef: change.base?.revision ?? "main",
		createdAt: timestamp,
		updatedAt: timestamp,
	};
	const allColumns: BoardColumn[] = TASK_DETAIL_COLUMNS.map((column) => ({
		...column,
		cards: column.id === columnId ? [card] : [],
	}));
	const column = allColumns.find((candidate) => candidate.id === columnId) ?? allColumns[0]!;
	return { card, column, allColumns };
}
