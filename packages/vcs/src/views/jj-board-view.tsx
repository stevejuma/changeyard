import { FileText, Folder, FolderTree, GitBranch, List, MoreHorizontal, PanelLeft, Sparkles, Upload, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

import {
	groupStackChangesByHead,
	selectAppliedWorkspaceStacks,
	type BranchesStack,
	type BranchesStackChange,
	type StackChangeGroup,
} from "@/branches-stack-model";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { CopyValueButton } from "@/components/ui/copy-value-button";
import { FileStatusGlyph, StatusChip } from "@/components/ui/status-chip";
import {
	findFileByPath,
	getFirstFilePath,
	VcsCollapsedColumn,
	VcsColumn,
	VcsFileDiffColumn,
	VcsInlineFileSection,
	type VcsFileChange,
} from "@/components/vcs-file-columns";
import { DiagnosticsPanel, EmptyState, QueryGate } from "@/components/vcs-panels";
import { NoProjectSelected, SelectProjectButton, VcsShell, type VcsShellProjectState } from "@/components/vcs-shell";
import type {
	QueryState,
	RuntimeGitCommitDiffResponse,
	RuntimeProjectConfigResponse,
	RuntimeProjectConfigUpdateRequest,
	VcsJjDiffResponse,
	VcsJjStateResponse,
} from "@/runtime/types";
import { postTrpcMutation, useTrpcInputQuery, useTrpcQuery } from "@/runtime/trpc-client";
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

const SELECTED_CHANGE_MARKER_CLASS =
	"relative before:absolute before:left-0 before:top-1/2 before:h-12 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:content-['']";

const WORKSPACE_COLUMN_LIMITS = {
	unstaged: { min: 240, max: 520, fallback: 300, key: VCS_LAYOUT_STORAGE_KEYS.workspaceUnstagedWidth },
	stack: { min: 320, max: 680, fallback: 380 },
	diff: { min: 420, max: 980, fallback: 640, key: VCS_LAYOUT_STORAGE_KEYS.branchesDiffWidth },
} as const;
const WORKSPACE_TRAILING_SPACER_WIDTH = WORKSPACE_COLUMN_LIMITS.diff.fallback;

function stackColumnWidthKey(stackId: string): string {
	return `changeyard.vcs.workspace.stack.${stackId}.width`;
}

function stackColumnCollapsedKey(stackId: string): string {
	return `changeyard.vcs.workspace.stack.${stackId}.collapsed`;
}

function readQueryParam(name: string): string | null {
	return new URLSearchParams(window.location.search).get(name)?.trim() || null;
}

function writeQueryParam(name: string, value: string | null): void {
	const url = new URL(window.location.href);
	if (value) {
		url.searchParams.set(name, value);
	} else {
		url.searchParams.delete(name);
	}
	window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function readWorkingCopyFileQueryParam(): string | null {
	return readQueryParam("workingCopyFile") ?? readQueryParam("unstagedFile");
}

function writeWorkingCopyFileQueryParam(value: string | null): void {
	writeQueryParam("workingCopyFile", value);
	writeQueryParam("unstagedFile", null);
}

function toFileChanges(diffState: QueryState<RuntimeGitCommitDiffResponse>): VcsFileChange[] {
	if (diffState.status !== "ready" || !diffState.data.ok) {
		return [];
	}
	return diffState.data.files;
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

function toWorkingCopyDiffFiles(diffState: QueryState<VcsJjDiffResponse>): VcsFileChange[] {
	if (diffState.status !== "ready") {
		return [];
	}
	return parseWorkingCopyPatchFiles(diffState.data.patch);
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

export function JjBoardView({
	state,
	diffState,
	currentPath,
	projectState,
	workspaceId,
}: {
	state: QueryState<VcsJjStateResponse>;
	refreshState: () => void;
	diffState: QueryState<VcsJjDiffResponse>;
	refreshDiff: () => void;
	currentPath: string;
	projectState: VcsShellProjectState;
	workspaceId: string | null;
}): React.ReactElement {
	const projectConfigQuery = useTrpcQuery<RuntimeProjectConfigResponse>(
		"changes.getProjectConfig",
		"Failed to load project configuration.",
		workspaceId,
		Boolean(workspaceId),
	);

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
									refreshProjectConfig={projectConfigQuery.refresh}
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
	refreshProjectConfig,
	workspaceId,
}: {
	data: VcsJjStateResponse;
	diffState: QueryState<VcsJjDiffResponse>;
	projectConfig: RuntimeProjectConfigResponse;
	refreshProjectConfig: () => void;
	workspaceId: string;
}): React.ReactElement {
	const [updatingStackId, setUpdatingStackId] = useState<string | null>(null);
	const [fileViewMode, setFileViewMode] = useState<VcsFileViewMode>(() => readVcsFileViewMode());
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(() => readQueryParam("commit"));
	const [selectedFilePath, setSelectedFilePath] = useState<string | null>(() => readQueryParam("file"));
	const [selectedUnstagedFilePath, setSelectedUnstagedFilePath] = useState<string | null>(() => readWorkingCopyFileQueryParam());
	const [hasUserClearedFile, setHasUserClearedFile] = useState(false);
	const [isFileSectionCollapsed, setFileSectionCollapsed] = useState(false);
	const [isUnstagedCollapsed, setUnstagedCollapsed] = useState(() =>
		readVcsBooleanPreference(VCS_LAYOUT_STORAGE_KEYS.workspaceWorkingCopyCollapsed, false),
	);
	const [collapsedStackIds, setCollapsedStackIds] = useState<Record<string, boolean>>({});
	const [stackColumnWidths, setStackColumnWidths] = useState<Record<string, number>>({});
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
	const appliedStackIds = projectConfig.vcsAppliedStacks ?? [];
	const appliedStacks = useMemo(
		() => selectAppliedWorkspaceStacks(data.stacks, appliedStackIds),
		[data.stacks, appliedStackIds],
	);
	const selectedStackId = useMemo(() => {
		if (!selectedCommitHash) {
			return null;
		}
		return appliedStacks.find((stack) => stack.changes.some((change) => change.commitId === selectedCommitHash))?.id ?? null;
	}, [appliedStacks, selectedCommitHash]);
	const commitDiffQuery = useTrpcInputQuery<RuntimeGitCommitDiffResponse>(
		"workspace.getRepositoryCommitDiff",
		{ commitHash: selectedCommitHash ?? "" },
		"Failed to load commit diff.",
		Boolean(workspaceId && selectedCommitHash),
		workspaceId,
	);
	const files = toFileChanges(commitDiffQuery.state);
	const selectedFile = findFileByPath(files, selectedFilePath);
	const unstagedDiffFiles = useMemo(() => toWorkingCopyDiffFiles(diffState), [diffState]);
	const selectedUnstagedFallbackFile = data.unassignedChanges.find((change) => change.path === selectedUnstagedFilePath);
	const selectedUnstagedFile =
		findFileByPath(unstagedDiffFiles, selectedUnstagedFilePath) ??
		(selectedUnstagedFallbackFile
			? { path: selectedUnstagedFallbackFile.path, status: selectedUnstagedFallbackFile.status }
			: null);

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
		const nextStackIds = appliedStackIds.filter((candidate) => candidate !== stackId);
		setUpdatingStackId(stackId);
		try {
			await postTrpcMutation<RuntimeProjectConfigResponse>(
				"changes.updateProjectConfig",
				{ vcsAppliedStacks: nextStackIds } satisfies RuntimeProjectConfigUpdateRequest,
				workspaceId,
			);
			refreshProjectConfig();
		} finally {
			setUpdatingStackId(null);
		}
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
		setHasUserClearedFile(false);
		writeQueryParam("file", path);
		writeWorkingCopyFileQueryParam(null);
	}

	function selectUnstagedFile(path: string): void {
		if (selectedUnstagedFilePath === path) {
			setSelectedUnstagedFilePath(null);
			writeWorkingCopyFileQueryParam(null);
			return;
		}
		setSelectedUnstagedFilePath(path);
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
		/>
	) : null;

	return (
		<div className="h-full min-h-0 overflow-x-auto overflow-y-hidden bg-surface-0 p-3">
			<div className="flex h-full min-h-0 gap-3">
				{isUnstagedCollapsed ? (
					<VcsCollapsedColumn
						label="Working Copy"
						count={data.unassignedChanges.length}
						onExpand={() => changeUnstagedCollapsed(false)}
					/>
				) : (
					<UnstagedColumn
						changes={data.unassignedChanges}
						width={unstagedColumnWidth}
						fileViewMode={fileViewMode}
						selectedPath={selectedUnstagedFilePath}
						onCollapse={() => changeUnstagedCollapsed(true)}
						onWidthChange={changeUnstagedColumnWidth}
						onFileViewModeChange={changeFileViewMode}
						onSelectPath={selectUnstagedFile}
					/>
				)}
				{unstagedDiffColumn}
				{appliedStacks.length === 0 ? (
					<EmptyWorkspaceLanes />
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
									diffState={commitDiffQuery.state}
									fileViewMode={fileViewMode}
									isFileSectionCollapsed={isFileSectionCollapsed}
									onFileViewModeChange={changeFileViewMode}
									onFileSectionCollapsedChange={changeFileSectionCollapsed}
									onSelectStackChange={selectStackChange}
									onSelectFile={selectFile}
								/>
							)}
							{selectedStackId === stack.id ? diffColumn : null}
						</Fragment>
					))
				)}
				{selectedFile && !selectedStackId ? diffColumn : null}
				<div
					aria-hidden
					className="h-full shrink-0"
					style={{ width: WORKSPACE_TRAILING_SPACER_WIDTH, minWidth: WORKSPACE_TRAILING_SPACER_WIDTH }}
				/>
			</div>
			<DiagnosticsPanel diagnostics={data.diagnostics} />
		</div>
	);
}

