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

export type RuntimeGitSyncAction = "fetch" | "pull" | "push";

export type RuntimeGitSyncSummary = {
	currentBranch: string | null;
	jjChangeId: string | null;
	upstreamBranch: string | null;
	changedFiles: number;
	additions: number;
	deletions: number;
	aheadCount: number;
	behindCount: number;
};

export type RuntimeGitSyncResponse = {
	ok: boolean;
	action: RuntimeGitSyncAction;
	summary: RuntimeGitSyncSummary;
	output: string;
	error?: string;
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
	}>;
	stacks: Array<{
		id: string;
		tip: string;
		base: string;
		order: number;
		isCheckedOut: boolean;
		heads: Array<{
			id: string;
			bookmarkName: string;
			changeId: string;
			commitId: string;
			title: string;
			isCheckedOut: boolean;
		}>;
		changes: Array<{
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
		}>;
	}>;
	unassignedChanges: Array<{
		path: string;
		status: "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";
	}>;
};

export type VcsJjInventoryItem = {
	id: string;
	name: string;
	type: "current" | "bookmark" | "remote" | "branch" | "tag" | "workspace";
	group: "current" | "today" | "applied" | "remote" | "local" | "tags" | "older";
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
	pr: {
		number: number;
		url: string | null;
		baseBranch: string | null;
	} | null;
};

export type VcsJjInventoryResponse = VcsDetectResponse & {
	workspaceTarget: VcsJjInventoryItem | null;
	items: VcsJjInventoryItem[];
};

export type VcsJjBranchesDataResponse = {
	inventory: VcsJjInventoryResponse;
	state: VcsJjStateResponse;
};

export type VcsBranchInventoryItem = VcsJjInventoryItem;
export type VcsBranchInventoryResponse = VcsJjInventoryResponse;
export type VcsBranchesDataResponse = VcsJjBranchesDataResponse;

export type RuntimeProjectConfigResponse = {
	initialized: boolean;
	providerType: "noop" | "local-folder" | "forgejo" | "github" | "gitlab";
	vcsEngine: "plain-copy" | "jj" | "git-worktree";
	vcsFallback: "plain-copy" | "jj" | "git-worktree";
	vcsTargetBranch?: string | null;
	vcsAppliedStacks?: string[];
	projectDefaultBase: string;
	planningDefaultProfile?: "none" | "openspec-lite";
	planningDefaultStrictness?: "normal" | "strict";
	planningAllowQuickChanges?: boolean;
	planningQuickChangeCheckProfile?: string;
	checkProfiles?: string[];
	templateProfiles?: string[];
};

export type RuntimeProjectConfigUpdateRequest = {
	vcsTargetBranch?: string | null;
	vcsAppliedStacks?: string[];
};

export type VcsJjDiffResponse = {
	changeId: string | null;
	summary: string;
	patch: string;
	diagnostics: VcsDiagnostic[];
};

export type VcsJjOperationFile = {
	path: string;
	status: "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";
};

export type VcsJjOperationEntry = {
	id: string;
	shortId: string;
	description: string;
	user: string | null;
	userAvatarUrl: string | null;
	timestamp: string | null;
	files: VcsJjOperationFile[];
	restoreEligible: boolean;
	parentOperationIds: string[];
};

export type VcsJjOperationsResponse = {
	operations: VcsJjOperationEntry[];
	requestedLimit: number;
	nextCursor?: string | null;
	hasMore: boolean;
	diagnostics: VcsDiagnostic[];
};

export type VcsJjOperationCommit = {
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
};

export type VcsJjOperationDiffResponse = {
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
};

export type VcsJjOperationActionResponse = {
	ok: boolean;
	title: string;
	summary: string;
	operationId: string | null;
	changed: boolean;
	diagnostics: VcsDiagnostic[];
};

export type RuntimeProjectSummary = {
	id: string;
	path: string;
	name: string;
	taskCounts: {
		backlog: number;
		in_progress: number;
		review: number;
		trash: number;
	};
	workspaces?: RuntimeProjectWorkspaceSummary[];
};

export type RuntimeProjectWorkspaceSummary = {
	id: string;
	title: string;
	status?: string;
	engine?: string;
	name?: string;
	path?: string;
	branch?: string;
};

export type RuntimeProjectsResponse = {
	currentProjectId: string | null;
	projects: RuntimeProjectSummary[];
};

export type RuntimeProjectAddResponse = {
	ok: boolean;
	project: RuntimeProjectSummary | null;
	requiresGitInitialization?: boolean;
	error?: string;
};

export type RuntimeProjectAddRequest = {
	path?: string;
	gitUrl?: string;
	initializeGit?: boolean;
};

export type RuntimeProjectDirectoryPickerResponse = {
	ok: boolean;
	path: string | null;
	error?: string;
};

