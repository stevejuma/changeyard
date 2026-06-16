import type { VcsDiagnostic } from "@/runtime/types";

export type VcsProviderKind = "jj" | "git";

export type VcsWorkspaceMode = "normal" | "editing" | "conflicted" | "unsupported";

export type VcsFileStatus = "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";

export interface VcsWorkspaceCapabilities {
	supportsMultiAppliedWorkspace: boolean;
	supportsHunkSelection: boolean;
	supportsHunkRestoreDiscard: boolean;
	supportsCommittedHunkSelection: boolean;
	supportsCommitRewrite: boolean;
	supportsMoveCommitAcrossStacks: boolean;
	supportsMoveChangesAcrossCommits: boolean;
	supportsUndoRedo: boolean;
	supportsSyntheticWorkspaceMerge: boolean;
	supportsCreateStack: boolean;
	supportsWorkingCopyCommit: boolean;
}

export interface VcsWorkspaceState {
	projectId: string;
	provider: VcsProviderKind;
	stateVersion?: number;
	targetRef: string;
	headId: string | null;
	mode: VcsWorkspaceMode;
	capabilities: VcsWorkspaceCapabilities;
	stacks: VcsWorkspaceStack[];
	appliedStackIds: string[];
	workingCopy: VcsWorkingCopyState;
	conflicts: VcsWorkspaceConflict[];
}

export interface VcsWorkspaceStack {
	stackId: string;
	name: string;
	targetRef: string | null;
	baseRef: string | null;
	headCommitId: string | null;
	isApplied: boolean;
	isCurrent: boolean;
	commits: VcsWorkspaceCommit[];
	metadata?: VcsProviderMetadata;
}

export interface VcsWorkspaceCommit {
	commitId: string;
	displayId: string;
	title: string;
	description: string;
	authorName: string | null;
	authorEmail: string | null;
	authorAvatarUrl: string | null;
	timestamp: string | null;
	parentCommitIds: string[];
	stackIds: string[];
	isHead: boolean;
	isCurrent: boolean;
	files?: VcsWorkspaceFileChange[];
	metadata?: VcsProviderMetadata;
}

export interface VcsWorkspaceFileChange {
	path: string;
	previousPath?: string | null;
	status: VcsFileStatus;
	additions?: number;
	deletions?: number;
	hunks?: VcsDiffHunk[];
}

export interface VcsWorkingCopyState {
	files: VcsWorkspaceFileChange[];
	hasConflicts: boolean;
	summary: {
		modified: number;
		added: number;
		deleted: number;
		renamed: number;
		copied: number;
		unknown: number;
	};
}

export interface VcsDiffHunk {
	id: string;
	path: string;
	header: string;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	patch: string;
}

export interface VcsHunkSelection {
	path: string;
	hunkId: string;
	oldStart?: number;
	oldLines?: number;
	newStart?: number;
	newLines?: number;
}

export interface VcsChangeSelection {
	source: "working_copy" | "commit";
	commitId?: string;
	paths?: string[];
	hunks?: VcsHunkSelection[];
}

export interface VcsCommitPosition {
	relativeToCommitId?: string;
	placement?: "before" | "after";
}

