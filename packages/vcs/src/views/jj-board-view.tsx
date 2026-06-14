import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import { AlertTriangle, Check, FileText, Folder, FolderTree, GitBranch, Info, List, LockKeyhole, MoreHorizontal, PanelLeft, Pencil, PencilLine, Play, RotateCcw, Sparkles, Upload, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";

import {
	applyWorkspaceStackId,
	groupStackChangesByHead,
	selectActiveAppliedStackIds,
	selectAppliedWorkspaceStacks,
	unapplyWorkspaceStackId,
	type BranchesStack,
	type BranchesStackChange,
	type StackChangeGroup,
} from "@/branches-stack-model";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { CopyValueButton } from "@/components/ui/copy-value-button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { FileStatusGlyph, StatusChip } from "@/components/ui/status-chip";
import {
	findFileByPath,
	getFirstFilePath,
	VcsCollapsedColumn,
	VcsColumn,
	VcsFileDiffColumn,
	VcsInlineFileSection,
	type VcsDiffHunkDragPayload,
	type VcsFileChange,
} from "@/components/vcs-file-columns";
import { useVcsDiagnosticsToasts } from "@/components/vcs-diagnostics-toasts";
import { EmptyState, QueryGate } from "@/components/vcs-panels";
import { KeyValue } from "@/components/vcs-panels";
import { NoProjectSelected, SelectProjectButton, VcsShell, type VcsShellProjectState } from "@/components/vcs-shell";
import type {
	QueryState,
	RuntimeGitCommitDiffResponse,
	RuntimeProjectConfigResponse,
	RuntimeProjectConfigUpdateRequest,
} from "@/runtime/types";
import {
	toRuntimeQueryState,
	useApplyVcsOperationMutation,
	useGetProjectConfigQuery,
	useGetRepositoryCommitDiffQuery,
	useLazyPreviewVcsOperationQuery,
	useUpdateProjectConfigMutation,
} from "@/runtime/vcs-api";
import { buildFileTree, type FileTreeNode } from "@/utils/file-tree";
import {
	readVcsBooleanPreference,
	readVcsFileViewMode,
	readVcsNumberPreference,
	VCS_LAYOUT_STORAGE_KEYS,
	writeVcsBooleanPreference,
	writeVcsFileViewMode,
	writeVcsNumberPreference,
	type VcsFileViewMode,
} from "@/utils/vcs-ui-preferences";
import { readVcsQueryParam, useVcsRouter } from "@/utils/vcs-router";
import {
	createVcsWorkspaceCreateCommitOperationFromDrop,
	createValidatedVcsWorkspaceOperationFromDrop,
	describeVcsWorkspaceDropTarget,
	parseVcsWorkspaceDragPayload,
	serializeVcsWorkspaceDragPayload,
	VCS_WORKSPACE_DRAG_MIME,
	type VcsWorkspaceDragPayload,
	type VcsWorkspaceDropTarget,
} from "@/vcs-workspace-dnd";
import {
	areVcsWorkspaceOperationsEqual,
	isLowRiskVcsWorkspaceOperation,
	type VcsChangeSelection,
	type VcsDiffResult,
	type VcsOperationPreview,
	type VcsWorkspaceConflict,
	type VcsWorkspaceOperation,
	type VcsWorkspaceState,
} from "@/vcs-workspace-contracts";

const SELECTED_CHANGE_MARKER_CLASS =
	"relative before:absolute before:left-0 before:top-1/2 before:h-12 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:content-['']";

const WORKSPACE_COLUMN_LIMITS = {
	unstaged: { min: 240, max: 520, fallback: 300, key: VCS_LAYOUT_STORAGE_KEYS.workspaceUnstagedWidth },
	stack: { min: 320, max: 680, fallback: 380 },
	diff: { min: 420, max: 980, fallback: 640, key: VCS_LAYOUT_STORAGE_KEYS.branchesDiffWidth },
} as const;
const WORKSPACE_TRAILING_SPACER_WIDTH = WORKSPACE_COLUMN_LIMITS.diff.fallback;
const EMPTY_CONFLICT_PATHS = new Set<string>();

function stackColumnWidthKey(stackId: string): string {
	return `changeyard.vcs.workspace.stack.${stackId}.width`;
}

function stackColumnCollapsedKey(stackId: string): string {
	return `changeyard.vcs.workspace.stack.${stackId}.collapsed`;
}

function toFileChanges(diffState: QueryState<RuntimeGitCommitDiffResponse>): VcsFileChange[] {
	if (diffState.status !== "ready" || !diffState.data.ok) {
		return [];
	}
	return diffState.data.files;
}

function writeDragPayload(event: ReactDragEvent<HTMLElement>, payload: VcsWorkspaceDragPayload): void {
	event.dataTransfer.effectAllowed = "move";
	event.dataTransfer.setData(VCS_WORKSPACE_DRAG_MIME, serializeVcsWorkspaceDragPayload(payload));
	event.dataTransfer.setData("text/plain", payload.kind);
}

function readDragPayload(event: ReactDragEvent<HTMLElement>): VcsWorkspaceDragPayload | null {
	const raw = event.dataTransfer.getData(VCS_WORKSPACE_DRAG_MIME);
	return raw ? parseVcsWorkspaceDragPayload(raw) : null;
}

type WorkspaceDropTargetState = "idle" | "valid" | "invalid";

type CommitEditModeState = {
	target: BranchesStackChange;
	editCommitId: string;
	returnToCommitId: string;
	appliedStackIdsSnapshot: string[];
	files: VcsFileChange[];
	isSaving: boolean;
	error: string | null;
};

type ImmutableRemoteBookmarkInfo = {
	bookmarkName: string;
	remoteName?: string;
	remoteBookmark: string;
	reason: string;
};

type ImmutableCommitPromptState = ImmutableRemoteBookmarkInfo & {
	change: BranchesStackChange;
	actionLabel: string;
};

type StackRemoteBookmarkActionInfo = {
	bookmarkName: string;
	remoteName?: string;
	remoteBookmark: string;
};

function workspaceDropTargetKey(target: VcsWorkspaceDropTarget): string {
	switch (target.kind) {
		case "workspace":
		case "working_copy":
			return target.kind;
		case "stack":
			return `stack:${target.stackId}`;
		case "stack_header":
			return `stack-header:${target.stackId}`;
		case "commit":
			return `commit:${target.commitId}`;
	}
}

function workspaceCommitDropTargetInstanceKey(headBookmarkName: string, groupIndex: number, change: BranchesStackChange): string {
	return `commit:${headBookmarkName}:${groupIndex}:${change.changeId}`;
}

function workspaceStackHeaderDropTargetInstanceKey(stackId: string, headBookmarkName: string, groupIndex: number): string {
	return `stack-header-card:${stackId}:${headBookmarkName}:${groupIndex}`;
}

function workspaceDropTargetClassName(state: WorkspaceDropTargetState): string | null {
	if (state === "valid") {
		return "ring-2 ring-accent/70 ring-offset-1 ring-offset-surface-0";
	}
	if (state === "invalid") {
		return "cursor-not-allowed ring-2 ring-status-red/80 ring-offset-1 ring-offset-surface-0";
	}
	return null;
}

function workspaceDropTargetOverlayClassName(state: WorkspaceDropTargetState): string | null {
	if (state === "valid") {
		return "relative after:pointer-events-none after:absolute after:inset-1 after:rounded-md after:border-2 after:border-dashed after:border-accent/80 after:bg-accent/10 after:content-['']";
	}
	if (state === "invalid") {
		return "relative cursor-not-allowed after:pointer-events-none after:absolute after:inset-1 after:rounded-md after:border-2 after:border-dashed after:border-status-red/80 after:bg-status-red/10 after:content-['']";
	}
	return null;
}

function workspaceCommitDropTargetClassName(state: WorkspaceDropTargetState): string | null {
	return workspaceDropTargetOverlayClassName(state);
}

type StackCommitComposerState = {
	stackId: string;
	selection: VcsChangeSelection | null;
	title: string;
	body: string;
	error: string | null;
};

function firstSelectionPath(selection: { paths?: string[]; hunks?: Array<{ path: string }> }): string | null {
	return selection.paths?.find((path) => path.trim()) ?? selection.hunks?.find((hunk) => hunk.path.trim())?.path ?? null;
}

function countPatchLineChanges(patch: string): { additions: number; deletions: number } {
	let additions = 0;
	let deletions = 0;
	let inHunk = false;
	for (const line of patch.split("\n")) {
		if (line.startsWith("@@")) {
			inHunk = true;
			continue;
		}
		if (!inHunk) {
			continue;
		}
		if (line.startsWith("diff --git ")) {
			inHunk = false;
			continue;
		}
		if (line.startsWith("+++") || line.startsWith("---")) {
			continue;
		}
		if (line.startsWith("+")) {
			additions += 1;
		} else if (line.startsWith("-")) {
			deletions += 1;
		}
	}
	return { additions, deletions };
}

function parseWorkingCopyPatchFiles(patch: string): VcsFileChange[] {
	const patchSegments = patch.split(/^diff --git /m);
	const files: VcsFileChange[] = [];
	for (const segment of patchSegments) {
		if (!segment.trim()) {
			continue;
		}
		const fullPatch = `diff --git ${segment}`;
		const headerMatch = fullPatch.match(/^diff --git a\/(.+) b\/(.+)$/m);
		if (!headerMatch?.[1] || !headerMatch[2]) {
			continue;
		}
		let previousPath: string | undefined = headerMatch[1] !== headerMatch[2] ? headerMatch[1] : undefined;
		let path = headerMatch[2];
		let status: VcsFileChange["status"] = "modified";
		const renameFromMatch = fullPatch.match(/^rename from (.+)$/m);
		const renameToMatch = fullPatch.match(/^rename to (.+)$/m);
		if (renameFromMatch?.[1] && renameToMatch?.[1]) {
			status = "renamed";
			previousPath = renameFromMatch[1];
			path = renameToMatch[1];
		} else if (/^new file mode /m.test(fullPatch)) {
			status = "added";
		} else if (/^deleted file mode /m.test(fullPatch)) {
			status = "deleted";
		}
		const { additions, deletions } = countPatchLineChanges(fullPatch);
		files.push({ path, previousPath, status, additions, deletions, patch: fullPatch });
	}
	return files;
}

function toWorkingCopyDiffFiles(diffState: QueryState<VcsDiffResult>): VcsFileChange[] {
	if (diffState.status !== "ready") {
		return [];
	}
	const patchFiles = parseWorkingCopyPatchFiles(diffState.data.patch);
	if (patchFiles.length > 0) {
		return patchFiles;
	}
	return diffState.data.files.map((file) => ({
		path: file.path,
		previousPath: file.previousPath ?? undefined,
		status: file.status,
		additions: file.additions,
		deletions: file.deletions,
	}));
}

function authorInitials(name: string | null): string {
	const trimmed = name?.trim();
	if (!trimmed) {
		return "?";
	}
	const parts = trimmed.split(/\s+/).filter(Boolean);
	const first = parts[0]?.[0] ?? "";
	const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
	return `${first}${second}`.toUpperCase() || "?";
}

function metadataString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value : null;
}

function metadataStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function parseRemoteBookmarkName(remoteBookmark: string): { bookmarkName: string; remoteName: string } | null {
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

function getImmutableRemoteBookmarkInfo(change: BranchesStackChange): ImmutableRemoteBookmarkInfo | null {
	const reason = change.immutableReason?.trim() || null;
	const remoteBookmark = change.untrackedRemoteBookmarks?.find((bookmark) => bookmark.trim().length > 0) ?? null;
	if (!reason || !remoteBookmark) {
		return null;
	}
	const parsed = parseRemoteBookmarkName(remoteBookmark);
	return {
		bookmarkName: parsed?.bookmarkName ?? remoteBookmark,
		remoteName: parsed?.remoteName,
		remoteBookmark,
		reason,
	};
}

function findStackRemoteBookmarkInfo(
	changes: readonly BranchesStackChange[],
	bookmarkName: string,
	metadataKey: "trackedRemoteBookmarks" | "untrackedRemoteBookmarks",
): StackRemoteBookmarkActionInfo | null {
	const normalizedBookmarkName = bookmarkName.trim();
	if (!normalizedBookmarkName) {
		return null;
	}
	for (const change of changes) {
		for (const remoteBookmark of change[metadataKey] ?? []) {
			const parsed = parseRemoteBookmarkName(remoteBookmark);
			const candidateBookmarkName = parsed?.bookmarkName ?? remoteBookmark;
			if (candidateBookmarkName !== normalizedBookmarkName) {
				continue;
			}
			return {
				bookmarkName: normalizedBookmarkName,
				remoteName: parsed?.remoteName,
				remoteBookmark,
			};
		}
	}
	return null;
}

function getStackRemoteBookmarkActions(group: StackChangeGroup): {
	tracked: StackRemoteBookmarkActionInfo | null;
	untracked: StackRemoteBookmarkActionInfo | null;
} {
	return {
		tracked: findStackRemoteBookmarkInfo(group.changes, group.head.bookmarkName, "trackedRemoteBookmarks"),
		untracked: findStackRemoteBookmarkInfo(group.changes, group.head.bookmarkName, "untrackedRemoteBookmarks"),
	};
}

function toUiFileChange(file: VcsWorkspaceState["workingCopy"]["files"][number]): VcsFileChange {
	return {
		path: file.path,
		previousPath: file.previousPath ?? undefined,
		status: file.status,
		additions: file.additions,
		deletions: file.deletions,
	};
}

function toWorkspaceBoardStacks(data: VcsWorkspaceState): BranchesStack[] {
	return data.stacks.map((stack, index) => {
		const changes = stack.commits.map((commit) => {
			const commitHash = metadataString(commit.metadata?.commitHash) ?? commit.displayId ?? commit.commitId;
			const bookmarks = data.provider === "git" ? [stack.name] : [];
			const metadataBookmarks = Array.isArray(commit.metadata?.bookmarks) ? commit.metadata.bookmarks : bookmarks;
			const remoteBookmarks = metadataStringArray(commit.metadata?.remoteBookmarks);
			return {
				id: commit.commitId,
				changeId: commit.commitId,
				commitId: commitHash,
				title: commit.title,
				authorName: commit.authorName,
				authorEmail: commit.authorEmail,
				authorAvatarUrl: commit.authorAvatarUrl,
				bookmarks: metadataBookmarks,
				remoteBookmarks,
				trackedRemoteBookmarks: metadataStringArray(commit.metadata?.trackedRemoteBookmarks),
				untrackedRemoteBookmarks: metadataStringArray(commit.metadata?.untrackedRemoteBookmarks),
				immutableReason: metadataString(commit.metadata?.immutableReason),
				isCurrent: commit.isCurrent,
				isHead: commit.isHead,
			};
		});
		const headCommits = stack.commits.filter((commit) => commit.isHead);
		const fallbackHead = stack.commits.at(-1) ?? null;
		const heads = (headCommits.length > 0 ? headCommits : fallbackHead ? [fallbackHead] : []).map((commit) => ({
			id: `${stack.stackId}:${commit.commitId}`,
			bookmarkName: stack.name,
			changeId: commit.commitId,
			commitId: metadataString(commit.metadata?.commitHash) ?? commit.displayId ?? commit.commitId,
			title: commit.title,
			isCheckedOut: commit.isCurrent,
		}));
		return {
			id: stack.stackId,
			tip: stack.targetRef ?? stack.headCommitId ?? stack.stackId,
			base: stack.baseRef ?? data.targetRef,
			order: index,
			isCheckedOut: stack.isCurrent,
			heads,
			changes,
		};
	});
}

export function WorkspaceView({
	state,
	diffState,
	currentPath,
	projectState,
	workspaceId,
}: {
	state: QueryState<VcsWorkspaceState>;
	diffState: QueryState<VcsDiffResult>;
	currentPath: string;
	projectState: VcsShellProjectState;
	workspaceId: string | null;
	}): React.ReactElement {
		const projectConfigResult = useGetProjectConfigQuery({ workspaceId: workspaceId ?? "" }, { skip: !workspaceId });
		const [updateProjectConfig] = useUpdateProjectConfigMutation();
		const projectConfigQuery = {
		state: toRuntimeQueryState<RuntimeProjectConfigResponse>(projectConfigResult, "Failed to load project configuration."),
	};

	return (
		<VcsShell
			projectState={projectState}
			currentPath={currentPath}
			title="Workspace"
			subtitle="Applied stack lanes and working-copy changes"
			kicker={<StatusChip label="Read only" tone="blue" />}
		>
			{!workspaceId ? (
				<NoProjectSelected action={<SelectProjectButton onClick={projectState.onAddProject} />}>
					Select a project to show applied workspace stacks.
				</NoProjectSelected>
			) : (
				<QueryGate
					state={state}
					loading="Loading workspace."
					loadingFallback={<WorkspacePageSkeleton />}
					errorTitle="Workspace failed"
				>
					{(data) => (
						<QueryGate
							state={projectConfigQuery.state}
							loading="Loading workspace configuration."
							loadingFallback={<WorkspacePageSkeleton />}
							errorTitle="Workspace configuration failed"
						>
							{(projectConfig) => (
								<WorkspaceReady
									data={data}
									diffState={diffState}
									projectConfig={projectConfig}
									updateProjectConfig={(input) =>
										updateProjectConfig({
											workspaceId,
											input,
										}).unwrap()
									}
									workspaceId={workspaceId}
								/>
							)}
						</QueryGate>
					)}
				</QueryGate>
			)}
		</VcsShell>
	);
}

function WorkspacePageSkeleton(): React.ReactElement {
	return (
		<div className="h-full min-h-0 overflow-hidden bg-surface-0 p-3">
			<div className="flex h-full min-h-0 gap-3">
				<section className="flex h-full min-h-0 w-[300px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
					<header className="flex h-12 shrink-0 items-center gap-2 border-b border-divider px-3">
						<div className="kb-skeleton h-4 w-4 rounded" />
						<div className="kb-skeleton h-4 w-24" />
						<div className="kb-skeleton ml-auto h-5 w-7 rounded-full" />
					</header>
					<div className="grid gap-2 p-3">
						{Array.from({ length: 5 }, (_, index) => (
							<div key={index} className="flex items-center gap-2">
								<div className="kb-skeleton h-4 w-4 rounded" />
								<div className="kb-skeleton h-4 min-w-0 flex-1" />
							</div>
						))}
					</div>
				</section>
				{Array.from({ length: 2 }, (_, laneIndex) => (
					<section
						key={laneIndex}
						className="flex h-full min-h-0 w-[380px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
					>
						<header className="flex h-10 shrink-0 items-center gap-2 border-b border-divider px-3">
							<div className="kb-skeleton h-4 w-4 rounded" />
							<div className="kb-skeleton h-4 w-44" />
							<div className="kb-skeleton ml-auto h-6 w-6 rounded" />
						</header>
						<div className="min-h-0 flex-1 bg-[radial-gradient(circle,_rgba(125,125,125,0.18)_1px,_transparent_1px)] [background-size:10px_10px] p-3">
							<div className="mb-3 h-11 rounded-lg border border-dashed border-border bg-surface-0/80" />
							<div className="rounded-lg border border-border bg-surface-0">
								<div className="border-b border-divider p-3">
									<div className="kb-skeleton h-5 w-48" />
									<div className="kb-skeleton mt-2 h-3 w-24" />
								</div>
								<div className="border-b border-divider bg-surface-1 p-2">
									<div className="kb-skeleton h-7 w-28" />
								</div>
								<div className="grid gap-3 p-3">
									{Array.from({ length: 3 }, (_, rowIndex) => (
										<div key={rowIndex} className="flex items-center gap-3">
											<div className="kb-skeleton h-3 w-3 rotate-45 rounded-[2px]" />
											<div className="kb-skeleton h-5 w-5 rounded-full" />
											<div className="kb-skeleton h-4 min-w-0 flex-1" />
										</div>
									))}
								</div>
							</div>
						</div>
					</section>
				))}
			</div>
		</div>
	);
}

function WorkspaceReady({
	data,
	diffState,
	projectConfig,
	updateProjectConfig,
	workspaceId,
}: {
	data: VcsWorkspaceState;
	diffState: QueryState<VcsDiffResult>;
	projectConfig: RuntimeProjectConfigResponse;
	updateProjectConfig: (input: RuntimeProjectConfigUpdateRequest) => Promise<RuntimeProjectConfigResponse>;
	workspaceId: string;
}): React.ReactElement {
	const [applyVcsOperation] = useApplyVcsOperationMutation();
	const [previewVcsOperation, previewResult] = useLazyPreviewVcsOperationQuery();
	const [applyPreviewedVcsOperation] = useApplyVcsOperationMutation();
	const { location, setQueryParam } = useVcsRouter();
	function readQueryParam(name: string): string | null {
		return readVcsQueryParam(location.search, name);
	}
	function writeQueryParam(name: string, value: string | null): void {
		setQueryParam(name, value, { replace: true });
	}
	function readWorkingCopyFileQueryParam(): string | null {
		return readQueryParam("workingCopyFile") ?? readQueryParam("unstagedFile");
	}
	function writeWorkingCopyFileQueryParam(value: string | null): void {
		writeQueryParam("workingCopyFile", value);
		writeQueryParam("unstagedFile", null);
	}
	useVcsDiagnosticsToasts(
		data.conflicts.map((conflict) => ({
			level: "warning" as const,
			code: conflict.id,
			message: conflict.message,
		})),
		"workspace",
	);
	const [updatingStackId, setUpdatingStackId] = useState<string | null>(null);
	const [fileViewMode, setFileViewMode] = useState<VcsFileViewMode>(() => readVcsFileViewMode());
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(() => readQueryParam("commit"));
	const [selectedFilePath, setSelectedFilePath] = useState<string | null>(() => readQueryParam("file"));
	const [selectedUnstagedFilePath, setSelectedUnstagedFilePath] = useState<string | null>(() => readWorkingCopyFileQueryParam());
	const [selectedComposerDiffStackId, setSelectedComposerDiffStackId] = useState<string | null>(null);
	const [hasUserClearedFile, setHasUserClearedFile] = useState(false);
	const [isFileSectionCollapsed, setFileSectionCollapsed] = useState(false);
	const [isUnstagedCollapsed, setUnstagedCollapsed] = useState(() =>
		readVcsBooleanPreference(VCS_LAYOUT_STORAGE_KEYS.workspaceWorkingCopyCollapsed, false),
	);
	const [collapsedStackIds, setCollapsedStackIds] = useState<Record<string, boolean>>({});
	const [stackColumnWidths, setStackColumnWidths] = useState<Record<string, number>>({});
	const [pendingOperation, setPendingOperation] = useState<VcsWorkspaceOperation | null>(null);
	const [commitEdit, setCommitEdit] = useState<{ commitId: string; title: string } | null>(null);
	const [commitEditMode, setCommitEditMode] = useState<CommitEditModeState | null>(null);
	const [immutableCommitPrompt, setImmutableCommitPrompt] = useState<ImmutableCommitPromptState | null>(null);
	const [stackCommitComposer, setStackCommitComposer] = useState<StackCommitComposerState | null>(null);
	const [operationApplyError, setOperationApplyError] = useState<string | null>(null);
	const [isApplyingPreviewedOperation, setApplyingPreviewedOperation] = useState(false);
	const [activeDragPayload, setActiveDragPayload] = useState<VcsWorkspaceDragPayload | null>(null);
	const [activeDropTarget, setActiveDropTarget] = useState<{ key: string; state: WorkspaceDropTargetState } | null>(null);
	const [unstagedColumnWidth, setUnstagedColumnWidth] = useState(() =>
		readVcsNumberPreference(
			WORKSPACE_COLUMN_LIMITS.unstaged.key,
			WORKSPACE_COLUMN_LIMITS.unstaged.fallback,
			WORKSPACE_COLUMN_LIMITS.unstaged.min,
			WORKSPACE_COLUMN_LIMITS.unstaged.max,
		),
	);
	const [diffColumnWidth, setDiffColumnWidth] = useState(() =>
		readVcsNumberPreference(
			WORKSPACE_COLUMN_LIMITS.diff.key,
			WORKSPACE_COLUMN_LIMITS.diff.fallback,
			WORKSPACE_COLUMN_LIMITS.diff.min,
			WORKSPACE_COLUMN_LIMITS.diff.max,
		),
	);
	const stacks = useMemo(() => toWorkspaceBoardStacks(data), [data]);
	const changesByChangeId = useMemo(() => {
		const changes = new Map<string, BranchesStackChange>();
		for (const stack of stacks) {
			for (const change of stack.changes) {
				changes.set(change.changeId, change);
			}
		}
		return changes;
	}, [stacks]);
	const appliedStackIds = useMemo(
		() =>
			selectActiveAppliedStackIds(
				projectConfig.vcsAppliedStacks,
				data.appliedStackIds,
				commitEditMode?.appliedStackIdsSnapshot,
			),
		[commitEditMode?.appliedStackIdsSnapshot, data.appliedStackIds, projectConfig.vcsAppliedStacks],
	);
	const appliedStacks = useMemo(
		() => selectAppliedWorkspaceStacks(stacks, appliedStackIds),
		[stacks, appliedStackIds],
	);
	const selectedStackId = useMemo(() => {
		if (!selectedCommitHash) {
			return null;
		}
		return appliedStacks.find((stack) => stack.changes.some((change) => change.commitId === selectedCommitHash))?.id ?? null;
	}, [appliedStacks, selectedCommitHash]);
	const selectedCommitChangeId = useMemo(() => {
		if (!selectedCommitHash) {
			return null;
		}
		for (const stack of appliedStacks) {
			const change = stack.changes.find((candidate) => candidate.commitId === selectedCommitHash);
			if (change) {
				return change.changeId;
			}
		}
		return null;
	}, [appliedStacks, selectedCommitHash]);
	const commitDiffResult = useGetRepositoryCommitDiffQuery(
		{ workspaceId: workspaceId ?? "", commitHash: selectedCommitHash ?? "" },
		{ skip: !workspaceId || !selectedCommitHash },
	);
	const commitDiffQuery = {
		state: toRuntimeQueryState<RuntimeGitCommitDiffResponse>(commitDiffResult, "Failed to load commit diff."),
		refresh: () => void commitDiffResult.refetch(),
	};
	const files = toFileChanges(commitDiffQuery.state);
	const selectedFile = findFileByPath(files, selectedFilePath);
	const unstagedDiffFiles = useMemo(() => toWorkingCopyDiffFiles(diffState), [diffState]);
	const workingCopyFiles = useMemo(() => data.workingCopy.files.map(toUiFileChange), [data.workingCopy.files]);
	const workingCopyConflictPaths = useMemo(
		() => new Set(data.conflicts.map((conflict) => conflict.path).filter((path): path is string => Boolean(path))),
		[data.conflicts],
	);
	const conflictCommitIds = useMemo(
		() => new Set(data.conflicts.flatMap((conflict) => conflict.commitIds)),
		[data.conflicts],
	);
	const conflictPathsByCommitId = useMemo(() => {
		const pathsByCommitId = new Map<string, Set<string>>();
		for (const conflict of data.conflicts) {
			if (!conflict.path) {
				continue;
			}
			for (const commitId of conflict.commitIds) {
				const paths = pathsByCommitId.get(commitId) ?? new Set<string>();
				paths.add(conflict.path);
				pathsByCommitId.set(commitId, paths);
			}
		}
		return pathsByCommitId;
	}, [data.conflicts]);
	const stagedComposerFiles = useMemo(
		() =>
			filesForSelection(
				stackCommitComposer?.selection?.source === "commit"
					? files
					: unstagedDiffFiles.length > 0
						? unstagedDiffFiles
						: workingCopyFiles,
				stackCommitComposer?.selection ?? null,
			),
		[files, stackCommitComposer?.selection, unstagedDiffFiles, workingCopyFiles],
	);
	const selectedUnstagedFallbackFile = workingCopyFiles.find((change) => change.path === selectedUnstagedFilePath);
	const selectedUnstagedFile =
		findFileByPath(unstagedDiffFiles, selectedUnstagedFilePath) ??
		(selectedUnstagedFallbackFile
			? { path: selectedUnstagedFallbackFile.path, status: selectedUnstagedFallbackFile.status }
			: null);
	const previewState = toRuntimeQueryState<VcsOperationPreview>(previewResult, "Failed to preview workspace operation.");

	useEffect(() => {
		setSelectedCommitHash(readVcsQueryParam(location.search, "commit"));
		setSelectedFilePath(readVcsQueryParam(location.search, "file"));
		setSelectedUnstagedFilePath(readVcsQueryParam(location.search, "workingCopyFile") ?? readVcsQueryParam(location.search, "unstagedFile"));
	}, [location.search]);

	useEffect(() => {
		if (isFileSectionCollapsed || commitDiffQuery.state.status !== "ready" || !commitDiffQuery.state.data.ok) {
			return;
		}
		if (hasUserClearedFile) {
			return;
		}
		const nextFiles = commitDiffQuery.state.data.files;
		if (nextFiles.length === 0) {
			if (selectedFilePath) {
				setSelectedFilePath(null);
				writeQueryParam("file", null);
			}
			return;
		}
		if (selectedFilePath && nextFiles.some((file) => file.path === selectedFilePath)) {
			return;
		}
		const nextFilePath = getFirstFilePath(nextFiles);
		setSelectedFilePath(nextFilePath);
		writeQueryParam("file", nextFilePath);
	}, [commitDiffQuery.state, hasUserClearedFile, isFileSectionCollapsed, selectedFilePath]);

	async function unapplyStack(stackId: string): Promise<void> {
		const operation = {
			kind: "unapply_stack",
			stackId,
		} satisfies VcsWorkspaceOperation;
		if (!isLowRiskVcsWorkspaceOperation(operation, data.provider)) {
			openWorkspaceOperationPreview(operation);
			return;
		}
		const nextStackIds = appliedStackIds.filter((candidate) => candidate !== stackId);
		setUpdatingStackId(stackId);
		try {
			const operationResult = await applyVcsOperation({
				workspaceId,
				input: {
					operation,
				},
			}).unwrap();
			if (!operationResult.ok) {
				throw new Error(operationResult.summary || "Workspace stack operation failed.");
			}
			await updateProjectConfig({ vcsAppliedStacks: nextStackIds });
		} finally {
			setUpdatingStackId(null);
		}
	}

	function openWorkspaceOperationPreview(operation: VcsWorkspaceOperation): void {
		const immutableChange = immutableChangeForOperation(operation);
		if (immutableChange) {
			const info = getImmutableRemoteBookmarkInfo(immutableChange);
			if (info) {
				setImmutableCommitPrompt({
					...info,
					change: immutableChange,
					actionLabel: labelForWorkspaceOperation(operation),
				});
				return;
			}
		}
		setPendingOperation(operation);
		setOperationApplyError(null);
		void previewVcsOperation({ workspaceId, input: { operation } });
	}

	function immutableChangeForOperation(operation: VcsWorkspaceOperation): BranchesStackChange | null {
		const candidateIds: string[] = [];
		switch (operation.kind) {
			case "begin_edit_commit":
				candidateIds.push(operation.targetCommitId);
				break;
			case "reword_commit":
			case "amend_commit":
			case "split_commit":
			case "move_commit":
			case "abandon_commit":
				candidateIds.push(operation.commitId);
				break;
			case "squash_commits":
				candidateIds.push(operation.sourceCommitId, operation.targetCommitId);
				break;
			case "move_changes":
				if (operation.selection.commitId) {
					candidateIds.push(operation.selection.commitId);
				}
				candidateIds.push(operation.targetCommitId);
				break;
			case "uncommit_changes":
			case "restore_changes":
			case "discard_changes":
				if (operation.selection.source === "commit" && operation.selection.commitId) {
					candidateIds.push(operation.selection.commitId);
				}
				break;
			case "create_commit":
				if (operation.selection.source === "commit" && operation.selection.commitId) {
					candidateIds.push(operation.selection.commitId);
				}
				break;
			case "apply_stack":
			case "unapply_stack":
			case "save_edit_commit":
			case "abort_edit_commit":
			case "track_remote_bookmark":
			case "checkout_commit":
			case "undo":
			case "redo":
				break;
		}
		for (const candidateId of candidateIds) {
			const change = changesByChangeId.get(candidateId);
			if (change && getImmutableRemoteBookmarkInfo(change)) {
				return change;
			}
		}
		return null;
	}

	function labelForWorkspaceOperation(operation: VcsWorkspaceOperation): string {
		switch (operation.kind) {
			case "begin_edit_commit":
				return "edit this commit";
			case "reword_commit":
				return "reword this commit";
			case "uncommit_changes":
				return "uncommit changes from this commit";
			case "squash_commits":
				return "squash commits";
			case "move_commit":
				return "move this commit";
			case "abandon_commit":
				return "abandon this commit";
			default:
				return "rewrite this commit";
		}
	}

	function previewTrackRemoteBookmark(prompt: ImmutableCommitPromptState): void {
		setImmutableCommitPrompt(null);
		openWorkspaceOperationPreview({
			kind: "track_remote_bookmark",
			bookmarkName: prompt.bookmarkName,
			remoteName: prompt.remoteName,
		});
	}

	function openCommitEdit(change: BranchesStackChange): void {
		const immutableInfo = getImmutableRemoteBookmarkInfo(change);
		if (immutableInfo) {
			setImmutableCommitPrompt({
				...immutableInfo,
				change,
				actionLabel: "reword this commit",
			});
			return;
		}
		setCommitEdit({ commitId: change.changeId, title: change.title });
	}

	function previewCommitEdit(message: string): void {
		if (!commitEdit) {
			return;
		}
		setCommitEdit(null);
		openWorkspaceOperationPreview({
			kind: "reword_commit",
			commitId: commitEdit.commitId,
			message,
		});
	}

	function previewUncommitCommit(change: BranchesStackChange): void {
		const immutableInfo = getImmutableRemoteBookmarkInfo(change);
		if (immutableInfo) {
			setImmutableCommitPrompt({
				...immutableInfo,
				change,
				actionLabel: "uncommit changes from this commit",
			});
			return;
		}
		if (selectedCommitHash !== change.commitId || files.length === 0) {
			selectStackChange(change);
			setFileSectionCollapsed(false);
			return;
		}
		openWorkspaceOperationPreview({
			kind: "uncommit_changes",
			selection: {
				source: "commit",
				commitId: change.changeId,
				paths: files.map((file) => file.path),
			},
		});
	}

	async function beginCommitEditMode(change: BranchesStackChange): Promise<void> {
		const immutableInfo = getImmutableRemoteBookmarkInfo(change);
		if (immutableInfo) {
			setImmutableCommitPrompt({
				...immutableInfo,
				change,
				actionLabel: "edit this commit",
			});
			return;
		}
		const targetFiles = selectedCommitHash === change.commitId ? files : [];
		const returnToCommitId = data.headId ?? change.changeId;
		const appliedStackIdsSnapshot = appliedStackIds;
		selectStackChange(change);
		setFileSectionCollapsed(false);
		setCommitEditMode({
			target: change,
			editCommitId: "",
			returnToCommitId,
			appliedStackIdsSnapshot,
			files: targetFiles,
			isSaving: true,
			error: null,
		});
		try {
			const result = await applyVcsOperation({
				workspaceId,
				input: {
					operation: {
						kind: "begin_edit_commit",
						targetCommitId: change.changeId,
						message: `Edit ${change.title}`,
					},
				},
			}).unwrap();
			if (!result.ok) {
				throw new Error(result.summary || "Could not enter edit mode.");
			}
			const editCommitId = result.affectedCommitIds.find((commitId) => commitId !== change.changeId) ?? result.affectedCommitIds[0] ?? "@";
			setCommitEditMode({
				target: change,
				editCommitId,
				returnToCommitId,
				appliedStackIdsSnapshot,
				files: targetFiles,
				isSaving: false,
				error: null,
			});
		} catch (error) {
			setCommitEditMode((current) =>
				current
					? {
							...current,
							isSaving: false,
							error: error instanceof Error ? error.message : "Could not enter edit mode.",
						}
					: current,
			);
		}
	}

	async function saveCommitEditMode(): Promise<void> {
		if (!commitEditMode || !commitEditMode.editCommitId) {
			return;
		}
		setCommitEditMode((current) => (current ? { ...current, isSaving: true, error: null } : current));
		try {
			const result = await applyVcsOperation({
				workspaceId,
				input: {
					operation: {
						kind: "save_edit_commit",
						editCommitId: commitEditMode.editCommitId,
						targetCommitId: commitEditMode.target.changeId,
						returnToCommitId: commitEditMode.returnToCommitId,
					},
				},
			}).unwrap();
			if (!result.ok) {
				throw new Error(result.summary || "Could not save commit edits.");
			}
			setCommitEditMode(null);
			selectStackChange(commitEditMode.target);
		} catch (error) {
			setCommitEditMode((current) =>
				current
					? {
							...current,
							isSaving: false,
							error: error instanceof Error ? error.message : "Could not save commit edits.",
						}
					: current,
			);
		}
	}

	async function abortCommitEditMode(): Promise<void> {
		if (!commitEditMode || !commitEditMode.editCommitId) {
			setCommitEditMode(null);
			return;
		}
		setCommitEditMode((current) => (current ? { ...current, isSaving: true, error: null } : current));
		try {
			const result = await applyVcsOperation({
				workspaceId,
				input: {
					operation: {
						kind: "abort_edit_commit",
						editCommitId: commitEditMode.editCommitId,
						returnToCommitId: commitEditMode.returnToCommitId,
					},
				},
			}).unwrap();
			if (!result.ok) {
				throw new Error(result.summary || "Could not abort commit edits.");
			}
			setCommitEditMode(null);
			selectStackChange(commitEditMode.target);
		} catch (error) {
			setCommitEditMode((current) =>
				current
					? {
							...current,
							isSaving: false,
							error: error instanceof Error ? error.message : "Could not abort commit edits.",
						}
					: current,
			);
		}
	}

	function openStackCommitComposer(stackId: string, selection: VcsChangeSelection | null = null, error: string | null = null): void {
		setStackCommitComposer({
			stackId,
			selection,
			title: "",
			body: "",
			error,
		});
	}

	function updateStackCommitComposer(patch: Partial<Pick<StackCommitComposerState, "title" | "body" | "error">>): void {
		setStackCommitComposer((current) => (current ? { ...current, ...patch } : current));
	}

	function closeStackCommitComposer(): void {
		setStackCommitComposer(null);
		setSelectedComposerDiffStackId(null);
	}

	function previewStackCommitComposer(): void {
		if (!stackCommitComposer) {
			return;
		}
		const title = stackCommitComposer.title.trim();
		if (!title) {
			updateStackCommitComposer({ error: "Commit title is required." });
			return;
		}
		if (!stackCommitComposer.selection) {
			updateStackCommitComposer({ error: "Drop working-copy changes onto this stack before creating a commit." });
			return;
		}
		const body = stackCommitComposer.body.trim();
		const message = body ? `${title}\n\n${body}` : title;
		openWorkspaceOperationPreview({
			kind: "create_commit",
			stackId: stackCommitComposer.stackId,
			message,
			selection: stackCommitComposer.selection,
		});
		closeStackCommitComposer();
	}

	function closeWorkspaceOperationPreview(): void {
		setPendingOperation(null);
		setOperationApplyError(null);
	}

	function getDropTargetState(target: VcsWorkspaceDropTarget, targetKey = workspaceDropTargetKey(target)): WorkspaceDropTargetState {
		const key = targetKey;
		return activeDropTarget?.key === key ? activeDropTarget.state : "idle";
	}

	function clearDragState(): void {
		setActiveDragPayload(null);
		setActiveDropTarget(null);
	}

	function startWorkspaceDrag(event: ReactDragEvent<HTMLElement>, payload: VcsWorkspaceDragPayload): void {
		event.stopPropagation();
		setActiveDragPayload(payload);
		setActiveDropTarget(null);
		writeDragPayload(event, payload);
	}

	function startWorkingCopyHunkDrag(event: ReactDragEvent<HTMLElement>, hunk: VcsDiffHunkDragPayload): void {
		startWorkspaceDrag(event, {
			kind: "hunk",
			source: "working_copy",
			hunk: {
				path: hunk.path,
				hunkId: hunk.hunkId,
				oldStart: hunk.oldStart,
				oldLines: hunk.oldLines,
				newStart: hunk.newStart,
				newLines: hunk.newLines,
			},
		});
	}

	function startCommittedHunkDrag(
		event: ReactDragEvent<HTMLElement>,
		hunk: VcsDiffHunkDragPayload,
		commitId: string | null,
	): void {
		if (!commitId) {
			return;
		}
		startWorkspaceDrag(event, {
			kind: "hunk",
			source: "commit",
			commitId,
			hunk: {
				path: hunk.path,
				hunkId: hunk.hunkId,
				oldStart: hunk.oldStart,
				oldLines: hunk.oldLines,
				newStart: hunk.newStart,
				newLines: hunk.newLines,
			},
		});
	}

	function canEditWorkspaceCommit(change: BranchesStackChange): boolean {
		return data.capabilities.supportsCommitRewrite && !getImmutableRemoteBookmarkInfo(change) && (data.provider !== "git" || change.isCurrent);
	}

	function focusCommittedFile(commitId: string, path: string): void {
		setSelectedCommitHash(commitId);
		setSelectedFilePath(path);
		setSelectedUnstagedFilePath(null);
		setHasUserClearedFile(false);
		setFileSectionCollapsed(false);
		writeQueryParam("commit", commitId);
		writeQueryParam("file", path);
		writeWorkingCopyFileQueryParam(null);
	}

	function focusWorkingCopyFile(path: string): void {
		setSelectedUnstagedFilePath(path);
		setSelectedCommitHash(null);
		setSelectedFilePath(null);
		setHasUserClearedFile(true);
		setUnstagedCollapsed(false);
		writeQueryParam("commit", null);
		writeQueryParam("file", null);
		writeWorkingCopyFileQueryParam(path);
	}

	function preserveSelectionAfterWorkspaceOperation(operation: VcsWorkspaceOperation, affectedCommitIds: string[]): void {
		switch (operation.kind) {
			case "amend_commit": {
				const path = firstSelectionPath(operation.selection);
				if (path) {
					focusCommittedFile(affectedCommitIds.at(-1) ?? operation.commitId, path);
				}
				return;
			}
			case "move_changes": {
				const path = firstSelectionPath(operation.selection);
				if (path) {
					focusCommittedFile(affectedCommitIds.at(-1) ?? operation.targetCommitId, path);
				}
				return;
			}
			case "uncommit_changes": {
				const path = firstSelectionPath(operation.selection);
				if (path) {
					focusWorkingCopyFile(path);
				}
				return;
			}
			default:
				return;
		}
	}

	async function applyPendingWorkspaceOperation(): Promise<void> {
		if (!pendingOperation) {
			return;
		}
		if (previewState.status !== "ready" || !areVcsWorkspaceOperationsEqual(previewState.data.operation, pendingOperation)) {
			setOperationApplyError("Preview is stale. Reopen the operation preview and try again.");
			return;
		}
		setApplyingPreviewedOperation(true);
		setOperationApplyError(null);
		try {
			const result = await applyPreviewedVcsOperation({
				workspaceId,
				input: { operation: pendingOperation },
			}).unwrap();
			if (!result.ok) {
				throw new Error(result.summary || "Workspace operation failed.");
			}
			if (pendingOperation.kind === "apply_stack") {
				await updateProjectConfig({
					vcsAppliedStacks: applyWorkspaceStackId(appliedStackIds, pendingOperation.stackId),
				});
			} else if (pendingOperation.kind === "unapply_stack") {
				await updateProjectConfig({
					vcsAppliedStacks: unapplyWorkspaceStackId(appliedStackIds, pendingOperation.stackId),
				});
			}
			preserveSelectionAfterWorkspaceOperation(pendingOperation, result.affectedCommitIds);
			closeWorkspaceOperationPreview();
		} catch (error) {
			setOperationApplyError(error instanceof Error ? error.message : "Workspace operation failed.");
		} finally {
			setApplyingPreviewedOperation(false);
		}
	}

	function handleDragOver(
		event: ReactDragEvent<HTMLElement>,
		target: VcsWorkspaceDropTarget,
		targetKey = workspaceDropTargetKey(target),
	): void {
		if (!Array.from(event.dataTransfer.types).includes(VCS_WORKSPACE_DRAG_MIME)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (!activeDragPayload) {
			event.dataTransfer.dropEffect = "move";
			return;
		}
		const feedback = describeVcsWorkspaceDropTarget(activeDragPayload, target, data.capabilities);
		setActiveDropTarget({ key: targetKey, state: feedback.state });
		event.dataTransfer.dropEffect = feedback.state === "valid" ? "move" : "none";
	}

	function handleDragLeave(
		event: ReactDragEvent<HTMLElement>,
		target: VcsWorkspaceDropTarget,
		targetKey = workspaceDropTargetKey(target),
	): void {
		const nextTarget = event.relatedTarget;
		if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
			return;
		}
		const key = targetKey;
		setActiveDropTarget((current) => (current?.key === key ? null : current));
	}

	function handleDrop(event: ReactDragEvent<HTMLElement>, target: VcsWorkspaceDropTarget): void {
		const payload = readDragPayload(event);
		if (!payload) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		clearDragState();
		if (target.kind === "stack_header") {
			const operation = createVcsWorkspaceCreateCommitOperationFromDrop(payload, target.stackId, "");
			if (!operation.valid) {
				openStackCommitComposer(target.stackId, null, operation.reason);
				return;
			}
			if (operation.operation.kind !== "create_commit") {
				openStackCommitComposer(target.stackId, null, "Only working-copy changes can start a new commit.");
				return;
			}
			openStackCommitComposer(target.stackId, operation.operation.selection);
			return;
		}
		const operation = createValidatedVcsWorkspaceOperationFromDrop(payload, target, data.capabilities);
		if (!operation.valid) {
			setOperationApplyError(operation.reason);
			return;
		}
		openWorkspaceOperationPreview(operation.operation);
	}

	function selectStackChange(change: BranchesStackChange): void {
		if (selectedCommitHash === change.commitId) {
			setSelectedCommitHash(null);
			setSelectedFilePath(null);
			setHasUserClearedFile(true);
			setFileSectionCollapsed(false);
			writeQueryParam("commit", null);
			writeQueryParam("file", null);
			return;
		}
		setSelectedCommitHash(change.commitId);
		setSelectedFilePath(null);
		setSelectedUnstagedFilePath(null);
		setSelectedComposerDiffStackId(null);
		setHasUserClearedFile(false);
		setFileSectionCollapsed(false);
		writeQueryParam("commit", change.commitId);
		writeQueryParam("file", null);
		writeWorkingCopyFileQueryParam(null);
	}

	function selectFile(path: string): void {
		if (selectedFilePath === path) {
			setSelectedFilePath(null);
			setHasUserClearedFile(true);
			writeQueryParam("file", null);
			return;
		}
		setSelectedFilePath(path);
		setSelectedUnstagedFilePath(null);
		setSelectedComposerDiffStackId(null);
		setHasUserClearedFile(false);
		writeQueryParam("file", path);
		writeWorkingCopyFileQueryParam(null);
	}

	function selectUnstagedFile(path: string): void {
		if (selectedUnstagedFilePath === path) {
			setSelectedUnstagedFilePath(null);
			setSelectedComposerDiffStackId(null);
			writeWorkingCopyFileQueryParam(null);
			return;
		}
		setSelectedUnstagedFilePath(path);
		setSelectedComposerDiffStackId(null);
		setSelectedCommitHash(null);
		setSelectedFilePath(null);
		setHasUserClearedFile(true);
		writeQueryParam("commit", null);
		writeWorkingCopyFileQueryParam(path);
		writeQueryParam("file", null);
	}

	function selectComposerStagedFile(stackId: string, path: string): void {
		const selection = stackCommitComposer?.stackId === stackId ? stackCommitComposer.selection : null;
		if (selection?.source === "commit") {
			const sourceCommitHash = commitHashForChangeId(appliedStacks, selection.commitId ?? null);
			if (!sourceCommitHash) {
				return;
			}
			if (selectedCommitHash === sourceCommitHash && selectedFilePath === path && selectedComposerDiffStackId === stackId) {
				setSelectedCommitHash(null);
				setSelectedFilePath(null);
				setSelectedComposerDiffStackId(null);
				writeQueryParam("commit", null);
				writeQueryParam("file", null);
				return;
			}
			setSelectedCommitHash(sourceCommitHash);
			setSelectedFilePath(path);
			setSelectedUnstagedFilePath(null);
			setSelectedComposerDiffStackId(stackId);
			setHasUserClearedFile(false);
			writeQueryParam("commit", sourceCommitHash);
			writeQueryParam("file", path);
			writeWorkingCopyFileQueryParam(null);
			return;
		}
		if (selectedUnstagedFilePath === path && selectedComposerDiffStackId === stackId) {
			setSelectedUnstagedFilePath(null);
			setSelectedComposerDiffStackId(null);
			writeWorkingCopyFileQueryParam(null);
			return;
		}
		setSelectedUnstagedFilePath(path);
		setSelectedComposerDiffStackId(stackId);
		setSelectedCommitHash(null);
		setSelectedFilePath(null);
		setHasUserClearedFile(true);
		writeQueryParam("commit", null);
		writeWorkingCopyFileQueryParam(path);
		writeQueryParam("file", null);
	}

	function changeFileViewMode(mode: VcsFileViewMode): void {
		setFileViewMode(writeVcsFileViewMode(mode));
	}

	function changeFileSectionCollapsed(collapsed: boolean): void {
		setFileSectionCollapsed(collapsed);
		if (collapsed) {
			setSelectedFilePath(null);
			setHasUserClearedFile(true);
			writeQueryParam("file", null);
			return;
		}
		setHasUserClearedFile(false);
		const nextFilePath = getFirstFilePath(files);
		if (nextFilePath) {
			setSelectedFilePath(nextFilePath);
			writeQueryParam("file", nextFilePath);
		}
	}

	function changeDiffColumnWidth(width: number): void {
		setDiffColumnWidth(
			writeVcsNumberPreference(
				WORKSPACE_COLUMN_LIMITS.diff.key,
				width,
				WORKSPACE_COLUMN_LIMITS.diff.min,
				WORKSPACE_COLUMN_LIMITS.diff.max,
			),
		);
	}

	function changeUnstagedColumnWidth(width: number): void {
		setUnstagedColumnWidth(
			writeVcsNumberPreference(
				WORKSPACE_COLUMN_LIMITS.unstaged.key,
				width,
				WORKSPACE_COLUMN_LIMITS.unstaged.min,
				WORKSPACE_COLUMN_LIMITS.unstaged.max,
			),
		);
	}

	function changeUnstagedCollapsed(collapsed: boolean): void {
		setUnstagedCollapsed(
			writeVcsBooleanPreference(VCS_LAYOUT_STORAGE_KEYS.workspaceWorkingCopyCollapsed, collapsed),
		);
	}

	function closeDiff(): void {
		setSelectedFilePath(null);
		setHasUserClearedFile(true);
		writeQueryParam("file", null);
	}

	function closeUnstagedDiff(): void {
		setSelectedUnstagedFilePath(null);
		setSelectedComposerDiffStackId(null);
		writeWorkingCopyFileQueryParam(null);
	}

	function setStackCollapsed(stackId: string, collapsed: boolean): void {
		writeVcsBooleanPreference(stackColumnCollapsedKey(stackId), collapsed);
		setCollapsedStackIds((current) => ({ ...current, [stackId]: collapsed }));
	}

	function isStackCollapsed(stackId: string): boolean {
		return collapsedStackIds[stackId] ?? readVcsBooleanPreference(stackColumnCollapsedKey(stackId), false);
	}

	function getStackColumnWidth(stackId: string): number {
		return (
			stackColumnWidths[stackId] ??
			readVcsNumberPreference(
				stackColumnWidthKey(stackId),
				WORKSPACE_COLUMN_LIMITS.stack.fallback,
				WORKSPACE_COLUMN_LIMITS.stack.min,
				WORKSPACE_COLUMN_LIMITS.stack.max,
			)
		);
	}

	function changeStackColumnWidth(stackId: string, width: number): void {
		const normalized = writeVcsNumberPreference(
			stackColumnWidthKey(stackId),
			width,
			WORKSPACE_COLUMN_LIMITS.stack.min,
			WORKSPACE_COLUMN_LIMITS.stack.max,
		);
		setStackColumnWidths((current) => ({ ...current, [stackId]: normalized }));
	}

	const diffColumn = selectedFile ? (
		<VcsFileDiffColumn
			file={selectedFile}
			width={diffColumnWidth}
			minWidth={WORKSPACE_COLUMN_LIMITS.diff.min}
			maxWidth={WORKSPACE_COLUMN_LIMITS.diff.max}
			onWidthChange={changeDiffColumnWidth}
			onClose={closeDiff}
			onHunkDragStart={(event, hunk) => startCommittedHunkDrag(event, hunk, selectedCommitChangeId)}
		/>
	) : null;
	const unstagedDiffColumn = selectedUnstagedFilePath ? (
		<VcsFileDiffColumn
			file={selectedUnstagedFile}
			isLoading={diffState.status === "loading"}
			width={diffColumnWidth}
			minWidth={WORKSPACE_COLUMN_LIMITS.diff.min}
			maxWidth={WORKSPACE_COLUMN_LIMITS.diff.max}
			onWidthChange={changeDiffColumnWidth}
			onClose={closeUnstagedDiff}
			onHunkDragStart={startWorkingCopyHunkDrag}
		/>
	) : null;
	const showTrailingSpacer = appliedStacks.length > 0 || Boolean(selectedFile) || Boolean(selectedUnstagedFilePath);
	return (
		<>
		<div className="h-full min-h-0 overflow-x-auto overflow-y-hidden bg-surface-0 p-3" onDragEnd={clearDragState}>
			<div className="flex h-full min-h-0 min-w-full gap-3">
				{isUnstagedCollapsed ? (
					<VcsCollapsedColumn
						label="Working Copy"
						count={workingCopyFiles.length}
						onExpand={() => changeUnstagedCollapsed(false)}
					/>
				) : (
					<UnstagedColumn
						changes={workingCopyFiles}
						width={unstagedColumnWidth}
						fileViewMode={fileViewMode}
						selectedPath={selectedUnstagedFilePath}
						onCollapse={() => changeUnstagedCollapsed(true)}
						onWidthChange={changeUnstagedColumnWidth}
						onFileViewModeChange={changeFileViewMode}
						onSelectPath={selectUnstagedFile}
						onFileDragStart={(event, file) => {
							startWorkspaceDrag(event, { kind: "file", source: "working_copy", path: file.path });
						}}
						onDragOver={(event) => handleDragOver(event, { kind: "working_copy" })}
						onDragLeave={(event) => handleDragLeave(event, { kind: "working_copy" })}
						onDrop={(event) => handleDrop(event, { kind: "working_copy" })}
						dropTargetState={getDropTargetState({ kind: "working_copy" })}
						hasConflicts={data.workingCopy.hasConflicts}
						conflictPaths={workingCopyConflictPaths}
					/>
				)}
				{selectedComposerDiffStackId ? null : unstagedDiffColumn}
				{appliedStacks.length === 0 ? (
					<EmptyWorkspaceLanes
						onDragOver={(event) => handleDragOver(event, { kind: "workspace" })}
						onDragLeave={(event) => handleDragLeave(event, { kind: "workspace" })}
						onDrop={(event) => handleDrop(event, { kind: "workspace" })}
						dropTargetState={getDropTargetState({ kind: "workspace" })}
					/>
				) : (
					appliedStacks.map((stack) => (
						<Fragment key={stack.id}>
							{isStackCollapsed(stack.id) ? (
								<VcsCollapsedColumn
									label={stack.id}
									count={stack.heads.length}
									onExpand={() => setStackCollapsed(stack.id, false)}
								/>
							) : (
								<WorkspaceStackLane
									stack={stack}
									width={getStackColumnWidth(stack.id)}
									isUpdating={updatingStackId === stack.id}
									onCollapse={() => setStackCollapsed(stack.id, true)}
									onWidthChange={(width) => changeStackColumnWidth(stack.id, width)}
									onUnapply={() => void unapplyStack(stack.id)}
									selectedCommitHash={selectedCommitHash}
									selectedFilePath={selectedFilePath}
									selectedFiles={files}
									conflictCommitIds={conflictCommitIds}
									conflictPathsByCommitId={conflictPathsByCommitId}
									diffState={commitDiffQuery.state}
									fileViewMode={fileViewMode}
									isFileSectionCollapsed={isFileSectionCollapsed}
									canEditCommit={canEditWorkspaceCommit}
									onFileViewModeChange={changeFileViewMode}
									onFileSectionCollapsedChange={changeFileSectionCollapsed}
									onSelectStackChange={selectStackChange}
									onEditCommit={openCommitEdit}
									onUncommitCommit={previewUncommitCommit}
									onBeginEditCommit={(change) => void beginCommitEditMode(change)}
									onSelectFile={selectFile}
									composer={stackCommitComposer?.stackId === stack.id ? stackCommitComposer : null}
									stagedFiles={stackCommitComposer?.stackId === stack.id ? stagedComposerFiles : []}
									selectedStagedFilePath={stackCommitComposer?.stackId === stack.id ? selectedUnstagedFilePath : null}
									onStartCommit={() => openStackCommitComposer(stack.id)}
									onComposerTitleChange={(title) => updateStackCommitComposer({ title, error: null })}
									onComposerBodyChange={(body) => updateStackCommitComposer({ body, error: null })}
									onComposerCancel={closeStackCommitComposer}
									onComposerPreview={previewStackCommitComposer}
									onSelectComposerStagedFile={(path) => selectComposerStagedFile(stack.id, path)}
									onFileDragStart={(event, file, change) => {
										startWorkspaceDrag(event, {
											kind: "file",
											source: "commit",
											path: file.path,
											commitId: change.changeId,
										});
									}}
									onCommitDragStart={(event, change) => {
										startWorkspaceDrag(event, {
											kind: "commit",
											commitId: change.changeId,
											stackId: stack.id,
										});
									}}
									onDragOverStack={(event) => handleDragOver(event, { kind: "stack", stackId: stack.id })}
									onDragLeaveStack={(event) => handleDragLeave(event, { kind: "stack", stackId: stack.id })}
									onDropStack={(event) => handleDrop(event, { kind: "stack", stackId: stack.id })}
									onDragOverStackHeader={(event, targetKey) => handleDragOver(event, { kind: "stack_header", stackId: stack.id }, targetKey)}
									onDragLeaveStackHeader={(event, targetKey) => handleDragLeave(event, { kind: "stack_header", stackId: stack.id }, targetKey)}
									onDropStackHeader={(event) => handleDrop(event, { kind: "stack_header", stackId: stack.id })}
									onDragOverCommit={(event, change, targetKey) => handleDragOver(event, { kind: "commit", commitId: change.changeId }, targetKey)}
									onDragLeaveCommit={(event, change, targetKey) => handleDragLeave(event, { kind: "commit", commitId: change.changeId }, targetKey)}
									onDropCommit={(event, change) => handleDrop(event, { kind: "commit", commitId: change.changeId })}
									onPreviewOperation={openWorkspaceOperationPreview}
									stackDropTargetState={getDropTargetState({ kind: "stack", stackId: stack.id })}
									stackHeaderDropTargetState={getDropTargetState({ kind: "stack_header", stackId: stack.id })}
									getStackHeaderDropTargetState={(targetKey) => getDropTargetState({ kind: "stack_header", stackId: stack.id }, targetKey)}
									getCommitDropTargetState={(change, targetKey) => getDropTargetState({ kind: "commit", commitId: change.changeId }, targetKey)}
								/>
							)}
							{selectedComposerDiffStackId === stack.id
								? stackCommitComposer?.selection?.source === "commit"
									? diffColumn
									: unstagedDiffColumn
								: selectedStackId === stack.id
									? diffColumn
									: null}
						</Fragment>
					))
				)}
				{selectedFile && !selectedStackId ? diffColumn : null}
				{showTrailingSpacer ? (
					<div
						aria-hidden
						className="h-full shrink-0"
						style={{ width: WORKSPACE_TRAILING_SPACER_WIDTH, minWidth: WORKSPACE_TRAILING_SPACER_WIDTH }}
					/>
				) : null}
			</div>
		</div>
		<WorkspaceOperationPreviewDialog
			operation={pendingOperation}
			previewState={previewState}
			applyError={operationApplyError}
			isApplying={isApplyingPreviewedOperation}
			onApply={() => void applyPendingWorkspaceOperation()}
			onClose={closeWorkspaceOperationPreview}
		/>
		<CommitMessageEditDialog
			edit={commitEdit}
			onChangeTitle={(title) => setCommitEdit((current) => (current ? { ...current, title } : current))}
			onPreview={previewCommitEdit}
			onClose={() => setCommitEdit(null)}
		/>
		<ImmutableCommitDialog
			prompt={immutableCommitPrompt}
			onTrack={previewTrackRemoteBookmark}
			onClose={() => setImmutableCommitPrompt(null)}
		/>
		<CommitEditModeOverlay
			editMode={commitEditMode}
			files={
				commitEditMode
					? commitEditMode.files.length > 0
						? commitEditMode.files
						: commitEditMode.target.commitId === selectedCommitHash
							? files
							: []
					: []
			}
			isFilesLoading={commitEditMode !== null && commitEditMode.target.commitId === selectedCommitHash && commitDiffQuery.state.status === "loading"}
			selectedPath={selectedFilePath}
			fileViewMode={fileViewMode}
			onFileViewModeChange={changeFileViewMode}
			onSelectPath={(path) => {
				setSelectedFilePath(path);
				writeQueryParam("file", path);
			}}
			onAbort={() => void abortCommitEditMode()}
			onSave={() => void saveCommitEditMode()}
		/>
		</>
	);
}

function UnstagedColumn({
	changes,
	width,
	fileViewMode,
	selectedPath,
	hasConflicts,
	conflictPaths,
	onCollapse,
	onWidthChange,
	onFileViewModeChange,
	onSelectPath,
	onFileDragStart,
	onDragOver,
	onDragLeave,
	onDrop,
	dropTargetState,
}: {
	changes: VcsFileChange[];
	width: number;
	fileViewMode: VcsFileViewMode;
	selectedPath: string | null;
	hasConflicts: boolean;
	conflictPaths: ReadonlySet<string>;
	onCollapse: () => void;
	onWidthChange: (width: number) => void;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onSelectPath: (path: string) => void;
	onFileDragStart: (event: ReactDragEvent<HTMLButtonElement>, file: VcsFileChange) => void;
	onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
	onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
	onDrop: (event: ReactDragEvent<HTMLElement>) => void;
	dropTargetState: WorkspaceDropTargetState;
}): React.ReactElement {
	const files: VcsFileChange[] = changes;
	return (
		<VcsColumn
			id="unstaged"
			title="Working Copy"
			count={changes.length}
			width={width}
			minWidth={WORKSPACE_COLUMN_LIMITS.unstaged.min}
			maxWidth={WORKSPACE_COLUMN_LIMITS.unstaged.max}
			onCollapse={onCollapse}
			onWidthChange={onWidthChange}
			hideHeader
			headerContent={
				<UnstagedColumnHeader
					count={changes.length}
					hasConflicts={hasConflicts}
					fileViewMode={fileViewMode}
					onFileViewModeChange={onFileViewModeChange}
				/>
			}
		>
			<div
				data-testid="vcs-working-copy-drop-target"
				data-drop-target-state={dropTargetState}
				className={cn("h-full min-h-0 transition-shadow", workspaceDropTargetClassName(dropTargetState), workspaceDropTargetOverlayClassName(dropTargetState))}
				onDragOver={onDragOver}
				onDragLeave={onDragLeave}
				onDrop={onDrop}
			>
				{changes.length === 0 ? (
					<div className="flex h-full items-center justify-center p-6 text-center">
						<div>
							<div className="mx-auto grid h-14 w-14 place-items-center rounded-lg border border-border bg-surface-0 text-accent">
								<Sparkles size={22} />
							</div>
			<div className="mt-4 text-sm font-medium text-text-primary">You're all caught up</div>
			<p className="mt-1 text-sm text-text-secondary">No files need committing.</p>
						</div>
					</div>
				) : (
					<>
					<UnstagedFileList
						files={files}
						viewMode={fileViewMode}
						selectedPath={selectedPath}
						conflictPaths={conflictPaths}
						onSelectPath={onSelectPath}
						onFileDragStart={onFileDragStart}
					/>
					</>
				)}
			</div>
		</VcsColumn>
	);
}

function UnstagedColumnHeader({
	count,
	hasConflicts,
	fileViewMode,
	onFileViewModeChange,
}: {
	count: number;
	hasConflicts: boolean;
	fileViewMode: VcsFileViewMode;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
}): React.ReactElement {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<PanelLeft size={15} className="shrink-0 text-text-tertiary" />
			<span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">Working Copy</span>
			{hasConflicts ? <StatusChip label="Conflicts" tone="orange" icon={<AlertTriangle size={11} />} /> : null}
			<StatusChip label={String(count)} tone="neutral" />
			<FileViewToggle mode={fileViewMode} onModeChange={onFileViewModeChange} />
		</div>
	);
}

