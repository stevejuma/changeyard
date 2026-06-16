import { GitBranch, GitPullRequest, Play, Search, Tag, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent as ReactDragEvent } from "react";

import {
	applyWorkspaceStackId,
	createBranchSelectionFallbackStack,
	findApplicableStackForBranchSelection,
	findContainingStackForBranchSelection,
	findStackForBranchSelection,
	normalizeAppliedStackIds,
	selectStackChangeGroupsForBranchDetail,
	unapplyWorkspaceStackId,
	type BranchesStack,
	type BranchesStackChange,
	type StackChangeGroup,
} from "@/branches-stack-model";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/button";
import { CopyValueButton } from "@/components/ui/copy-value-button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip } from "@/components/ui/status-chip";
import {
	findFileByPath,
	getFirstFilePath,
	VcsCollapsedColumn,
	VcsColumn,
	VcsFileDiffColumn,
	VcsInlineFileSection,
	type VcsFileChange,
} from "@/components/vcs-file-columns";
import { useVcsDiagnosticsToasts } from "@/components/vcs-diagnostics-toasts";
import { EmptyState, KeyValue, QueryGate } from "@/components/vcs-panels";
import { NoProjectSelected, SelectProjectButton, VcsShell, type VcsShellProjectState } from "@/components/vcs-shell";
import type {
	QueryState,
	RuntimeGitCommit,
	RuntimeGitCommitDiffResponse,
	RuntimeGitLogResponse,
	RuntimeProjectConfigResponse,
	VcsBranchesDataResponse,
	VcsJjInventoryItem,
	VcsJjInventoryResponse,
	VcsJjStateResponse,
} from "@/runtime/types";
import { useRtkPaginatedRepositoryLog } from "@/runtime/repository-log-api";
import {
	toRuntimeQueryState,
	useApplyVcsOperationMutation,
	useGetProjectConfigQuery,
	useGetVcsBranchesDataQuery,
	useGetVcsWorkspaceStateQuery,
	useGetRepositoryCommitDiffQuery,
	useLazyPreviewVcsOperationQuery,
	useUpdateProjectConfigMutation,
} from "@/runtime/vcs-api";
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
	serializeVcsWorkspaceDragPayload,
	VCS_WORKSPACE_DRAG_MIME,
	type VcsWorkspaceDragPayload,
} from "@/vcs-workspace-dnd";
import type { VcsWorkspaceState } from "@/vcs-workspace-contracts";
import {
	areVcsWorkspaceOperationsEqual,
	isLowRiskVcsWorkspaceOperation,
	type VcsOperationPreview,
	type VcsWorkspaceOperation,
} from "@/vcs-workspace-contracts";

type BranchFilter = "all" | "prs" | "local";
type BranchColumnId = "refs" | "stack";

const SELECTED_REF_MARKER_CLASS =
	"relative before:absolute before:left-0 before:top-1/2 before:h-12 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:content-['']";

const BRANCH_COLUMN_LIMITS = {
	refs: { min: 300, max: 580, fallback: 360, key: VCS_LAYOUT_STORAGE_KEYS.branchesRefsWidth },
	stack: { min: 380, max: 760, fallback: 500, key: VCS_LAYOUT_STORAGE_KEYS.branchesCommitsWidth },
	diff: { min: 420, max: 980, fallback: 640, key: VCS_LAYOUT_STORAGE_KEYS.branchesDiffWidth },
} as const;
const BRANCH_COLUMN_COLLAPSED_KEYS = {
	refs: VCS_LAYOUT_STORAGE_KEYS.branchesRefsCollapsed,
	stack: VCS_LAYOUT_STORAGE_KEYS.branchesStackCollapsed,
} as const;
const BRANCH_TRAILING_SPACER_WIDTH = BRANCH_COLUMN_LIMITS.diff.fallback;

const GROUP_LABELS: Record<VcsJjInventoryItem["group"], string> = {
	current: "Current workspace target",
	today: "Today",
	applied: "Applied",
	remote: "Remote work",
	local: "Local branches",
	tags: "Tags",
	older: "Older",
};

function itemIcon(item: VcsJjInventoryItem): React.ReactElement {
	if (item.type === "tag") {
		return <Tag size={14} />;
	}
	if (item.pr) {
		return <GitPullRequest size={14} />;
	}
	return <GitBranch size={14} />;
}

function getItemTarget(item: VcsJjInventoryItem): string {
	if (item.type === "workspace") {
		return item.name;
	}
	return item.target ?? item.name;
}

function getWorkspaceTargetLogRef(item: VcsJjInventoryItem | null): string | null {
	if (!item || item.type !== "workspace") {
		return null;
	}
	if (item.target && item.remoteName) {
		return `${item.target}@${item.remoteName}`;
	}
	return item.target ?? item.name;
}

function formatRelativeTime(timestamp: string | null): string | null {
	if (!timestamp) {
		return null;
	}
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return null;
	}
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	return months < 12 ? `${months} mo ago` : `${Math.floor(months / 12)} yr ago`;
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

function groupRecord(): Record<VcsJjInventoryItem["group"], VcsJjInventoryItem[]> {
	return { current: [], today: [], applied: [], remote: [], local: [], tags: [], older: [] };
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

function workspaceStackMembershipDisabledReason(
	state: QueryState<VcsWorkspaceState>,
	appliedStackCount: number,
	isApplied: boolean,
): string | null {
	if (state.status === "loading") {
		return "Workspace capabilities are still loading.";
	}
	if (state.status === "error") {
		return state.message;
	}
	if (!state.data.capabilities.supportsMultiAppliedWorkspace && appliedStackCount > 0 && !isApplied) {
		return "This provider supports one applied stack at a time.";
	}
	return null;
}

export function BranchesView({
	currentPath,
	projectState,
	workspaceId,
}: {
	currentPath: string;
	projectState: VcsShellProjectState;
	workspaceId: string | null;
}): React.ReactElement {
	const { location, setQueryParam } = useVcsRouter();
	function readQueryParam(name: string): string | null {
		return readVcsQueryParam(location.search, name);
	}
	function writeQueryParam(name: string, value: string | null): void {
		setQueryParam(name, value, { replace: true });
	}
	const hasWorkspace = Boolean(workspaceId);
	const activeWorkspacePath = projectState.activeWorkspacePath;
	const activeWorkspaceQuery = { workspaceId: workspaceId ?? "", workspacePath: activeWorkspacePath };
	const branchesDataResult = useGetVcsBranchesDataQuery(activeWorkspaceQuery, { skip: !hasWorkspace });
	const branchesDataState = toRuntimeQueryState<VcsBranchesDataResponse>(
		branchesDataResult,
		"Failed to load branch data.",
	);
	const workspaceStateResult = useGetVcsWorkspaceStateQuery(activeWorkspaceQuery, { skip: !hasWorkspace });
	const workspaceState = toRuntimeQueryState<VcsWorkspaceState>(
		workspaceStateResult,
		"Failed to load workspace capabilities.",
	);
	const inventoryQuery = {
		state:
			branchesDataState.status === "ready"
				? ({ status: "ready", data: branchesDataState.data.inventory } as const)
				: branchesDataState,
		refresh: () => void branchesDataResult.refetch(),
	};
	const stackQuery = {
		state:
			branchesDataState.status === "ready"
				? ({ status: "ready", data: branchesDataState.data.state } as const)
				: branchesDataState,
		refresh: () => void branchesDataResult.refetch(),
	};
	const projectConfigResult = useGetProjectConfigQuery({ workspaceId: workspaceId ?? "" }, { skip: !hasWorkspace });
	const [updateProjectConfig] = useUpdateProjectConfigMutation();
	const [applyVcsOperation] = useApplyVcsOperationMutation();
	const [previewVcsOperation, previewResult] = useLazyPreviewVcsOperationQuery();
	const projectConfigQuery = {
		state: toRuntimeQueryState<RuntimeProjectConfigResponse>(projectConfigResult, "Failed to load project configuration."),
		refresh: () => void projectConfigResult.refetch(),
	};
	const [filter, setFilter] = useState<BranchFilter>("all");
	const [search, setSearch] = useState("");
	const [collapsedColumns, setCollapsedColumns] = useState<Record<BranchColumnId, boolean>>({
		refs: readVcsBooleanPreference(BRANCH_COLUMN_COLLAPSED_KEYS.refs, false),
		stack: readVcsBooleanPreference(BRANCH_COLUMN_COLLAPSED_KEYS.stack, false),
	});
	const [columnWidths, setColumnWidths] = useState(() => ({
		refs: readVcsNumberPreference(BRANCH_COLUMN_LIMITS.refs.key, BRANCH_COLUMN_LIMITS.refs.fallback, BRANCH_COLUMN_LIMITS.refs.min, BRANCH_COLUMN_LIMITS.refs.max),
		stack: readVcsNumberPreference(BRANCH_COLUMN_LIMITS.stack.key, BRANCH_COLUMN_LIMITS.stack.fallback, BRANCH_COLUMN_LIMITS.stack.min, BRANCH_COLUMN_LIMITS.stack.max),
		diff: readVcsNumberPreference(BRANCH_COLUMN_LIMITS.diff.key, BRANCH_COLUMN_LIMITS.diff.fallback, BRANCH_COLUMN_LIMITS.diff.min, BRANCH_COLUMN_LIMITS.diff.max),
	}));
	const [fileViewMode, setFileViewMode] = useState<VcsFileViewMode>(() => readVcsFileViewMode());
	const [selectedRefName, setSelectedRefName] = useState<string | null>(() => readQueryParam("ref"));
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(() => readQueryParam("commit"));
	const [selectedFilePath, setSelectedFilePath] = useState<string | null>(() => readQueryParam("file"));
	const [hasUserClearedRef, setHasUserClearedRef] = useState(false);
	const [hasUserClearedFile, setHasUserClearedFile] = useState(false);
	const [isFileSectionCollapsed, setFileSectionCollapsed] = useState(false);
	const [updatingAppliedStackId, setUpdatingAppliedStackId] = useState<string | null>(null);
	const [pendingOperation, setPendingOperation] = useState<VcsWorkspaceOperation | null>(null);
	const [pendingAppliedStackIds, setPendingAppliedStackIds] = useState<string[] | null>(null);
	const [operationApplyError, setOperationApplyError] = useState<string | null>(null);
	const [isApplyingPreviewedOperation, setApplyingPreviewedOperation] = useState(false);
	const commitDiffResult = useGetRepositoryCommitDiffQuery(
		{ workspaceId: workspaceId ?? "", workspacePath: activeWorkspacePath, commitHash: selectedCommitHash ?? "" },
		{ skip: !workspaceId || !selectedCommitHash },
	);
	const commitDiffQuery = {
		state: toRuntimeQueryState<RuntimeGitCommitDiffResponse>(commitDiffResult, "Failed to load commit diff."),
		refresh: () => void commitDiffResult.refetch(),
	};
	const files = toFileChanges(commitDiffQuery.state);
	const selectedFile = findFileByPath(files, selectedFilePath);
	const previewState = toRuntimeQueryState<VcsOperationPreview>(previewResult, "Failed to preview workspace operation.");

	useEffect(() => {
		setSelectedRefName(readVcsQueryParam(location.search, "ref"));
		setSelectedCommitHash(readVcsQueryParam(location.search, "commit"));
		setSelectedFilePath(readVcsQueryParam(location.search, "file"));
	}, [location.search]);

	useEffect(() => {
		if (selectedRefName || hasUserClearedRef || inventoryQuery.state.status !== "ready") {
			return;
		}
			const workspaceTarget = inventoryQuery.state.data.workspaceTarget;
			const next = workspaceTarget ? getItemTarget(workspaceTarget) : inventoryQuery.state.data.items[0]?.target ?? null;
		if (next) {
			setSelectedRefName(next);
			writeQueryParam("ref", next);
		}
	}, [hasUserClearedRef, inventoryQuery.state, selectedRefName]);

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

	function selectRef(item: VcsJjInventoryItem): void {
		const target = getItemTarget(item);
		if (selectedRefName === target) {
			setSelectedRefName(null);
			setSelectedCommitHash(null);
			setSelectedFilePath(null);
			setHasUserClearedRef(true);
			setHasUserClearedFile(true);
			setFileSectionCollapsed(false);
			writeQueryParam("ref", null);
			writeQueryParam("commit", null);
			writeQueryParam("file", null);
			return;
		}
		setSelectedRefName(target);
		setSelectedCommitHash(null);
		setSelectedFilePath(null);
		setHasUserClearedRef(false);
		setHasUserClearedFile(false);
		setFileSectionCollapsed(false);
		writeQueryParam("ref", target);
		writeQueryParam("commit", null);
		writeQueryParam("file", null);
		changeColumnCollapsed("stack", false);
	}

	function selectStackChange(change: BranchesStackChange): void {
		selectCommitHash(change.commitId);
	}

	function selectCommitHash(commitHash: string): void {
		if (selectedCommitHash === commitHash) {
			setSelectedCommitHash(null);
			setSelectedFilePath(null);
			setHasUserClearedFile(true);
			setFileSectionCollapsed(false);
			writeQueryParam("commit", null);
			writeQueryParam("file", null);
			return;
		}
		setSelectedCommitHash(commitHash);
		setSelectedFilePath(null);
		setHasUserClearedFile(false);
		setFileSectionCollapsed(false);
		writeQueryParam("commit", commitHash);
		writeQueryParam("file", null);
	}

	function selectFile(path: string): void {
		if (selectedFilePath === path) {
			setSelectedFilePath(null);
			setHasUserClearedFile(true);
			writeQueryParam("file", null);
			return;
		}
		setSelectedFilePath(path);
		setHasUserClearedFile(false);
		writeQueryParam("file", path);
	}

	function setColumnWidth(column: keyof typeof columnWidths, width: number): void {
		const limits = BRANCH_COLUMN_LIMITS[column];
		const normalized = writeVcsNumberPreference(limits.key, width, limits.min, limits.max);
		setColumnWidths((current) => ({ ...current, [column]: normalized }));
	}

	function changeColumnCollapsed(column: BranchColumnId, collapsed: boolean): void {
		writeVcsBooleanPreference(BRANCH_COLUMN_COLLAPSED_KEYS[column], collapsed);
		setCollapsedColumns((current) => ({ ...current, [column]: collapsed }));
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

	async function updateAppliedStacks(stackId: string, action: "apply" | "unapply"): Promise<void> {
		if (!workspaceId || projectConfigQuery.state.status !== "ready" || workspaceState.status !== "ready") {
			return;
		}
		const currentStackIds = projectConfigQuery.state.data.vcsAppliedStacks ?? [];
		const nextStackIds =
			action === "apply"
				? applyWorkspaceStackId(currentStackIds, stackId)
				: unapplyWorkspaceStackId(currentStackIds, stackId);
		const operation = {
			kind: action === "apply" ? "apply_stack" : "unapply_stack",
			stackId,
		} satisfies VcsWorkspaceOperation;
		if (!isLowRiskVcsWorkspaceOperation(operation, workspaceState.data.provider)) {
			setPendingOperation(operation);
			setPendingAppliedStackIds(nextStackIds);
			setOperationApplyError(null);
			void previewVcsOperation({ workspaceId, workspacePath: activeWorkspacePath, input: { operation } });
			return;
		}
		setUpdatingAppliedStackId(stackId);
		try {
			const operationResult = await applyVcsOperation({
				workspaceId,
				workspacePath: activeWorkspacePath,
				input: {
					operation,
				},
			}).unwrap();
			if (!operationResult.ok) {
				throw new Error(operationResult.summary || "Workspace stack operation failed.");
			}
			await updateProjectConfig({
				workspaceId,
				input: { vcsAppliedStacks: nextStackIds },
			}).unwrap();
		} finally {
			setUpdatingAppliedStackId(null);
		}
	}

	function closeOperationPreview(): void {
		setPendingOperation(null);
		setPendingAppliedStackIds(null);
		setOperationApplyError(null);
	}

	async function applyPendingOperation(): Promise<void> {
		if (!workspaceId || !pendingOperation || !pendingAppliedStackIds) {
			return;
		}
		if (previewState.status !== "ready" || !areVcsWorkspaceOperationsEqual(previewState.data.operation, pendingOperation)) {
			setOperationApplyError("Preview is stale. Reopen the operation preview and try again.");
			return;
		}
		setApplyingPreviewedOperation(true);
		setOperationApplyError(null);
		try {
			const operationResult = await applyVcsOperation({
				workspaceId,
				workspacePath: activeWorkspacePath,
				input: { operation: pendingOperation },
			}).unwrap();
			if (!operationResult.ok) {
				throw new Error(operationResult.summary || "Workspace stack operation failed.");
			}
			await updateProjectConfig({
				workspaceId,
				input: { vcsAppliedStacks: pendingAppliedStackIds },
			}).unwrap();
			closeOperationPreview();
		} catch (error) {
			setOperationApplyError(error instanceof Error ? error.message : "Workspace stack operation failed.");
		} finally {
			setApplyingPreviewedOperation(false);
		}
	}

	return (
		<VcsShell
			projectState={projectState}
			currentPath={currentPath}
			title="Branches"
			subtitle="Refs, remote work, stacks, and commits"
			kicker={<StatusChip label="Read only" tone="blue" />}
		>
			{!workspaceId ? (
				<NoProjectSelected action={<SelectProjectButton onClick={projectState.onAddProject} />}>
					Select a project to show refs, remotes, and stacks.
				</NoProjectSelected>
			) : (
				<QueryGate
					state={inventoryQuery.state}
					loading="Loading branch inventory."
					loadingFallback={<BranchesLoadingLayout columnWidths={columnWidths} />}
					errorTitle="Branch inventory failed"
				>
					{(inventory) => (
						<BranchesReady
							inventory={inventory}
							workspaceId={workspaceId}
							stackState={stackQuery.state}
							workspaceState={workspaceState}
							projectConfigState={projectConfigQuery.state}
							updatingAppliedStackId={updatingAppliedStackId}
							filter={filter}
							setFilter={setFilter}
							search={search}
							setSearch={setSearch}
							selectedRefName={selectedRefName}
							selectedCommitHash={selectedCommitHash}
							selectedFilePath={selectedFilePath}
							selectedFile={selectedFile}
							diffState={commitDiffQuery.state}
							collapsedColumns={collapsedColumns}
							columnWidths={columnWidths}
							fileViewMode={fileViewMode}
							isFileSectionCollapsed={isFileSectionCollapsed}
							onColumnCollapsedChange={changeColumnCollapsed}
							onColumnWidthChange={setColumnWidth}
							onFileViewModeChange={changeFileViewMode}
							onFileSectionCollapsedChange={changeFileSectionCollapsed}
							onSelectRef={selectRef}
							onSelectStackChange={selectStackChange}
							onSelectCommitHash={selectCommitHash}
							onSelectFile={selectFile}
							onApplyStack={(stackId) => void updateAppliedStacks(stackId, "apply")}
							onUnapplyStack={(stackId) => void updateAppliedStacks(stackId, "unapply")}
							onCloseDiff={() => {
								setSelectedFilePath(null);
								setHasUserClearedFile(true);
								writeQueryParam("file", null);
							}}
						/>
					)}
				</QueryGate>
			)}
			<BranchesOperationPreviewDialog
				operation={pendingOperation}
				previewState={previewState}
				applyError={operationApplyError}
				isApplying={isApplyingPreviewedOperation}
				onApply={() => void applyPendingOperation()}
				onClose={closeOperationPreview}
			/>
		</VcsShell>
	);
}

function BranchesLoadingLayout({
	columnWidths,
}: {
	columnWidths: Record<BranchColumnId | "diff", number>;
}): React.ReactElement {
	return (
		<div className="h-full min-h-0 overflow-x-auto overflow-y-hidden bg-surface-0 p-3">
			<div className="flex h-full min-h-0 gap-3">
				<VcsColumn
					id="refs"
					title="Branches"
					width={columnWidths.refs}
					minWidth={BRANCH_COLUMN_LIMITS.refs.min}
					maxWidth={BRANCH_COLUMN_LIMITS.refs.max}
					onCollapse={() => undefined}
					onWidthChange={() => undefined}
				>
					<div className="border-b border-border p-3">
						<div className="rounded-md border border-border bg-surface-0 p-3">
							<div className="kb-skeleton h-3 w-36" />
							<div className="mt-3 flex items-center gap-2">
								<div className="kb-skeleton h-7 w-7 shrink-0 rounded-md" />
								<div className="min-w-0 flex-1">
									<div className="kb-skeleton h-4 w-3/4" />
									<div className="kb-skeleton mt-2 h-3 w-1/2" />
								</div>
							</div>
						</div>
					</div>
					<div className="border-b border-border p-3">
						<div className="kb-skeleton h-8 w-full" />
						<div className="kb-skeleton mt-3 h-8 w-full" />
					</div>
					<BranchRowsSkeleton />
				</VcsColumn>
				<VcsColumn
					id="stack"
					title="Stack"
					width={columnWidths.stack}
					minWidth={BRANCH_COLUMN_LIMITS.stack.min}
					maxWidth={BRANCH_COLUMN_LIMITS.stack.max}
					onCollapse={() => undefined}
					onWidthChange={() => undefined}
				>
					<StackDetailSkeleton />
				</VcsColumn>
				<div
					aria-hidden
					className="h-full shrink-0"
					style={{ width: BRANCH_TRAILING_SPACER_WIDTH, minWidth: BRANCH_TRAILING_SPACER_WIDTH }}
				/>
			</div>
		</div>
	);
}

function BranchRowsSkeleton({ rows = 8 }: { rows?: number }): React.ReactElement {
	return (
		<div className="py-1">
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="border-b border-divider px-3 py-3">
					<div className="flex items-center gap-2">
						<div className="kb-skeleton h-4 w-4 shrink-0 rounded" />
						<div className="kb-skeleton h-4 min-w-0 flex-1" />
						<div className="kb-skeleton h-5 w-16 shrink-0 rounded-full" />
					</div>
					<div className="mt-2 flex gap-2">
						<div className="kb-skeleton h-3 w-16" />
						<div className="kb-skeleton h-3 w-20" />
						<div className="kb-skeleton h-3 w-12" />
					</div>
				</div>
			))}
		</div>
	);
}

function BranchesReady({
	inventory,
	workspaceId,
	stackState,
	workspaceState,
	projectConfigState,
	updatingAppliedStackId,
	filter,
	setFilter,
	search,
	setSearch,
	selectedRefName,
	selectedCommitHash,
	selectedFilePath,
	selectedFile,
	diffState,
	collapsedColumns,
	columnWidths,
	fileViewMode,
	isFileSectionCollapsed,
	onColumnCollapsedChange,
	onColumnWidthChange,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectRef,
	onSelectStackChange,
	onSelectCommitHash,
	onSelectFile,
	onApplyStack,
	onUnapplyStack,
	onCloseDiff,
}: {
	inventory: VcsJjInventoryResponse;
	workspaceId: string | null;
	stackState: QueryState<VcsJjStateResponse>;
	workspaceState: QueryState<VcsWorkspaceState>;
	projectConfigState: QueryState<RuntimeProjectConfigResponse>;
	updatingAppliedStackId: string | null;
	filter: BranchFilter;
	setFilter: (filter: BranchFilter) => void;
	search: string;
	setSearch: (value: string) => void;
	selectedRefName: string | null;
	selectedCommitHash: string | null;
	selectedFilePath: string | null;
	selectedFile: VcsFileChange | null;
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	collapsedColumns: Record<BranchColumnId, boolean>;
	columnWidths: Record<BranchColumnId | "diff", number>;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onColumnCollapsedChange: (column: BranchColumnId, collapsed: boolean) => void;
	onColumnWidthChange: (column: BranchColumnId | "diff", width: number) => void;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectRef: (item: VcsJjInventoryItem) => void;
	onSelectStackChange: (change: BranchesStackChange) => void;
	onSelectCommitHash: (commitHash: string) => void;
	onSelectFile: (path: string) => void;
	onApplyStack: (stackId: string) => void;
	onUnapplyStack: (stackId: string) => void;
	onCloseDiff: () => void;
}): React.ReactElement {
	const configuredAppliedStackIds =
		projectConfigState.status === "ready" ? normalizeAppliedStackIds(projectConfigState.data.vcsAppliedStacks) : [];
	const providerAppliedStackIds =
		workspaceState.status === "ready" ? normalizeAppliedStackIds(workspaceState.data.appliedStackIds) : [];
	const appliedStackIds = configuredAppliedStackIds.length > 0 ? configuredAppliedStackIds : providerAppliedStackIds;
	const refsCount = inventory.items.length;
	const visibleItems = inventory.items.filter((item) => {
		if (filter === "prs" && !item.pr) {
			return false;
		}
		if (filter === "local" && !["current", "today", "applied", "local", "older"].includes(item.group)) {
			return false;
		}
		const needle = search.trim().toLowerCase();
		return needle.length === 0 || item.name.toLowerCase().includes(needle) || item.commitId?.toLowerCase().includes(needle);
	});
	const groupedItems = visibleItems.reduce<Record<VcsJjInventoryItem["group"], VcsJjInventoryItem[]>>(
		(groups, item) => {
			groups[item.group].push(item);
			return groups;
		},
		groupRecord(),
	);
	const selectableItems = [inventory.workspaceTarget, ...inventory.items].filter(
		(item): item is VcsJjInventoryItem => Boolean(item),
	);
	const activeItem =
		selectedRefName ? selectableItems.find((item) => getItemTarget(item) === selectedRefName) ?? null : null;
	const workspaceTargetLogRef = getWorkspaceTargetLogRef(activeItem);
	const workspaceTargetLogInput = useMemo(() => ({ ref: workspaceTargetLogRef }), [workspaceTargetLogRef]);
	const workspaceTargetLogQuery = useRtkPaginatedRepositoryLog({
		input: workspaceTargetLogInput,
		message: "Failed to load workspace target commits.",
		enabled: Boolean(workspaceId && workspaceTargetLogRef && !collapsedColumns.stack),
		workspaceId,
		pageSize: 50,
	});
	const selection = { refName: selectedRefName, item: activeItem };
	const applicableStack =
		stackState.status === "ready" ? findApplicableStackForBranchSelection(stackState.data.stacks, selection) : null;
	const hasDerivedStack = Boolean(applicableStack);
	const applicableStackId = applicableStack?.id ?? null;
	const applicableStackApplied = Boolean(applicableStackId && appliedStackIds.includes(applicableStackId));
	const workspaceMembershipDisabledReason = workspaceStackMembershipDisabledReason(
		workspaceState,
		appliedStackIds.length,
		applicableStackApplied,
	);
	function stackDragPayloadForItem(item: VcsJjInventoryItem): VcsWorkspaceDragPayload | null {
		if (stackState.status !== "ready" || !item.hasLocal || item.type === "remote" || item.type === "tag") {
			return null;
		}
		const stack = findApplicableStackForBranchSelection(stackState.data.stacks, {
			refName: getItemTarget(item),
			item,
		});
		return stack ? { kind: "stack", stackId: stack.id } : null;
	}
	const activeStack = (() => {
		if (stackState.status !== "ready") {
			return null;
		}
		const owningStack = findStackForBranchSelection(stackState.data.stacks, selection);
		if (owningStack) {
			return owningStack;
		}
		const containingStack = findContainingStackForBranchSelection(stackState.data.stacks, selection);
		if (containingStack) {
			return containingStack;
		}
		return activeItem?.type === "bookmark" && activeItem.hasLocal ? null : createBranchSelectionFallbackStack(selection);
	})();
	const diagnostics = [
		...inventory.diagnostics,
		...(stackState.status === "ready" ? stackState.data.diagnostics : []),
	];
	useVcsDiagnosticsToasts(diagnostics, "branches");
	const showStackColumn = Boolean(activeItem);

	return (
		<div className="h-full min-h-0 overflow-x-auto overflow-y-hidden bg-surface-0 p-3">
			<div className="flex h-full min-h-0 gap-3">
				{collapsedColumns.refs ? (
					<VcsCollapsedColumn
						label="Branches"
						count={visibleItems.length}
						onExpand={() => onColumnCollapsedChange("refs", false)}
					/>
				) : (
					<VcsColumn
						id="refs"
						title="Branches"
						count={visibleItems.length}
						width={columnWidths.refs}
						minWidth={BRANCH_COLUMN_LIMITS.refs.min}
						maxWidth={BRANCH_COLUMN_LIMITS.refs.max}
						onCollapse={() => onColumnCollapsedChange("refs", true)}
						onWidthChange={(width) => onColumnWidthChange("refs", width)}
					>
						<BranchesColumnContent
							inventory={inventory}
							groupedItems={groupedItems}
							visibleItems={visibleItems}
							refsCount={refsCount}
							filter={filter}
							setFilter={setFilter}
							search={search}
							setSearch={setSearch}
							selectedRefName={selectedRefName}
							appliedStackIds={appliedStackIds}
							getDragPayload={stackDragPayloadForItem}
							onSelectRef={onSelectRef}
						/>
					</VcsColumn>
				)}
				{showStackColumn && collapsedColumns.stack ? (
					<VcsCollapsedColumn
						label="Stack"
						count={activeStack?.heads.length}
						onExpand={() => onColumnCollapsedChange("stack", false)}
					/>
				) : showStackColumn ? (
					<VcsColumn
						id="stack"
						title={activeStack?.id ?? activeItem?.name ?? "Stack"}
						count={activeStack?.changes.length}
						width={columnWidths.stack}
						minWidth={BRANCH_COLUMN_LIMITS.stack.min}
						maxWidth={BRANCH_COLUMN_LIMITS.stack.max}
						onCollapse={() => onColumnCollapsedChange("stack", true)}
						onWidthChange={(width) => onColumnWidthChange("stack", width)}
						onScrollNearEnd={workspaceTargetLogQuery.hasMore ? workspaceTargetLogQuery.loadMore : undefined}
						hideHeader
						headerContent={
							<StackHeaderActions
								item={activeItem}
								stackId={applicableStackId}
								canApply={
									hasDerivedStack &&
									projectConfigState.status === "ready" &&
									!applicableStackApplied &&
									!workspaceMembershipDisabledReason
								}
								isApplied={applicableStackApplied}
								disabledReason={workspaceMembershipDisabledReason}
								isUpdating={Boolean(applicableStackId && updatingAppliedStackId === applicableStackId)}
								onApplyStack={onApplyStack}
								onUnapplyStack={onUnapplyStack}
							/>
						}
					>
						<StackDetailColumn
							state={stackState}
							selectedRefName={selectedRefName}
							activeItem={activeItem}
							selectedCommitHash={selectedCommitHash}
							selectedFilePath={selectedFilePath}
							diffState={diffState}
							workspaceTargetLogState={workspaceTargetLogQuery.state}
							workspaceTargetLogHasMore={workspaceTargetLogQuery.hasMore}
							isWorkspaceTargetLogLoadingMore={workspaceTargetLogQuery.isLoadingMore}
							fileViewMode={fileViewMode}
							isFileSectionCollapsed={isFileSectionCollapsed}
							onFileViewModeChange={onFileViewModeChange}
							onFileSectionCollapsedChange={onFileSectionCollapsedChange}
							onSelectStackChange={onSelectStackChange}
							onSelectCommitHash={onSelectCommitHash}
							onLoadMoreWorkspaceTargetLog={workspaceTargetLogQuery.loadMore}
							onSelectFile={onSelectFile}
						/>
					</VcsColumn>
				) : null}
				{selectedFile ? (
					<VcsFileDiffColumn
						file={selectedFile}
						width={columnWidths.diff}
						minWidth={BRANCH_COLUMN_LIMITS.diff.min}
						maxWidth={BRANCH_COLUMN_LIMITS.diff.max}
						onWidthChange={(width) => onColumnWidthChange("diff", width)}
						onClose={onCloseDiff}
					/>
				) : null}
				<div
					aria-hidden
					className="h-full shrink-0"
					style={{ width: BRANCH_TRAILING_SPACER_WIDTH, minWidth: BRANCH_TRAILING_SPACER_WIDTH }}
				/>
			</div>
		</div>
	);
}

