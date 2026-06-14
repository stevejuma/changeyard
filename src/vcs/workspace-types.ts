export type NeutralFileStatus = "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";

export type NeutralSelection = {
	source: "working_copy" | "commit";
	commitId?: string;
	paths?: string[];
	hunks?: Array<{
		path: string;
		hunkId: string;
		oldStart?: number;
		oldLines?: number;
		newStart?: number;
		newLines?: number;
	}>;
};

export type NeutralCommitPosition = {
	relativeToCommitId?: string;
	placement?: "before" | "after";
};

export type NeutralOperation =
	| { kind: "apply_stack"; stackId: string }
	| { kind: "unapply_stack"; stackId: string }
	| { kind: "create_stack"; name: string; selection?: NeutralSelection }
	| { kind: "create_commit"; stackId: string; message: string; selection: NeutralSelection }
	| { kind: "begin_edit_commit"; targetCommitId: string; message: string }
	| { kind: "save_edit_commit"; editCommitId: string; targetCommitId: string; returnToCommitId?: string }
	| { kind: "abort_edit_commit"; editCommitId: string; returnToCommitId?: string }
	| { kind: "track_remote_bookmark"; bookmarkName: string; remoteName?: string }
	| { kind: "untrack_remote_bookmark"; bookmarkName: string; remoteName?: string }
	| { kind: "checkout_commit"; commitId: string }
	| { kind: "abandon_commit"; commitId: string }
	| { kind: "reword_commit"; commitId: string; message: string }
	| { kind: "amend_commit"; commitId: string; selection: NeutralSelection }
	| { kind: "split_commit"; commitId: string; message: string; selection: NeutralSelection }
	| { kind: "squash_commits"; sourceCommitId: string; targetCommitId: string }
	| { kind: "move_commit"; commitId: string; targetStackId: string; position?: NeutralCommitPosition }
	| { kind: "move_changes"; selection: NeutralSelection; targetCommitId: string }
	| { kind: "uncommit_changes"; selection: NeutralSelection; targetStackId?: string }
	| { kind: "restore_changes"; selection: NeutralSelection }
	| { kind: "discard_changes"; selection: NeutralSelection }
	| { kind: "undo" }
	| { kind: "redo" };

export type NeutralOperationRequest = {
	operation: NeutralOperation;
};