function FileViewToggle({
	mode,
	onModeChange,
}: {
	mode: VcsFileViewMode;
	onModeChange: (mode: VcsFileViewMode) => void;
}): React.ReactElement {
	return (
		<div className="inline-flex shrink-0 rounded-md border border-divider bg-surface-0 p-0.5">
			<button
				type="button"
				aria-label="Show files as list"
				title="List"
				className={cn(
					"grid h-6 w-6 place-items-center rounded border border-transparent text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary",
					mode === "list" && "border-accent/30 bg-accent/15 text-accent",
				)}
				onClick={(event) => {
					event.stopPropagation();
					onModeChange("list");
				}}
			>
				<List size={14} />
			</button>
			<button
				type="button"
				aria-label="Show files as folders"
				title="Folder tree"
				className={cn(
					"grid h-6 w-6 place-items-center rounded border border-transparent text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary",
					mode === "tree" && "border-accent/30 bg-accent/15 text-accent",
				)}
				onClick={(event) => {
					event.stopPropagation();
					onModeChange("tree");
				}}
			>
				<FolderTree size={14} />
			</button>
		</div>
	);
}

function UnstagedFileList({
	files,
	viewMode,
	selectedPath,
	conflictPaths,
	onSelectPath,
	onFileDragStart,
}: {
	files: VcsFileChange[];
	viewMode: VcsFileViewMode;
	selectedPath: string | null;
	conflictPaths: ReadonlySet<string>;
	onSelectPath: (path: string) => void;
	onFileDragStart: (event: ReactDragEvent<HTMLButtonElement>, file: VcsFileChange) => void;
}): React.ReactElement {
	const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
	const tree = useMemo(() => buildFileTree(files.map((file) => file.path)), [files]);
	return (
		<div className="px-1 py-1">
			{viewMode === "tree"
				? tree.map((node) => (
						<UnstagedFileTreeRow
							key={node.path}
							node={node}
							depth={0}
							selectedPath={selectedPath}
							conflictPaths={conflictPaths}
							onSelectPath={onSelectPath}
							filesByPath={filesByPath}
							onFileDragStart={onFileDragStart}
						/>
					))
				: files.map((file) => (
						<UnstagedFileRow
							key={`${file.status}:${file.path}`}
							file={file}
							selected={file.path === selectedPath}
							hasConflict={conflictPaths.has(file.path)}
							onSelectPath={onSelectPath}
							onFileDragStart={onFileDragStart}
						/>
					))}
		</div>
	);
}

