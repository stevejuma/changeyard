export type VcsRepositoryKind = "none" | "git" | "jj";
export type VcsProvider = "none" | "github" | "gitlab" | "forgejo" | "unknown";
export type VcsDiagnosticLevel = "info" | "warning" | "error";

export interface VcsDiagnostic {
	level: VcsDiagnosticLevel;
	code: string;
	message: string;
}

export interface VcsRepositorySummary {
	kind: VcsRepositoryKind;
	root: string | null;
}

export interface VcsJjSummary {
	installed: boolean;
	version: string | null;
	repoRoot: string | null;
	currentBookmark: string | null;
	currentChangeId: string | null;
	defaultBase: string | null;
}

export interface VcsGitSummary {
	remoteName: string | null;
	remoteUrl: string | null;
	provider: VcsProvider;
	defaultBranch: string | null;
}

export interface VcsPublishingSummary {
	provider: VcsProvider;
	remoteName: string | null;
	available: boolean;
	authenticated: boolean;
	reason: string | null;
}

export interface VcsDetectResult {
	cwd: string;
	repository: VcsRepositorySummary;
	jj: VcsJjSummary;
	git: VcsGitSummary;
	publishing: VcsPublishingSummary;
	diagnostics: VcsDiagnostic[];
}

export interface VcsJjBookmark {
	name: string;
	changeId: string;
	commitId: string;
	synced: boolean;
	tracked: boolean;
	trackedRemoteNames?: string[];
}

export interface VcsJjChange {
	changeId: string;
	commitId: string;
	description: string;
	authorName: string | null;
	authorEmail: string | null;
	authorAvatarUrl: string | null;
	timestamp: string | null;
	parentChangeIds: string[];
	bookmarks: string[];
	remoteBookmarks: string[];
	trackedRemoteBookmarks?: string[];
	untrackedRemoteBookmarks?: string[];
	immutableReason?: string | null;
	isCurrent: boolean;
}

export interface VcsJjStackChange {
	id: string;
	changeId: string;
	commitId: string;
	title: string;
	description: string;
	authorName: string | null;
	authorEmail: string | null;
	authorAvatarUrl: string | null;
	timestamp: string | null;
	bookmarks: string[];
	remoteBookmarks: string[];
	trackedRemoteBookmarks?: string[];
	untrackedRemoteBookmarks?: string[];
	immutableReason?: string | null;
	isCurrent: boolean;
	isHead: boolean;
}

export interface VcsJjStackHead {
	id: string;
	bookmarkName: string;
	changeId: string;
	commitId: string;
	title: string;
	isCheckedOut: boolean;
}

export interface VcsJjStack {
	id: string;
	tip: string;
	base: string;
	order: number;
	isCheckedOut: boolean;
	heads: VcsJjStackHead[];
	changes: VcsJjStackChange[];
}

export interface VcsJjUnassignedChange {
	path: string;
	status: "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";
}

export interface VcsJjStateResult extends VcsDetectResult {
	bookmarks: VcsJjBookmark[];
	changes: VcsJjChange[];
	stacks: VcsJjStack[];
	unassignedChanges: VcsJjUnassignedChange[];
}

export type VcsJjInventoryItemType = "current" | "bookmark" | "remote" | "branch" | "tag" | "workspace";
export type VcsJjInventoryItemGroup = "current" | "today" | "applied" | "remote" | "local" | "tags" | "older";

export interface VcsJjInventoryPullRequest {
	number: number;
	url: string | null;
	baseBranch: string | null;
	title?: string | null;
}

export interface VcsJjInventoryItem {
	id: string;
	name: string;
	type: VcsJjInventoryItemType;
	group: VcsJjInventoryItemGroup;
	changeId: string | null;
	commitId: string | null;
	title: string | null;
	authorName: string | null;
	authorEmail: string | null;
	authorAvatarUrl: string | null;
	timestamp: string | null;
	target: string | null;
	remoteName: string | null;
	hasLocal: boolean;
	remotes: string[];
	synced: boolean;
	tracked: boolean;
	isCurrent: boolean;
	pr: VcsJjInventoryPullRequest | null;
}

export interface VcsJjInventoryResult extends VcsDetectResult {
	workspaceTarget: VcsJjInventoryItem | null;
	items: VcsJjInventoryItem[];
}

export interface VcsJjBranchesDataResult {
	inventory: VcsJjInventoryResult;
	state: VcsJjStateResult;
}

export interface VcsJjDiffResult {
	changeId: string | null;
	summary: string;
	patch: string;
	diagnostics: VcsDiagnostic[];
}

export interface VcsJjOperationFile {
	path: string;
	status: "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";
}

export interface VcsJjOperationEntry {
	id: string;
	shortId: string;
	description: string;
	user: string | null;
	userAvatarUrl: string | null;
	timestamp: string | null;
	files: VcsJjOperationFile[];
	restoreEligible: boolean;
	parentOperationIds: string[];
}

export interface VcsJjOperationsResult {
	operations: VcsJjOperationEntry[];
	requestedLimit: number;
	nextCursor?: string | null;
	hasMore: boolean;
	diagnostics: VcsDiagnostic[];
}

export interface VcsJjOperationActionResult {
	ok: boolean;
	title: string;
	summary: string;
	operationId: string | null;
	changed: boolean;
	diagnostics: VcsDiagnostic[];
}