export type VcsWorkspaceOperation =
	| { kind: "apply_stack"; stackId: string }
	| { kind: "unapply_stack"; stackId: string }
	| { kind: "create_stack"; name: string; selection?: VcsChangeSelection }
	| { kind: "create_commit"; stackId: string; message: string; selection?: VcsChangeSelection | null }
	| { kind: "add_empty_commit"; targetCommitId: string; placement: "before" | "after"; message: string }
	| { kind: "create_bookmark"; targetCommitId: string; bookmarkName: string }
	| { kind: "rename_stack"; stackId: string; name: string }
	| { kind: "delete_stack"; stackId: string }
	| { kind: "squash_stack"; stackId: string }
	| { kind: "begin_edit_commit"; targetCommitId: string; message: string }
	| { kind: "save_edit_commit"; editCommitId: string; targetCommitId: string; returnToCommitId?: string }
	| { kind: "abort_edit_commit"; editCommitId: string; returnToCommitId?: string }
	| { kind: "track_remote_bookmark"; bookmarkName: string; remoteName?: string }
	| { kind: "untrack_remote_bookmark"; bookmarkName: string; remoteName?: string }
	| { kind: "checkout_commit"; commitId: string }
	| { kind: "abandon_commit"; commitId: string }
	| { kind: "reword_commit"; commitId: string; message: string }
	| { kind: "amend_commit"; commitId: string; selection: VcsChangeSelection }
	| { kind: "split_commit"; commitId: string; message: string; selection: VcsChangeSelection }
	| { kind: "squash_commits"; sourceCommitId: string; targetCommitId: string }
	| { kind: "move_commit"; commitId: string; targetStackId: string; position?: VcsCommitPosition }
	| { kind: "move_changes"; selection: VcsChangeSelection; targetCommitId: string }
	| { kind: "uncommit_changes"; selection: VcsChangeSelection; targetStackId?: string }
	| { kind: "restore_changes"; selection: VcsChangeSelection }
	| { kind: "discard_changes"; selection: VcsChangeSelection }
	| { kind: "undo" }
	| { kind: "redo" };

export interface VcsWorkspaceConflict {
	id: string;
	path?: string | null;
	message: string;
	commitIds: string[];
	stackIds: string[];
}

export interface VcsOperationWarning {
	code: string;
	message: string;
}

export interface VcsOperationPreview {
	valid: boolean;
	operation: VcsWorkspaceOperation;
	title: string;
	summary: string;
	risk: "low" | "medium" | "high";
	disabledReason: string | null;
	warnings: VcsOperationWarning[];
	conflicts: VcsWorkspaceConflict[];
	affectedStackIds: string[];
	affectedCommitIds: string[];
	affectedPaths: string[];
	diagnostics: VcsDiagnostic[];
}

export type VcsOperationCacheUpdateKind = "none" | "commits" | "stacks" | "working_copy" | "workspace";

export interface VcsOperationCachePayload {
	commits?: VcsWorkspaceCommit[];
	stacks?: VcsWorkspaceStack[];
	removedStackIds?: string[];
	workingCopy?: VcsWorkingCopyState | null;
	conflicts?: VcsWorkspaceConflict[];
	headId?: string | null;
	mode?: VcsWorkspaceMode;
	appliedStackIds?: string[];
}

export interface VcsOperationTiming {
	totalMs?: number;
	commandMs?: number;
	updateReadMs?: number;
	commandCount?: number;
	fallbackReason?: string;
	reconcileMs?: number;
}

export interface VcsOperationResult {
	ok: boolean;
	operation: VcsWorkspaceOperation;
	title: string;
	summary: string;
	affectedStackIds: string[];
	affectedCommitIds: string[];
	affectedPaths: string[];
	recovery: VcsOperationRecovery | null;
	diagnostics: VcsDiagnostic[];
	cacheUpdate?: VcsOperationCacheUpdateKind;
	cachePayload?: VcsOperationCachePayload | null;
	invalidateTags?: string[];
	timing?: VcsOperationTiming | null;
}

export interface VcsOperationRecovery {
	refName?: string;
	instructions: string[];
}

export interface VcsDiffInput {
	projectId: string;
	workspacePath?: string | null;
	selection?: VcsChangeSelection;
	commitId?: string;
	stackId?: string;
}

export interface VcsDiffResult {
	ok: boolean;
	summary: string;
	patch: string;
	files: VcsWorkspaceFileChange[];
	diagnostics: VcsDiagnostic[];
}

export interface VcsWorkspaceStateInput {
	projectId: string;
	workspacePath?: string | null;
	targetRef?: string | null;
	appliedStackIds?: string[];
}

export interface VcsWorkspaceOperationContext {
	stateVersion?: number;
	stackId?: string;
	headCommitId?: string | null;
	orderedCommitIds?: string[];
	selectedCommitId?: string | null;
	nextLowerCommitId?: string | null;
}