function UnstagedColumn({
	changes,
	width,
	fileViewMode,
	selectedPath,
	onCollapse,
	onWidthChange,
	onFileViewModeChange,
	onSelectPath,
}: {
	changes: VcsJjStateResponse["unassignedChanges"];
	width: number;
	fileViewMode: VcsFileViewMode;
	selectedPath: string | null;
	onCollapse: () => void;
	onWidthChange: (width: number) => void;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onSelectPath: (path: string) => void;
}): React.ReactElement {
	const files: VcsFileChange[] = changes.map((change) => ({ path: change.path, status: change.status }));
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
					fileViewMode={fileViewMode}
					onFileViewModeChange={onFileViewModeChange}
				/>
			}
		>
			<div className="h-full min-h-0">
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
					<UnstagedFileList
						files={files}
						viewMode={fileViewMode}
						selectedPath={selectedPath}
						onSelectPath={onSelectPath}
					/>
				)}
			</div>
		</VcsColumn>
	);
}

function UnstagedColumnHeader({
	count,
	fileViewMode,
	onFileViewModeChange,
}: {
	count: number;
	fileViewMode: VcsFileViewMode;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
}): React.ReactElement {
	return (
		<div className="flex min-w-0 items-center gap-2">
			<PanelLeft size={15} className="shrink-0 text-text-tertiary" />
			<span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">Working Copy</span>
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
	onSelectPath,
}: {
	files: VcsFileChange[];
	viewMode: VcsFileViewMode;
	selectedPath: string | null;
	onSelectPath: (path: string) => void;
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
							onSelectPath={onSelectPath}
							filesByPath={filesByPath}
						/>
					))
				: files.map((file) => (
						<UnstagedFileRow
							key={`${file.status}:${file.path}`}
							file={file}
							selected={file.path === selectedPath}
							onSelectPath={onSelectPath}
						/>
					))}
		</div>
	);
}