export type RuntimeDirectoryListEntry = {
	name: string;
	path: string;
	isGitRepository: boolean;
};

export type RuntimeDirectoryListRequest = {
	path?: string;
};

export type RuntimeDirectoryListResponse = {
	ok: boolean;
	currentPath: string;
	parentPath: string | null;
	rootPath: string;
	entries: RuntimeDirectoryListEntry[];
	error?: string;
};

export type RuntimeProjectRemoveResponse = {
	ok: boolean;
	error?: string;
};

export type RuntimeTaskSessionSummary = {
	taskId: string;
	state: "idle" | "running" | "awaiting_review" | "interrupted" | "failed";
	mode?: string | null;
	agentId: string | null;
	workspacePath: string | null;
	pid: number | null;
	startedAt: number | null;
	updatedAt: number;
	lastOutputAt: number | null;
	reviewReason: string | null;
	exitCode: number | null;
	lastHookAt?: number | null;
	warningMessage?: string | null;
	externalSession?: {
		provider: string;
		sessionId: string | null;
		transcriptPath: string | null;
		resumeCommand: string[];
		source: string | null;
	} | null;
};

export type RuntimeShellSessionStartRequest = {
	taskId: string;
	cols?: number;
	rows?: number;
	workspaceTaskId?: string;
	baseRef: string;
};

export type RuntimeShellSessionStartResponse = {
	ok: boolean;
	summary: RuntimeTaskSessionSummary | null;
	shellBinary?: string | null;
	error?: string;
};

export type RuntimeTaskSessionStopRequest = {
	taskId: string;
};

export type RuntimeTaskSessionStopResponse = {
	ok: boolean;
	summary: RuntimeTaskSessionSummary | null;
	error?: string;
};

export type RuntimeTerminalWsClientMessage =
	| {
			type: "resize";
			cols: number;
			rows: number;
			pixelWidth?: number;
			pixelHeight?: number;
	  }
	| {
			type: "stop";
	  }
	| {
			type: "output_ack";
			bytes: number;
	  }
	| {
			type: "restore_complete";
	  };

export type RuntimeTerminalWsServerMessage =
	| {
			type: "state";
			summary: RuntimeTaskSessionSummary;
	  }
	| {
			type: "error";
			message: string;
	  }
	| {
			type: "exit";
			code: number | null;
	  }
	| {
			type: "restore";
			snapshot: string;
			cols?: number | null;
			rows?: number | null;
	  };

export type RuntimeCommandRunResponse = {
	exitCode: number;
	stdout: string;
	stderr: string;
	combinedOutput: string;
	durationMs: number;
};

export type RuntimeGitRef = {
	name: string;
	type: "branch" | "remote" | "detached";
	hash: string;
	changeId?: string;
	isHead: boolean;
	upstreamName?: string;
	ahead?: number;
	behind?: number;
};

export type RuntimeGitCommit = {
	hash: string;
	shortHash: string;
	changeId?: string;
	changeIdUniquePrefix?: string;
	authorName: string;
	authorEmail: string;
	authorAvatarUrl?: string | null;
	date: string;
	message: string;
	parentHashes: string[];
	bookmarks?: string[];
	labels?: string[];
	relation?: "selected" | "upstream" | "shared";
};

export type RuntimeGitLogRequest = {
	workspacePath?: string | null;
	ref?: string | null;
	refs?: string[];
	maxCount?: number;
	skip?: number;
	cursor?: string | null;
	pageSize?: number;
	taskScope?: { taskId: string; baseRef: string } | null;
};

export type RuntimeGitLogResponse = {
	ok: boolean;
	commits: RuntimeGitCommit[];
	totalCount: number;
	nextCursor?: string | null;
	hasMore?: boolean;
	error?: string;
};

export type RuntimeGitRefsResponse = {
	ok: boolean;
	refs: RuntimeGitRef[];
	error?: string;
};

export type RuntimeGitCommitDiffFile = {
	path: string;
	previousPath?: string;
	status: "modified" | "added" | "deleted" | "renamed";
	additions: number;
	deletions: number;
	patch: string;
};

export type RuntimeGitCommitDiffResponse = {
	ok: boolean;
	commitHash: string;
	files: RuntimeGitCommitDiffFile[];
	error?: string;
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

export type RuntimeVcsProjectEventKind = "worktree_changes" | "vcs/activity" | "vcs/head" | "vcs/fetch";

export type RuntimeStateStreamVcsProjectEventMessage = {
	type: "vcs_project_event";
	workspaceId: string;
	topic: string;
	kind: RuntimeVcsProjectEventKind;
	paths: string[];
	changedAt: number;
	version: number;
};

export type MutationState<T> =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "ready"; data: T };