export interface VcsJjOperationCommit {
	hash: string;
	shortHash: string;
	changeId?: string;
	changeIdUniquePrefix?: string;
	authorName: string;
	authorEmail: string;
	authorAvatarUrl: string | null;
	date: string;
	message: string;
	parentHashes: string[];
	bookmarks: string[];
	labels: string[];
	relation?: "selected" | "upstream" | "shared";
}

export interface VcsJjOperationDiffResult {
	operationId: string;
	summary: string;
	patch: string;
	files: VcsJjOperationFile[];
	commits: VcsJjOperationCommit[];
	commitSkip: number;
	commitLimit: number;
	nextCursor?: string | null;
	totalCommitCount: number;
	hasMoreCommits: boolean;
	diagnostics: VcsDiagnostic[];
}

export type VcsPreviewOperationKind =
	| "reorder_change"
	| "create_bookmark"
	| "edit_message"
	| "create_change"
	| "move_bookmark"
	| "squash_change"
	| "split_change"
	| "absorb_file"
	| "restore_file"
	| "undo_last"
	| "redo_last"
	| "abandon_change";
export type VcsPreviewPlacement = "before" | "after";
export type VcsOperationRiskLevel = "low" | "medium" | "high";

export interface VcsCreateBookmarkOperationInput {
	kind: "create_bookmark";
	changeId: string;
	bookmarkName: string;
}

export interface VcsEditMessageOperationInput {
	kind: "edit_message";
	changeId: string;
	message: string;
}

export interface VcsCreateChangeOperationInput {
	kind: "create_change";
	anchorChangeId: string;
	placement: VcsPreviewPlacement;
	message: string;
}

export interface VcsMoveBookmarkOperationInput {
	kind: "move_bookmark";
	bookmarkName: string;
	targetChangeId: string;
}

export interface VcsSquashChangeOperationInput {
	kind: "squash_change";
	sourceChangeId: string;
	targetChangeId: string;
	paths?: string[];
	allowDescendantTarget?: boolean;
}

export interface VcsSplitChangeOperationInput {
	kind: "split_change";
	changeId: string;
	message: string;
	paths: string[];
}

export interface VcsAbsorbFileOperationInput {
	kind: "absorb_file";
	targetChangeId: string;
	paths: string[];
}

export interface VcsRestoreFileOperationInput {
	kind: "restore_file";
	paths: string[];
}

export interface VcsUndoLastOperationInput {
	kind: "undo_last";
}

export interface VcsRedoLastOperationInput {
	kind: "redo_last";
}

export interface VcsAbandonChangeOperationInput {
	kind: "abandon_change";
	changeId: string;
}

export interface VcsReorderOperationInput {
	kind: "reorder_change";
	sourceChangeId: string;
	targetChangeId: string;
	placement: VcsPreviewPlacement;
}

export type VcsPreviewOperationInput =
	| VcsReorderOperationInput
	| VcsCreateBookmarkOperationInput
	| VcsEditMessageOperationInput
	| VcsCreateChangeOperationInput
	| VcsMoveBookmarkOperationInput
	| VcsSquashChangeOperationInput
	| VcsSplitChangeOperationInput
	| VcsAbsorbFileOperationInput
	| VcsRestoreFileOperationInput
	| VcsUndoLastOperationInput
	| VcsRedoLastOperationInput
	| VcsAbandonChangeOperationInput;

export interface VcsPreviewCommand {
	command: "jj";
	args: string[];
}

export interface VcsPreviewOperationResult {
	valid: boolean;
	operation: VcsPreviewOperationInput;
	title: string;
	description: string;
	risk: VcsOperationRiskLevel;
	commands: VcsPreviewCommand[];
	affectedChangeIds: string[];
	affectedBookmarks: string[];
	diagnostics: VcsDiagnostic[];
}

export type VcsApplyOperationInput = VcsPreviewOperationInput;

export interface VcsApplyOperationResult {
	ok: boolean;
	operation: VcsApplyOperationInput;
	title: string;
	description: string;
	risk: VcsOperationRiskLevel;
	command: VcsPreviewCommand | null;
	stdout: string;
	stderr: string;
	exitCode: number | null;
	affectedChangeIds: string[];
	affectedBookmarks: string[];
	diagnostics: VcsDiagnostic[];
}

export interface VcsSubmitStackPreviewInput {
	targetBookmark?: string | null;
	remoteName?: string | null;
}

export type VcsSubmitStackAction = "none" | "push" | "create_pr" | "update_pr_base" | "push_and_create_pr";

export interface VcsSubmitStackPullRequestSummary {
	number: number;
	url: string | null;
	baseBranch: string;
}

export interface VcsSubmitStackItem {
	bookmarkName: string;
	changeId: string;
	title: string;
	baseBranch: string;
	needsPush: boolean;
	action: VcsSubmitStackAction;
	existingPr: VcsSubmitStackPullRequestSummary | null;
}

export interface VcsSubmitStackPreviewResult {
	available: boolean;
	targetBookmark: string | null;
	remoteName: string | null;
	repoOwner: string | null;
	repoName: string | null;
	items: VcsSubmitStackItem[];
	commands: VcsPreviewCommand[];
	diagnostics: VcsDiagnostic[];
}

export interface VcsSubmitStackResultItem extends VcsSubmitStackItem {
	completed: boolean;
	resultPr: VcsSubmitStackPullRequestSummary | null;
}

export interface VcsSubmitStackResult {
	ok: boolean;
	targetBookmark: string | null;
	remoteName: string | null;
	repoOwner: string | null;
	repoName: string | null;
	items: VcsSubmitStackResultItem[];
	commands: VcsPreviewCommand[];
	diagnostics: VcsDiagnostic[];
}