function UnstagedFileTreeRow({
	node,
	depth,
	selectedPath,
	conflictPaths,
	onSelectPath,
	filesByPath,
	onFileDragStart,
}: {
	node: FileTreeNode;
	depth: number;
	selectedPath: string | null;
	conflictPaths: ReadonlySet<string>;
	onSelectPath: (path: string) => void;
	filesByPath: Map<string, VcsFileChange>;
	onFileDragStart: (event: ReactDragEvent<HTMLButtonElement>, file: VcsFileChange) => void;
}): React.ReactElement {
	const isDirectory = node.type === "directory";
	const file = filesByPath.get(node.path);
	const selected = !isDirectory && node.path === selectedPath;
	const hasConflict = isDirectory
		? Array.from(conflictPaths).some((path) => path === node.path || path.startsWith(`${node.path}/`))
		: conflictPaths.has(node.path);
	return (
		<div>
			<button
				type="button"
				disabled={isDirectory}
				data-testid={isDirectory ? "vcs-working-copy-directory-row" : "vcs-working-copy-file-row"}
				data-file-path={isDirectory ? undefined : node.path}
				draggable={!isDirectory && Boolean(file)}
				className={cn(
					"kb-file-tree-row",
					isDirectory && "kb-file-tree-row-directory",
					!isDirectory && "cursor-pointer hover:bg-surface-2",
					selected && "kb-file-tree-row-selected",
					hasConflict && "kb-file-tree-row-conflict",
					hasConflict && selected && "ring-1 ring-status-red/60",
				)}
				style={{ paddingLeft: depth * 12 + 8 }}
				onDragStart={(event) => {
					if (file) {
						onFileDragStart(event, file);
					}
				}}
				onClick={() => {
					if (!isDirectory) {
						onSelectPath(node.path);
					}
				}}
			>
				{isDirectory ? <Folder size={14} /> : <FileText size={14} className={hasConflict ? "text-status-orange" : undefined} />}
				{file ? <FileStatusGlyph status={file.status} /> : null}
				<span className="min-w-0 flex-1 truncate">{node.name}</span>
				{hasConflict ? <AlertTriangle size={16} className="ml-auto shrink-0 text-status-red" /> : null}
			</button>
			{node.children.length > 0 ? (
				<div>
					{node.children.map((child) => (
						<UnstagedFileTreeRow
							key={child.path}
							node={child}
							depth={depth + 1}
							selectedPath={selectedPath}
							conflictPaths={conflictPaths}
							onSelectPath={onSelectPath}
							filesByPath={filesByPath}
							onFileDragStart={onFileDragStart}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

function UnstagedFileRow({
	file,
	selected,
	hasConflict,
	onSelectPath,
	onFileDragStart,
}: {
	file: VcsFileChange;
	selected: boolean;
	hasConflict: boolean;
	onSelectPath: (path: string) => void;
	onFileDragStart: (event: ReactDragEvent<HTMLButtonElement>, file: VcsFileChange) => void;
}): React.ReactElement {
	return (
		<button
			type="button"
			data-testid="vcs-working-copy-file-row"
			data-file-path={file.path}
			draggable
			className={cn(
				"kb-file-tree-row cursor-pointer hover:bg-surface-2",
				selected && "kb-file-tree-row-selected",
				hasConflict && "kb-file-tree-row-conflict",
				hasConflict && selected && "ring-1 ring-status-red/60",
			)}
			onDragStart={(event) => onFileDragStart(event, file)}
			onClick={() => onSelectPath(file.path)}
		>
			<FileText size={14} className={hasConflict ? "text-status-orange" : undefined} />
			<FileStatusGlyph status={file.status} />
			<span className="min-w-0 flex-1 truncate">{file.path}</span>
			{hasConflict ? <AlertTriangle size={16} className="ml-auto shrink-0 text-status-red" /> : null}
		</button>
	);
}

function EmptyWorkspaceLanes({
	onDragOver,
	onDragLeave,
	onDrop,
	dropTargetState,
}: {
	onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
	onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
	onDrop: (event: ReactDragEvent<HTMLElement>) => void;
	dropTargetState: WorkspaceDropTargetState;
}): React.ReactElement {
	return (
		<section
			data-testid="vcs-empty-workspace-drop-target"
			data-drop-target-state={dropTargetState}
			className={cn(
				"flex h-full min-h-0 min-w-[520px] flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface-1 transition-shadow",
				workspaceDropTargetClassName(dropTargetState),
			)}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			<div className="flex h-full items-center justify-center bg-[radial-gradient(circle,_rgba(125,125,125,0.18)_1px,_transparent_1px)] [background-size:10px_10px] p-8 text-center">
				<EmptyState title="No stacks applied">
					Open Branches and apply a local stack to show it in this workspace.
				</EmptyState>
			</div>
		</section>
	);
}

function WorkspaceStackLane({
	stack,
	width,
	isUpdating,
	onCollapse,
	onWidthChange,
	onUnapply,
	selectedCommitHash,
	selectedFilePath,
	selectedFiles,
	conflictCommitIds,
	conflictPathsByCommitId,
	diffState,
	fileViewMode,
	isFileSectionCollapsed,
	canEditCommit,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectStackChange,
	onEditCommit,
	onUncommitCommit,
	onBeginEditCommit,
	onSelectFile,
	composer,
	stagedFiles,
	selectedStagedFilePath,
	onStartCommit,
	onComposerTitleChange,
	onComposerBodyChange,
	onComposerCancel,
	onComposerPreview,
	onSelectComposerStagedFile,
	onFileDragStart,
	onCommitDragStart,
	onDragOverStack,
	onDragLeaveStack,
	onDropStack,
	onDragOverStackHeader,
	onDragLeaveStackHeader,
	onDropStackHeader,
	onDragOverCommit,
	onDragLeaveCommit,
	onDropCommit,
	onPreviewOperation,
	stackDropTargetState,
	stackHeaderDropTargetState,
	getStackHeaderDropTargetState,
	getCommitDropTargetState,
}: {
	stack: BranchesStack;
	width: number;
	isUpdating: boolean;
	onCollapse: () => void;
	onWidthChange: (width: number) => void;
	onUnapply: () => void;
	selectedCommitHash: string | null;
	selectedFilePath: string | null;
	selectedFiles: VcsFileChange[];
	conflictCommitIds: ReadonlySet<string>;
	conflictPathsByCommitId: ReadonlyMap<string, ReadonlySet<string>>;
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	canEditCommit: (change: BranchesStackChange) => boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectStackChange: (change: BranchesStackChange) => void;
	onEditCommit: (change: BranchesStackChange) => void;
	onUncommitCommit: (change: BranchesStackChange) => void;
	onBeginEditCommit: (change: BranchesStackChange) => void;
	onSelectFile: (path: string) => void;
	composer: StackCommitComposerState | null;
	stagedFiles: VcsFileChange[];
	selectedStagedFilePath: string | null;
	onStartCommit: () => void;
	onComposerTitleChange: (title: string) => void;
	onComposerBodyChange: (body: string) => void;
	onComposerCancel: () => void;
	onComposerPreview: () => void;
	onSelectComposerStagedFile: (path: string) => void;
	onFileDragStart: (event: ReactDragEvent<HTMLButtonElement>, file: VcsFileChange, change: BranchesStackChange) => void;
	onCommitDragStart: (event: ReactDragEvent<HTMLDivElement>, change: BranchesStackChange) => void;
	onDragOverStack: (event: ReactDragEvent<HTMLElement>) => void;
	onDragLeaveStack: (event: ReactDragEvent<HTMLElement>) => void;
	onDropStack: (event: ReactDragEvent<HTMLElement>) => void;
	onDragOverStackHeader: (event: ReactDragEvent<HTMLElement>, targetKey?: string) => void;
	onDragLeaveStackHeader: (event: ReactDragEvent<HTMLElement>, targetKey?: string) => void;
	onDropStackHeader: (event: ReactDragEvent<HTMLElement>) => void;
	onDragOverCommit: (event: ReactDragEvent<HTMLElement>, change: BranchesStackChange, targetKey: string) => void;
	onDragLeaveCommit: (event: ReactDragEvent<HTMLElement>, change: BranchesStackChange, targetKey: string) => void;
	onDropCommit: (event: ReactDragEvent<HTMLElement>, change: BranchesStackChange) => void;
	onPreviewOperation: (operation: VcsWorkspaceOperation) => void;
	stackDropTargetState: WorkspaceDropTargetState;
	stackHeaderDropTargetState: WorkspaceDropTargetState;
	getStackHeaderDropTargetState: (targetKey: string) => WorkspaceDropTargetState;
	getCommitDropTargetState: (change: BranchesStackChange, targetKey: string) => WorkspaceDropTargetState;
}): React.ReactElement {
	const groups = groupStackChangesByHead(stack);
	return (
		<VcsColumn
			id="stack"
			title={stack.id}
			count={stack.heads.length}
			width={width}
			minWidth={WORKSPACE_COLUMN_LIMITS.stack.min}
			maxWidth={WORKSPACE_COLUMN_LIMITS.stack.max}
			onCollapse={onCollapse}
			onWidthChange={onWidthChange}
			hideHeader
			headerContent={
				<div className="flex min-w-0 items-center gap-2">
					<GitBranch size={15} className="text-accent" />
					<span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{stack.id}</span>
					<Button
						variant="ghost"
						size="sm"
						icon={<X size={14} />}
						disabled={isUpdating}
						aria-label={`Unapply ${stack.id}`}
						title={`Unapply ${stack.id}`}
						onClick={onUnapply}
					/>
				</div>
			}
		>
			<div
				data-testid="vcs-workspace-stack-drop-target"
				data-stack-id={stack.id}
				data-drop-target-state={stackDropTargetState}
				className={cn(
					"min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle,_rgba(125,125,125,0.18)_1px,_transparent_1px)] [background-size:10px_10px] p-3 transition-shadow",
					workspaceDropTargetClassName(stackDropTargetState),
				)}
				onDragOver={onDragOverStack}
				onDragLeave={onDragLeaveStack}
				onDrop={onDropStack}
			>
				<StackStartCommitPanel
					composer={composer}
					stagedFiles={stagedFiles}
					selectedStagedFilePath={selectedStagedFilePath}
					fileViewMode={fileViewMode}
					dropTargetState={stackHeaderDropTargetState}
					onDragOver={onDragOverStackHeader}
					onDragLeave={onDragLeaveStackHeader}
					onDrop={onDropStackHeader}
					onStartCommit={onStartCommit}
					onTitleChange={onComposerTitleChange}
					onBodyChange={onComposerBodyChange}
					onCancel={onComposerCancel}
					onPreview={onComposerPreview}
					onFileViewModeChange={onFileViewModeChange}
					onSelectStagedFile={onSelectComposerStagedFile}
				/>
				<div className="grid gap-3">
					{groups.map((group, groupIndex) => (
						<WorkspaceStackCard
							key={`${group.head.bookmarkName}-${groupIndex}`}
							stackId={stack.id}
							group={group}
							groupIndex={groupIndex}
							selectedCommitHash={selectedCommitHash}
							selectedFilePath={selectedFilePath}
							selectedFiles={selectedFiles}
							conflictCommitIds={conflictCommitIds}
							conflictPathsByCommitId={conflictPathsByCommitId}
							diffState={diffState}
							fileViewMode={fileViewMode}
							isFileSectionCollapsed={isFileSectionCollapsed}
							canEditCommit={canEditCommit}
							onFileViewModeChange={onFileViewModeChange}
							onFileSectionCollapsedChange={onFileSectionCollapsedChange}
							onSelectStackChange={onSelectStackChange}
							onEditCommit={onEditCommit}
							onUncommitCommit={onUncommitCommit}
							onBeginEditCommit={onBeginEditCommit}
							onSelectFile={onSelectFile}
							onFileDragStart={onFileDragStart}
							onCommitDragStart={onCommitDragStart}
							onDragOverStackHeader={onDragOverStackHeader}
							onDragLeaveStackHeader={onDragLeaveStackHeader}
							onDropStackHeader={onDropStackHeader}
							onDragOverCommit={onDragOverCommit}
							onDragLeaveCommit={onDragLeaveCommit}
							onDropCommit={onDropCommit}
							onPreviewOperation={onPreviewOperation}
							getStackHeaderDropTargetState={getStackHeaderDropTargetState}
							getCommitDropTargetState={getCommitDropTargetState}
						/>
					))}
				</div>
			</div>
		</VcsColumn>
	);
}

function StackStartCommitPanel({
	composer,
	stagedFiles,
	selectedStagedFilePath,
	fileViewMode,
	dropTargetState,
	onDragOver,
	onDragLeave,
	onDrop,
	onStartCommit,
	onTitleChange,
	onBodyChange,
	onCancel,
	onPreview,
	onFileViewModeChange,
	onSelectStagedFile,
}: {
	composer: StackCommitComposerState | null;
	stagedFiles: VcsFileChange[];
	selectedStagedFilePath: string | null;
	fileViewMode: VcsFileViewMode;
	dropTargetState: WorkspaceDropTargetState;
	onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
	onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
	onDrop: (event: ReactDragEvent<HTMLElement>) => void;
	onStartCommit: () => void;
	onTitleChange: (title: string) => void;
	onBodyChange: (body: string) => void;
	onCancel: () => void;
	onPreview: () => void;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onSelectStagedFile: (path: string) => void;
}): React.ReactElement {
	const hasSelection = Boolean(composer?.selection);
	const title = composer?.title ?? "";
	const body = composer?.body ?? "";
	const hasStagedFiles = stagedFiles.length > 0;
	return (
		<div className="mb-3 rounded-lg border border-border bg-surface-0/90 p-3 shadow-sm">
			{hasStagedFiles ? null : (
				<div
					data-testid="vcs-workspace-stack-header-drop-target"
					data-drop-target-state={dropTargetState}
					className={cn(
						"rounded-md border-2 border-dashed border-border bg-surface-1/70 px-3 py-5 text-center text-sm font-medium text-text-secondary transition-colors",
						dropTargetState === "valid" && "border-accent/80 bg-accent/10 text-accent",
						dropTargetState === "invalid" && "border-status-red/80 bg-status-red/10 text-status-red",
						workspaceDropTargetOverlayClassName(dropTargetState),
					)}
					onDragOver={onDragOver}
					onDragLeave={onDragLeave}
					onDrop={onDrop}
				>
					Drop files to stage or commit directly
				</div>
			)}
			{composer ? (
				<div className={cn("grid gap-3", !hasStagedFiles && "mt-3")}>
					{hasStagedFiles ? (
						<div
							data-testid="vcs-workspace-staged-drop-target"
							data-drop-target-state={dropTargetState}
							className={cn(
								"overflow-hidden rounded-md border border-border bg-surface-0 transition-shadow",
								workspaceDropTargetClassName(dropTargetState),
								workspaceDropTargetOverlayClassName(dropTargetState),
							)}
							onDragOver={onDragOver}
							onDragLeave={onDragLeave}
							onDrop={onDrop}
						>
							<VcsInlineFileSection
								title="Staged"
								files={stagedFiles}
								selectedPath={selectedStagedFilePath}
								viewMode={fileViewMode}
								onViewModeChange={onFileViewModeChange}
								onSelectPath={onSelectStagedFile}
								className="mx-0 mb-0 rounded-none border-0 bg-transparent"
							/>
						</div>
					) : null}
				<div className="rounded-md border border-border bg-surface-0">
					<input
						className="h-11 w-full rounded-t-md border-0 border-b border-border bg-transparent px-3 text-sm font-medium text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
						placeholder="Commit title (required)"
						value={title}
						onChange={(event) => onTitleChange(event.target.value)}
						onKeyDown={(event) => {
							if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
								onPreview();
							}
						}}
					/>
					<textarea
						className="min-h-24 w-full resize-y border-0 bg-transparent px-3 py-3 font-mono text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
						placeholder="Commit message"
						value={body}
						onChange={(event) => onBodyChange(event.target.value)}
						onKeyDown={(event) => {
							if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
								onPreview();
							}
						}}
					/>
					<div className="mx-3 border-t border-divider py-3">
						{composer.error ? <div className="mb-3 text-xs text-status-red">{composer.error}</div> : null}
						<div className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] gap-2">
							<Button variant="default" onClick={onCancel}>
								Cancel
							</Button>
							<Button variant="primary" icon={<Play size={14} />} disabled={!title.trim() || !hasSelection} onClick={onPreview}>
								Create commit
							</Button>
						</div>
					</div>
				</div>
				</div>
			) : (
				<Button variant="default" className="mt-3 w-full justify-center" onClick={onStartCommit}>
					Start a commit...
				</Button>
			)}
		</div>
	);
}

function filesForSelection(files: VcsFileChange[], selection: VcsChangeSelection | null): VcsFileChange[] {
	if (!selection) {
		return [];
	}
	const selectedPaths = new Set(selection.hunks?.map((hunk) => hunk.path) ?? []);
	for (const path of selection.paths ?? []) {
		selectedPaths.add(path);
	}
	if (selectedPaths.size === 0) {
		return [];
	}
	return files.filter((file) => {
		for (const path of selectedPaths) {
			if (file.path === path || file.path.startsWith(`${path}/`)) {
				return true;
			}
		}
		return false;
	});
}

function commitHashForChangeId(stacks: BranchesStack[], changeId: string | null): string | null {
	if (!changeId) {
		return null;
	}
	for (const stack of stacks) {
		for (const change of stack.changes) {
			if (change.changeId === changeId) {
				return change.commitId;
			}
		}
	}
	return null;
}

function WorkspaceStackCard({
	stackId,
	group,
	groupIndex,
	selectedCommitHash,
	selectedFilePath,
	selectedFiles,
	conflictCommitIds,
	conflictPathsByCommitId,
	diffState,
	fileViewMode,
	isFileSectionCollapsed,
	canEditCommit,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectStackChange,
	onEditCommit,
	onUncommitCommit,
	onBeginEditCommit,
	onSelectFile,
	onFileDragStart,
	onCommitDragStart,
	onDragOverStackHeader,
	onDragLeaveStackHeader,
	onDropStackHeader,
	onDragOverCommit,
	onDragLeaveCommit,
	onDropCommit,
	onPreviewOperation,
	getStackHeaderDropTargetState,
	getCommitDropTargetState,
}: {
	stackId: string;
	group: StackChangeGroup;
	groupIndex: number;
	selectedCommitHash: string | null;
	selectedFilePath: string | null;
	selectedFiles: VcsFileChange[];
	conflictCommitIds: ReadonlySet<string>;
	conflictPathsByCommitId: ReadonlyMap<string, ReadonlySet<string>>;
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	canEditCommit: (change: BranchesStackChange) => boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectStackChange: (change: BranchesStackChange) => void;
	onEditCommit: (change: BranchesStackChange) => void;
	onUncommitCommit: (change: BranchesStackChange) => void;
	onBeginEditCommit: (change: BranchesStackChange) => void;
	onSelectFile: (path: string) => void;
	onFileDragStart: (event: ReactDragEvent<HTMLButtonElement>, file: VcsFileChange, change: BranchesStackChange) => void;
	onCommitDragStart: (event: ReactDragEvent<HTMLDivElement>, change: BranchesStackChange) => void;
	onDragOverStackHeader: (event: ReactDragEvent<HTMLElement>, targetKey: string) => void;
	onDragLeaveStackHeader: (event: ReactDragEvent<HTMLElement>, targetKey: string) => void;
	onDropStackHeader: (event: ReactDragEvent<HTMLElement>) => void;
	onDragOverCommit: (event: ReactDragEvent<HTMLElement>, change: BranchesStackChange, targetKey: string) => void;
	onDragLeaveCommit: (event: ReactDragEvent<HTMLElement>, change: BranchesStackChange, targetKey: string) => void;
	onDropCommit: (event: ReactDragEvent<HTMLElement>, change: BranchesStackChange) => void;
	onPreviewOperation: (operation: VcsWorkspaceOperation) => void;
	getStackHeaderDropTargetState: (targetKey: string) => WorkspaceDropTargetState;
	getCommitDropTargetState: (change: BranchesStackChange, targetKey: string) => WorkspaceDropTargetState;
}): React.ReactElement {
	const stackHeaderDropTargetKey = workspaceStackHeaderDropTargetInstanceKey(stackId, group.head.bookmarkName, groupIndex);
	const stackHeaderDropTargetState = getStackHeaderDropTargetState(stackHeaderDropTargetKey);
	const remoteBookmarkActions = getStackRemoteBookmarkActions(group);
	return (
		<section className="overflow-hidden rounded-lg border border-border bg-surface-0 shadow-sm">
			<header
				data-testid="vcs-workspace-stack-card-header-drop-target"
				data-drop-target-key={stackHeaderDropTargetKey}
				data-drop-target-state={stackHeaderDropTargetState}
				className={cn(
					"border-b border-divider px-3 py-3 transition-colors",
					workspaceDropTargetOverlayClassName(stackHeaderDropTargetState),
				)}
				onDragOver={(event) => onDragOverStackHeader(event, stackHeaderDropTargetKey)}
				onDragLeave={(event) => onDragLeaveStackHeader(event, stackHeaderDropTargetKey)}
				onDrop={onDropStackHeader}
			>
				<div className="flex min-w-0 items-center gap-2">
					<div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg">
						<GitBranch size={14} />
					</div>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-semibold text-text-primary">{group.head.bookmarkName}</div>
						<div className="mt-1 text-xs text-text-secondary">Nothing to push</div>
					</div>
				</div>
			</header>
			<div className="flex items-center gap-1.5 border-b border-divider bg-surface-1 px-3 py-2">
				<Button variant="default" size="sm" icon={<Upload size={13} />} disabled>
					Push
				</Button>
				<Button variant="ghost" size="sm" icon={<Sparkles size={13} />} aria-label="Stack actions" title="Stack actions" />
				<StackActionMenu
					remoteBookmarkActions={remoteBookmarkActions}
					onPreviewOperation={onPreviewOperation}
				/>
			</div>
			<div>
				{group.changes.length === 0 ? (
					<div className="px-3 py-4 text-sm text-text-secondary">No visible changes were returned for this stack head.</div>
				) : (
					group.changes.map((change) => {
						const dropTargetKey = workspaceCommitDropTargetInstanceKey(group.head.bookmarkName, groupIndex, change);
						const selected = selectedCommitHash === change.commitId;
						return (
							<WorkspaceStackChangeRow
								key={`${group.head.bookmarkName}-${groupIndex}-${change.changeId}`}
								change={change}
								dropTargetKey={dropTargetKey}
								selected={selected}
								selectedFilePath={selectedFilePath}
								selectedFiles={selectedFiles}
								hasConflict={conflictCommitIds.has(change.changeId)}
								conflictPaths={conflictPathsByCommitId.get(change.changeId) ?? EMPTY_CONFLICT_PATHS}
								diffState={diffState}
								fileViewMode={fileViewMode}
								isFileSectionCollapsed={isFileSectionCollapsed}
								canEditCommit={canEditCommit}
								canUncommitCommit={selected && selectedFiles.length > 0}
								onFileViewModeChange={onFileViewModeChange}
								onFileSectionCollapsedChange={onFileSectionCollapsedChange}
								onSelectStackChange={onSelectStackChange}
								onEditCommit={onEditCommit}
								onUncommitCommit={onUncommitCommit}
								onBeginEditCommit={onBeginEditCommit}
								onSelectFile={onSelectFile}
								onFileDragStart={onFileDragStart}
								onCommitDragStart={onCommitDragStart}
								onDragOverCommit={onDragOverCommit}
								onDragLeaveCommit={onDragLeaveCommit}
								onDropCommit={onDropCommit}
								dropTargetState={getCommitDropTargetState(change, dropTargetKey)}
							/>
						);
					})
				)}
			</div>
		</section>
	);
}

function StackActionMenu({
	remoteBookmarkActions,
	onPreviewOperation,
}: {
	remoteBookmarkActions: {
		tracked: StackRemoteBookmarkActionInfo | null;
		untracked: StackRemoteBookmarkActionInfo | null;
	};
	onPreviewOperation: (operation: VcsWorkspaceOperation) => void;
}): React.ReactElement {
	const trackInfo = remoteBookmarkActions.untracked;
	const untrackInfo = remoteBookmarkActions.tracked;
	return (
		<RadixDropdownMenu.Root>
			<RadixDropdownMenu.Trigger asChild>
				<Button
					variant="ghost"
					size="sm"
					icon={<MoreHorizontal size={14} />}
					aria-label="More stack actions"
					title="More stack actions"
					className="ml-auto"
				/>
			</RadixDropdownMenu.Trigger>
			<RadixDropdownMenu.Portal>
				<RadixDropdownMenu.Content
					align="end"
					sideOffset={6}
					className="z-[80] min-w-56 overflow-hidden rounded-md border border-border bg-surface-1 p-1 text-sm text-text-primary shadow-xl"
				>
					<RadixDropdownMenu.Item
						disabled={!trackInfo}
						className="flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-surface-3"
						onSelect={() => {
							if (!trackInfo) {
								return;
							}
							onPreviewOperation({
								kind: "track_remote_bookmark",
								bookmarkName: trackInfo.bookmarkName,
								remoteName: trackInfo.remoteName,
							});
						}}
					>
						<LockKeyhole size={14} className="text-status-orange" />
						<span className="min-w-0 flex-1">Track remote bookmark</span>
					</RadixDropdownMenu.Item>
					<RadixDropdownMenu.Item
						disabled={!untrackInfo}
						className="flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-surface-3"
						onSelect={() => {
							if (!untrackInfo) {
								return;
							}
							onPreviewOperation({
								kind: "untrack_remote_bookmark",
								bookmarkName: untrackInfo.bookmarkName,
								remoteName: untrackInfo.remoteName,
							});
						}}
					>
						<LockKeyhole size={14} className="text-text-tertiary" />
						<span className="min-w-0 flex-1">Untrack remote bookmark</span>
					</RadixDropdownMenu.Item>
					{trackInfo || untrackInfo ? (
						<div className="border-t border-divider px-2 py-1.5 text-xs text-text-tertiary">
							{(trackInfo ?? untrackInfo)?.remoteBookmark}
						</div>
					) : (
						<div className="border-t border-divider px-2 py-1.5 text-xs text-text-tertiary">
							No remote bookmark is available for this stack.
						</div>
					)}
				</RadixDropdownMenu.Content>
			</RadixDropdownMenu.Portal>
		</RadixDropdownMenu.Root>
	);
}

function WorkspaceStackChangeRow({
	change,
	dropTargetKey,
	selected,
	selectedFilePath,
	selectedFiles,
	hasConflict,
	conflictPaths,
	diffState,
	fileViewMode,
	isFileSectionCollapsed,
	canEditCommit,
	canUncommitCommit,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectStackChange,
	onEditCommit,
	onUncommitCommit,
	onBeginEditCommit,
	onSelectFile,
	onFileDragStart,
	onCommitDragStart,
	onDragOverCommit,
	onDragLeaveCommit,
	onDropCommit,
	dropTargetState,
}: {
	change: BranchesStack["changes"][number];
	dropTargetKey: string;
	selected: boolean;
	selectedFilePath: string | null;
	selectedFiles: VcsFileChange[];
	hasConflict: boolean;
	conflictPaths: ReadonlySet<string>;
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	canEditCommit: (change: BranchesStackChange) => boolean;
	canUncommitCommit: boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectStackChange: (change: BranchesStackChange) => void;
	onEditCommit: (change: BranchesStackChange) => void;
	onUncommitCommit: (change: BranchesStackChange) => void;
	onBeginEditCommit: (change: BranchesStackChange) => void;
	onSelectFile: (path: string) => void;
	onFileDragStart: (event: ReactDragEvent<HTMLButtonElement>, file: VcsFileChange, change: BranchesStackChange) => void;
	onCommitDragStart: (event: ReactDragEvent<HTMLDivElement>, change: BranchesStackChange) => void;
	onDragOverCommit: (event: ReactDragEvent<HTMLElement>, change: BranchesStackChange, targetKey: string) => void;
	onDragLeaveCommit: (event: ReactDragEvent<HTMLElement>, change: BranchesStackChange, targetKey: string) => void;
	onDropCommit: (event: ReactDragEvent<HTMLElement>, change: BranchesStackChange) => void;
	dropTargetState: WorkspaceDropTargetState;
}): React.ReactElement {
	const selectedError =
		diffState.status === "error"
			? diffState.message
			: diffState.status === "ready" && !diffState.data.ok
				? diffState.data.error ?? "The selected change diff could not be read."
				: null;
	const authorName = change.authorName?.trim() || null;
	const immutableInfo = getImmutableRemoteBookmarkInfo(change);

	return (
		<div
			draggable
			data-testid="vcs-workspace-commit-card"
			data-commit-id={change.commitId}
			data-drop-target-key={dropTargetKey}
			data-drop-target-state={dropTargetState}
			className={cn(
				"overflow-hidden border-b border-divider bg-surface-0 transition-shadow last:border-b-0",
				change.isCurrent && "border-l-4 border-l-accent",
				hasConflict && "border-status-red/35 bg-status-red/10",
				selected && "bg-surface-2",
				selected && SELECTED_CHANGE_MARKER_CLASS,
			)}
			onDragStart={(event) => onCommitDragStart(event, change)}
			onDragOver={(event) => onDragOverCommit(event, change, dropTargetKey)}
			onDragLeave={(event) => onDragLeaveCommit(event, change, dropTargetKey)}
			onDrop={(event) => onDropCommit(event, change)}
		>
			<div className={cn("flex min-w-0 items-center gap-1 px-3 py-3 transition-colors hover:bg-surface-2", workspaceCommitDropTargetClassName(dropTargetState))}>
				<button
					type="button"
					className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
					onClick={() => onSelectStackChange(change)}
				>
					<div className="relative flex w-6 shrink-0 justify-center self-stretch">
						<span className="absolute bottom-[-13px] top-[-13px] w-px bg-accent" />
						<span className={cn("relative mt-1 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-accent", hasConflict && "bg-status-red")} />
						{immutableInfo ? (
							<span
								className="absolute bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-full border border-status-orange/35 bg-surface-1 p-0.5 text-status-orange"
								title={immutableInfo.reason}
							>
								<LockKeyhole size={10} />
							</span>
						) : null}
					</div>
					<Avatar
						src={change.authorAvatarUrl}
						name={authorName}
						email={change.authorEmail}
						initials={authorInitials(authorName)}
						className="h-5 w-5 shrink-0"
					/>
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-medium text-text-primary">{change.title}</div>
						<div className="mt-1 flex min-w-0 items-center gap-2">
							<CopyValueButton displayValue={change.commitId.slice(0, 8)} copyValue={change.commitId} />
							<span className="text-text-tertiary">·</span>
							<CopyValueButton label="Commit" displayValue={change.changeId} copyValue={change.changeId} />
						</div>
					</div>
					{hasConflict ? <StatusChip label="conflict" tone="red" icon={<AlertTriangle size={11} />} /> : null}
					{change.isHead ? <StatusChip label="head" tone="green" /> : null}
				</button>
				<CommitActionMenu
					change={change}
					canRewrite={canEditCommit(change)}
					canUncommit={canUncommitCommit}
					immutableInfo={immutableInfo}
					onUncommit={onUncommitCommit}
					onReword={onEditCommit}
					onEdit={onBeginEditCommit}
				/>
			</div>
			{selected ? (
				<VcsInlineFileSection
					title="Changed files"
					files={selectedFiles}
					selectedPath={selectedFilePath}
					isLoading={diffState.status === "loading"}
					errorMessage={selectedError}
					viewMode={fileViewMode}
					onViewModeChange={onFileViewModeChange}
					collapsed={isFileSectionCollapsed}
					onCollapsedChange={onFileSectionCollapsedChange}
					onSelectPath={onSelectFile}
					onFileDragStart={(event, file) => onFileDragStart(event, file, change)}
					conflictPaths={conflictPaths}
				/>
			) : null}
		</div>
	);
}

function CommitActionMenu({
	change,
	canRewrite,
	canUncommit,
	immutableInfo,
	onUncommit,
	onReword,
	onEdit,
}: {
	change: BranchesStackChange;
	canRewrite: boolean;
	canUncommit: boolean;
	immutableInfo: ImmutableRemoteBookmarkInfo | null;
	onUncommit: (change: BranchesStackChange) => void;
	onReword: (change: BranchesStackChange) => void;
	onEdit: (change: BranchesStackChange) => void;
}): React.ReactElement {
	const canChooseRewriteAction = canRewrite || Boolean(immutableInfo);
	const disabledReason = canRewrite ? undefined : immutableInfo?.reason ?? "This commit cannot be rewritten from this workspace.";
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
	function closeMenu(): void {
		setMenuPosition(null);
	}
	function toggleMenu(event: React.MouseEvent<HTMLButtonElement>): void {
		event.stopPropagation();
		const rect = event.currentTarget.getBoundingClientRect();
		setMenuPosition((current) =>
			current
				? null
				: {
						top: rect.bottom + 4,
						left: Math.max(8, rect.right - 220),
					},
		);
	}
	return (
		<>
			<Button
				ref={triggerRef}
				variant="ghost"
				size="sm"
				icon={<MoreHorizontal size={14} />}
				aria-label={`Commit actions ${change.title}`}
				title="Commit actions"
				onClick={toggleMenu}
			/>
			{menuPosition ? (
				<>
					<button type="button" aria-label="Close commit actions" className="fixed inset-0 z-40 cursor-default bg-transparent" onClick={closeMenu} />
					<div
						role="menu"
						className="fixed z-50 min-w-[220px] rounded-md border border-border-bright bg-surface-1 p-1 shadow-xl"
						style={{ top: menuPosition.top, left: menuPosition.left }}
					>
						<CommitActionMenuItem
							icon={<RotateCcw size={16} />}
							label="Uncommit"
							disabled={!canChooseRewriteAction || (!canUncommit && !immutableInfo)}
							title={!canUncommit && !immutableInfo ? "Select this commit and load its changed files before uncommitting." : disabledReason}
							onSelect={() => {
								closeMenu();
								onUncommit(change);
							}}
						/>
						<CommitActionMenuItem
							icon={<PencilLine size={16} />}
							label="Reword commit"
							disabled={!canChooseRewriteAction}
							title={disabledReason}
							onSelect={() => {
								closeMenu();
								onReword(change);
							}}
						/>
						<CommitActionMenuItem
							icon={<GitBranch size={16} />}
							label="Edit commit"
							disabled={!canChooseRewriteAction}
							title={disabledReason}
							onSelect={() => {
								closeMenu();
								onEdit(change);
							}}
						/>
					</div>
				</>
			) : null}
		</>
	);
}

function CommitActionMenuItem({
	icon,
	label,
	disabled,
	title,
	onSelect,
}: {
	icon: React.ReactNode;
	label: string;
	disabled?: boolean;
	title?: string;
	onSelect: () => void;
}): React.ReactElement {
	return (
		<button
			type="button"
			role="menuitem"
			disabled={disabled}
			title={title}
			className="flex w-full cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-left text-[13px] text-text-primary outline-none hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-45"
			onClick={onSelect}
		>
			<span className="shrink-0 text-text-tertiary">{icon}</span>
			<span>{label}</span>
		</button>
	);
}

function CommitEditModeOverlay({
	editMode,
	files,
	isFilesLoading,
	selectedPath,
	fileViewMode,
	onFileViewModeChange,
	onSelectPath,
	onAbort,
	onSave,
}: {
	editMode: CommitEditModeState | null;
	files: VcsFileChange[];
	isFilesLoading: boolean;
	selectedPath: string | null;
	fileViewMode: VcsFileViewMode;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onSelectPath: (path: string) => void;
	onAbort: () => void;
	onSave: () => void;
}): React.ReactElement | null {
	if (!editMode) {
		return null;
	}
	const target = editMode.target;
	const authorName = target.authorName?.trim() || null;
	const shortCommitId = target.commitId.slice(0, 8);
	return (
		<div className="fixed inset-0 z-50 flex flex-col bg-surface-0 text-text-primary">
			<div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-10 py-10">
				<header className="mb-8 flex flex-wrap items-center gap-3">
					<h2 className="text-2xl font-semibold tracking-normal text-text-primary">
						You are editing commit
					</h2>
					<CopyValueButton label="Change" displayValue={target.changeId} copyValue={target.changeId} className="h-8 px-2 text-sm" />
					<CopyValueButton label="SHA" displayValue={shortCommitId} copyValue={target.commitId} className="h-8 px-2 text-sm" />
					<Info size={22} className="text-text-tertiary" />
				</header>

				<section className="mb-3 rounded-lg border border-border-bright bg-surface-1 p-5 shadow-sm">
					<div className="border-l-4 border-border-bright pl-4">
						<div className="text-lg font-semibold text-text-primary">{target.title}</div>
						<div className="mt-3 flex items-center gap-2 text-sm text-text-secondary">
							<Avatar
								src={target.authorAvatarUrl}
								name={authorName}
								email={target.authorEmail}
								initials={authorInitials(authorName)}
								className="h-5 w-5"
							/>
							<span>{shortCommitId}</span>
							<span>•</span>
							<span>{authorName ?? target.authorEmail ?? "Unknown author"}</span>
						</div>
					</div>
				</section>

				<VcsInlineFileSection
					title="Changed files"
					files={files}
					selectedPath={selectedPath}
					isLoading={isFilesLoading}
					viewMode={fileViewMode}
					onViewModeChange={onFileViewModeChange}
					onSelectPath={onSelectPath}
					className="mx-0 mb-0 border-border-bright bg-surface-1 shadow-sm"
				/>

				<div className="mt-8 flex w-full items-start gap-2 rounded-lg border border-border bg-surface-1 px-5 py-4 text-sm text-text-secondary">
					<AlertTriangle size={16} className="mt-0.5 shrink-0 text-text-tertiary" />
					<div>
						<div>Please don&apos;t make any commits while in edit mode.</div>
						<div>To exit edit mode, use the provided actions.</div>
						{editMode.editCommitId ? <div className="mt-2 font-mono text-xs text-text-tertiary">Edit change: {editMode.editCommitId}</div> : null}
						{editMode.error ? <div className="mt-3 text-sm text-status-red">{editMode.error}</div> : null}
					</div>
				</div>

				<footer className="mt-auto flex justify-end gap-3 pt-8">
					<Button variant="default" disabled={editMode.isSaving} onClick={onAbort}>
						Abort
					</Button>
					<Button variant="primary" icon={<Check size={16} />} disabled={editMode.isSaving || !editMode.editCommitId} onClick={onSave}>
						Save changes and exit
					</Button>
				</footer>
			</div>
		</div>
	);
}

function CommitMessageEditDialog({
	edit,
	onChangeTitle,
	onPreview,
	onClose,
}: {
	edit: { commitId: string; title: string } | null;
	onChangeTitle: (title: string) => void;
	onPreview: (message: string) => void;
	onClose: () => void;
}): React.ReactElement {
	const message = edit?.title ?? "";
	const trimmedMessage = message.trim();
	return (
		<Dialog
			open={edit !== null}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			contentClassName="max-w-xl"
		>
			<DialogHeader title="Edit Commit Message" icon={<Pencil size={16} />} />
			<DialogBody>
				<label className="grid gap-2 text-sm text-text-secondary">
					<span className="font-medium text-text-primary">Commit message</span>
					<textarea
						className="min-h-28 resize-y rounded-md border border-border bg-surface-0 px-3 py-2 font-mono text-[13px] text-text-primary outline-none focus:border-accent"
						value={message}
						onChange={(event) => onChangeTitle(event.target.value)}
					/>
				</label>
			</DialogBody>
			<DialogFooter>
				<Button variant="ghost" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					icon={<Play size={14} />}
					disabled={!trimmedMessage}
					onClick={() => onPreview(trimmedMessage)}
				>
					Preview changes
				</Button>
			</DialogFooter>
		</Dialog>
	);
}

function ImmutableCommitDialog({
	prompt,
	onTrack,
	onClose,
}: {
	prompt: ImmutableCommitPromptState | null;
	onTrack: (prompt: ImmutableCommitPromptState) => void;
	onClose: () => void;
}): React.ReactElement {
	return (
		<Dialog
			open={prompt !== null}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			contentClassName="max-w-lg"
		>
			<DialogHeader title="Commit Is Immutable" icon={<LockKeyhole size={16} />} />
			<DialogBody>
				<div className="grid gap-4 text-sm text-text-secondary">
					<p>
						{prompt ? `Cannot ${prompt.actionLabel} because this commit is only reachable through an untracked remote bookmark.` : null}
					</p>
					{prompt ? (
						<div className="rounded-md border border-border bg-surface-0 px-3 py-2">
							<div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Remote bookmark</div>
							<div className="mt-1 font-mono text-sm text-text-primary">{prompt.remoteBookmark}</div>
						</div>
					) : null}
					<p>Start tracking the remote bookmark to create a local tracked bookmark, then retry the action.</p>
				</div>
			</DialogBody>
			<DialogFooter>
				<Button variant="default" onClick={onClose}>
					Cancel
				</Button>
				<Button variant="primary" icon={<Check size={16} />} disabled={!prompt} onClick={() => prompt && onTrack(prompt)}>
					Start tracking
				</Button>
			</DialogFooter>
		</Dialog>
	);
}

function WorkspaceOperationPreviewDialog({
	operation,
	previewState,
	applyError,
	isApplying,
	onApply,
	onClose,
}: {
	operation: VcsWorkspaceOperation | null;
	previewState: QueryState<VcsOperationPreview>;
	applyError: string | null;
	isApplying: boolean;
	onApply: () => void;
	onClose: () => void;
}): React.ReactElement {
	const isPreviewCurrent =
		operation !== null &&
		previewState.status === "ready" &&
		areVcsWorkspaceOperationsEqual(previewState.data.operation, operation);
	return (
		<Dialog
			open={operation !== null}
			onOpenChange={(open) => {
				if (!open) {
					onClose();
				}
			}}
			contentClassName="max-w-2xl"
		>
			<DialogHeader title="Workspace Operation" icon={<GitBranch size={16} />} />
			<DialogBody>
				{previewState.status === "loading" ? (
					<div className="flex items-center gap-2 text-sm text-text-secondary">
						<Spinner size={16} />
						Loading preview.
					</div>
				) : previewState.status === "error" ? (
					<p className="text-sm text-status-red">{previewState.message}</p>
				) : (
					<div className="grid gap-3">
						<KeyValue
							label="Risk"
							value={
								<StatusChip
									label={previewState.data.risk}
									tone={previewState.data.risk === "high" ? "red" : previewState.data.risk === "medium" ? "orange" : "green"}
								/>
							}
						/>
						<KeyValue label="Summary" value={previewState.data.summary} />
						{previewState.data.disabledReason ? (
							<KeyValue label="Disabled" value={previewState.data.disabledReason} />
						) : null}
						{!isPreviewCurrent ? (
							<KeyValue label="Status" value="Preview is stale. Reopen this operation before applying it." />
						) : null}
						{previewState.data.affectedStackIds.length > 0 ? (
							<KeyValue label="Stacks" value={previewState.data.affectedStackIds.join(", ")} />
						) : null}
						{previewState.data.affectedCommitIds.length > 0 ? (
							<KeyValue label="Commits" value={previewState.data.affectedCommitIds.join(", ")} />
						) : null}
						{previewState.data.affectedPaths.length > 0 ? (
							<KeyValue label="Paths" value={previewState.data.affectedPaths.join(", ")} />
						) : null}
						{previewState.data.warnings.length > 0 ? (
							<KeyValue
								label="Warnings"
								value={previewState.data.warnings.map((warning) => (
									<p className="text-[13px] text-text-secondary" key={`${warning.code}-${warning.message}`}>
										{warning.message}
									</p>
								))}
							/>
						) : null}
						{applyError ? <p className="text-sm text-status-red">{applyError}</p> : null}
					</div>
				)}
			</DialogBody>
			<DialogFooter>
				<Button variant="ghost" onClick={onClose}>
					Close
				</Button>
				<Button
					variant="primary"
					icon={isApplying ? <Spinner size={14} /> : <Play size={14} />}
					disabled={previewState.status !== "ready" || !previewState.data.valid || !isPreviewCurrent || isApplying}
					onClick={onApply}
				>
					{isApplying ? "Applying" : "Apply operation"}
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
