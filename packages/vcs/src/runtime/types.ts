import type {
	AbandonChangePreviewRequest,
	AbsorbFilePreviewRequest,
	CreateBookmarkPreviewRequest,
	CreateChangePreviewRequest,
	EditMessagePreviewRequest,
	MoveBookmarkPreviewRequest,
	RedoLastPreviewRequest,
	ReorderPreviewRequest,
	RestoreFilePreviewRequest,
	SquashChangePreviewRequest,
	UndoLastPreviewRequest,
} from "@/preview-state";

export type VcsOperationRequest =
	| ReorderPreviewRequest
	| CreateBookmarkPreviewRequest
	| EditMessagePreviewRequest
	| CreateChangePreviewRequest
	| MoveBookmarkPreviewRequest
	| SquashChangePreviewRequest
	| AbsorbFilePreviewRequest
	| RestoreFilePreviewRequest
	| UndoLastPreviewRequest
	| RedoLastPreviewRequest
	| AbandonChangePreviewRequest;

export type VcsDiagnostic = {
	level: "info" | "warning" | "error";
	code: string;
	message: string;
};

export type VcsDetectResponse = {
	cwd: string;
	repository: {
		kind: "none" | "git" | "jj";
		root: string | null;
	};
	jj: {
		installed: boolean;
		version: string | null;
		repoRoot: string | null;
		currentBookmark: string | null;
		currentChangeId: string | null;
		defaultBase: string | null;
	};
	git: {
		remoteName: string | null;
		remoteUrl: string | null;
		provider: "none" | "github" | "gitlab" | "forgejo" | "unknown";
		defaultBranch: string | null;
	};
	publishing: {
		provider: "none" | "github" | "gitlab" | "forgejo" | "unknown";
		remoteName: string | null;
		available: boolean;
		authenticated: boolean;
		reason: string | null;
	};
	diagnostics: VcsDiagnostic[];
};

export type VcsJjStateResponse = VcsDetectResponse & {
	bookmarks: Array<{
		name: string;
		changeId: string;
		commitId: string;
		synced: boolean;
		tracked: boolean;
	}>;
	changes: Array<{
		changeId: string;
		commitId: string;
		description: string;
		parentChangeIds: string[];
		bookmarks: string[];
		remoteBookmarks: string[];
		isCurrent: boolean;
	}>;
	lanes: Array<{
		id: string;
		headBookmark: string;
		segments: Array<{
			id: string;
			changeId: string;
			commitId: string;
			title: string;
			bookmarks: string[];
			remoteBookmarks: string[];
			isCurrent: boolean;
			isHead: boolean;
		}>;
	}>;
	unassignedChanges: Array<{
		path: string;
		status: "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";
	}>;
};

export type VcsJjDiffResponse = {
	changeId: string | null;
	summary: string;
	patch: string;
	diagnostics: VcsDiagnostic[];
};

export type VcsPreviewOperationResponse = {
	valid: boolean;
	operation: VcsOperationRequest;
	title: string;
	description: string;
	risk: "low" | "medium" | "high";
	commands: Array<{
		command: "jj";
		args: string[];
	}>;
	affectedChangeIds: string[];
	affectedBookmarks: string[];
	diagnostics: VcsDiagnostic[];
};

export type VcsApplyOperationResponse = {
	ok: boolean;
	operation: VcsOperationRequest;
	title: string;
	description: string;
	risk: "low" | "medium" | "high";
	command: {
		command: "jj";
		args: string[];
	} | null;
	stdout: string;
	stderr: string;
	exitCode: number | null;
	affectedChangeIds: string[];
	affectedBookmarks: string[];
	diagnostics: VcsDiagnostic[];
};

export type VcsSubmitStackPreviewResponse = {
	available: boolean;
	targetBookmark: string | null;
	remoteName: string | null;
	repoOwner: string | null;
	repoName: string | null;
	items: Array<{
		bookmarkName: string;
		changeId: string;
		title: string;
		baseBranch: string;
		needsPush: boolean;
		action: "none" | "push" | "create_pr" | "update_pr_base" | "push_and_create_pr";
		existingPr: {
			number: number;
			url: string | null;
			baseBranch: string;
		} | null;
	}>;
	commands: Array<{
		command: "jj";
		args: string[];
	}>;
	diagnostics: VcsDiagnostic[];
};

export type VcsSubmitStackResponse = {
	ok: boolean;
	targetBookmark: string | null;
	remoteName: string | null;
	repoOwner: string | null;
	repoName: string | null;
	items: Array<VcsSubmitStackPreviewResponse["items"][number] & {
		completed: boolean;
		resultPr: {
			number: number;
			url: string | null;
			baseBranch: string;
		} | null;
	}>;
	commands: Array<{
		command: "jj";
		args: string[];
	}>;
	diagnostics: VcsDiagnostic[];
};

export type QueryState<T> =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };

export type MutationState<T> =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };
