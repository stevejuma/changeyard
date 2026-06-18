import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { detectVcsState, type VcsCommandRunner } from "../detect.js";
import type {
	VcsApplyOperationResult,
	VcsDiagnostic,
	VcsJjDiffResult,
	VcsJjStateResult,
	VcsPreviewOperationInput,
	VcsPreviewOperationResult,
} from "../types.js";
import { applyJjOperation } from "./apply.js";
import { normalizeRemoteTargetToLocalBookmark, remoteNameFromTarget } from "./bookmark-utils.js";
import { loadJjDiff } from "./diff.js";
import { previewJjOperation } from "./preview.js";
import { createJjRemoteBookmarkRevset, createJjSymbolRevset } from "./read.js";
import { loadJjState, type LoadJjStateOptions } from "./state.js";
import type { NeutralFileStatus, NeutralOperation, NeutralOperationContext, NeutralOperationRequest, NeutralSelection } from "../workspace-types.js";

type JjHunkSelection = NonNullable<NeutralSelection["hunks"]>[number];
type JjRestoreDiscardOperation = Extract<NeutralOperation, { kind: "restore_changes" | "discard_changes" }>;
type JjWorkingCopyHunkRestoreDiscardOperation = JjRestoreDiscardOperation & {
	selection: NeutralSelection & { source: "working_copy"; hunks: JjHunkSelection[] };
};
type JjCommittedHunkDiscardOperation = JjRestoreDiscardOperation & {
	selection: NeutralSelection & { source: "commit"; hunks: JjHunkSelection[] };
};
type JjWorkingCopyHunkCommitOperation =
	| (Extract<NeutralOperation, { kind: "amend_commit" }> & {
			selection: NeutralSelection & { source: "working_copy"; hunks: JjHunkSelection[] };
	  })
	| (Extract<NeutralOperation, { kind: "create_commit" }> & {
			selection: NeutralSelection & { source: "working_copy"; hunks: JjHunkSelection[] };
	  });
type JjCommittedHunkCreateCommitOperation = Extract<NeutralOperation, { kind: "create_commit" }> & {
	selection: NeutralSelection & { source: "commit"; hunks: JjHunkSelection[] };
};
type JjCommittedHunkRewriteOperation =
	| Extract<NeutralOperation, { kind: "split_commit" | "move_changes" | "uncommit_changes" }>
	| JjCommittedHunkCreateCommitOperation;

type JjPatchFile = {
	path: string;
	headerLines: string[];
	hunks: JjPatchHunk[];
};

type JjPatchHunk = {
	id: string;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: string[];
};

function createDiagnostic(level: VcsDiagnostic["level"], code: string, message: string): VcsDiagnostic {
	return { level, code, message };
}

function resolveRepoFilePath(repoCwd: string, path: string): string | null {
	const absolutePath = resolve(repoCwd, path);
	const relativePath = relative(repoCwd, absolutePath);
	if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
		return null;
	}
	return absolutePath;
}

function splitConflictLines(content: string): { lines: string[]; trailingNewline: boolean } {
	const trailingNewline = content.endsWith("\n");
	const lines = content.length === 0 ? [] : content.split("\n");
	if (trailingNewline) {
		lines.pop();
	}
	return { lines, trailingNewline };
}

function joinConflictLines(lines: readonly string[], trailingNewline: boolean): string {
	const body = lines.join("\n");
	return trailingNewline && lines.length > 0 ? `${body}\n` : body;
}

export function parseJjConflictFile(content: string) {
	const { lines, trailingNewline } = splitConflictLines(content);
	const leftLines: string[] = [];
	const baseLines: string[] = [];
	const rightLines: string[] = [];
	const diagnostics: VcsDiagnostic[] = [];
	let index = 0;
	let conflictCount = 0;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		if (!line.startsWith("<<<<<<< conflict ")) {
			leftLines.push(line);
			baseLines.push(line);
			rightLines.push(line);
			index += 1;
			continue;
		}
		conflictCount += 1;
		index += 1;
		const conflictBaseLines: string[] = [];
		const conflictLeftLines: string[] = [];
		const conflictRightLines: string[] = [];
		let inRightSide = false;
		let ended = false;

		while (index < lines.length) {
			const conflictLine = lines[index] ?? "";
			index += 1;
			if (conflictLine.startsWith(">>>>>>> conflict ")) {
				ended = true;
				break;
			}
			if (/^\+{6,}\s/.test(conflictLine)) {
				inRightSide = true;
				continue;
			}
			if (conflictLine.startsWith("%%%%%%% ") || conflictLine.startsWith("\\")) {
				continue;
			}
			if (inRightSide) {
				conflictRightLines.push(conflictLine);
				continue;
			}
			if (conflictLine.startsWith("-")) {
				conflictBaseLines.push(conflictLine.slice(1));
			} else if (conflictLine.startsWith("+")) {
				conflictLeftLines.push(conflictLine.slice(1));
			} else if (conflictLine.startsWith(" ")) {
				const contextLine = conflictLine.slice(1);
				conflictBaseLines.push(contextLine);
				conflictLeftLines.push(contextLine);
			} else {
				conflictBaseLines.push(conflictLine);
				conflictLeftLines.push(conflictLine);
			}
		}

		if (!ended) {
			diagnostics.push(createDiagnostic("warning", "jj_conflict_marker_unclosed", "A JJ conflict marker was not closed."));
		}
		leftLines.push(...conflictLeftLines);
		baseLines.push(...conflictBaseLines);
		rightLines.push(...conflictRightLines);
	}

	return {
		ok: conflictCount > 0 && diagnostics.every((diagnostic) => diagnostic.level !== "error"),
		conflictCount,
		left: joinConflictLines(leftLines, trailingNewline),
		base: joinConflictLines(baseLines, trailingNewline),
		right: joinConflictLines(rightLines, trailingNewline),
		diagnostics,
	};
}

function workspaceCapabilities() {
	return {
		supportsMultiAppliedWorkspace: true,
		supportsHunkSelection: false,
		supportsHunkRestoreDiscard: true,
		supportsCommittedHunkSelection: true,
		supportsCommitRewrite: true,
		supportsMoveCommitAcrossStacks: true,
		supportsMoveChangesAcrossCommits: true,
		supportsUndoRedo: true,
		supportsSyntheticWorkspaceMerge: false,
		supportsCreateStack: false,
		supportsWorkingCopyCommit: true,
	};
}

const COMMIT_METADATA_INVALIDATION_TAGS = ["OperationHistory", "OperationDetails", "RepositoryLog"] as const;
const STACK_GRAPH_INVALIDATION_TAGS = [
	"BranchListing",
	"BranchDetails",
	"DivergentBookmarks",
	"OperationHistory",
	"OperationDetails",
	"RepositoryLog",
] as const;
const WORKSPACE_INVALIDATION_TAGS = [
	"Stacks",
	"StackDetails",
	"WorktreeChanges",
	"BranchListing",
	"BranchDetails",
	"HeadSha",
	"BaseBranchData",
	"DivergentBookmarks",
	"Diff",
	"CommitChanges",
	"OperationHistory",
	"OperationDetails",
	"RepositoryLog",
] as const;

function workingCopySummary(files: Array<{ status: NeutralFileStatus }>) {
	const summary = {
		modified: 0,
		added: 0,
		deleted: 0,
		renamed: 0,
		copied: 0,
		unknown: 0,
	};
	for (const file of files) {
		summary[file.status] += 1;
	}
	return summary;
}

function normalizeDescription(description: string): { title: string; body: string } {
	const trimmed = description.trim();
	if (!trimmed) {
		return { title: "(no description)", body: "" };
	}
	const [title = trimmed, ...body] = trimmed.split("\n");
	return { title, body: body.join("\n").trim() };
}

const UNTRACKED_REMOTE_IMMUTABLE_REASON = "Remote bookmark is not tracked. Start tracking before rewriting this commit.";

type JjWorkspaceBookmark = VcsJjStateResult["bookmarks"][number];
type JjWorkspaceChange = VcsJjStateResult["changes"][number] | VcsJjStateResult["stacks"][number]["changes"][number];
type RemoteTrackingInfo = { trackedRemoteBookmarks: string[]; untrackedRemoteBookmarks: string[]; immutableReason: string | null };

function parseRemoteBookmark(remoteBookmark: string): { bookmarkName: string; remoteName: string } | null {
	const normalized = remoteBookmark.trim();
	const separatorIndex = normalized.lastIndexOf("@");
	if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) {
		return null;
	}
	return {
		bookmarkName: normalized.slice(0, separatorIndex),
		remoteName: normalized.slice(separatorIndex + 1),
	};
}

function classifyRemoteBookmarksForChange(
	change: JjWorkspaceChange,
	bookmarks: readonly JjWorkspaceBookmark[],
): RemoteTrackingInfo {
	const trackedRemoteBookmarks: string[] = [];
	const untrackedRemoteBookmarks: string[] = [];
	for (const remoteBookmark of change.remoteBookmarks) {
		const parsed = parseRemoteBookmark(remoteBookmark);
		if (!parsed) {
			untrackedRemoteBookmarks.push(remoteBookmark);
			continue;
		}
		if (parsed.remoteName === "git") {
			continue;
		}
		const hasMatchingTrackedBookmark = bookmarks.some(
			(bookmark) =>
				bookmark.name === parsed.bookmarkName &&
				(bookmark.trackedRemoteNames?.length
					? bookmark.trackedRemoteNames.includes(parsed.remoteName)
					: bookmark.tracked) &&
				(bookmark.changeId === change.changeId || bookmark.commitId === change.commitId),
		);
		if (hasMatchingTrackedBookmark) {
			trackedRemoteBookmarks.push(remoteBookmark);
		} else {
			untrackedRemoteBookmarks.push(remoteBookmark);
		}
	}
	return {
		trackedRemoteBookmarks,
		untrackedRemoteBookmarks,
		immutableReason: untrackedRemoteBookmarks.length > 0 ? UNTRACKED_REMOTE_IMMUTABLE_REASON : null,
	};
}

function combineRemoteTrackingInfo(...items: RemoteTrackingInfo[]): RemoteTrackingInfo {
	const trackedRemoteBookmarks = [...new Set(items.flatMap((item) => item.trackedRemoteBookmarks))];
	const untrackedRemoteBookmarks = [...new Set(items.flatMap((item) => item.untrackedRemoteBookmarks))];
	return {
		trackedRemoteBookmarks,
		untrackedRemoteBookmarks,
		immutableReason: untrackedRemoteBookmarks.length > 0 ? UNTRACKED_REMOTE_IMMUTABLE_REASON : null,
	};
}

function toWorkspaceFile(path: string, status: NeutralFileStatus) {
	return {
		path,
		status,
	};
}

function toWorkspaceStack(
	stack: VcsJjStateResult["stacks"][number],
	state: Pick<VcsJjStateResult, "bookmarks" | "changes">,
	appliedStackIds: readonly string[] = [],
) {
	const changesById = new Map(state.changes.map((change) => [change.changeId, change]));
	const headChangeIds = new Set(stack.heads.map((head) => head.changeId));
	const stackRemoteTracking = combineRemoteTrackingInfo(
		...stack.changes
			.filter((change) => change.isHead || headChangeIds.has(change.changeId))
			.map((change) => classifyRemoteBookmarksForChange(change, state.bookmarks)),
	);
	return {
		stackId: stack.id,
		name: stack.id,
		targetRef: stack.tip,
		baseRef: stack.base,
		headCommitId: stack.heads[0]?.changeId ?? stack.changes.at(-1)?.changeId ?? null,
		isApplied: appliedStackIds.includes(stack.id),
		isCurrent: stack.isCheckedOut,
		commits: stack.changes.map((change) => {
			const description = normalizeDescription(change.description || change.title);
			const remoteTracking = combineRemoteTrackingInfo(
				classifyRemoteBookmarksForChange(change, state.bookmarks),
				stackRemoteTracking,
			);
			return {
				commitId: change.changeId,
				displayId: change.commitId,
				title: description.title,
				description: description.body,
				authorName: change.authorName,
				authorEmail: change.authorEmail,
				authorAvatarUrl: change.authorAvatarUrl,
				timestamp: change.timestamp,
				parentCommitIds: changesById.get(change.changeId)?.parentChangeIds ?? [],
				stackIds: [stack.id],
				isHead: change.isHead,
				isCurrent: change.isCurrent,
				metadata: {
					changeId: change.changeId,
					commitHash: change.commitId,
					bookmarks: change.bookmarks,
					remoteBookmarks: change.remoteBookmarks,
					trackedRemoteBookmarks: remoteTracking.trackedRemoteBookmarks,
					untrackedRemoteBookmarks: remoteTracking.untrackedRemoteBookmarks,
					immutableReason: remoteTracking.immutableReason,
				},
			};
		}),
		metadata: {
			tip: stack.tip,
			base: stack.base,
			headChangeIds: stack.heads.map((head) => head.changeId),
			headCommitHashes: stack.heads.map((head) => head.commitId),
		},
	};
}

function createWorkspaceConflictRevset(appliedStackIds: readonly string[]): string {
	const scopedRevsets = ["::@", ...appliedStackIds.map((stackId) => `::${createJjSymbolRevset(stackId)}`)];
	return `conflicts() & (${scopedRevsets.join(" | ")})`;
}

async function readJjWorkspaceConflicts(cwd: string, runner: VcsCommandRunner, revset: string) {
	const result = await runner({
		command: "jj",
		args: [
			"log",
			"--ignore-working-copy",
			"--at-op=@",
			"--revisions",
			revset,
			"--no-graph",
			"--template",
			'change_id.shortest(12) ++ "\\t" ++ commit_id.shortest(12) ++ "\\t" ++ description.first_line().replace("\\\\t", " ").replace("\\\\n", " ") ++ "\\n"',
		],
		cwd,
	});
	if (!result.ok) {
		return [];
	}
	return result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [changeId, commitId, title] = line.split("\t");
			return changeId && commitId
				? {
						changeId,
						commitId,
						title: title?.trim() || null,
					}
				: null;
		})
		.filter((entry): entry is { changeId: string; commitId: string; title: string | null } => Boolean(entry));
}

async function readJjWorkspaceConflictPaths(cwd: string, runner: VcsCommandRunner, revision?: string | null): Promise<string[]> {
	const args = ["resolve", "--list"];
	if (revision) {
		args.push("-r", revision);
	}
	const result = await runner({
		command: "jj",
		args,
		cwd,
	});
	if (!result.ok) {
		return [];
	}
	return result.stdout
		.split("\n")
		.map((line) => line.trim().split(/\s+/)[0] ?? "")
		.filter(Boolean)
		.sort((left, right) => left.localeCompare(right));
}

async function countJjWorkspaceRevset(cwd: string, runner: VcsCommandRunner, revset: string): Promise<number> {
	const result = await runner({
		command: "jj",
		args: ["log", "--ignore-working-copy", "--at-op=@", "-r", revset, "--count"],
		cwd,
	});
	if (!result.ok) {
		return 0;
	}
	const count = Number.parseInt(result.stdout.trim(), 10);
	return Number.isFinite(count) ? count : 0;
}

async function readJjWorkspaceSyncSummary(
	cwd: string,
	runner: VcsCommandRunner,
	state: Pick<VcsJjStateResult, "git" | "jj">,
	options: LoadJjStateOptions,
) {
	const detectedBase = state.jj.defaultBase ?? state.git.defaultBranch ?? null;
	const defaultTarget = state.git.remoteName && detectedBase ? `${state.git.remoteName}/${detectedBase}` : detectedBase;
	const configuredTarget = options.targetBranch?.trim() || defaultTarget;
	const bookmarkName = normalizeRemoteTargetToLocalBookmark(configuredTarget, state.git.remoteName) ?? detectedBase;
	const remoteName = remoteNameFromTarget(configuredTarget, state.git.remoteName) ?? state.git.remoteName;
	if (!bookmarkName || !remoteName) {
		return {
			targetRef: bookmarkName,
			remoteRef: null,
			aheadCount: 0,
			behindCount: 0,
		};
	}
	const localRevset = createJjSymbolRevset(bookmarkName);
	const remoteRevset = createJjRemoteBookmarkRevset(bookmarkName, remoteName);
	const [aheadCount, behindCount] = await Promise.all([
		countJjWorkspaceRevset(cwd, runner, `${remoteRevset}..${localRevset}`),
		countJjWorkspaceRevset(cwd, runner, `${localRevset}..${remoteRevset}`),
	]);
	return {
		targetRef: bookmarkName,
		remoteRef: `${bookmarkName}@${remoteName}`,
		aheadCount,
		behindCount,
	};
}

