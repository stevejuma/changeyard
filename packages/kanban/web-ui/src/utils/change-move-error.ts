type ChangeMoveTargetColumn = "backlog" | "ready" | "in_progress" | "blocked" | "review" | "done" | "abandoned";

const TARGET_COLUMN_LABELS: Record<ChangeMoveTargetColumn, string> = {
	backlog: "Backlog",
	ready: "Ready",
	in_progress: "In Progress",
	blocked: "Blocked",
	review: "Review / PR",
	done: "Done",
	abandoned: "Abandoned",
};

const STATUS_LABELS: Record<string, string> = {
	draft: "Draft",
	ready: "Ready",
	synced: "Synced",
	in_progress: "In Progress",
	blocked: "Blocked",
	ready_for_pr: "Ready for PR",
	pr_open: "PR Open",
	in_review: "In Review",
	changes_requested: "Changes Requested",
	approved: "Approved",
	merged: "Merged",
	abandoned: "Abandoned",
};

function statusLabel(status: string): string {
	return STATUS_LABELS[status] ?? (status || "unknown");
}

export function unsupportedChangeMoveMessage(
	changeId: string,
	status: string,
	targetColumnId: ChangeMoveTargetColumn,
): string {
	if (targetColumnId === "done") {
		if (status === "ready_for_pr") {
			return `${changeId} is ready for PR, but Done is only for approved or merged changes. Start a review first, or use Land to merge the ready-for-PR workspace.`;
		}
		if (status === "pr_open") {
			return `${changeId} has an open PR, but Done is only for approved or merged changes. Finish review or merge the PR, then update the change to merged.`;
		}
		if (status === "changes_requested") {
			return `${changeId} has requested changes. Move it back to In Progress, address the feedback, then complete it again before moving to Done.`;
		}
	}

	if (targetColumnId === "review" && status === "ready_for_pr") {
		return `${changeId} is already Ready for PR. Use Start Review from the change detail panel to create a review before approval.`;
	}

	return `Cannot move ${changeId} from ${statusLabel(status)} to ${TARGET_COLUMN_LABELS[targetColumnId]}. Use the change lifecycle action for this transition.`;
}