function BranchesColumnContent({
	inventory,
	groupedItems,
	visibleItems,
	refsCount,
	filter,
	setFilter,
	search,
	setSearch,
	selectedRefName,
	appliedStackIds,
	getDragPayload,
	onSelectRef,
}: {
	inventory: VcsJjInventoryResponse;
	groupedItems: Record<VcsJjInventoryItem["group"], VcsJjInventoryItem[]>;
	visibleItems: VcsJjInventoryItem[];
	refsCount: number;
	filter: BranchFilter;
	setFilter: (filter: BranchFilter) => void;
	search: string;
	setSearch: (value: string) => void;
	selectedRefName: string | null;
	appliedStackIds: string[];
	getDragPayload: (item: VcsJjInventoryItem) => VcsWorkspaceDragPayload | null;
	onSelectRef: (item: VcsJjInventoryItem) => void;
}): React.ReactElement {
	const workspaceTarget = inventory.workspaceTarget;
	const workspaceTargetSelected = Boolean(workspaceTarget && getItemTarget(workspaceTarget) === selectedRefName);
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="border-b border-border px-3 py-3">
				<button
					type="button"
					data-testid="vcs-current-workspace-target"
					disabled={!workspaceTarget}
					onClick={() => {
						if (workspaceTarget) {
							onSelectRef(workspaceTarget);
						}
					}}
					className={cn(
						"w-full rounded-md border border-border bg-surface-0 p-3 text-left hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-surface-0",
						workspaceTargetSelected && "bg-surface-2",
						workspaceTargetSelected && SELECTED_REF_MARKER_CLASS,
					)}
				>
					<div className="text-xs font-medium text-text-tertiary">Current workspace target</div>
					<div className="mt-2 flex min-w-0 items-center gap-2">
						<div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg">
							<GitBranch size={14} />
						</div>
						<div className="min-w-0">
							<div className="truncate text-sm font-semibold text-text-primary">
								{inventory.workspaceTarget?.name ?? inventory.jj.currentBookmark ?? "Current commit"}
							</div>
							<div className="truncate font-mono text-[11px] text-text-tertiary">
								{inventory.workspaceTarget?.changeId ?? inventory.jj.currentChangeId ?? "unknown"}
							</div>
						</div>
					</div>
					<div className="mt-3 border-t border-border pt-2 text-xs text-text-secondary">
						{refsCount} branches · {inventory.items.filter((item) => item.pr).length} PRs
					</div>
				</button>
			</div>
			<div className="border-b border-border px-3 py-3">
				<div className="mt-1 grid grid-cols-3 rounded-md border border-border bg-surface-0 p-1">
					{(["all", "prs", "local"] as BranchFilter[]).map((candidate) => (
						<button
							key={candidate}
							type="button"
							className={cn(
								"h-7 rounded-sm text-xs font-medium capitalize",
								filter === candidate ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:text-text-primary",
							)}
							onClick={() => setFilter(candidate)}
						>
							{candidate === "prs" ? "PRs" : candidate}
						</button>
					))}
				</div>
				<label className="mt-3 flex h-8 items-center gap-2 rounded-md border border-border bg-surface-0 px-2 text-xs text-text-secondary">
					<Search size={14} />
						<input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search branches"
							className="min-w-0 flex-1 border-0 bg-transparent text-text-primary outline-none placeholder:text-text-tertiary"
						/>
				</label>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{visibleItems.length === 0 ? (
					<div className="p-3">
						<EmptyState title="No branch data">No refs matched the active filter.</EmptyState>
					</div>
				) : (
					(Object.keys(groupedItems) as VcsJjInventoryItem["group"][]).map((group) =>
							groupedItems[group].length > 0 ? (
							<section key={group} className="border-b border-border">
								<header className="sticky top-0 z-10 border-b border-border bg-surface-2 px-3 py-2 text-xs font-medium text-text-tertiary">
									{GROUP_LABELS[group]}
								</header>
								{groupedItems[group].map((item) => (
									<BranchRow
										key={item.id}
										item={item}
										selected={getItemTarget(item) === selectedRefName}
										isApplied={appliedStackIds.includes(item.name) || Boolean(item.target && appliedStackIds.includes(item.target))}
										dragPayload={getDragPayload(item)}
										onSelect={() => onSelectRef(item)}
									/>
								))}
							</section>
						) : null,
					)
				)}
			</div>
		</div>
	);
}