export async function loadJjWorkspaceState(
	cwd: string,
	runner: VcsCommandRunner,
	options: LoadJjStateOptions & { appliedStackIds?: string[] } = {},
) {
	const state = await loadJjState(cwd, runner, options);
	const repoCwd = state.repository.root ?? cwd;
	const appliedStackIds = options.appliedStackIds ?? [];
	const conflictRevset = createWorkspaceConflictRevset(appliedStackIds);
	const [conflictChanges, workspaceConflictPaths, sync] = await Promise.all([
		readJjWorkspaceConflicts(repoCwd, runner, conflictRevset),
		readJjWorkspaceConflictPaths(repoCwd, runner),
		readJjWorkspaceSyncSummary(repoCwd, runner, state, options),
	]);
	const conflictPathEntries = await Promise.all(
		conflictChanges.map(async (conflict) => [conflict.changeId, await readJjWorkspaceConflictPaths(repoCwd, runner, conflict.changeId)] as const),
	);
	const conflictPathsByChangeId = new Map(conflictPathEntries);
	const stacks = state.stacks.map((stack) => toWorkspaceStack(stack, state, appliedStackIds));
	const stackIdsByCommitId = new Map<string, string[]>();
	for (const stack of stacks) {
		for (const commit of stack.commits) {
			stackIdsByCommitId.set(commit.commitId, [
				...(stackIdsByCommitId.get(commit.commitId) ?? []),
				stack.stackId,
			]);
		}
	}
	const conflicts = conflictChanges.flatMap((conflict) => {
		const pathsForChange = conflictPathsByChangeId.get(conflict.changeId) ?? [];
		const paths = pathsForChange.length > 0 ? pathsForChange : workspaceConflictPaths.length > 0 ? workspaceConflictPaths : [null];
		return paths.map((path) => ({
			id: path ? `jj-conflict-${conflict.changeId}-${path}` : `jj-conflict-${conflict.changeId}`,
			path,
			message: conflict.title
				? `JJ conflict in ${path ? `${path} in ` : ""}${conflict.title}.`
				: `JJ conflict in ${path ?? `change ${conflict.changeId}`}.`,
			commitIds: [conflict.changeId],
			stackIds: stackIdsByCommitId.get(conflict.changeId) ?? [],
		}));
	});
	const workingCopyFilesByPath = new Map(state.unassignedChanges.map((change) => [change.path, toWorkspaceFile(change.path, change.status)]));
	for (const path of workspaceConflictPaths) {
		if (!workingCopyFilesByPath.has(path)) {
			workingCopyFilesByPath.set(path, toWorkspaceFile(path, "modified"));
		}
	}
	const workingCopyFiles = [...workingCopyFilesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
	return {
		projectId: cwd,
		provider: "jj" as const,
		targetRef: options.targetBranch ?? state.jj.defaultBase ?? state.git.defaultBranch ?? "",
		headId: state.jj.currentChangeId,
		mode: conflicts.length > 0 ? "conflicted" as const : "normal" as const,
		capabilities: workspaceCapabilities(),
		stacks,
		appliedStackIds,
		workingCopy: {
			files: workingCopyFiles,
			hasConflicts: conflicts.length > 0,
			summary: workingCopySummary(workingCopyFiles),
		},
		conflicts,
		sync,
	};
}

export async function loadJjWorkspaceStacks(
	cwd: string,
	runner: VcsCommandRunner,
	options: LoadJjStateOptions & { appliedStackIds?: string[] } = {},
) {
	const state = await loadJjWorkspaceState(cwd, runner, options);
	return { stacks: state.stacks };
}

type JjWorkspaceState = Awaited<ReturnType<typeof loadJjWorkspaceState>>;
type CachedJjWorkspaceState = JjWorkspaceState & { stateVersion?: number };
type JjWorkspaceStack = JjWorkspaceState["stacks"][number];
type JjWorkspaceCommit = JjWorkspaceStack["commits"][number];
type JjOperationCachePayload = {
	commits?: JjWorkspaceCommit[];
	stacks?: JjWorkspaceStack[];
	removedStackIds?: string[];
	workingCopy?: JjWorkspaceState["workingCopy"] | null;
	conflicts?: JjWorkspaceState["conflicts"];
	headId?: string | null;
	mode?: JjWorkspaceState["mode"];
	appliedStackIds?: string[];
};

type JjOperationResultShape = {
	ok: boolean;
	operation: NeutralOperation;
	title: string;
	summary: string;
	affectedStackIds: string[];
	affectedCommitIds: string[];
	affectedPaths: string[];
	recovery: { refName?: string; instructions: string[] } | null;
	diagnostics: VcsDiagnostic[];
	cacheUpdate?: "none" | "commits" | "stacks" | "working_copy" | "workspace";
	cachePayload?: JjOperationCachePayload | null;
	invalidateTags?: readonly string[];
	timing?: Record<string, number | string> | null;
};

function cloneWorkspaceStack(stack: JjWorkspaceStack): JjWorkspaceStack {
	return JSON.parse(JSON.stringify(stack)) as JjWorkspaceStack;
}

function contextMatchesCachedState(context: NeutralOperationContext | undefined, cachedState: CachedJjWorkspaceState | null | undefined): boolean {
	if (!context?.stateVersion || !cachedState?.stateVersion) {
		return Boolean(cachedState);
	}
	return context.stateVersion === cachedState.stateVersion;
}

function cachedStackForOperation(
	input: NeutralOperationRequest,
	cachedState: CachedJjWorkspaceState | null | undefined,
	stackId: string | null | undefined,
): JjWorkspaceStack | null {
	if (!stackId || !contextMatchesCachedState(input.operationContext, cachedState)) {
		return null;
	}
	return cachedState?.stacks.find((stack) => stack.stackId === stackId) ?? null;
}

function cachedStackContainingCommit(
	input: NeutralOperationRequest,
	cachedState: CachedJjWorkspaceState | null | undefined,
	commitId: string,
): JjWorkspaceStack | null {
	if (!contextMatchesCachedState(input.operationContext, cachedState)) {
		return null;
	}
	const contextStack = input.operationContext?.stackId
		? cachedState?.stacks.find((stack) => stack.stackId === input.operationContext?.stackId)
		: null;
	if (contextStack?.commits.some((commit) => commit.commitId === commitId)) {
		return contextStack;
	}
	return cachedState?.stacks.find((stack) => stack.commits.some((commit) => commit.commitId === commitId)) ?? null;
}

function cachePayloadFromPatchedStack(cachedState: CachedJjWorkspaceState | null | undefined, stack: JjWorkspaceStack): JjOperationCachePayload {
	return {
		stacks: [stack],
		headId: cachedState?.headId,
		mode: cachedState?.mode,
		conflicts: cachedState?.conflicts,
		appliedStackIds: cachedState?.appliedStackIds,
	};
}

function commitFromMessage(input: {
	changeId: string;
	message: string;
	parentCommitIds: string[];
	stackId: string;
	isHead: boolean;
	isCurrent?: boolean;
}): JjWorkspaceCommit {
	const description = normalizeDescription(input.message);
	return {
		commitId: input.changeId,
		displayId: input.changeId,
		title: description.title,
		description: description.body,
		authorName: null,
		authorEmail: null,
		authorAvatarUrl: null,
		timestamp: new Date().toISOString(),
		parentCommitIds: input.parentCommitIds,
		stackIds: [input.stackId],
		isHead: input.isHead,
		isCurrent: input.isCurrent ?? false,
		metadata: {
			changeId: input.changeId,
			commitHash: input.changeId,
			bookmarks: input.isHead ? [input.stackId] : [],
			remoteBookmarks: [],
			trackedRemoteBookmarks: [],
			untrackedRemoteBookmarks: [],
			immutableReason: null,
		},
	};
}

function patchStackWithNewCommit(
	stack: JjWorkspaceStack,
	targetCommitId: string,
	newCommit: JjWorkspaceCommit,
	placement: "before" | "after",
): JjWorkspaceStack {
	const nextStack = cloneWorkspaceStack(stack);
	const targetIndex = nextStack.commits.findIndex((commit) => commit.commitId === targetCommitId);
	const insertIndex = targetIndex < 0 ? nextStack.commits.length : placement === "after" ? targetIndex + 1 : targetIndex;
	if (newCommit.isHead) {
		for (const commit of nextStack.commits) {
			commit.isHead = false;
			commit.metadata = {
				...(commit.metadata ?? {}),
				bookmarks: (commit.metadata?.bookmarks ?? []).filter((bookmark) => bookmark !== stack.stackId),
			};
		}
		nextStack.headCommitId = newCommit.commitId;
	}
	nextStack.commits.splice(insertIndex, 0, newCommit);
	return nextStack;
}

function patchStackAfterAbandon(stack: JjWorkspaceStack, abandonedCommitId: string, replacementCommitId: string | null): JjWorkspaceStack {
	const nextStack = cloneWorkspaceStack(stack);
	const wasHead = nextStack.headCommitId === abandonedCommitId;
	nextStack.commits = nextStack.commits.filter((commit) => commit.commitId !== abandonedCommitId);
	if (wasHead) {
		if (replacementCommitId) {
			nextStack.headCommitId = replacementCommitId;
		}
		for (const commit of nextStack.commits) {
			const isReplacement = commit.commitId === replacementCommitId;
			commit.isHead = isReplacement;
			commit.metadata = {
				...(commit.metadata ?? {}),
				bookmarks: isReplacement
					? [...new Set([...(commit.metadata?.bookmarks ?? []), nextStack.stackId])]
					: (commit.metadata?.bookmarks ?? []).filter((bookmark) => bookmark !== nextStack.stackId),
			};
		}
	}
	return nextStack;
}

function patchCommitMessage(commit: JjWorkspaceCommit, message: string): JjWorkspaceCommit {
	const description = normalizeDescription(message);
	return {
		...commit,
		title: description.title,
		description: description.body,
	};
}

function withNoCacheUpdate<T extends JjOperationResultShape>(result: T): T {
	return {
		...result,
		cacheUpdate: result.cacheUpdate ?? "none",
		cachePayload: result.cachePayload ?? null,
		invalidateTags: result.invalidateTags ?? [],
	};
}

function withWorkspaceCacheFallback<T extends JjOperationResultShape>(result: T): T {
	return {
		...result,
		cacheUpdate: "workspace",
		cachePayload: null,
		invalidateTags: WORKSPACE_INVALIDATION_TAGS,
	};
}

async function withCommitCacheUpdate<T extends JjOperationResultShape>(
	result: T,
	cwd: string,
	runner: VcsCommandRunner,
	commitIds: readonly string[],
): Promise<T> {
	if (!result.ok || commitIds.length === 0) {
		return result.ok ? withWorkspaceCacheFallback(result) : withNoCacheUpdate(result);
	}
	const state = await loadJjWorkspaceState(cwd, runner);
	const commits = state.stacks.flatMap((stack) => stack.commits).filter((commit) => commitIds.includes(commit.commitId));
	if (commits.length === 0) {
		return withWorkspaceCacheFallback(result);
	}
	return {
		...result,
		cacheUpdate: "commits",
		cachePayload: {
			commits,
			headId: state.headId,
			mode: state.mode,
			conflicts: state.conflicts,
		},
		invalidateTags: COMMIT_METADATA_INVALIDATION_TAGS,
	};
}

async function withStackCacheUpdate<T extends JjOperationResultShape>(
	result: T,
	cwd: string,
	runner: VcsCommandRunner,
	stackIds: readonly string[],
	options: { removedStackIds?: readonly string[] } = {},
): Promise<T> {
	if (!result.ok) {
		return withNoCacheUpdate(result);
	}
	const uniqueStackIds = [...new Set(stackIds.filter(Boolean))];
	const removedStackIds = [...new Set(options.removedStackIds ?? [])];
	if (uniqueStackIds.length === 0 && removedStackIds.length === 0) {
		return withWorkspaceCacheFallback(result);
	}
	const state = await loadJjWorkspaceState(cwd, runner);
	const stacks = state.stacks.filter((stack) => uniqueStackIds.includes(stack.stackId));
	if (stacks.length === 0 && removedStackIds.length === 0) {
		return withWorkspaceCacheFallback(result);
	}
	return {
		...result,
		cacheUpdate: "stacks" as const,
		cachePayload: {
			stacks,
			removedStackIds,
			headId: state.headId,
			mode: state.mode,
			conflicts: state.conflicts,
		},
		invalidateTags: STACK_GRAPH_INVALIDATION_TAGS,
	};
}

async function stackIdsContainingCommits(cwd: string, runner: VcsCommandRunner, commitIds: readonly string[]): Promise<string[]> {
	if (commitIds.length === 0) {
		return [];
	}
	const state = await loadJjWorkspaceState(cwd, runner);
	const stackIds = new Set<string>();
	for (const stack of state.stacks) {
		if (stack.commits.some((commit) => commitIds.includes(commit.commitId))) {
			stackIds.add(stack.stackId);
		}
	}
	return [...stackIds];
}

export async function loadJjWorkspaceDiff(cwd: string, runner: VcsCommandRunner) {
	const diff = await loadJjDiff(cwd, runner);
	return toNeutralDiff(diff);
}

export async function loadJjConflictFile(
	cwd: string,
	runner: VcsCommandRunner,
	input: { path: string; source?: "workspace" | "commit"; revision?: string | null },
) {
	const detect = await detectVcsState(cwd, runner);
	const repoCwd = detect.repository.root ?? cwd;
	if (detect.repository.kind !== "jj") {
		return {
			ok: false,
			provider: "jj" as const,
			path: input.path,
			source: input.source ?? "workspace" as const,
			revision: input.revision ?? null,
			readOnly: true,
			left: "",
			base: "",
			right: "",
			labels: { left: "Left", base: "Base", right: "Right" },
			diagnostics: [createDiagnostic("warning", "jj_repo_required", "JJ conflict files are only available inside a JJ repository.")],
		};
	}
	const source = input.source ?? (input.revision ? "commit" : "workspace");
	const args = ["file", "show"];
	if (input.revision) {
		args.push("-r", input.revision);
	}
	args.push(input.path);
	const result = await runner({ command: "jj", args, cwd: repoCwd });
	if (!result.ok) {
		return {
			ok: false,
			provider: "jj" as const,
			path: input.path,
			source,
			revision: input.revision ?? null,
			readOnly: true,
			left: "",
			base: "",
			right: "",
			labels: { left: "Left", base: "Base", right: "Right" },
			diagnostics: [createDiagnostic("error", "jj_conflict_file_show_failed", result.stderr.trim() || `Could not load ${input.path}.`)],
		};
	}
	const parsed = parseJjConflictFile(result.stdout);
	const readOnly = source !== "workspace" || Boolean(input.revision);
	return {
		ok: parsed.ok,
		provider: "jj" as const,
		path: input.path,
		source,
		revision: input.revision ?? null,
		readOnly,
		left: parsed.left,
		base: parsed.base,
		right: parsed.right,
		labels: {
			left: readOnly ? "Left" : "Ours",
			base: "Base",
			right: readOnly ? "Right" : "Theirs",
		},
		diagnostics: [
			...parsed.diagnostics,
			...(parsed.conflictCount === 0 ? [createDiagnostic("warning", "jj_conflict_markers_missing", `${input.path} does not contain JJ conflict markers.`)] : []),
		],
	};
}

export async function resolveJjConflictFile(
	cwd: string,
	runner: VcsCommandRunner,
	input: { path: string; resolvedContent: string },
) {
	const detect = await detectVcsState(cwd, runner);
	const repoCwd = detect.repository.root ?? cwd;
	if (detect.repository.kind !== "jj") {
		return {
			ok: false,
			path: input.path,
			summary: "JJ conflict resolution is only available inside a JJ repository.",
			diagnostics: [createDiagnostic("warning", "jj_repo_required", "JJ conflict resolution is only available inside a JJ repository.")],
		};
	}
	const absolutePath = resolveRepoFilePath(repoCwd, input.path);
	if (!absolutePath) {
		return {
			ok: false,
			path: input.path,
			summary: "Conflict file path escapes the repository.",
			diagnostics: [createDiagnostic("error", "jj_conflict_path_invalid", "Conflict file path escapes the repository.")],
		};
	}
	await writeFile(absolutePath, input.resolvedContent, "utf8");
	const unresolvedPaths = await readJjWorkspaceConflictPaths(repoCwd, runner);
	if (unresolvedPaths.includes(input.path)) {
		return {
			ok: false,
			path: input.path,
			summary: `${input.path} is still reported by jj resolve --list.`,
			diagnostics: [createDiagnostic("warning", "jj_conflict_still_unresolved", `${input.path} is still reported by jj resolve --list.`)],
		};
	}
	return {
		ok: true,
		path: input.path,
		summary: `Resolved ${input.path}.`,
		diagnostics: [],
	};
}

export async function previewJjWorkspaceOperation(
	cwd: string,
	input: NeutralOperationRequest,
	runner: VcsCommandRunner,
) {
	if (
		input.operation.kind === "begin_edit_commit" ||
		input.operation.kind === "save_edit_commit" ||
		input.operation.kind === "abort_edit_commit"
	) {
		return previewJjCommitEditModeOperation(input.operation);
	}
	if (input.operation.kind === "checkout_commit") {
		return previewJjCheckoutCommitOperation(input.operation);
	}
	if (input.operation.kind === "track_remote_bookmark") {
		return previewJjTrackRemoteBookmarkOperation(input.operation);
	}
	if (input.operation.kind === "untrack_remote_bookmark") {
		return previewJjUntrackRemoteBookmarkOperation(input.operation);
	}
	if (input.operation.kind === "abandon_commit") {
		return previewJjAbandonCommitOperation(input.operation);
	}
	if (input.operation.kind === "rename_stack" || input.operation.kind === "delete_stack" || input.operation.kind === "squash_stack") {
		return await previewJjStackOperation(cwd, runner, input.operation);
	}
	if (input.operation.kind === "apply_stack" || input.operation.kind === "unapply_stack") {
		return await workspaceMembershipPreview(cwd, runner, input.operation);
	}
	if (isJjSupportedWorkingCopyHunkCommitOperation(input.operation)) {
		return await previewJjWorkingCopyHunkCommitOperation(cwd, runner, input.operation);
	}
	if (isJjCommittedHunkDiscardOperation(input.operation)) {
		const validation = await validateJjCommittedHunkDiscardOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedPreview(input.operation, validation);
		}
		const sourceCommitId = input.operation.selection.commitId ?? null;
		return {
			valid: true,
			operation: input.operation,
			title: "Discard selected hunks",
			summary: `Remove ${input.operation.selection.hunks?.length ?? 0} selected hunk(s) from ${sourceCommitId ?? "the source commit"}.`,
			risk: "high" as const,
			disabledReason: null,
			warnings: [
				{
					code: "jj_committed_hunk_discard",
					message: "This rewrites the source change by moving selected hunks into a temporary change and abandoning it.",
				},
			],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: commitIdsFromOperation(input.operation),
			affectedPaths: pathsFromOperation(input.operation),
			diagnostics: [],
		};
	}
	if (isJjCommittedHunkRewriteOperation(input.operation)) {
		const validation = await validateJjCommittedHunkOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedPreview(input.operation, validation);
		}
		const sourceCommitId = sourceCommitIdForCommittedHunkOperation(input.operation);
		return {
			valid: true,
			operation: input.operation,
			title: titleForCommittedHunkOperation(input.operation),
			summary: summaryForCommittedHunkOperation(input.operation, sourceCommitId),
			risk: "high" as const,
			disabledReason: null,
			warnings: [
				{
					code: "jj_committed_hunk_rewrite",
					message: "This uses JJ's diff editor flow to rewrite only the selected committed hunks.",
				},
			],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: commitIdsFromOperation(input.operation),
			affectedPaths: pathsFromOperation(input.operation),
			diagnostics: [],
		};
	}
	if (input.operation.kind === "create_commit") {
		return await previewJjCreateCommitOperation(cwd, runner, input.operation);
	}
	if (isJjHunkRestoreDiscardOperation(input.operation)) {
		const validation = await validateJjWorkingCopyHunkOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedPreview(input.operation, validation);
		}
		const action = input.operation.kind === "restore_changes" ? "Restore changes" : "Discard changes";
		return {
			valid: true,
			operation: input.operation,
			title: action,
			summary: `${action} for ${input.operation.selection.hunks?.length ?? 0} selected working-copy hunk(s).`,
			risk: "high" as const,
			disabledReason: null,
			warnings: [
				{
					code: "jj_hunk_restore",
					message: "This applies the selected reverse patch to the working tree.",
				},
			],
			conflicts: [],
			affectedStackIds: [],
			affectedCommitIds: [],
			affectedPaths: pathsFromOperation(input.operation),
			diagnostics: [],
		};
	}
	const translated = await translateOperation(cwd, runner, input.operation);
	if (!translated.operation) {
		return unsupportedPreview(input.operation, translated.reason);
	}
	const preview = await previewJjOperation(cwd, translated.operation, runner);
	return toNeutralPreview(input.operation, preview);
}