export interface VcsWorkspaceOperationInput {
	projectId: string;
	workspacePath?: string | null;
	operation: VcsWorkspaceOperation;
	operationContext?: VcsWorkspaceOperationContext;
}

export interface VcsWorkspaceEngine {
	provider: VcsProviderKind;
	getCapabilities(): VcsWorkspaceCapabilities;
	getWorkspaceState(input: VcsWorkspaceStateInput): Promise<VcsWorkspaceState>;
	getDiff(input: VcsDiffInput): Promise<VcsDiffResult>;
	previewOperation(input: VcsWorkspaceOperationInput): Promise<VcsOperationPreview>;
	applyOperation(input: VcsWorkspaceOperationInput): Promise<VcsOperationResult>;
}

export type VcsProviderMetadata = Record<string, string | number | boolean | null | string[]>;

export type VcsWorkspaceOperationValidation =
	| { valid: true; reason: null }
	| { valid: false; reason: string };

export const unsupportedWorkspaceCapabilities: VcsWorkspaceCapabilities = {
	supportsMultiAppliedWorkspace: false,
	supportsHunkSelection: false,
	supportsHunkRestoreDiscard: false,
	supportsCommittedHunkSelection: false,
	supportsCommitRewrite: false,
	supportsMoveCommitAcrossStacks: false,
	supportsMoveChangesAcrossCommits: false,
	supportsUndoRedo: false,
	supportsSyntheticWorkspaceMerge: false,
	supportsCreateStack: false,
	supportsWorkingCopyCommit: false,
};

export function validateVcsWorkspaceOperation(
	operation: VcsWorkspaceOperation,
	capabilities: VcsWorkspaceCapabilities,
): VcsWorkspaceOperationValidation {
	const fieldValidation = validateOperationFields(operation);
	if (!fieldValidation.valid) {
		return fieldValidation;
	}

	const capabilityReason = disabledReasonForVcsWorkspaceOperation(operation, capabilities);
	if (capabilityReason) {
		return { valid: false, reason: capabilityReason };
	}

	return { valid: true, reason: null };
}

export function isLowRiskVcsWorkspaceOperation(
	operation: VcsWorkspaceOperation,
	provider: VcsProviderKind,
): boolean {
	void operation;
	void provider;
	return false;
}

export function areVcsWorkspaceOperationsEqual(
	left: VcsWorkspaceOperation,
	right: VcsWorkspaceOperation,
): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function disabledReasonForVcsWorkspaceOperation(
	operation: VcsWorkspaceOperation,
	capabilities: VcsWorkspaceCapabilities,
): string | null {
	if (operationUsesHunkSelection(operation) && !capabilitySupportsHunkSelectionForOperation(operation, capabilities)) {
		return "This provider does not support hunk-level workspace operations.";
	}

	switch (operation.kind) {
		case "create_commit":
			if (!operation.selection || operation.selection.source === "working_copy") {
				return capabilities.supportsWorkingCopyCommit
					? null
					: "This provider does not support committing selected working-copy changes.";
			}
			return capabilities.supportsMoveChangesAcrossCommits
				? null
				: "This provider does not support moving selected changes into a new commit.";
		case "add_empty_commit":
		case "create_bookmark":
		case "rename_stack":
		case "delete_stack":
		case "squash_stack":
		case "begin_edit_commit":
		case "save_edit_commit":
		case "abort_edit_commit":
		case "checkout_commit":
		case "abandon_commit":
		case "reword_commit":
		case "amend_commit":
		case "split_commit":
		case "squash_commits":
			return capabilities.supportsCommitRewrite
				? null
				: "This provider does not support commit rewrite operations.";
		case "move_commit":
			return capabilities.supportsMoveCommitAcrossStacks
				? null
				: "This provider does not support moving commits across stacks.";
		case "move_changes":
		case "uncommit_changes":
			return capabilities.supportsMoveChangesAcrossCommits
				? null
				: "This provider does not support moving selected changes across commits.";
		case "undo":
		case "redo":
			return capabilities.supportsUndoRedo ? null : "This provider does not support undo and redo.";
		case "create_stack":
			return capabilities.supportsCreateStack
				? null
				: "This provider does not support creating stacks from selected changes.";
		case "track_remote_bookmark":
		case "untrack_remote_bookmark":
		case "apply_stack":
		case "unapply_stack":
		case "restore_changes":
		case "discard_changes":
			return null;
	}
}