function BranchesOperationPreviewDialog({
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

function BranchRow({
	item,
	selected,
	isApplied,
	dragPayload,
	onSelect,
}: {
	item: VcsJjInventoryItem;
	selected: boolean;
	isApplied: boolean;
	dragPayload: VcsWorkspaceDragPayload | null;
	onSelect: () => void;
}): React.ReactElement {
	const title = item.title?.trim() || item.name;
	const relativeTime = formatRelativeTime(item.timestamp);
	const authorName = item.authorName?.trim() || null;
	const provenance = item.hasLocal ? "local" : item.remoteName ? item.remoteName : item.type;
	const footerParts = [
		relativeTime && authorName ? `${relativeTime} by ${authorName}` : relativeTime,
		!relativeTime && authorName ? authorName : null,
	].filter(Boolean);
	return (
		<button
			type="button"
			draggable={Boolean(dragPayload)}
			className={cn(
				"flex w-full min-w-0 cursor-pointer flex-col border-b border-border px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-2",
				selected && "bg-surface-2",
				selected && SELECTED_REF_MARKER_CLASS,
			)}
			onDragStart={(event) => {
				if (dragPayload) {
					writeDragPayload(event, dragPayload);
				}
			}}
			onClick={onSelect}
		>
			<div className="flex min-w-0 items-center gap-2">
				<span className="text-text-tertiary">{itemIcon(item)}</span>
				<span className="truncate text-sm font-semibold text-text-primary">{item.name}</span>
				{isApplied ? <StatusChip label="Workspace" tone="green" /> : null}
			</div>
			<div className="mt-1 truncate text-xs text-text-secondary">{title}</div>
			<div className="mt-2 flex min-w-0 items-center justify-between gap-3 border-t border-divider pt-2">
				<div className="flex min-w-0 items-center gap-2 text-xs text-text-tertiary">
					<Avatar
						src={item.authorAvatarUrl}
						name={authorName}
						email={item.authorEmail}
						initials={authorInitials(authorName)}
						className="h-5 w-5"
					/>
					<span className="truncate">{provenance}</span>
				</div>
				{footerParts.length > 0 ? (
					<div className="min-w-0 truncate text-right text-xs text-text-secondary">{footerParts.join(" ")}</div>
				) : null}
			</div>
		</button>
	);
}

function StackDetailColumn({
	state,
	selectedRefName,
	activeItem,
	selectedCommitHash,
	selectedFilePath,
	diffState,
	workspaceTargetLogState,
	workspaceTargetLogHasMore,
	isWorkspaceTargetLogLoadingMore,
	fileViewMode,
	isFileSectionCollapsed,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectStackChange,
	onSelectCommitHash,
	onLoadMoreWorkspaceTargetLog,
	onSelectFile,
}: {
	state: QueryState<VcsJjStateResponse>;
	selectedRefName: string | null;
	activeItem: VcsJjInventoryItem | null;
	selectedCommitHash: string | null;
	selectedFilePath: string | null;
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	workspaceTargetLogState: QueryState<RuntimeGitLogResponse>;
	workspaceTargetLogHasMore: boolean;
	isWorkspaceTargetLogLoadingMore: boolean;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectStackChange: (change: BranchesStackChange) => void;
	onSelectCommitHash: (commitHash: string) => void;
	onLoadMoreWorkspaceTargetLog: () => void;
	onSelectFile: (path: string) => void;
}): React.ReactElement {
	if (!selectedRefName) {
		return <div className="p-3"><EmptyState title="Select a branch">Choose a branch or ref to show its stack.</EmptyState></div>;
	}
	if (activeItem?.type === "workspace") {
		return (
			<WorkspaceTargetCommitList
				item={activeItem}
				state={workspaceTargetLogState}
				hasMore={workspaceTargetLogHasMore}
				isLoadingMore={isWorkspaceTargetLogLoadingMore}
				selectedCommitHash={selectedCommitHash}
				selectedFilePath={selectedFilePath}
				selectedFiles={toFileChanges(diffState)}
				diffState={diffState}
				fileViewMode={fileViewMode}
				isFileSectionCollapsed={isFileSectionCollapsed}
				onFileViewModeChange={onFileViewModeChange}
				onFileSectionCollapsedChange={onFileSectionCollapsedChange}
				onSelectCommitHash={onSelectCommitHash}
				onLoadMore={onLoadMoreWorkspaceTargetLog}
				onSelectFile={onSelectFile}
			/>
		);
	}
	if (state.status === "loading") {
		return <StackDetailSkeleton />;
	}
	if (state.status === "error") {
		return <div className="p-3"><EmptyState title="Stack unavailable">{state.message}</EmptyState></div>;
	}

	const selection = { refName: selectedRefName, item: activeItem };
	const owningStack = findStackForBranchSelection(state.data.stacks, selection);
	const containingStack = owningStack ? null : findContainingStackForBranchSelection(state.data.stacks, selection);
	const inactiveLocalBookmark = activeItem?.type === "bookmark" && activeItem.hasLocal && !owningStack && !containingStack;
	const stack = owningStack ?? containingStack ?? (inactiveLocalBookmark ? null : createBranchSelectionFallbackStack(selection));
	if (inactiveLocalBookmark && activeItem) {
		return (
			<div className="grid gap-3 p-3">
				<InactiveBranchCard item={activeItem} />
			</div>
		);
	}
	if (!stack) {
		return (
			<div className="p-3">
				<EmptyState title="No derived stack">
					This ref is not part of an active local stack.
				</EmptyState>
			</div>
		);
	}

	const groups = selectStackChangeGroupsForBranchDetail(stack, selection);
	const selectedFiles = toFileChanges(diffState);
	return (
		<div className="grid gap-3 p-3">
			{groups.length === 0 ? (
				<EmptyState title="No stack heads">This stack did not return any branch heads.</EmptyState>
			) : (
				groups.map((group) => (
					<StackHeadCard
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
				))
			)}
		</div>
	);
}

function StackHeaderActions({
	item,
	stackId,
	canApply,
	isApplied,
	disabledReason,
	isUpdating,
	onApplyStack,
	onUnapplyStack,
}: {
	item: VcsJjInventoryItem | null;
	stackId: string | null;
	canApply: boolean;
	isApplied: boolean;
	disabledReason: string | null;
	isUpdating: boolean;
	onApplyStack: (stackId: string) => void;
	onUnapplyStack: (stackId: string) => void;
}): React.ReactElement | null {
	if (item?.type === "workspace") {
		return <WorkspaceTargetHeaderMetadata item={item} />;
	}
	if (!item?.hasLocal || item.type === "remote" || item.type === "tag") {
		return null;
	}
	return (
		<div className="flex min-w-0 items-center gap-2">
			<Button
				variant="primary"
				size="sm"
				icon={<GitBranch size={14} />}
				className="shrink-0"
				disabled={isUpdating || Boolean(disabledReason) || (!canApply && !isApplied)}
				title={disabledReason ?? undefined}
				onClick={() => {
					if (!stackId) {
						return;
					}
					if (isApplied) {
						onUnapplyStack(stackId);
						return;
					}
					onApplyStack(stackId);
				}}
			>
				{isUpdating ? "Updating..." : isApplied ? "Unapply from workspace" : "Apply to workspace"}
			</Button>
			<Button
				variant="default"
				size="sm"
				iconRight={<Trash2 size={14} />}
				className="shrink-0"
				disabled
				title="Deleting local refs is not implemented in the provider-neutral workspace engine yet."
				onClick={() => undefined}
			>
				Delete local
			</Button>
		</div>
	);
}

function WorkspaceTargetHeaderMetadata({ item }: { item: VcsJjInventoryItem }): React.ReactElement | null {
	if (!item.changeId && !item.commitId) {
		return null;
	}
	const shortCommitId = item.commitId ? item.commitId.slice(0, 8) : null;
	return (
		<div className="flex min-w-0 flex-wrap items-center gap-2">
			{item.changeId ? (
				<CopyValueButton label="Provider ID" displayValue={item.changeId} copyValue={item.changeId} />
			) : null}
			{item.commitId ? (
				<CopyValueButton label="Commit" displayValue={shortCommitId ?? item.commitId} copyValue={item.commitId} />
			) : null}
		</div>
	);
}

function displayBranchDetailName(item: VcsJjInventoryItem): string {
	if (item.remoteName && item.name && !item.name.startsWith(`${item.remoteName}/`)) {
		return `${item.remoteName}/${item.name}`;
	}
	return item.name;
}

function WorkspaceTargetCommitList({
	item,
	state,
	hasMore,
	isLoadingMore,
	selectedCommitHash,
	selectedFilePath,
	selectedFiles,
	diffState,
	fileViewMode,
	isFileSectionCollapsed,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectCommitHash,
	onLoadMore,
	onSelectFile,
}: {
	item: VcsJjInventoryItem;
	state: QueryState<RuntimeGitLogResponse>;
	hasMore: boolean;
	isLoadingMore: boolean;
	selectedCommitHash: string | null;
	selectedFilePath: string | null;
	selectedFiles: VcsFileChange[];
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectCommitHash: (commitHash: string) => void;
	onLoadMore: () => void;
	onSelectFile: (path: string) => void;
}): React.ReactElement {
	if (state.status === "loading") {
		return <CommitListSkeleton />;
	}
	if (state.status === "error") {
		return <div className="p-3"><EmptyState title="Target history unavailable">{state.message}</EmptyState></div>;
	}
	if (!state.data.ok) {
		return (
			<div className="p-3">
				<EmptyState title="Target history unavailable">
					{state.data.error ?? "The selected workspace target history could not be loaded."}
				</EmptyState>
			</div>
		);
	}
	if (state.data.commits.length === 0) {
		return (
			<div className="grid gap-3 p-3">
				<InactiveBranchCard item={item} />
			</div>
		);
	}

	return (
		<div className="py-1">
			{state.data.commits.map((commit) => (
				<WorkspaceTargetCommitRow
					key={commit.hash}
					commit={commit}
					selected={selectedCommitHash === commit.hash}
					selectedFilePath={selectedFilePath}
					selectedFiles={selectedFiles}
					diffState={diffState}
					fileViewMode={fileViewMode}
					isFileSectionCollapsed={isFileSectionCollapsed}
					onFileViewModeChange={onFileViewModeChange}
					onFileSectionCollapsedChange={onFileSectionCollapsedChange}
					onSelectCommitHash={onSelectCommitHash}
					onSelectFile={onSelectFile}
				/>
			))}
			{hasMore || isLoadingMore ? (
				<div className="border-t border-divider p-2">
					<button
						type="button"
						className="flex h-8 w-full items-center justify-center rounded-md border border-border bg-surface-0 text-xs font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary disabled:opacity-60"
						disabled={isLoadingMore}
						onClick={onLoadMore}
					>
						{isLoadingMore ? "Loading more commits..." : "Load more commits"}
					</button>
				</div>
			) : null}
		</div>
	);
}

function WorkspaceTargetCommitRow({
	commit,
	selected,
	selectedFilePath,
	selectedFiles,
	diffState,
	fileViewMode,
	isFileSectionCollapsed,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectCommitHash,
	onSelectFile,
}: {
	commit: RuntimeGitCommit;
	selected: boolean;
	selectedFilePath: string | null;
	selectedFiles: VcsFileChange[];
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectCommitHash: (commitHash: string) => void;
	onSelectFile: (path: string) => void;
}): React.ReactElement {
	const selectedError =
		diffState.status === "error"
			? diffState.message
			: diffState.status === "ready" && !diffState.data.ok
				? diffState.data.error ?? "The selected commit diff could not be read."
				: null;

	return (
		<div
			className={cn(
				"overflow-hidden border-b border-border bg-surface-0 last:border-b-0",
				selected && "bg-surface-2",
				selected && SELECTED_REF_MARKER_CLASS,
			)}
		>
			<button
				type="button"
				className="flex w-full min-w-0 cursor-pointer items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2"
				onClick={() => onSelectCommitHash(commit.hash)}
			>
				<div className="relative flex w-6 shrink-0 justify-center self-stretch">
					<span className="absolute bottom-[-13px] top-[-13px] w-px bg-accent" />
					<span className="relative mt-1 h-2.5 w-2.5 rotate-45 rounded-[2px] bg-accent" />
				</div>
				<div className="min-w-0 truncate text-sm font-medium text-text-primary">{commit.message || "Untitled commit"}</div>
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

function InactiveBranchCard({ item }: { item: VcsJjInventoryItem }): React.ReactElement {
	return (
		<section className="overflow-hidden rounded-lg border border-border bg-surface-0">
			<header className="px-3 py-3">
				<div className="flex min-w-0 items-center gap-2">
					<div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg">
						<GitBranch size={14} />
					</div>
					<div className="truncate text-sm font-semibold text-text-primary">{displayBranchDetailName(item)}</div>
				</div>
				<p className="mt-3 text-sm text-text-secondary">There are no commits yet on this branch.</p>
			</header>
		</section>
	);
}

function CommitListSkeleton({ rows = 12 }: { rows?: number }): React.ReactElement {
	return (
		<div className="py-1">
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="flex min-w-0 items-center gap-3 border-b border-border px-3 py-3">
					<div className="kb-skeleton h-3 w-3 rotate-45 rounded-[2px]" />
					<div className="kb-skeleton h-4 min-w-0 flex-1" />
				</div>
			))}
		</div>
	);
}

function StackHeadCard({
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
		<section className="overflow-hidden rounded-lg border border-border bg-surface-0">
			<header className="border-b border-divider px-3 py-3">
				<div className="flex min-w-0 items-center gap-2">
					<div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg">
						<GitBranch size={14} />
					</div>
					<div className="truncate text-sm font-semibold text-text-primary">{group.head.bookmarkName}</div>
				</div>
			</header>
			<div>
				{group.changes.length === 0 ? (
					<div className="p-4 text-sm text-text-secondary">
						No visible changes were returned for this head.
					</div>
				) : (
					group.changes.map((change) => (
						<StackChangeRow
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

function StackChangeRow({
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

	return (
		<div
			className={cn(
				"overflow-hidden border-b border-border bg-surface-0 last:border-b-0",
				change.isCurrent && "border-l-4 border-l-accent",
				selected && "bg-surface-2",
				selected && SELECTED_REF_MARKER_CLASS,
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
				<div className="min-w-0 truncate text-sm font-medium text-text-primary">{change.title}</div>
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

function StackDetailSkeleton({ rows = 4 }: { rows?: number }): React.ReactElement {
	return (
		<div className="grid gap-3 p-3">
			<div className="rounded-lg border border-border bg-surface-0 p-3">
				<div className="kb-skeleton h-5 w-40" />
				<div className="mt-3 flex gap-2">
					<div className="kb-skeleton h-5 w-24 rounded-full" />
					<div className="kb-skeleton h-5 w-28 rounded-full" />
				</div>
			</div>
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="rounded-lg border border-border bg-surface-0 p-3">
					<div className="kb-skeleton h-4 w-3/4" />
					<div className="mt-2 kb-skeleton h-3 w-1/2" />
					<div className="mt-4 kb-skeleton h-16 w-full" />
				</div>
			))}
		</div>
	);
}