export async function applyJjWorkspaceOperation(
	cwd: string,
	input: NeutralOperationRequest,
	runner: VcsCommandRunner,
	cachedState: CachedJjWorkspaceState | null = null,
): Promise<JjOperationResultShape> {
	if (input.operation.kind === "begin_edit_commit") {
		return await applyJjBeginEditCommitOperation(cwd, runner, input.operation);
	}
	if (input.operation.kind === "save_edit_commit") {
		return await applyJjSaveEditCommitOperation(cwd, runner, input.operation);
	}
	if (input.operation.kind === "abort_edit_commit") {
		return await applyJjAbortEditCommitOperation(cwd, runner, input.operation);
	}
	if (input.operation.kind === "checkout_commit") {
		return await applyJjCheckoutCommitOperation(cwd, runner, input.operation);
	}
	if (input.operation.kind === "track_remote_bookmark") {
		return await applyJjTrackRemoteBookmarkOperation(cwd, runner, input.operation);
	}
	if (input.operation.kind === "untrack_remote_bookmark") {
		return await applyJjUntrackRemoteBookmarkOperation(cwd, runner, input.operation);
	}
	if (input.operation.kind === "apply_stack" || input.operation.kind === "unapply_stack") {
		return await workspaceMembershipApply(cwd, runner, input.operation);
	}
	if (isJjSupportedWorkingCopyHunkCommitOperation(input.operation)) {
		return await applyJjWorkingCopyHunkCommitOperation(cwd, runner, input.operation);
	}
	if (isJjCommittedHunkDiscardOperation(input.operation)) {
		const validation = await validateJjCommittedHunkDiscardOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedApply(input.operation, validation);
		}
		const patch = await buildSelectedJjCommittedHunkPatch(cwd, runner, input.operation);
		if (!patch.ok) {
			return unsupportedApply(input.operation, patch.reason);
		}
		const applyResult = await discardJjCommittedHunksWithTemporaryChange(patch.repoCwd, runner, input.operation, patch);
		if (!applyResult.ok) {
			return failedApply(
				input.operation,
				applyResult.stderr.trim() || applyResult.stdout.trim() || "Could not discard selected JJ committed hunks.",
			);
		}
		return {
			ok: true,
			operation: input.operation,
			title: "Discarded selected hunks",
			summary: `Removed ${input.operation.selection.hunks?.length ?? 0} selected hunk(s) from ${input.operation.selection.commitId ?? "the source commit"}.`,
			affectedStackIds: [],
			affectedCommitIds: commitIdsFromOperation(input.operation),
			affectedPaths: pathsFromOperation(input.operation),
			recovery: null,
			diagnostics: [],
		};
	}
	if (isJjCommittedHunkRewriteOperation(input.operation)) {
		const validation = await validateJjCommittedHunkOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedApply(input.operation, validation);
		}
		const patch = await buildSelectedJjCommittedHunkPatch(cwd, runner, input.operation);
		if (!patch.ok) {
			return unsupportedApply(input.operation, patch.reason);
		}
		const applyResult = await applyJjCommittedHunkOperationWithEditor(patch.repoCwd, runner, input.operation, patch);
		if (!applyResult.ok) {
			return failedApply(
				input.operation,
				applyResult.stderr.trim() || applyResult.stdout.trim() || "Could not rewrite selected JJ committed hunks.",
			);
		}
		return {
			ok: true,
			operation: input.operation,
			title: appliedTitleForCommittedHunkOperation(input.operation),
			summary: summaryForCommittedHunkOperation(input.operation, sourceCommitIdForCommittedHunkOperation(input.operation)),
			affectedStackIds: [],
			affectedCommitIds: commitIdsFromOperation(input.operation),
			affectedPaths: pathsFromOperation(input.operation),
			recovery: null,
			diagnostics: [],
		};
	}
	if (isJjCommittedPathMoveOperation(input.operation)) {
		return await applyJjCommittedPathMoveOperation(cwd, runner, input.operation);
	}
	if (input.operation.kind === "create_commit") {
		return await applyJjCreateCommitOperation(
			cwd,
			runner,
			{ ...input, operation: input.operation },
			cachedState,
		);
	}
	if (input.operation.kind === "abandon_commit") {
		return await applyJjAbandonCommitOperation(
			cwd,
			runner,
			{ ...input, operation: input.operation },
			cachedState,
		);
	}
	if (input.operation.kind === "reword_commit") {
		return await applyJjFastRewordOperation(
			cwd,
			runner,
			{ ...input, operation: input.operation },
			cachedState,
		);
	}
	if (input.operation.kind === "add_empty_commit") {
		return await applyJjFastAddEmptyCommitOperation(
			cwd,
			runner,
			{ ...input, operation: input.operation },
			cachedState,
		);
	}
	if (input.operation.kind === "rename_stack" || input.operation.kind === "delete_stack" || input.operation.kind === "squash_stack") {
		return await applyJjStackOperation(cwd, runner, input.operation);
	}
	if (isJjHunkRestoreDiscardOperation(input.operation)) {
		const validation = await validateJjWorkingCopyHunkOperation(cwd, runner, input.operation);
		if (validation) {
			return unsupportedApply(input.operation, validation);
		}
		const patch = await buildSelectedJjWorkingCopyHunkPatch(cwd, runner, input.operation.selection.hunks ?? []);
		if (!patch.ok) {
			return unsupportedApply(input.operation, patch.reason);
		}
		const applyResult = await runner({
			command: "git",
			args: ["apply", "--reverse", "--whitespace=nowarn", "-"],
			cwd: patch.repoCwd,
			stdin: patch.patch,
		});
		if (!applyResult.ok) {
			return unsupportedApply(input.operation, applyResult.stderr.trim() || "Could not restore selected JJ working-copy hunks.");
		}
		const action = input.operation.kind === "restore_changes" ? "Restored changes" : "Discarded changes";
		return {
			ok: true,
			operation: input.operation,
			title: action,
			summary: `${action} for ${input.operation.selection.hunks?.length ?? 0} selected working-copy hunk(s).`,
			affectedStackIds: [],
			affectedCommitIds: [],
			affectedPaths: pathsFromOperation(input.operation),
			recovery: null,
			diagnostics: [],
		};
	}
	const translated = await translateOperation(cwd, runner, input.operation);
	if (!translated.operation) {
		return unsupportedApply(input.operation, translated.reason);
		}
		const result = await applyJjOperation(cwd, translated.operation, runner);
		const neutral = toNeutralApply(input.operation, result);
		if (!neutral.ok) {
			return withNoCacheUpdate(neutral);
		}
		if (input.operation.kind === "create_bookmark") {
			return await withStackCacheUpdate(neutral, cwd, runner, [input.operation.bookmarkName]);
		}
		return withWorkspaceCacheFallback(neutral);
	}

function toNeutralDiff(diff: VcsJjDiffResult) {
	return {
		ok: diff.diagnostics.every((diagnostic) => diagnostic.level !== "error"),
		summary: diff.summary,
		patch: diff.patch,
		files: [],
		diagnostics: diff.diagnostics,
	};
}

async function translateOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: NeutralOperation,
): Promise<{ operation: VcsPreviewOperationInput | null; reason: string }> {
	if (
		operation.kind !== "undo" &&
		operation.kind !== "redo" &&
		!isJjSupportedWorkingCopyHunkCommitOperation(operation) &&
		!isJjCommittedHunkRewriteOperation(operation) &&
		"selection" in operation &&
		operation.selection?.hunks?.length
	) {
		return {
			operation: null,
			reason: "JJ hunk-level workspace operations are not implemented yet.",
		};
	}

	switch (operation.kind) {
		case "abandon_commit":
			return {
				operation: { kind: "abandon_change", changeId: operation.commitId },
				reason: "",
			};
		case "reword_commit":
			return {
				operation: { kind: "edit_message", changeId: operation.commitId, message: operation.message },
				reason: "",
			};
		case "add_empty_commit":
			return {
				operation: {
					kind: "create_change",
					anchorChangeId: operation.targetCommitId,
					placement: operation.placement,
					message: operation.message,
				},
				reason: "",
			};
		case "create_bookmark":
			return {
				operation: {
					kind: "create_bookmark",
					changeId: operation.targetCommitId,
					bookmarkName: operation.bookmarkName,
				},
				reason: "",
			};
		case "amend_commit": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "working_copy" || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ amend currently supports selected working-copy files only.",
				};
			}
			return {
				operation: { kind: "squash_change", sourceChangeId: "@", targetChangeId: operation.commitId, paths },
				reason: "",
			};
		}
		case "squash_commits":
			return {
				operation: {
					kind: "squash_change",
					sourceChangeId: operation.sourceCommitId,
					targetChangeId: operation.targetCommitId,
				},
				reason: "",
			};
		case "split_commit": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "commit" || operation.selection.commitId !== operation.commitId || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ split currently supports selected files from the source commit only.",
				};
			}
			return {
				operation: {
					kind: "split_change",
					changeId: operation.commitId,
					message: operation.message,
					paths,
				},
				reason: "",
			};
		}
		case "move_commit": {
			const targetChangeId = await resolveMoveCommitTargetChangeId(cwd, runner, operation);
			if (!targetChangeId) {
				return {
					operation: null,
					reason: `JJ move commit could not resolve target stack ${operation.targetStackId}.`,
				};
			}
			return {
				operation: {
					kind: "reorder_change",
					sourceChangeId: operation.commitId,
					targetChangeId,
					placement: operation.position?.placement ?? "after",
				},
				reason: "",
			};
		}
		case "move_changes": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "commit" || !operation.selection.commitId || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ move changes currently supports selected committed files only.",
				};
			}
			return {
				operation: {
					kind: "squash_change",
					sourceChangeId: operation.selection.commitId,
					targetChangeId: operation.targetCommitId,
					paths,
					allowDescendantTarget: true,
				},
				reason: "",
			};
		}
		case "restore_changes": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "working_copy" || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ restore currently supports selected working-copy files only.",
				};
			}
			return { operation: { kind: "restore_file", paths }, reason: "" };
		}
		case "discard_changes": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "working_copy" || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ discard currently supports selected working-copy files only.",
				};
			}
			return { operation: { kind: "restore_file", paths }, reason: "" };
		}
		case "uncommit_changes": {
			const paths = operation.selection.paths ?? [];
			if (operation.selection.source !== "commit" || !operation.selection.commitId || paths.length === 0) {
				return {
					operation: null,
					reason: "JJ uncommit currently supports selected committed files only.",
				};
			}
			return {
				operation: {
					kind: "squash_change",
					sourceChangeId: operation.selection.commitId,
					targetChangeId: "@",
					paths,
					allowDescendantTarget: true,
				},
				reason: "",
			};
		}
		case "undo":
			return { operation: { kind: "undo_last" }, reason: "" };
		case "redo":
			return { operation: { kind: "redo_last" }, reason: "" };
		case "apply_stack":
		case "unapply_stack":
		case "create_stack":
		case "create_commit":
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
			return {
				operation: null,
				reason: `JJ ${operation.kind.replaceAll("_", " ")} is not implemented in the neutral workspace engine yet.`,
			};
	}
}