function capabilitySupportsHunkSelectionForOperation(
	operation: VcsWorkspaceOperation,
	capabilities: VcsWorkspaceCapabilities,
): boolean {
	if (capabilities.supportsHunkSelection) {
		return true;
	}
	return (
		capabilities.supportsWorkingCopyCommit &&
		operation.kind === "create_commit" &&
		operation.selection?.source === "working_copy"
	) || (
		capabilities.supportsCommittedHunkSelection &&
		capabilities.supportsMoveChangesAcrossCommits &&
		operation.kind === "create_commit" &&
		operation.selection?.source === "commit"
	) || (
		capabilities.supportsCommitRewrite &&
		operation.kind === "amend_commit" &&
		operation.selection.source === "working_copy"
	) || (
		capabilities.supportsHunkRestoreDiscard &&
		(operation.kind === "restore_changes" || operation.kind === "discard_changes") &&
		operation.selection.source === "working_copy"
	) || (
		capabilities.supportsCommittedHunkSelection &&
		(
			operation.kind === "split_commit" ||
			operation.kind === "move_changes" ||
			operation.kind === "uncommit_changes" ||
			operation.kind === "restore_changes" ||
			operation.kind === "discard_changes"
		) &&
		operation.selection.source === "commit"
	);
}

function validateOperationFields(operation: VcsWorkspaceOperation): VcsWorkspaceOperationValidation {
	switch (operation.kind) {
		case "apply_stack":
		case "unapply_stack":
			return requireNonEmpty(operation.stackId, "Choose a stack.");
		case "create_stack":
			return operation.selection
				? firstInvalid(requireNonEmpty(operation.name, "Enter a stack name."), validateSelection(operation.selection))
				: requireNonEmpty(operation.name, "Enter a stack name.");
		case "create_commit":
			return operation.selection
				? firstInvalid(
						requireNonEmpty(operation.stackId, "Choose a target stack."),
						requireNonEmpty(operation.message, "Enter a commit message."),
						validateSelection(operation.selection),
					)
				: firstInvalid(
						requireNonEmpty(operation.stackId, "Choose a target stack."),
						requireNonEmpty(operation.message, "Enter a commit message."),
					);
		case "add_empty_commit":
			return firstInvalid(
				requireNonEmpty(operation.targetCommitId, "Choose a target commit."),
				requireNonEmpty(operation.message, "Enter a commit message."),
			);
		case "create_bookmark":
			return firstInvalid(
				requireNonEmpty(operation.targetCommitId, "Choose a target commit."),
				requireNonEmpty(operation.bookmarkName, "Enter a branch name."),
			);
		case "rename_stack":
			return firstInvalid(
				requireNonEmpty(operation.stackId, "Choose a stack."),
				requireNonEmpty(operation.name, "Enter a stack name."),
			);
		case "delete_stack":
		case "squash_stack":
			return requireNonEmpty(operation.stackId, "Choose a stack.");
		case "begin_edit_commit":
			return firstInvalid(
				requireNonEmpty(operation.targetCommitId, "Choose a commit to edit."),
				requireNonEmpty(operation.message, "Enter an edit commit message."),
			);
		case "save_edit_commit":
			return firstInvalid(
				requireNonEmpty(operation.editCommitId, "Choose the edit commit."),
				requireNonEmpty(operation.targetCommitId, "Choose the target commit."),
				operation.editCommitId === operation.targetCommitId ? invalid("Edit and target commits must be different.") : valid(),
			);
		case "abort_edit_commit":
			return requireNonEmpty(operation.editCommitId, "Choose the edit commit.");
		case "track_remote_bookmark":
			return requireNonEmpty(operation.bookmarkName, "Choose a remote bookmark to track.");
		case "untrack_remote_bookmark":
			return requireNonEmpty(operation.bookmarkName, "Choose a remote bookmark to untrack.");
		case "checkout_commit":
		case "abandon_commit":
			return requireNonEmpty(operation.commitId, "Choose a commit.");
		case "reword_commit":
			return firstInvalid(
				requireNonEmpty(operation.commitId, "Choose a commit."),
				requireNonEmpty(operation.message, "Enter a commit message."),
			);
		case "amend_commit":
		case "split_commit":
			return firstInvalid(
				requireNonEmpty(operation.commitId, "Choose a commit."),
				operation.kind === "split_commit" ? requireNonEmpty(operation.message, "Enter a commit message.") : valid(),
				validateSelection(operation.selection),
			);
		case "squash_commits":
			return firstInvalid(
				requireNonEmpty(operation.sourceCommitId, "Choose a source commit."),
				requireNonEmpty(operation.targetCommitId, "Choose a target commit."),
				operation.sourceCommitId === operation.targetCommitId
					? invalid("Choose two different commits.")
					: valid(),
			);
		case "move_commit":
			return firstInvalid(
				requireNonEmpty(operation.commitId, "Choose a commit."),
				requireNonEmpty(operation.targetStackId, "Choose a target stack."),
			);
		case "move_changes":
			return firstInvalid(
				validateSelection(operation.selection),
				requireNonEmpty(operation.targetCommitId, "Choose a target commit."),
			);
		case "uncommit_changes":
		case "restore_changes":
		case "discard_changes":
			return validateSelection(operation.selection);
		case "undo":
		case "redo":
			return valid();
	}
}