function UnstagedFileTreeRow({
	node,
	depth,
	selectedPath,
	onSelectPath,
	filesByPath,
}: {
	node: FileTreeNode;
	depth: number;
	selectedPath: string | null;
	onSelectPath: (path: string) => void;
	filesByPath: Map<string, VcsFileChange>;
}): React.ReactElement {
	const isDirectory = node.type === "directory";
	const file = filesByPath.get(node.path);
	const selected = !isDirectory && node.path === selectedPath;
	return (
		<div>
			<button
				type="button"
				disabled={isDirectory}
				className={cn(
					"kb-file-tree-row",
					isDirectory && "kb-file-tree-row-directory",
					!isDirectory && "cursor-pointer hover:bg-surface-2",
					selected && "kb-file-tree-row-selected",
				)}
				style={{ paddingLeft: depth * 12 + 8 }}
				onClick={() => {
					if (!isDirectory) {
						onSelectPath(node.path);
					}
				}}
			>
				{isDirectory ? <Folder size={14} /> : <FileText size={14} />}
				{file ? <FileStatusGlyph status={file.status} /> : null}
				<span className="min-w-0 flex-1 truncate">{node.name}</span>
			</button>
			{node.children.length > 0 ? (
				<div>
					{node.children.map((child) => (
						<UnstagedFileTreeRow
							key={child.path}
							node={child}
							depth={depth + 1}
							selectedPath={selectedPath}
							onSelectPath={onSelectPath}
							filesByPath={filesByPath}
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
	onSelectPath,
}: {
	file: VcsFileChange;
	selected: boolean;
	onSelectPath: (path: string) => void;
}): React.ReactElement {
	return (
		<button
			type="button"
			className={cn("kb-file-tree-row cursor-pointer hover:bg-surface-2", selected && "kb-file-tree-row-selected")}
			onClick={() => onSelectPath(file.path)}
		>
			<FileText size={14} />
			<FileStatusGlyph status={file.status} />
			<span className="min-w-0 flex-1 truncate">{file.path}</span>
		</button>
	);
}

function EmptyWorkspaceLanes(): React.ReactElement {
	return (
		<section className="flex h-full min-h-0 w-[520px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1">
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
	diffState,
	fileViewMode,
	isFileSectionCollapsed,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectStackChange,
	onSelectFile,
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
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectStackChange: (change: BranchesStackChange) => void;
	onSelectFile: (path: string) => void;
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
			<div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle,_rgba(125,125,125,0.18)_1px,_transparent_1px)] [background-size:10px_10px] p-3">
				<div className="mb-3 rounded-lg border border-dashed border-border bg-surface-0/80 px-3 py-3 text-center text-sm text-text-tertiary">
					Drop files to stage or commit directly
				</div>
				<div className="grid gap-3">
					{groups.map((group) => (
						<WorkspaceStackCard
							key={group.head.bookmarkName}
							group={group}
							selectedCommitHash={selectedCommitHash}
							selectedFilePath={selectedFilePath}
							selectedFiles={selectedFiles}
							diffState={diffState}
							fileViewMode={fileViewMode}
							isFileSectionCollapsed={isFileSectionCollapsed}
							onFileViewModeChange={onFileViewModeChange}
							onFileSectionCollapsedChange={onFileSectionCollapsedChange}
							onSelectStackChange={onSelectStackChange}
							onSelectFile={onSelectFile}
						/>
					))}
				</div>
			</div>
		</VcsColumn>
	);
}

function WorkspaceStackCard({
	group,
	selectedCommitHash,
	selectedFilePath,
	selectedFiles,
	diffState,
	fileViewMode,
	isFileSectionCollapsed,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectStackChange,
	onSelectFile,
}: {
	group: StackChangeGroup;
	selectedCommitHash: string | null;
	selectedFilePath: string | null;
	selectedFiles: VcsFileChange[];
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectStackChange: (change: BranchesStackChange) => void;
	onSelectFile: (path: string) => void;
}): React.ReactElement {
	return (
		<section className="overflow-hidden rounded-lg border border-border bg-surface-0 shadow-sm">
			<header className="border-b border-divider px-3 py-3">
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
				<Button variant="ghost" size="sm" icon={<MoreHorizontal size={14} />} aria-label="More stack actions" title="More stack actions" className="ml-auto" />
			</div>
			<div>
				{group.changes.length === 0 ? (
					<div className="px-3 py-4 text-sm text-text-secondary">No visible changes were returned for this stack head.</div>
				) : (
					group.changes.map((change) => (
						<WorkspaceStackChangeRow
							key={`${group.head.bookmarkName}-${change.changeId}`}
							change={change}
							selected={selectedCommitHash === change.commitId}
							selectedFilePath={selectedFilePath}
							selectedFiles={selectedFiles}
							diffState={diffState}
							fileViewMode={fileViewMode}
							isFileSectionCollapsed={isFileSectionCollapsed}
							onFileViewModeChange={onFileViewModeChange}
							onFileSectionCollapsedChange={onFileSectionCollapsedChange}
							onSelectStackChange={onSelectStackChange}
							onSelectFile={onSelectFile}
						/>
					))
				)}
			</div>
		</section>
	);
}

function WorkspaceStackChangeRow({
	change,
	selected,
	selectedFilePath,
	selectedFiles,
	diffState,
	fileViewMode,
	isFileSectionCollapsed,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectStackChange,
	onSelectFile,
}: {
	change: BranchesStack["changes"][number];
	selected: boolean;
	selectedFilePath: string | null;
	selectedFiles: VcsFileChange[];
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectStackChange: (change: BranchesStackChange) => void;
	onSelectFile: (path: string) => void;
}): React.ReactElement {
	const selectedError =
		diffState.status === "error"
			? diffState.message
			: diffState.status === "ready" && !diffState.data.ok
				? diffState.data.error ?? "The selected change diff could not be read."
				: null;
	const authorName = change.authorName?.trim() || null;

	return (
		<div
			className={cn(
				"overflow-hidden border-b border-divider bg-surface-0 last:border-b-0",
				change.isCurrent && "border-l-4 border-l-accent",
				selected && "bg-surface-2",
				selected && SELECTED_CHANGE_MARKER_CLASS,
			)}
		>
			<button
				type="button"
				className="flex w-full min-w-0 cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2"
				onClick={() => onSelectStackChange(change)}
			>
				<div className="relative flex w-6 shrink-0 justify-center self-stretch">
					<span className="absolute bottom-[-13px] top-[-13px] w-px bg-accent" />
					<span className="relative mt-1 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-accent" />
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
						<CopyValueButton label="Change" displayValue={change.changeId} copyValue={change.changeId} />
					</div>
				</div>
				{change.isHead ? <StatusChip label="head" tone="green" /> : null}
			</button>
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
				/>
			) : null}
		</div>
	);
}