async function resolveMoveCommitTargetChangeId(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "move_commit" }>,
): Promise<string | null> {
	const explicitTarget = operation.position?.relativeToCommitId?.trim();
	if (explicitTarget) {
		return explicitTarget;
	}
	const state = await loadJjWorkspaceState(cwd, runner);
	const stack = state.stacks.find((candidate) => candidate.stackId === operation.targetStackId);
	return stack?.headCommitId ?? stack?.commits.at(-1)?.commitId ?? null;
}

function isJjHunkRestoreDiscardOperation(
	operation: NeutralOperation,
): operation is JjWorkingCopyHunkRestoreDiscardOperation {
	return (
		(operation.kind === "restore_changes" || operation.kind === "discard_changes") &&
		operation.selection?.source === "working_copy" &&
		Boolean(operation.selection?.hunks?.length)
	);
}

function isJjSupportedWorkingCopyHunkCommitOperation(
	operation: NeutralOperation,
): operation is JjWorkingCopyHunkCommitOperation {
	return (
		(operation.kind === "amend_commit" || operation.kind === "create_commit") &&
		operation.selection?.source === "working_copy" &&
		Boolean(operation.selection?.hunks?.length)
	);
}

function isJjCommittedHunkRewriteOperation(
	operation: NeutralOperation,
): operation is JjCommittedHunkRewriteOperation {
	return (
		(
			operation.kind === "split_commit" ||
			operation.kind === "move_changes" ||
			operation.kind === "uncommit_changes" ||
			operation.kind === "create_commit"
		) &&
		operation.selection?.source === "commit" &&
		Boolean(operation.selection?.hunks?.length)
	);
}

function isJjCommittedPathMoveOperation(
	operation: NeutralOperation,
): operation is Extract<NeutralOperation, { kind: "move_changes" | "uncommit_changes" }> {
	return (
		(operation.kind === "move_changes" || operation.kind === "uncommit_changes") &&
		operation.selection?.source === "commit" &&
		Boolean(operation.selection?.paths?.length) &&
		!(operation.selection?.hunks?.length)
	);
}

function isJjCommittedHunkDiscardOperation(
	operation: NeutralOperation,
): operation is JjCommittedHunkDiscardOperation {
	return (
		(operation.kind === "restore_changes" || operation.kind === "discard_changes") &&
		operation.selection?.source === "commit" &&
		Boolean(operation.selection?.hunks?.length)
	);
}

function sourceCommitIdForCommittedHunkOperation(
	operation: JjCommittedHunkRewriteOperation,
): string | null {
	if (operation.kind === "split_commit") {
		return operation.commitId;
	}
	return operation.selection.commitId ?? null;
}

function titleForCommittedHunkOperation(
	operation: JjCommittedHunkRewriteOperation,
): string {
	switch (operation.kind) {
		case "create_commit":
			return "Create commit from selected hunks";
		case "split_commit":
			return "Split selected hunks";
		case "move_changes":
			return "Move selected hunks";
		case "uncommit_changes":
			return "Uncommit selected hunks";
	}
}

function appliedTitleForCommittedHunkOperation(
	operation: JjCommittedHunkRewriteOperation,
): string {
	switch (operation.kind) {
		case "create_commit":
			return "Created commit";
		case "split_commit":
			return "Split selected hunks";
		case "move_changes":
			return "Moved selected hunks";
		case "uncommit_changes":
			return "Uncommitted selected hunks";
	}
}

function summaryForCommittedHunkOperation(
	operation: JjCommittedHunkRewriteOperation,
	sourceCommitId: string | null,
): string {
	const count = operation.selection.hunks?.length ?? 0;
	switch (operation.kind) {
		case "create_commit":
			return `Create a new commit at top of ${operation.stackId} from ${count} selected hunk(s) in ${sourceCommitId ?? "the source commit"}.`;
		case "split_commit":
			return `Split ${count} selected hunk(s) out of ${sourceCommitId ?? operation.commitId}.`;
		case "move_changes":
			return `Move ${count} selected hunk(s) from ${sourceCommitId ?? "the source commit"} into ${operation.targetCommitId}.`;
		case "uncommit_changes":
			return `Move ${count} selected hunk(s) from ${sourceCommitId ?? "the source commit"} into the working copy.`;
	}
}

async function validateJjCommittedHunkOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: JjCommittedHunkRewriteOperation,
): Promise<string | null> {
	const hunks = operation.selection.hunks ?? [];
	const paths = operation.selection.paths ?? [];
	const sourceCommitId = sourceCommitIdForCommittedHunkOperation(operation);
	if (operation.selection.source !== "commit") {
		return "JJ committed hunk operations require a committed source selection.";
	}
	if (!sourceCommitId) {
		return "JJ committed hunk operations require a source commit.";
	}
	if (operation.kind === "split_commit" && operation.selection.commitId && operation.selection.commitId !== operation.commitId) {
		return "JJ split hunk selection must come from the commit being split.";
	}
	if (operation.kind === "create_commit" && !normalizeOperationMessage(operation.message)) {
		return "Enter a commit title before previewing.";
	}
	if (operation.kind === "create_commit") {
		const target = await resolveCreateCommitStackHeadChangeId(cwd, runner, operation);
		if (!target.ok) {
			return target.reason;
		}
	}
	if (operation.kind === "move_changes" && operation.targetCommitId === sourceCommitId) {
		return "Source and target changes must be different.";
	}
	if (hunks.length === 0) {
		return "Choose one or more committed hunks.";
	}
	const overlappingPath = paths.find((path) => hunks.some((hunk) => hunk.path === path));
	if (overlappingPath) {
		return `Choose either the whole file or individual hunks for ${overlappingPath}, not both.`;
	}
	const pathOperation = toJjPathOperationForCommittedHunks(operation, sourceCommitId, [...new Set(hunks.map((hunk) => hunk.path))]);
	const pathPreview = await previewJjOperation(cwd, pathOperation, runner);
	if (!pathPreview.valid) {
		return pathPreview.description;
	}
	const patch = await buildSelectedJjCommittedHunkPatch(cwd, runner, operation);
	return patch.ok ? null : patch.reason;
}

async function validateJjCommittedHunkDiscardOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: JjCommittedHunkDiscardOperation,
): Promise<string | null> {
	const sourceCommitId = operation.selection.commitId;
	const hunks = operation.selection.hunks ?? [];
	const paths = operation.selection.paths ?? [];
	if (operation.selection.source !== "commit") {
		return "JJ committed hunk discard requires a committed source selection.";
	}
	if (!sourceCommitId) {
		return "JJ committed hunk discard requires a source commit.";
	}
	if (hunks.length === 0) {
		return "Choose one or more committed hunks to discard.";
	}
	const overlappingPath = paths.find((path) => hunks.some((hunk) => hunk.path === path));
	if (overlappingPath) {
		return `Choose either the whole file or individual hunks for ${overlappingPath}, not both.`;
	}
	const parent = await readSingleJjParentChange(cwd, runner, sourceCommitId);
	if (!parent.ok) {
		return parent.reason;
	}
	const patch = await buildSelectedJjCommittedHunkPatch(cwd, runner, operation);
	return patch.ok ? null : patch.reason;
}

function toJjPathOperationForCommittedHunks(
	operation: JjCommittedHunkRewriteOperation,
	sourceCommitId: string,
	paths: string[],
): VcsPreviewOperationInput {
	switch (operation.kind) {
		case "create_commit":
			return {
				kind: "split_change",
				changeId: sourceCommitId,
				message: operation.message,
				paths,
			};
		case "split_commit":
			return {
				kind: "split_change",
				changeId: operation.commitId,
				message: operation.message,
				paths,
			};
		case "move_changes":
			return {
				kind: "squash_change",
				sourceChangeId: sourceCommitId,
				targetChangeId: operation.targetCommitId,
				paths,
				allowDescendantTarget: true,
			};
		case "uncommit_changes":
			return {
				kind: "squash_change",
				sourceChangeId: sourceCommitId,
				targetChangeId: "@",
				paths,
				allowDescendantTarget: true,
			};
	}
}

async function validateJjWorkingCopyHunkOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "restore_changes" | "discard_changes" }>,
): Promise<string | null> {
	const hunks = operation.selection.hunks ?? [];
	const paths = operation.selection.paths ?? [];
	if (operation.selection.source !== "working_copy") {
		return "JJ hunk-level restore currently supports selected working-copy hunks only.";
	}
	if (hunks.length === 0) {
		return "Choose one or more hunks to restore.";
	}
	const overlappingPath = paths.find((path) => hunks.some((hunk) => hunk.path === path));
	if (overlappingPath) {
		return `Choose either the whole file or individual hunks for ${overlappingPath}, not both.`;
	}
	const patch = await buildSelectedJjWorkingCopyHunkPatch(cwd, runner, hunks);
	return patch.ok ? null : patch.reason;
}

function validateJjWorkingCopySelection(selection: NeutralSelection): string | null {
	if (selection.source !== "working_copy") {
		return "Choose working-copy changes.";
	}
	const paths = selection.paths ?? [];
	const hunks = selection.hunks ?? [];
	if (paths.length === 0 && hunks.length === 0) {
		return "Choose one or more working-copy files or hunks.";
	}
	const overlappingPath = paths.find((path) => hunks.some((hunk) => hunk.path === path));
	if (overlappingPath) {
		return `Choose either the whole file or individual hunks for ${overlappingPath}, not both.`;
	}
	return null;
}

function validateJjCommittedCreateCommitSelection(selection: NeutralSelection): string | null {
	if (selection.source !== "commit") {
		return "Choose committed changes.";
	}
	if (!selection.commitId) {
		return "Choose a source commit.";
	}
	const paths = selection.paths ?? [];
	const hunks = selection.hunks ?? [];
	if (paths.length === 0 && hunks.length === 0) {
		return "Choose one or more committed files or hunks.";
	}
	const overlappingPath = paths.find((path) => hunks.some((hunk) => hunk.path === path));
	if (overlappingPath) {
		return `Choose either the whole file or individual hunks for ${overlappingPath}, not both.`;
	}
	return null;
}

function normalizeOperationMessage(message: string): string | null {
	const trimmed = message.trim();
	return trimmed.length > 0 ? trimmed : null;
}

async function resolveCreateCommitStackHeadChangeId(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "create_commit" }>,
): Promise<{ ok: true; headChangeId: string } | { ok: false; reason: string }> {
	const state = await loadJjWorkspaceState(cwd, runner);
	const stack = state.stacks.find((candidate) => candidate.stackId === operation.stackId);
	const headChangeId = stack?.headCommitId ?? stack?.commits.at(-1)?.commitId ?? null;
	if (!headChangeId) {
		return { ok: false, reason: `Could not resolve stack ${operation.stackId} to a JJ change.` };
	}
	return { ok: true, headChangeId };
}

async function resolveStackHeadChangeId(cwd: string, runner: VcsCommandRunner, stackId: string): Promise<string | null> {
	const state = await loadJjWorkspaceState(cwd, runner);
	const stack = state.stacks.find((candidate) => candidate.stackId === stackId);
	return stack?.headCommitId ?? stack?.commits.at(-1)?.commitId ?? null;
}

async function finalizeJjCreateCommitApply(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "create_commit" }>,
	targetHeadChangeId: string,
	output: { stdout: string; stderr: string },
): Promise<{ ok: true; affectedCommitIds: string[] } | { ok: false; message: string }> {
	const createdChangeId =
		parseCreatedJjChangeId(output.stdout) ??
		parseCreatedJjChangeId(output.stderr) ??
		(await resolveStackHeadChangeId(cwd, runner, operation.stackId));
	if (createdChangeId && createdChangeId !== targetHeadChangeId) {
		const bookmarkResult = await runner({
			command: "jj",
			args: ["bookmark", "set", operation.stackId, "-r", createdChangeId],
			cwd,
		});
		if (!bookmarkResult.ok) {
			return {
				ok: false,
				message: bookmarkResult.stderr.trim() || bookmarkResult.stdout.trim() || `Could not move bookmark ${operation.stackId}.`,
			};
		}
	}
	return {
		ok: true,
		affectedCommitIds: uniqueCommitIds([createdChangeId ?? targetHeadChangeId, targetHeadChangeId]),
	};
}

function previewJjAbandonCommitOperation(operation: Extract<NeutralOperation, { kind: "abandon_commit" }>) {
	return {
		valid: true,
		operation,
		title: "Delete commit",
		summary: `Abandon ${operation.commitId} and rebase descendants onto its parent.`,
		risk: "high" as const,
		disabledReason: null,
		warnings: [
			{
				code: "jj_abandon_commit",
				message: "This abandons the commit. If it is a stack head, Changeyard keeps the stack bookmark on the next lower commit when possible.",
			},
		],
		conflicts: [],
		affectedStackIds: [],
		affectedCommitIds: [operation.commitId],
		affectedPaths: [],
		diagnostics: [],
	};
}

function fastStackCacheUpdateForCreatedCommit<T extends JjOperationResultShape>(
	result: T,
	input: NeutralOperationRequest,
	cachedState: CachedJjWorkspaceState | null,
	cachedStack: JjWorkspaceStack | null,
	createdChangeId: string | null,
	targetHeadChangeId: string,
	message: string,
): T | null {
	if (!result.ok || !cachedStack || !createdChangeId || createdChangeId === targetHeadChangeId) {
		return null;
	}
	const newCommit = commitFromMessage({
		changeId: createdChangeId,
		message,
		parentCommitIds: [targetHeadChangeId],
		stackId: cachedStack.stackId,
		isHead: true,
	});
	const patchedStack = patchStackWithNewCommit(cachedStack, targetHeadChangeId, newCommit, "after");
	return {
		...result,
		cacheUpdate: "stacks",
		cachePayload: cachePayloadFromPatchedStack(cachedState, patchedStack),
		invalidateTags: STACK_GRAPH_INVALIDATION_TAGS,
		timing: {
			...(result.timing ?? {}),
			commandCount: 2,
		},
	};
}

async function applyJjFastRewordOperation(
	cwd: string,
	runner: VcsCommandRunner,
	input: NeutralOperationRequest & { operation: Extract<NeutralOperation, { kind: "reword_commit" }> },
	cachedState: CachedJjWorkspaceState | null,
) {
	const { operation } = input;
	const message = normalizeOperationMessage(operation.message);
	if (!message) {
		return unsupportedApply(operation, "Enter a commit message.");
	}
	const startedAt = Date.now();
	const result = await runner({ command: "jj", args: ["describe", "-r", operation.commitId, "-m", message], cwd });
	const commandMs = Date.now() - startedAt;
	if (!result.ok) {
		return failedApply(operation, result.stderr.trim() || result.stdout.trim() || "Could not reword JJ commit.");
	}
	const neutral = successfulApply(operation, "Updated commit message", `Updated ${operation.commitId} description.`, [operation.commitId]);
	const stack = cachedStackContainingCommit(input, cachedState, operation.commitId);
	const commit = stack?.commits.find((candidate) => candidate.commitId === operation.commitId) ?? null;
	if (!stack || !commit) {
		return await withCommitCacheUpdate(
			{
				...neutral,
				timing: { commandMs, commandCount: 1, fallbackReason: "missing_cached_commit" },
			},
			cwd,
			runner,
			[operation.commitId],
		);
	}
	return {
		...neutral,
		cacheUpdate: "commits" as const,
		cachePayload: {
			commits: [patchCommitMessage(commit, message)],
			headId: cachedState?.headId,
			mode: cachedState?.mode,
			conflicts: cachedState?.conflicts,
		},
		invalidateTags: COMMIT_METADATA_INVALIDATION_TAGS,
		timing: { commandMs, commandCount: 1 },
	};
}