function validateSelection(selection: VcsChangeSelection): VcsWorkspaceOperationValidation {
	if (selection.source === "commit") {
		const commitValidation = requireNonEmpty(selection.commitId, "Choose a source commit.");
		if (!commitValidation.valid) {
			return commitValidation;
		}
	}

	const paths = selection.paths ?? [];
	const hunks = selection.hunks ?? [];
	if (paths.length === 0 && hunks.length === 0) {
		return invalid("Choose at least one file or hunk.");
	}

	if (paths.some((path) => !path.trim()) || hunks.some((hunk) => !hunk.path.trim() || !hunk.hunkId.trim())) {
		return invalid("Selection contains an empty file or hunk identifier.");
	}

	return valid();
}

function operationUsesHunkSelection(operation: VcsWorkspaceOperation): boolean {
	switch (operation.kind) {
		case "create_stack":
			return Boolean(operation.selection?.hunks?.length);
		case "create_commit":
			return Boolean(operation.selection?.hunks?.length);
		case "amend_commit":
		case "split_commit":
		case "move_changes":
		case "uncommit_changes":
		case "restore_changes":
		case "discard_changes":
			return Boolean(operation.selection.hunks?.length);
		case "apply_stack":
		case "unapply_stack":
		case "add_empty_commit":
		case "create_bookmark":
		case "rename_stack":
		case "delete_stack":
		case "squash_stack":
		case "begin_edit_commit":
		case "save_edit_commit":
		case "abort_edit_commit":
		case "track_remote_bookmark":
		case "untrack_remote_bookmark":
		case "checkout_commit":
		case "abandon_commit":
		case "reword_commit":
		case "squash_commits":
		case "move_commit":
		case "undo":
		case "redo":
			return false;
	}
}

function firstInvalid(...results: VcsWorkspaceOperationValidation[]): VcsWorkspaceOperationValidation {
	return results.find((result) => !result.valid) ?? valid();
}

function requireNonEmpty(value: string | null | undefined, reason: string): VcsWorkspaceOperationValidation {
	return value?.trim() ? valid() : invalid(reason);
}

function valid(): VcsWorkspaceOperationValidation {
	return { valid: true, reason: null };
}

function invalid(reason: string): VcsWorkspaceOperationValidation {
	return { valid: false, reason };
}