async function applyJjFastAddEmptyCommitOperation(
	cwd: string,
	runner: VcsCommandRunner,
	input: NeutralOperationRequest & { operation: Extract<NeutralOperation, { kind: "add_empty_commit" }> },
	cachedState: CachedJjWorkspaceState | null,
) {
	const { operation } = input;
	const message = normalizeOperationMessage(operation.message);
	if (!message) {
		return unsupportedApply(operation, "Enter a commit message.");
	}
	const insertArg = operation.placement === "before" ? "--insert-before" : "--insert-after";
	const startedAt = Date.now();
	const result = await runner({ command: "jj", args: ["new", insertArg, operation.targetCommitId, "--no-edit", "-m", message], cwd });
	const commandMs = Date.now() - startedAt;
	if (!result.ok) {
		return failedApply(operation, result.stderr.trim() || result.stdout.trim() || "Could not create empty JJ commit.");
	}
	const neutral = successfulApply(operation, "Created empty commit", `Created empty commit ${operation.placement} ${operation.targetCommitId}.`, [
		parseCreatedJjChangeId(result.stdout) ?? parseCreatedJjChangeId(result.stderr) ?? operation.targetCommitId,
		operation.targetCommitId,
	]);
	const createdChangeId = neutral.affectedCommitIds.find((commitId) => commitId !== operation.targetCommitId) ?? null;
	const cachedStack = cachedStackContainingCommit(input, cachedState, operation.targetCommitId);
	if (!cachedStack || !createdChangeId) {
		const stackIds = await stackIdsContainingCommits(cwd, runner, [operation.targetCommitId]);
		return await withStackCacheUpdate(
			{
				...neutral,
				timing: { commandMs, commandCount: 1, fallbackReason: "missing_cached_stack" },
			},
			cwd,
			runner,
			stackIds,
		);
	}
	const targetCommit = cachedStack.commits.find((commit) => commit.commitId === operation.targetCommitId) ?? null;
	const isNewHead = operation.placement === "after" && cachedStack.headCommitId === operation.targetCommitId;
	const parentCommitIds = operation.placement === "after"
		? [operation.targetCommitId]
		: targetCommit?.parentCommitIds ?? [];
	const newCommit = commitFromMessage({
		changeId: createdChangeId,
		message,
		parentCommitIds,
		stackId: cachedStack.stackId,
		isHead: isNewHead,
	});
	const patchedStack = patchStackWithNewCommit(cachedStack, operation.targetCommitId, newCommit, operation.placement);
	return {
		...neutral,
		cacheUpdate: "stacks" as const,
		cachePayload: cachePayloadFromPatchedStack(cachedState, patchedStack),
		invalidateTags: STACK_GRAPH_INVALIDATION_TAGS,
		timing: { commandMs, commandCount: 1 },
	};
}

async function previewJjCreateCommitOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "create_commit" }>,
) {
	const message = normalizeOperationMessage(operation.message);
	if (!message) {
		return unsupportedPreview(operation, "Enter a commit title before previewing.");
	}
	const validation =
		!operation.selection
			? null
			: operation.selection.source === "working_copy"
			? validateJjWorkingCopySelection(operation.selection)
			: validateJjCommittedCreateCommitSelection(operation.selection);
	if (validation) {
		return unsupportedPreview(operation, validation);
	}
	const target = await resolveCreateCommitStackHeadChangeId(cwd, runner, operation);
	if (!target.ok) {
		return unsupportedPreview(operation, target.reason);
	}
	return {
		valid: true,
		operation,
		title: "Create commit",
		summary: `Create new commit at top of ${operation.stackId}.`,
		risk: operation.selection?.hunks?.length ? "high" as const : "medium" as const,
		disabledReason: null,
		warnings: [],
		conflicts: [],
		affectedStackIds: [operation.stackId],
		affectedCommitIds: [target.headChangeId],
		affectedPaths: pathsFromOperation(operation),
		diagnostics: [],
	};
}

async function previewJjWorkingCopyHunkCommitOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: JjWorkingCopyHunkCommitOperation,
) {
	const validation = validateJjWorkingCopySelection(operation.selection);
	if (validation) {
		return unsupportedPreview(operation, validation);
	}
	if (operation.kind === "create_commit" && !normalizeOperationMessage(operation.message)) {
		return unsupportedPreview(operation, "Enter a commit title before previewing.");
	}
	const patch = await buildSelectedJjWorkingCopyHunkPatch(cwd, runner, operation.selection.hunks ?? []);
	if (!patch.ok) {
		return unsupportedPreview(operation, patch.reason);
	}
	const createCommitTarget = operation.kind === "create_commit" ? await resolveCreateCommitStackHeadChangeId(cwd, runner, operation) : null;
	if (createCommitTarget && !createCommitTarget.ok) {
		return unsupportedPreview(operation, createCommitTarget.reason);
	}
	const affectedCommitIds = operation.kind === "amend_commit" ? [operation.commitId] : [createCommitTarget?.headChangeId ?? ""].filter(Boolean);
	return {
		valid: true,
		operation,
		title: operation.kind === "amend_commit" ? "Amend commit" : "Create commit",
		summary:
			operation.kind === "amend_commit"
				? `Move selected working-copy changes into ${operation.commitId}.`
				: `Create new commit at top of ${operation.stackId}.`,
		risk: "high" as const,
		disabledReason: null,
		warnings: [],
		conflicts: [],
		affectedStackIds: operation.kind === "create_commit" ? [operation.stackId] : [],
		affectedCommitIds,
		affectedPaths: pathsFromOperation(operation),
		diagnostics: [],
	};
}

async function applyJjCreateCommitOperation(
	cwd: string,
	runner: VcsCommandRunner,
	input: NeutralOperationRequest & { operation: Extract<NeutralOperation, { kind: "create_commit" }> },
	cachedState: CachedJjWorkspaceState | null,
) {
	const { operation } = input;
	const message = normalizeOperationMessage(operation.message);
	if (!message) {
		return unsupportedApply(operation, "Enter a commit title before previewing.");
	}
	const validation =
		!operation.selection
			? null
			: operation.selection.source === "working_copy"
			? validateJjWorkingCopySelection(operation.selection)
			: validateJjCommittedCreateCommitSelection(operation.selection);
	if (validation) {
		return unsupportedApply(operation, validation);
	}
	const cachedStack = cachedStackForOperation(input, cachedState, operation.stackId);
	const contextHeadChangeId = input.operationContext?.headCommitId ?? cachedStack?.headCommitId ?? null;
	const target = contextHeadChangeId
		? { ok: true as const, headChangeId: contextHeadChangeId }
		: await resolveCreateCommitStackHeadChangeId(cwd, runner, operation);
	if (!target.ok) {
		return unsupportedApply(operation, target.reason);
	}
	if (!operation.selection) {
		const applyResult = await runner({
			command: "jj",
			args: ["new", "--no-edit", "--insert-after", target.headChangeId, "-m", message],
			cwd,
		});
		if (!applyResult.ok) {
			return failedApply(operation, applyResult.stderr.trim() || applyResult.stdout.trim() || "Could not create empty JJ commit.");
		}
		const finalized = await finalizeJjCreateCommitApply(cwd, runner, operation, target.headChangeId, applyResult);
		if (!finalized.ok) {
			return failedApply(operation, finalized.message);
		}
		const fastResult = fastStackCacheUpdateForCreatedCommit(
			successfulApply(
				operation,
				"Created commit",
				`Created empty commit at top of ${operation.stackId}.`,
				finalized.affectedCommitIds,
			),
			input,
			cachedState,
			cachedStack,
			finalized.affectedCommitIds[0] ?? null,
			target.headChangeId,
			message,
		);
		if (fastResult) {
			return fastResult;
		}
			return await withStackCacheUpdate(
				successfulApply(
					operation,
					"Created commit",
					`Created empty commit at top of ${operation.stackId}.`,
					finalized.affectedCommitIds,
				),
				cwd,
				runner,
				[operation.stackId],
			);
	}
	const paths = operation.selection.paths ?? [];
	if (isJjSupportedWorkingCopyHunkCommitOperation(operation)) {
		return await applyJjWorkingCopyHunkCommitOperation(cwd, runner, operation);
	}
	if (isJjCommittedHunkRewriteOperation(operation)) {
		const validation = await validateJjCommittedHunkOperation(cwd, runner, operation);
		if (validation) {
			return unsupportedApply(operation, validation);
		}
		const patch = await buildSelectedJjCommittedHunkPatch(cwd, runner, operation);
		if (!patch.ok) {
			return unsupportedApply(operation, patch.reason);
		}
		const applyResult = await applyJjCommittedHunkOperationWithEditor(patch.repoCwd, runner, operation, patch);
		if (!applyResult.ok) {
			return failedApply(operation, applyResult.stderr.trim() || applyResult.stdout.trim() || "Could not create commit from selected JJ hunks.");
		}
		const finalized = await finalizeJjCreateCommitApply(cwd, runner, operation, target.headChangeId, applyResult);
		if (!finalized.ok) {
			return failedApply(operation, finalized.message);
		}
			return await withStackCacheUpdate(
				successfulApply(
					operation,
					"Created commit",
					`Created new commit at top of ${operation.stackId}.`,
					finalized.affectedCommitIds,
				),
				cwd,
				runner,
				[operation.stackId],
			);
	}
	if (operation.selection.source === "commit") {
		if (!operation.selection.commitId || paths.length === 0) {
			return unsupportedApply(operation, "Choose one or more committed files.");
		}
		const applyResult = await runner({
			command: "jj",
			args: ["split", "-r", operation.selection.commitId, "--insert-after", target.headChangeId, "-m", message, "--", ...paths],
			cwd,
		});
		if (!applyResult.ok) {
			return failedApply(operation, applyResult.stderr.trim() || applyResult.stdout.trim() || "Could not create JJ commit.");
		}
		const finalized = await finalizeJjCreateCommitApply(cwd, runner, operation, target.headChangeId, applyResult);
		if (!finalized.ok) {
			return failedApply(operation, finalized.message);
		}
			return await withStackCacheUpdate(
				successfulApply(
					operation,
					"Created commit",
					`Created new commit at top of ${operation.stackId}.`,
					finalized.affectedCommitIds,
				),
				cwd,
				runner,
				[operation.stackId],
			);
	}
	const applyResult = await runner({
		command: "jj",
		args: ["split", "-r", "@", "--insert-after", target.headChangeId, "-m", message, "--", ...paths],
		cwd,
	});
	if (!applyResult.ok) {
		return failedApply(operation, applyResult.stderr.trim() || applyResult.stdout.trim() || "Could not create JJ commit.");
	}
	const finalized = await finalizeJjCreateCommitApply(cwd, runner, operation, target.headChangeId, applyResult);
	if (!finalized.ok) {
		return failedApply(operation, finalized.message);
	}
		return await withStackCacheUpdate(
			successfulApply(
				operation,
				"Created commit",
				`Created new commit at top of ${operation.stackId}.`,
				finalized.affectedCommitIds,
			),
			cwd,
			runner,
			[operation.stackId],
		);
}

async function applyJjAbandonCommitOperation(
	cwd: string,
	runner: VcsCommandRunner,
	input: NeutralOperationRequest & { operation: Extract<NeutralOperation, { kind: "abandon_commit" }> },
	cachedState: CachedJjWorkspaceState | null,
) {
	const { operation } = input;
	const cachedStack = cachedStackContainingCommit(input, cachedState, operation.commitId);
	if (cachedStack) {
		const targetIndex = cachedStack.commits.findIndex((commit) => commit.commitId === operation.commitId);
		const isHead = cachedStack.headCommitId === operation.commitId;
		const replacementCommitId = isHead ? input.operationContext?.nextLowerCommitId ?? cachedStack.commits[targetIndex - 1]?.commitId ?? null : null;
		if (isHead && replacementCommitId) {
			const bookmarkResult = await runner({
				command: "jj",
				args: ["bookmark", "set", "--allow-backwards", cachedStack.stackId, "-r", replacementCommitId],
				cwd,
			});
			if (!bookmarkResult.ok) {
				return failedApply(
					operation,
					bookmarkResult.stderr.trim() || bookmarkResult.stdout.trim() || `Could not move bookmark ${cachedStack.stackId}.`,
				);
			}
		}
		const abandonArgs = isHead && !replacementCommitId
			? ["abandon", "--retain-bookmarks", operation.commitId]
			: ["abandon", operation.commitId];
		const abandonResult = await runner({ command: "jj", args: abandonArgs, cwd });
		if (!abandonResult.ok) {
			return failedApply(operation, abandonResult.stderr.trim() || abandonResult.stdout.trim() || "Could not delete JJ commit.");
		}
		if (isHead && !replacementCommitId) {
			const finalized = successfulApply(
				operation,
				"Deleted commit",
				`Abandoned ${operation.commitId}. Descendants were rebased onto its parent.`,
				[operation.commitId],
			);
			return await withStackCacheUpdate(finalized, cwd, runner, [cachedStack.stackId]);
		}
		const patchedStack = patchStackAfterAbandon(cachedStack, operation.commitId, replacementCommitId);
		return {
			ok: true,
			operation,
			title: "Deleted commit",
			summary:
				replacementCommitId
					? `Abandoned ${operation.commitId} and moved ${cachedStack.stackId} to ${replacementCommitId}.`
					: `Abandoned ${operation.commitId}. Descendants were rebased onto its parent.`,
			affectedStackIds: [cachedStack.stackId],
			affectedCommitIds: uniqueCommitIds([operation.commitId, replacementCommitId ?? ""]),
			affectedPaths: [],
			recovery: null,
			diagnostics: [],
			cacheUpdate: "stacks" as const,
			cachePayload: cachePayloadFromPatchedStack(cachedState, patchedStack),
			invalidateTags: STACK_GRAPH_INVALIDATION_TAGS,
			timing: { commandCount: isHead && replacementCommitId ? 2 : 1 },
		};
	}

	const state = await loadJjWorkspaceState(cwd, runner);
	const headStacks = state.stacks.filter((stack) => stack.headCommitId === operation.commitId);
	const containingStackIds = state.stacks
		.filter((stack) => stack.commits.some((commit) => commit.commitId === operation.commitId))
		.map((stack) => stack.stackId);
	const affectedStackIds = headStacks.length > 0 ? headStacks.map((stack) => stack.stackId) : containingStackIds;
	const replacementCommitIds: string[] = [];
	for (const stack of headStacks) {
		const targetIndex = stack.commits.findIndex((commit) => commit.commitId === operation.commitId);
		const replacementCommitId = targetIndex > 0 ? stack.commits[targetIndex - 1]?.commitId ?? null : null;
		if (!replacementCommitId) {
			continue;
		}
		const bookmarkResult = await runner({
			command: "jj",
			args: ["bookmark", "set", "--allow-backwards", stack.stackId, "-r", replacementCommitId],
			cwd,
		});
		if (!bookmarkResult.ok) {
			return failedApply(
				operation,
				bookmarkResult.stderr.trim() || bookmarkResult.stdout.trim() || `Could not move bookmark ${stack.stackId}.`,
			);
		}
		replacementCommitIds.push(replacementCommitId);
	}
	const abandonArgs =
		headStacks.length > 0 && replacementCommitIds.length === 0
			? ["abandon", "--retain-bookmarks", operation.commitId]
			: ["abandon", operation.commitId];
	const abandonResult = await runner({ command: "jj", args: abandonArgs, cwd });
	if (!abandonResult.ok) {
		return failedApply(operation, abandonResult.stderr.trim() || abandonResult.stdout.trim() || "Could not delete JJ commit.");
	}
	return await withStackCacheUpdate(
		{
			ok: true,
			operation,
			title: "Deleted commit",
			summary:
				replacementCommitIds.length > 0
					? `Abandoned ${operation.commitId} and moved ${affectedStackIds.join(", ")} to ${replacementCommitIds.join(", ")}.`
					: `Abandoned ${operation.commitId}. Descendants were rebased onto its parent.`,
			affectedStackIds,
			affectedCommitIds: [operation.commitId, ...replacementCommitIds],
			affectedPaths: [],
			recovery: null,
			diagnostics: [],
		},
		cwd,
		runner,
		affectedStackIds,
	);
}

async function previewJjStackOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "rename_stack" | "delete_stack" | "squash_stack" }>,
) {
	const state = await loadJjWorkspaceState(cwd, runner);
	const stack = state.stacks.find((candidate) => candidate.stackId === operation.stackId);
	if (!stack) {
		return unsupportedPreview(operation, `Could not find stack ${operation.stackId}.`);
	}
	if (operation.kind === "rename_stack") {
		return {
			valid: true,
			operation,
			title: "Rename stack",
			summary: `Rename ${operation.stackId} to ${operation.name}.`,
			risk: "low" as const,
			disabledReason: null,
			warnings: [],
			conflicts: [],
			affectedStackIds: [operation.stackId, operation.name],
			affectedCommitIds: [],
			affectedPaths: [],
			diagnostics: [],
		};
	}
	if (operation.kind === "delete_stack") {
		return {
			valid: true,
			operation,
			title: "Delete stack",
			summary: `Delete bookmark ${operation.stackId}. Commits are left intact.`,
			risk: "medium" as const,
			disabledReason: null,
			warnings: [
				{
					code: "jj_bookmark_delete_only",
					message: "This deletes the bookmark only; it does not abandon commits.",
				},
			],
			conflicts: [],
			affectedStackIds: [operation.stackId],
			affectedCommitIds: [],
			affectedPaths: [],
			diagnostics: [],
		};
	}
	const headChangeId = stack.headCommitId ?? stack.commits.at(0)?.commitId ?? null;
	const sourceCommitIds = stack.commits.map((commit) => commit.commitId).filter((commitId) => commitId !== headChangeId);
	if (!headChangeId || sourceCommitIds.length === 0) {
		return unsupportedPreview(operation, `${operation.stackId} needs at least two commits to squash.`);
	}
	return {
		valid: true,
		operation,
		title: "Squash stack",
		summary: `Squash ${sourceCommitIds.length} commit(s) into ${headChangeId}.`,
		risk: "high" as const,
		disabledReason: null,
		warnings: [
			{
				code: "jj_squash_stack",
				message: "This rewrites every visible commit in the stack into the stack head.",
			},
		],
		conflicts: [],
		affectedStackIds: [operation.stackId],
		affectedCommitIds: [headChangeId, ...sourceCommitIds],
		affectedPaths: [],
		diagnostics: [],
	};
}

async function applyJjStackOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "rename_stack" | "delete_stack" | "squash_stack" }>,
) {
	const preview = await previewJjStackOperation(cwd, runner, operation);
	if (!preview.valid) {
		return unsupportedApply(operation, preview.summary);
	}
	if (operation.kind === "rename_stack") {
		const result = await runner({ command: "jj", args: ["bookmark", "rename", operation.stackId, operation.name], cwd });
		if (!result.ok) {
			return failedApply(operation, result.stderr.trim() || result.stdout.trim() || `Could not rename ${operation.stackId}.`);
		}
		return await withStackCacheUpdate(
			successfulApply(operation, "Renamed stack", `Renamed ${operation.stackId} to ${operation.name}.`, []),
			cwd,
			runner,
			[operation.name],
			{ removedStackIds: [operation.stackId] },
		);
	}
	if (operation.kind === "delete_stack") {
		const result = await runner({ command: "jj", args: ["bookmark", "delete", operation.stackId], cwd });
		if (!result.ok) {
			return failedApply(operation, result.stderr.trim() || result.stdout.trim() || `Could not delete ${operation.stackId}.`);
		}
		return await withStackCacheUpdate(
			successfulApply(operation, "Deleted stack", `Deleted bookmark ${operation.stackId}.`, []),
			cwd,
			runner,
			[],
			{ removedStackIds: [operation.stackId] },
		);
	}
	const sourceCommitIds = preview.affectedCommitIds.slice(1);
	const targetCommitId = preview.affectedCommitIds[0];
	if (!targetCommitId || sourceCommitIds.length === 0) {
		return unsupportedApply(operation, `${operation.stackId} needs at least two commits to squash.`);
	}
	const result = await runner({
		command: "jj",
		args: [
			"squash",
			...sourceCommitIds.flatMap((commitId) => ["--from", commitId]),
			"--into",
			targetCommitId,
			"--use-destination-message",
		],
		cwd,
	});
	if (!result.ok) {
		return failedApply(operation, result.stderr.trim() || result.stdout.trim() || `Could not squash ${operation.stackId}.`);
	}
	return await withStackCacheUpdate(
		successfulApply(operation, "Squashed stack", `Squashed ${sourceCommitIds.length} commit(s) into ${targetCommitId}.`, [
			targetCommitId,
			...sourceCommitIds,
		]),
		cwd,
		runner,
		[operation.stackId],
	);
}

async function applyJjCommittedPathMoveOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "move_changes" | "uncommit_changes" }>,
) {
	const sourceCommitId = operation.selection.commitId;
	const paths = operation.selection.paths ?? [];
	if (!sourceCommitId || paths.length === 0) {
		return unsupportedApply(operation, "Choose one or more committed files.");
	}
	const targetChangeId = operation.kind === "move_changes" ? operation.targetCommitId : "@";
	const splitResult = await runner({
		command: "jj",
		args: [
			"split",
			"-r",
			sourceCommitId,
			"--insert-after",
			targetChangeId,
			"-m",
			"changeyard move selected files",
			"--",
			...paths,
		],
		cwd,
	});
	if (!splitResult.ok) {
		return failedApply(operation, splitResult.stderr.trim() || splitResult.stdout.trim() || "Could not move selected JJ files.");
	}
	const temporaryChangeId = parseCreatedJjChangeId(splitResult.stdout) ?? parseCreatedJjChangeId(splitResult.stderr);
	if (!temporaryChangeId) {
		return failedApply(operation, splitResult.stderr.trim() || "Could not determine the temporary JJ change id.");
	}
	const squashResult = await runner({
		command: "jj",
		args: ["squash", "--from", temporaryChangeId, "--into", targetChangeId, "--use-destination-message"],
		cwd,
	});
	if (!squashResult.ok) {
		return failedApply(operation, squashResult.stderr.trim() || squashResult.stdout.trim() || "Could not squash selected JJ files into the target.");
	}
	await runner({ command: "jj", args: ["abandon", temporaryChangeId], cwd });
	return successfulApply(
		operation,
		operation.kind === "move_changes" ? "Moved selected files" : "Uncommitted selected files",
		operation.kind === "move_changes"
			? `Moved ${paths.length} selected file(s) into ${operation.targetCommitId}.`
			: `Moved ${paths.length} selected file(s) into the working copy.`,
		commitIdsFromOperation(operation),
	);
}

async function applyJjWorkingCopyHunkCommitOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: JjWorkingCopyHunkCommitOperation,
) {
	const preview = await previewJjWorkingCopyHunkCommitOperation(cwd, runner, operation);
	if (!preview.valid) {
		return unsupportedApply(operation, preview.summary);
	}
	const target =
		operation.kind === "create_commit"
			? await resolveCreateCommitStackHeadChangeId(cwd, runner, operation)
			: { ok: true as const, headChangeId: operation.commitId };
	if (!target.ok) {
		return unsupportedApply(operation, target.reason);
	}
	const applyResult = await applyJjWorkingCopyHunkCommitOperationWithEditor(cwd, runner, operation, target.headChangeId);
	if (!applyResult.ok) {
		return failedApply(operation, applyResult.stderr.trim() || applyResult.stdout.trim() || "Could not rewrite selected JJ working-copy hunks.");
	}
	const title = operation.kind === "amend_commit" ? "Amended commit" : "Created commit";
	const summary =
		operation.kind === "amend_commit"
			? `Moved selected working-copy changes into ${operation.commitId}.`
			: `Created new commit at top of ${operation.stackId}.`;
		if (operation.kind === "create_commit") {
			const finalized = await finalizeJjCreateCommitApply(cwd, runner, operation, target.headChangeId, applyResult);
			if (!finalized.ok) {
				return failedApply(operation, finalized.message);
			}
			return await withStackCacheUpdate(successfulApply(operation, title, summary, finalized.affectedCommitIds), cwd, runner, [
				operation.stackId,
			]);
		}
	return successfulApply(operation, title, summary, [target.headChangeId]);
}

async function buildSelectedJjCommittedHunkPatch(
	cwd: string,
	runner: VcsCommandRunner,
	operation:
		| JjCommittedHunkRewriteOperation
		| JjCommittedHunkDiscardOperation,
): Promise<{ ok: true; patch: string; repoCwd: string; paths: string[] } | { ok: false; reason: string }> {
	const sourceCommitId =
		operation.kind === "restore_changes" || operation.kind === "discard_changes"
			? operation.selection.commitId
			: sourceCommitIdForCommittedHunkOperation(operation);
	if (!sourceCommitId) {
		return { ok: false, reason: "JJ committed hunk operations require a source commit." };
	}
	const detect = await detectVcsState(cwd, runner);
	const repoCwd = detect.repository.root ?? cwd;
	if (detect.repository.kind !== "jj") {
		return { ok: false, reason: "JJ committed hunk operations are only available inside a JJ repository." };
	}
	const hunks = operation.selection.hunks ?? [];
	const paths = [...new Set(hunks.map((hunk) => hunk.path))];
	const diffResult = await runner({
		command: "jj",
		args: ["--color=never", "diff", "--ignore-working-copy", "--git", "-r", sourceCommitId, "--", ...paths],
		cwd: repoCwd,
	});
	if (!diffResult.ok) {
		return {
			ok: false,
			reason: diffResult.stderr.trim() || "Could not read JJ committed hunks.",
		};
	}
	const patchFiles = parseJjPatchFiles(diffResult.stdout);
	const patchLines: string[] = [];
	for (const file of patchFiles) {
		const selectedHunks = hunks.filter((hunk) => hunk.path === file.path);
		if (selectedHunks.length === 0) {
			continue;
		}
		const matchedHunks: JjPatchHunk[] = [];
		for (const selection of selectedHunks) {
			const match = file.hunks.find((hunk) => hunkMatchesSelection(file.path, hunk, selection));
			if (!match) {
				return {
					ok: false,
					reason: `Could not match selected JJ hunk ${selection.hunkId} in ${selection.path}. Refresh the workspace and retry.`,
				};
			}
			matchedHunks.push(match);
		}
		patchLines.push(...file.headerLines);
		for (const hunk of matchedHunks) {
			patchLines.push(...hunk.lines);
		}
	}
	if (patchLines.length === 0) {
		return { ok: false, reason: "Could not build a JJ patch for the selected committed hunks." };
	}
	return { ok: true, patch: `${patchLines.join("\n")}\n`, repoCwd, paths };
}

async function readSingleJjParentChange(
	cwd: string,
	runner: VcsCommandRunner,
	sourceCommitId: string,
): Promise<{ ok: true; parentChangeId: string } | { ok: false; reason: string }> {
	const result = await runner({
		command: "jj",
		args: ["log", "--ignore-working-copy", "--no-graph", "-r", `${sourceCommitId}-`, "-T", "change_id.short()"],
		cwd,
	});
	if (!result.ok) {
		return {
			ok: false,
			reason: result.stderr.trim() || `Could not resolve the parent of ${sourceCommitId}.`,
		};
	}
	const parents = result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (parents.length !== 1 || !parents[0]) {
		return {
			ok: false,
			reason: `JJ committed hunk discard requires ${sourceCommitId} to have exactly one parent.`,
		};
	}
	return { ok: true, parentChangeId: parents[0] };
}

async function discardJjCommittedHunksWithTemporaryChange(
	repoCwd: string,
	runner: VcsCommandRunner,
	operation: JjCommittedHunkDiscardOperation,
	patch: { patch: string; paths: string[] },
) {
	const sourceCommitId = operation.selection.commitId ?? "";
	const parent = await readSingleJjParentChange(repoCwd, runner, sourceCommitId);
	if (!parent.ok) {
		return { ok: false, stdout: "", stderr: parent.reason, exitCode: 1 };
	}
	const tempDir = await mkdtemp(join(tmpdir(), "changeyard-jj-discard-"));
	const patchPath = join(tempDir, "selected.patch");
	const editorPath = join(tempDir, "select-hunks-editor.sh");
	await writeFile(patchPath, patch.patch, "utf8");
	await writeFile(editorPath, createJjSelectedPatchEditorScript(patchPath), "utf8");
	await chmod(editorPath, 0o700);
	let temporaryChangeId: string | null = null;
	let abandonedTemporaryChange = false;
	try {
		const createResult = await runner({
			command: "jj",
			args: ["new", "--no-edit", parent.parentChangeId, "-m", "changeyard discard selected hunks"],
			cwd: repoCwd,
		});
		if (!createResult.ok) {
			return createResult;
		}
		temporaryChangeId = parseCreatedJjChangeId(createResult.stdout) ?? parseCreatedJjChangeId(createResult.stderr);
		if (!temporaryChangeId) {
			return {
				ok: false,
				stdout: createResult.stdout,
				stderr: createResult.stderr.trim() || "Could not determine the temporary JJ change id.",
				exitCode: 1,
			};
		}
		const squashResult = await runner({
			command: "jj",
			args: [
				"squash",
				"--from",
				sourceCommitId,
				"--into",
				temporaryChangeId,
				"--interactive",
				"--tool",
				editorPath,
				...patch.paths,
			],
			cwd: repoCwd,
		});
		if (!squashResult.ok) {
			return squashResult;
		}
		const abandonResult = await runner({
			command: "jj",
			args: ["abandon", temporaryChangeId],
			cwd: repoCwd,
		});
		if (abandonResult.ok) {
			abandonedTemporaryChange = true;
		}
		return abandonResult;
	} finally {
		if (temporaryChangeId && !abandonedTemporaryChange) {
			await runner({
				command: "jj",
				args: ["abandon", temporaryChangeId],
				cwd: repoCwd,
			});
		}
		await rm(tempDir, { recursive: true, force: true });
	}
}

function parseCreatedJjChangeId(output: string): string | null {
	const match = /^Created new commit\s+([A-Za-z0-9._/-]+)/m.exec(output);
	return match?.[1] ?? null;
}

function parseSelectedJjChangeId(output: string): string | null {
	const match = /^Selected changes\s*:\s*([A-Za-z0-9._/-]+)/m.exec(output);
	return match?.[1] ?? null;
}

function isSuccessfulJjSplitOutput(output: string): boolean {
	return /^Selected changes\s*:/m.test(output) && /^Remaining changes\s*:/m.test(output);
}

function uniqueCommitIds(commitIds: string[]): string[] {
	return [...new Set(commitIds.filter(Boolean))];
}

async function applyJjCommittedHunkOperationWithEditor(
	repoCwd: string,
	runner: VcsCommandRunner,
	operation: JjCommittedHunkRewriteOperation,
	patch: { patch: string; paths: string[] },
) {
	const sourceCommitId = sourceCommitIdForCommittedHunkOperation(operation);
	const target =
		operation.kind === "create_commit"
			? await resolveCreateCommitStackHeadChangeId(repoCwd, runner, operation)
			: operation.kind === "move_changes"
				? { ok: true as const, headChangeId: operation.targetCommitId }
				: operation.kind === "uncommit_changes"
					? { ok: true as const, headChangeId: "@" }
					: null;
	if (target && !target.ok) {
		return { ok: false, stdout: "", stderr: target.reason, exitCode: 1 };
	}
	const tempDir = await mkdtemp(join(tmpdir(), "changeyard-jj-hunks-"));
	const patchPath = join(tempDir, "selected.patch");
	const editorPath = join(tempDir, "select-hunks-editor.sh");
	await writeFile(patchPath, patch.patch, "utf8");
	await writeFile(editorPath, createJjSelectedPatchEditorScript(patchPath), "utf8");
	await chmod(editorPath, 0o700);
	try {
		if (operation.kind === "split_commit") {
			return await runner({
				command: "jj",
				args: ["split", "-r", operation.commitId, "-m", operation.message.trim(), "--tool", editorPath, ...patch.paths],
				cwd: repoCwd,
			});
		}
		const splitResult = await runner({
			command: "jj",
			args: [
				"split",
				"-r",
				sourceCommitId ?? "",
				"--insert-after",
				target?.headChangeId ?? "",
				"-m",
				operation.kind === "create_commit" ? (normalizeOperationMessage(operation.message) ?? "") : "changeyard move selected hunks",
				"--interactive",
				"--tool",
				editorPath,
				...patch.paths,
			],
			cwd: repoCwd,
		});
		const splitOutput = [splitResult.stdout, splitResult.stderr].filter(Boolean).join("\n");
		if ((!splitResult.ok && !isSuccessfulJjSplitOutput(splitOutput)) || operation.kind === "create_commit") {
			return splitResult;
		}
		const temporaryChangeId =
			parseCreatedJjChangeId(splitResult.stdout) ??
			parseCreatedJjChangeId(splitResult.stderr) ??
			parseSelectedJjChangeId(splitOutput);
		if (!temporaryChangeId) {
			return {
				ok: false,
				stdout: splitResult.stdout,
				stderr: splitResult.stderr.trim() || "Could not determine the temporary JJ change id.",
				exitCode: 1,
			};
		}
		const squashResult = await runner({
			command: "jj",
			args: ["squash", "--from", temporaryChangeId, "--into", target?.headChangeId ?? "", "--use-destination-message"],
			cwd: repoCwd,
		});
		if (squashResult.ok) {
			await runner({ command: "jj", args: ["abandon", temporaryChangeId], cwd: repoCwd });
		}
		return squashResult;
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

async function applyJjWorkingCopyHunkCommitOperationWithEditor(
	cwd: string,
	runner: VcsCommandRunner,
	operation: JjWorkingCopyHunkCommitOperation,
	targetChangeId: string,
) {
	const patch = await buildSelectedJjWorkingCopyHunkPatch(cwd, runner, operation.selection.hunks ?? []);
	if (!patch.ok) {
		return { ok: false, stdout: "", stderr: patch.reason, exitCode: 1 };
	}
	const message = operation.kind === "create_commit" ? normalizeOperationMessage(operation.message) : null;
	if (operation.kind === "create_commit" && !message) {
		return { ok: false, stdout: "", stderr: "Enter a commit title before previewing.", exitCode: 1 };
	}
	const paths = [...new Set((operation.selection.hunks ?? []).map((hunk) => hunk.path))];
	const tempDir = await mkdtemp(join(tmpdir(), "changeyard-jj-working-hunks-"));
	const patchPath = join(tempDir, "selected.patch");
	const editorPath = join(tempDir, "select-hunks-editor.sh");
	await writeFile(patchPath, patch.patch, "utf8");
	await writeFile(editorPath, createJjSelectedPatchEditorScript(patchPath), "utf8");
	await chmod(editorPath, 0o700);
	try {
		if (operation.kind === "create_commit") {
			return await runner({
				command: "jj",
				args: [
					"split",
					"-r",
					"@",
					"--insert-after",
					targetChangeId,
					"-m",
					message ?? "",
					"--interactive",
					"--tool",
					editorPath,
					...paths,
				],
				cwd: patch.repoCwd,
			});
		}
		return await runner({
			command: "jj",
			args: [
				"squash",
				"--from",
				"@",
				"--into",
				targetChangeId,
				"--interactive",
				"--tool",
				editorPath,
				...paths,
			],
			cwd: patch.repoCwd,
		});
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

function createJjSelectedPatchEditorScript(patchPath: string): string {
	return [
		"#!/bin/sh",
		"set -eu",
		'left="$1"',
		'right="$2"',
		'find "$right" -mindepth 1 -maxdepth 1 -exec rm -rf {} +',
		'cp -R "$left"/. "$right"/',
		`git -C "$right" apply --whitespace=nowarn ${shellSingleQuote(patchPath)}`,
		"",
	].join("\n");
}

function shellSingleQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

async function buildSelectedJjWorkingCopyHunkPatch(
	cwd: string,
	runner: VcsCommandRunner,
	hunks: JjHunkSelection[],
): Promise<{ ok: true; patch: string; repoCwd: string } | { ok: false; reason: string }> {
	const detect = await detectVcsState(cwd, runner);
	const repoCwd = detect.repository.root ?? cwd;
	if (detect.repository.kind !== "jj") {
		return { ok: false, reason: "JJ hunk restore is only available inside a JJ repository." };
	}
	const paths = [...new Set(hunks.map((hunk) => hunk.path))];
	const diffResult = await runner({
		command: "jj",
		args: ["--color=never", "diff", "--ignore-working-copy", "--git", "--", ...paths],
		cwd: repoCwd,
	});
	if (!diffResult.ok) {
		return {
			ok: false,
			reason: diffResult.stderr.trim() || "Could not read JJ working-copy hunks.",
		};
	}
	const patchFiles = parseJjPatchFiles(diffResult.stdout);
	const patchLines: string[] = [];
	for (const file of patchFiles) {
		const selectedHunks = hunks.filter((hunk) => hunk.path === file.path);
		if (selectedHunks.length === 0) {
			continue;
		}
		const matchedHunks: JjPatchHunk[] = [];
		for (const selection of selectedHunks) {
			const match = file.hunks.find((hunk) => hunkMatchesSelection(file.path, hunk, selection));
			if (!match) {
				return {
					ok: false,
					reason: `Could not match selected JJ hunk ${selection.hunkId} in ${selection.path}. Refresh the workspace and retry.`,
				};
			}
			matchedHunks.push(match);
		}
		patchLines.push(...file.headerLines);
		for (const hunk of matchedHunks) {
			patchLines.push(...hunk.lines);
		}
	}
	if (patchLines.length === 0) {
		return { ok: false, reason: "Could not build a JJ patch for the selected hunks." };
	}
	return { ok: true, patch: `${patchLines.join("\n")}\n`, repoCwd };
}

function parseJjPatchFiles(patch: string): JjPatchFile[] {
	const files: JjPatchFile[] = [];
	let currentFile: JjPatchFile | null = null;
	let currentHunk: JjPatchHunk | null = null;
	let sawHunk = false;

	function pushCurrentHunk(): void {
		if (currentFile && currentHunk) {
			currentFile.hunks.push(currentHunk);
		}
		currentHunk = null;
	}

	function pushCurrentFile(): void {
		pushCurrentHunk();
		if (currentFile) {
			files.push(currentFile);
		}
		currentFile = null;
		sawHunk = false;
	}

	for (const line of patch.split("\n")) {
		if (line.startsWith("diff --git ")) {
			pushCurrentFile();
			currentFile = {
				path: parseDiffGitPath(line),
				headerLines: [line],
				hunks: [],
			};
			continue;
		}
		if (!currentFile) {
			continue;
		}
		if (line.startsWith("@@")) {
			pushCurrentHunk();
			sawHunk = true;
			const parsed = parseJjHunkHeader(line);
			currentHunk = {
				id: `${parsed.oldStart}:${parsed.oldLines}:${parsed.newStart}:${parsed.newLines}`,
				...parsed,
				lines: [line],
			};
			continue;
		}
		if (currentHunk) {
			currentHunk.lines.push(line);
			continue;
		}
		if (!sawHunk) {
			currentFile.headerLines.push(line);
			if (line.startsWith("+++ b/")) {
				currentFile.path = line.slice("+++ b/".length);
			}
		}
	}
	pushCurrentFile();
	return files;
}

function parseDiffGitPath(line: string): string {
	const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
	return match?.[2] ?? "";
}

function parseJjHunkHeader(header: string): Omit<JjPatchHunk, "id" | "lines"> {
	const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header);
	if (!match) {
		return { oldStart: 0, oldLines: 0, newStart: 0, newLines: 0 };
	}
	return {
		oldStart: Number.parseInt(match[1] ?? "0", 10),
		oldLines: Number.parseInt(match[2] ?? "1", 10),
		newStart: Number.parseInt(match[3] ?? "0", 10),
		newLines: Number.parseInt(match[4] ?? "1", 10),
	};
}

function hunkMatchesSelection(path: string, hunk: JjPatchHunk, selection: JjHunkSelection): boolean {
	if (selection.hunkId === hunk.id || selection.hunkId === `${path}:${hunk.id}`) {
		return true;
	}
	return (
		selection.oldStart === hunk.oldStart &&
		selection.oldLines === hunk.oldLines &&
		selection.newStart === hunk.newStart &&
		selection.newLines === hunk.newLines
	);
}

function toNeutralPreview(operation: NeutralOperation, preview: VcsPreviewOperationResult) {
	return {
		valid: preview.valid,
		operation,
		title: preview.title,
		summary: preview.description,
		risk: preview.risk,
		disabledReason: preview.valid ? null : preview.description,
		warnings: preview.diagnostics
			.filter((diagnostic) => diagnostic.level === "warning")
			.map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message })),
		conflicts: [],
		affectedStackIds: preview.affectedBookmarks,
		affectedCommitIds: preview.affectedChangeIds,
		affectedPaths: pathsFromOperation(operation),
		diagnostics: preview.diagnostics,
	};
}

function toNeutralApply(operation: NeutralOperation, result: VcsApplyOperationResult) {
	return {
		ok: result.ok,
		operation,
		title: result.title,
		summary: result.description,
		affectedStackIds: result.affectedBookmarks,
		affectedCommitIds: result.affectedChangeIds,
		affectedPaths: pathsFromOperation(operation),
		recovery: result.ok
			? null
			: {
					instructions: [
						"Review the JJ operation output and run `jj op log` or `jj op undo` if repository state needs recovery.",
					],
				},
		diagnostics: result.diagnostics,
	};
}

function unsupportedPreview(operation: NeutralOperation, reason: string) {
	return {
		valid: false,
		operation,
		title: "Preview unavailable",
		summary: reason,
		risk: "high" as const,
		disabledReason: reason,
		warnings: [],
		conflicts: [],
		affectedStackIds: stackIdsFromOperation(operation),
		affectedCommitIds: commitIdsFromOperation(operation),
		affectedPaths: pathsFromOperation(operation),
		diagnostics: [createDiagnostic("warning", "jj_workspace_operation_unsupported", reason)],
	};
}

function previewJjCommitEditModeOperation(
	operation: Extract<NeutralOperation, { kind: "begin_edit_commit" | "save_edit_commit" | "abort_edit_commit" }>,
) {
	switch (operation.kind) {
		case "begin_edit_commit":
			return {
				valid: true,
				operation,
				title: "Begin edit mode",
				summary: `Create a temporary edit commit above ${operation.targetCommitId}.`,
				risk: "medium" as const,
				disabledReason: null,
				warnings: [
					{
						code: "jj_edit_mode",
						message: "Do not create additional commits while edit mode is active. Use Save or Abort to exit.",
					},
				],
				conflicts: [],
				affectedStackIds: [],
				affectedCommitIds: [operation.targetCommitId],
				affectedPaths: [],
				diagnostics: [],
			};
		case "save_edit_commit":
			return {
				valid: true,
				operation,
				title: "Save edit mode",
				summary: operation.returnToCommitId
					? `Squash ${operation.editCommitId} into ${operation.targetCommitId} and return to ${operation.returnToCommitId}.`
					: `Squash ${operation.editCommitId} into ${operation.targetCommitId} and exit edit mode.`,
				risk: "high" as const,
				disabledReason: null,
				warnings: [],
				conflicts: [],
				affectedStackIds: [],
				affectedCommitIds: [
					operation.editCommitId,
					operation.targetCommitId,
					...(operation.returnToCommitId ? [operation.returnToCommitId] : []),
				],
				affectedPaths: [],
				diagnostics: [],
			};
		case "abort_edit_commit":
			return {
				valid: true,
				operation,
				title: "Abort edit mode",
				summary: operation.returnToCommitId
					? `Abandon temporary edit commit ${operation.editCommitId} and return to ${operation.returnToCommitId}.`
					: `Abandon temporary edit commit ${operation.editCommitId}.`,
				risk: "high" as const,
				disabledReason: null,
				warnings: [],
				conflicts: [],
				affectedStackIds: [],
				affectedCommitIds: [operation.editCommitId, ...(operation.returnToCommitId ? [operation.returnToCommitId] : [])],
				affectedPaths: [],
				diagnostics: [],
			};
	}
}

function jjTrackRemoteBookmarkArgs(operation: Extract<NeutralOperation, { kind: "track_remote_bookmark" }>): string[] {
	const remoteName = operation.remoteName?.trim();
	return ["bookmark", "track", ...(remoteName ? ["--remote", remoteName] : []), operation.bookmarkName];
}

function jjUntrackRemoteBookmarkArgs(operation: Extract<NeutralOperation, { kind: "untrack_remote_bookmark" }>): string[] {
	const remoteName = operation.remoteName?.trim();
	return ["bookmark", "untrack", ...(remoteName ? ["--remote", remoteName] : []), operation.bookmarkName];
}

function previewJjTrackRemoteBookmarkOperation(operation: Extract<NeutralOperation, { kind: "track_remote_bookmark" }>) {
	const remoteName = operation.remoteName?.trim();
	return {
		valid: true,
		operation,
		title: `Track remote bookmark ${operation.bookmarkName}`,
		summary: remoteName
			? `Start tracking ${operation.bookmarkName}@${remoteName} so its commits can be rewritten locally.`
			: `Start tracking remote bookmark ${operation.bookmarkName} so its commits can be rewritten locally.`,
		risk: "medium" as const,
		disabledReason: null,
		warnings: [],
		conflicts: [],
		affectedStackIds: [operation.bookmarkName],
		affectedCommitIds: [],
		affectedPaths: [],
		diagnostics: [],
	};
}

function previewJjUntrackRemoteBookmarkOperation(operation: Extract<NeutralOperation, { kind: "untrack_remote_bookmark" }>) {
	const remoteName = operation.remoteName?.trim();
	return {
		valid: true,
		operation,
		title: `Untrack remote bookmark ${operation.bookmarkName}`,
		summary: remoteName
			? `Stop tracking ${operation.bookmarkName}@${remoteName}. Its remote commits will become immutable until tracking is restored.`
			: `Stop tracking remote bookmark ${operation.bookmarkName}. Its remote commits will become immutable until tracking is restored.`,
		risk: "medium" as const,
		disabledReason: null,
		warnings: [
			{
				code: "jj_remote_bookmark_untrack",
				message: "Untracking a remote bookmark makes remote-only commits read-only until the bookmark is tracked again.",
			},
		],
		conflicts: [],
		affectedStackIds: [operation.bookmarkName],
		affectedCommitIds: [],
		affectedPaths: [],
		diagnostics: [],
	};
}

async function applyJjBeginEditCommitOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "begin_edit_commit" }>,
) {
	const result = await runner({
		command: "jj",
		args: ["new", "--insert-after", operation.targetCommitId, "-m", operation.message],
		cwd,
	});
	if (!result.ok) {
		return failedApply(operation, result.stderr.trim() || result.stdout.trim() || "Could not begin JJ edit mode.");
	}
	const editCommitId =
		parseCreatedJjChangeId(result.stdout) ??
		parseCreatedJjChangeId(result.stderr) ??
		(await resolveCurrentJjChangeId(cwd, runner)) ??
		"@";
	return successfulApply(
		operation,
		"Editing commit",
		`Created temporary edit commit ${editCommitId} above ${operation.targetCommitId}.`,
		[editCommitId, operation.targetCommitId],
	);
}

async function applyJjTrackRemoteBookmarkOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "track_remote_bookmark" }>,
) {
	const result = await runner({
		command: "jj",
		args: jjTrackRemoteBookmarkArgs(operation),
		cwd,
	});
	if (!result.ok) {
		return failedApply(operation, result.stderr.trim() || result.stdout.trim() || "Could not track JJ remote bookmark.");
	}
	const remoteName = operation.remoteName?.trim();
	return {
		ok: true,
		operation,
		title: "Tracking remote bookmark",
		summary: remoteName
			? `Started tracking ${operation.bookmarkName}@${remoteName}.`
			: `Started tracking remote bookmark ${operation.bookmarkName}.`,
		affectedStackIds: [operation.bookmarkName],
		affectedCommitIds: [],
		affectedPaths: [],
		recovery: null,
		diagnostics: [],
	};
}

async function applyJjUntrackRemoteBookmarkOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "untrack_remote_bookmark" }>,
) {
	const result = await runner({
		command: "jj",
		args: jjUntrackRemoteBookmarkArgs(operation),
		cwd,
	});
	if (!result.ok) {
		return failedApply(operation, result.stderr.trim() || result.stdout.trim() || "Could not untrack JJ remote bookmark.");
	}
	const remoteName = operation.remoteName?.trim();
	return {
		ok: true,
		operation,
		title: "Untracked remote bookmark",
		summary: remoteName
			? `Stopped tracking ${operation.bookmarkName}@${remoteName}.`
			: `Stopped tracking remote bookmark ${operation.bookmarkName}.`,
		affectedStackIds: [operation.bookmarkName],
		affectedCommitIds: [],
		affectedPaths: [],
		recovery: null,
		diagnostics: [],
	};
}

async function resolveCurrentJjChangeId(cwd: string, runner: VcsCommandRunner): Promise<string | null> {
	const result = await runner({
		command: "jj",
		args: ["log", "--ignore-working-copy", "--no-graph", "-r", "@", "-T", "change_id.short()"],
		cwd,
	});
	if (!result.ok) {
		return null;
	}
	return result.stdout.trim() || null;
}

async function applyJjSaveEditCommitOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "save_edit_commit" }>,
) {
	const result = await runner({
		command: "jj",
		args: ["squash", "--from", operation.editCommitId, "--into", operation.targetCommitId, "--use-destination-message"],
		cwd,
	});
	if (!result.ok) {
		return failedApply(operation, result.stderr.trim() || result.stdout.trim() || "Could not save JJ edit mode changes.");
	}
	const returnResult = await returnToJjCommitAfterEdit(cwd, runner, operation);
	if (returnResult) {
		return returnResult;
	}
	return successfulApply(
		operation,
		"Saved commit edits",
		operation.returnToCommitId
			? `Squashed ${operation.editCommitId} into ${operation.targetCommitId} and returned to ${operation.returnToCommitId}.`
			: `Squashed ${operation.editCommitId} into ${operation.targetCommitId}.`,
		[operation.editCommitId, operation.targetCommitId, ...(operation.returnToCommitId ? [operation.returnToCommitId] : [])],
	);
}

async function applyJjAbortEditCommitOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "abort_edit_commit" }>,
) {
	const result = await runner({
		command: "jj",
		args: ["abandon", operation.editCommitId],
		cwd,
	});
	if (!result.ok) {
		return failedApply(operation, result.stderr.trim() || result.stdout.trim() || "Could not abort JJ edit mode.");
	}
	const returnResult = await returnToJjCommitAfterEdit(cwd, runner, operation);
	if (returnResult) {
		return returnResult;
	}
	return successfulApply(
		operation,
		"Aborted commit edits",
		operation.returnToCommitId
			? `Abandoned temporary edit commit ${operation.editCommitId} and returned to ${operation.returnToCommitId}.`
			: `Abandoned temporary edit commit ${operation.editCommitId}.`,
		[operation.editCommitId, ...(operation.returnToCommitId ? [operation.returnToCommitId] : [])],
	);
}

async function returnToJjCommitAfterEdit(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "save_edit_commit" | "abort_edit_commit" }>,
) {
	const returnToCommitId = operation.returnToCommitId?.trim();
	if (!returnToCommitId) {
		return null;
	}
	const result = await runner({
		command: "jj",
		args: ["edit", returnToCommitId],
		cwd,
	});
	if (result.ok) {
		return null;
	}
	const reason = result.stderr.trim() || result.stdout.trim() || `Run jj edit ${returnToCommitId} to return to the workspace commit.`;
	return failedApplyWithRecovery(operation, reason, [
		`The edit operation completed, but Changeyard could not return to ${returnToCommitId}.`,
		`Run \`jj edit ${returnToCommitId}\` to return to the workspace commit.`,
		"Run `jj op log` or `jj op undo` if the repository state needs recovery.",
	]);
}

function previewJjCheckoutCommitOperation(operation: Extract<NeutralOperation, { kind: "checkout_commit" }>) {
	return {
		valid: true,
		operation,
		title: "Checkout commit",
		summary: `Move the JJ working-copy commit to ${operation.commitId}.`,
		risk: "low" as const,
		disabledReason: null,
		warnings: [],
		conflicts: [],
		affectedStackIds: [],
		affectedCommitIds: [operation.commitId],
		affectedPaths: [],
		diagnostics: [],
	};
}

async function applyJjCheckoutCommitOperation(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "checkout_commit" }>,
) {
	const result = await runner({
		command: "jj",
		args: ["edit", operation.commitId],
		cwd,
	});
	if (!result.ok) {
		return failedApply(operation, result.stderr.trim() || result.stdout.trim() || `Could not checkout ${operation.commitId}.`);
	}
	return successfulApply(operation, "Checked out commit", `Moved the JJ working copy to ${operation.commitId}.`, [operation.commitId]);
}

async function workspaceMembershipPreview(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "apply_stack" | "unapply_stack" }>,
) {
	const action = operation.kind === "apply_stack" ? "Apply stack" : "Unapply stack";
	const membership = await resolveJjWorkspaceMembership(cwd, runner, operation);
	if (!membership.ok) {
		return unsupportedPreview(operation, membership.reason);
	}
	return {
		valid: true,
		operation,
		title: action,
		summary: membership.noop
			? `${operation.stackId} is already ${operation.kind === "apply_stack" ? "applied to" : "removed from"} the JJ workspace merge.`
			: `${action} ${operation.stackId} by rebasing the working-copy change onto ${membership.nextParentChangeIds.join(", ")}.`,
		risk: "medium" as const,
		disabledReason: null,
		warnings: [
			{
				code: "jj_workspace_merge_rebase",
				message: "This rewrites the working-copy change parents to update the JJ workspace merge.",
			},
		],
		conflicts: [],
		affectedStackIds: [operation.stackId],
		affectedCommitIds: [membership.targetChangeId],
		affectedPaths: [],
		diagnostics: [],
	};
}

async function workspaceMembershipApply(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "apply_stack" | "unapply_stack" }>,
) {
	const action = operation.kind === "apply_stack" ? "Applied stack" : "Unapplied stack";
	const membership = await resolveJjWorkspaceMembership(cwd, runner, operation);
	if (!membership.ok) {
		return unsupportedApply(operation, membership.reason);
	}
	if (!membership.noop) {
		const applyResult = await runner({
			command: "jj",
			args: ["rebase", "-r", "@", ...membership.nextParentChangeIds.flatMap((changeId) => ["-o", changeId])],
			cwd: membership.repoCwd,
		});
		if (!applyResult.ok) {
			return failedApply(
				operation,
				applyResult.stderr.trim() || applyResult.stdout.trim() || `Could not ${operation.kind.replace("_", " ")}.`,
			);
		}
	}
	return {
		ok: true,
		operation,
		title: action,
		summary: membership.noop
			? `${operation.stackId} was already ${operation.kind === "apply_stack" ? "applied to" : "removed from"} the JJ workspace merge.`
			: `${action} ${operation.stackId} in the JJ workspace merge.`,
		affectedStackIds: [operation.stackId],
		affectedCommitIds: [membership.targetChangeId],
		affectedPaths: [],
		recovery: null,
		diagnostics: [],
	};
}

async function resolveJjWorkspaceMembership(
	cwd: string,
	runner: VcsCommandRunner,
	operation: Extract<NeutralOperation, { kind: "apply_stack" | "unapply_stack" }>,
): Promise<
	| { ok: true; repoCwd: string; targetChangeId: string; nextParentChangeIds: string[]; noop: boolean }
	| { ok: false; reason: string }
> {
	const state = await loadJjWorkspaceState(cwd, runner);
	if (state.provider !== "jj") {
		return { ok: false, reason: "JJ workspace stack membership is only available inside a JJ repository." };
	}
	const stack = state.stacks.find((candidate) => candidate.stackId === operation.stackId);
	const targetChangeId = stack?.headCommitId ?? stack?.commits.at(-1)?.commitId ?? null;
	if (!targetChangeId) {
		return { ok: false, reason: `Could not resolve stack ${operation.stackId} to a JJ change.` };
	}
	if (operation.kind === "apply_stack" && state.headId === targetChangeId) {
		return {
			ok: true,
			repoCwd: state.projectId,
			targetChangeId,
			nextParentChangeIds: [],
			noop: true,
		};
	}
	const parents = await readCurrentJjParentChanges(state.projectId, runner);
	if (!parents.ok) {
		return parents;
	}
	if (operation.kind === "apply_stack") {
		const nextParentChangeIds = [...new Set([...parents.parentChangeIds, targetChangeId])];
		return {
			ok: true,
			repoCwd: state.projectId,
			targetChangeId,
			nextParentChangeIds,
			noop: nextParentChangeIds.length === parents.parentChangeIds.length,
		};
	}
	const nextParentChangeIds = parents.parentChangeIds.filter((parentChangeId) => parentChangeId !== targetChangeId);
	if (nextParentChangeIds.length === parents.parentChangeIds.length) {
		return {
			ok: true,
			repoCwd: state.projectId,
			targetChangeId,
			nextParentChangeIds,
			noop: true,
		};
	}
	if (nextParentChangeIds.length === 0) {
		return { ok: false, reason: `Cannot unapply ${operation.stackId} because it is the only JJ workspace parent.` };
	}
	return {
		ok: true,
		repoCwd: state.projectId,
		targetChangeId,
		nextParentChangeIds,
		noop: false,
	};
}

async function readCurrentJjParentChanges(
	cwd: string,
	runner: VcsCommandRunner,
): Promise<{ ok: true; parentChangeIds: string[] } | { ok: false; reason: string }> {
	const result = await runner({
		command: "jj",
		args: ["log", "--ignore-working-copy", "--no-graph", "-r", "@-", "-T", 'change_id.short() ++ "\\n"'],
		cwd,
	});
	if (!result.ok) {
		return {
			ok: false,
			reason: result.stderr.trim() || "Could not resolve the current JJ workspace parents.",
		};
	}
	const parentChangeIds = result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (parentChangeIds.length === 0) {
		return { ok: false, reason: "The current JJ workspace change has no parent to rebase." };
	}
	return { ok: true, parentChangeIds };
}

function unsupportedApply(operation: NeutralOperation, reason: string) {
	return withNoCacheUpdate({
		ok: false,
		operation,
		title: "Operation unavailable",
		summary: reason,
		affectedStackIds: stackIdsFromOperation(operation),
		affectedCommitIds: commitIdsFromOperation(operation),
		affectedPaths: pathsFromOperation(operation),
		recovery: {
			instructions: ["No repository changes were attempted."],
		},
		diagnostics: [createDiagnostic("warning", "jj_workspace_operation_unsupported", reason)],
	});
}

function failedApply(operation: NeutralOperation, reason: string) {
	return withNoCacheUpdate({
		ok: false,
		operation,
		title: "Operation failed",
		summary: reason,
		affectedStackIds: stackIdsFromOperation(operation),
		affectedCommitIds: commitIdsFromOperation(operation),
		affectedPaths: pathsFromOperation(operation),
		recovery: {
			instructions: [
				"Review the JJ operation output and run `jj op log` or `jj op undo` if repository state needs recovery.",
			],
		},
		diagnostics: [createDiagnostic("error", "jj_workspace_operation_failed", reason)],
	});
}

function failedApplyWithRecovery(operation: NeutralOperation, reason: string, instructions: string[]) {
	return withNoCacheUpdate({
		ok: false,
		operation,
		title: "Operation failed",
		summary: reason,
		affectedStackIds: stackIdsFromOperation(operation),
		affectedCommitIds: commitIdsFromOperation(operation),
		affectedPaths: pathsFromOperation(operation),
		recovery: {
			instructions,
		},
		diagnostics: [createDiagnostic("error", "jj_workspace_operation_failed", reason)],
	});
}

function successfulApply(operation: NeutralOperation, title: string, summary: string, affectedCommitIds: string[]) {
	return withWorkspaceCacheFallback({
		ok: true,
		operation,
		title,
		summary,
		affectedStackIds: stackIdsFromOperation(operation),
		affectedCommitIds,
		affectedPaths: pathsFromOperation(operation),
		recovery: null,
		diagnostics: [],
	});
}

function stackIdsFromOperation(operation: NeutralOperation): string[] {
	switch (operation.kind) {
		case "apply_stack":
		case "unapply_stack":
			return [operation.stackId];
		case "create_commit":
			return [operation.stackId];
		case "rename_stack":
			return [operation.stackId, operation.name];
		case "delete_stack":
		case "squash_stack":
			return [operation.stackId];
		case "move_commit":
			return [operation.targetStackId];
		case "uncommit_changes":
			return operation.targetStackId ? [operation.targetStackId] : [];
		case "create_stack":
		case "begin_edit_commit":
		case "add_empty_commit":
		case "create_bookmark":
		case "save_edit_commit":
		case "abort_edit_commit":
		case "track_remote_bookmark":
		case "untrack_remote_bookmark":
		case "checkout_commit":
		case "abandon_commit":
		case "reword_commit":
		case "amend_commit":
		case "split_commit":
		case "squash_commits":
		case "move_changes":
		case "restore_changes":
		case "discard_changes":
		case "undo":
		case "redo":
			return [];
	}
}

function commitIdsFromOperation(operation: NeutralOperation): string[] {
	switch (operation.kind) {
		case "begin_edit_commit":
			return [operation.targetCommitId];
		case "save_edit_commit":
			return [operation.editCommitId, operation.targetCommitId, ...(operation.returnToCommitId ? [operation.returnToCommitId] : [])];
		case "abort_edit_commit":
			return [operation.editCommitId, ...(operation.returnToCommitId ? [operation.returnToCommitId] : [])];
		case "track_remote_bookmark":
		case "untrack_remote_bookmark":
			return [];
		case "add_empty_commit":
		case "create_bookmark":
			return [operation.targetCommitId];
		case "checkout_commit":
		case "abandon_commit":
			return [operation.commitId];
		case "reword_commit":
		case "amend_commit":
		case "split_commit":
			return [operation.commitId];
		case "squash_commits":
			return [operation.sourceCommitId, operation.targetCommitId];
		case "move_commit":
			return [operation.commitId];
		case "move_changes":
			return [
				...(operation.selection.commitId ? [operation.selection.commitId] : []),
				operation.targetCommitId,
			];
		case "uncommit_changes":
			return operation.selection.commitId ? [operation.selection.commitId] : [];
		case "restore_changes":
		case "discard_changes":
			return operation.selection.source === "commit" && operation.selection.commitId ? [operation.selection.commitId] : [];
		case "apply_stack":
		case "unapply_stack":
		case "create_stack":
		case "create_commit":
		case "rename_stack":
		case "delete_stack":
		case "squash_stack":
		case "undo":
		case "redo":
			return [];
	}
}

function pathsFromOperation(operation: NeutralOperation): string[] {
	if ("selection" in operation && operation.selection) {
		return [
			...(operation.selection.paths ?? []),
			...(operation.selection.hunks ?? []).map((hunk) => hunk.path),
		];
	}
	return [];
}
