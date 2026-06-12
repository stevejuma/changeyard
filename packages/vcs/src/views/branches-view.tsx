import { GitBranch, GitCommit, GitPullRequest, Search, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/components/ui/cn";
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
import { DiagnosticsPanel, EmptyState, QueryGate } from "@/components/vcs-panels";
import { NoProjectSelected, SelectProjectButton, VcsShell, type VcsShellProjectState } from "@/components/vcs-shell";
import type {
	QueryState,
	RuntimeGitCommit,
	RuntimeGitCommitDiffResponse,
	RuntimeGitLogResponse,
	RuntimeGitRefsResponse,
	VcsJjInventoryItem,
	VcsJjInventoryResponse,
} from "@/runtime/types";
import { usePaginatedRepositoryLog, useTrpcInputQuery, useTrpcQuery } from "@/runtime/trpc-client";
import {
	readVcsFileViewMode,
	readVcsNumberPreference,
	VCS_LAYOUT_STORAGE_KEYS,
	writeVcsFileViewMode,
	writeVcsNumberPreference,
	type VcsFileViewMode,
} from "@/utils/vcs-ui-preferences";

type BranchFilter = "all" | "prs" | "local";
type BranchColumnId = "refs" | "commits";

const SELECTED_REF_MARKER_CLASS =
	"relative before:absolute before:left-0 before:top-1/2 before:h-12 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:content-['']";

const BRANCH_COLUMN_LIMITS = {
	refs: { min: 300, max: 580, fallback: 360, key: VCS_LAYOUT_STORAGE_KEYS.branchesRefsWidth },
	commits: { min: 380, max: 760, fallback: 500, key: VCS_LAYOUT_STORAGE_KEYS.branchesCommitsWidth },
	diff: { min: 420, max: 980, fallback: 640, key: VCS_LAYOUT_STORAGE_KEYS.branchesDiffWidth },
} as const;

const GROUP_LABELS: Record<VcsJjInventoryItem["group"], string> = {
	current: "Current workspace target",
	applied: "Applied",
	remote: "Remote work",
	local: "Local branches",
	tags: "Tags",
	older: "Older",
};

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

function formatRelativeTime(isoDate: string): string {
	const date = new Date(isoDate);
	const diffMs = Date.now() - date.getTime();
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

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
	return item.target ?? item.name;
}

function toFileChanges(diffState: QueryState<RuntimeGitCommitDiffResponse>): VcsFileChange[] {
	if (diffState.status !== "ready" || !diffState.data.ok) {
		return [];
	}
	return diffState.data.files;
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
	const inventoryQuery = useTrpcQuery<VcsJjInventoryResponse>(
		"vcs.jjInventory",
		"Failed to load branch inventory.",
		workspaceId,
		Boolean(workspaceId),
	);
	const refsQuery = useTrpcInputQuery<RuntimeGitRefsResponse>(
		"workspace.getRepositoryRefs",
		null,
		"Failed to load repository refs.",
		Boolean(workspaceId),
		workspaceId,
	);
	const [filter, setFilter] = useState<BranchFilter>("all");
	const [search, setSearch] = useState("");
	const [collapsedColumns, setCollapsedColumns] = useState<Record<BranchColumnId, boolean>>({
		refs: false,
		commits: false,
	});
	const [columnWidths, setColumnWidths] = useState(() => ({
		refs: readVcsNumberPreference(BRANCH_COLUMN_LIMITS.refs.key, BRANCH_COLUMN_LIMITS.refs.fallback, BRANCH_COLUMN_LIMITS.refs.min, BRANCH_COLUMN_LIMITS.refs.max),
		commits: readVcsNumberPreference(BRANCH_COLUMN_LIMITS.commits.key, BRANCH_COLUMN_LIMITS.commits.fallback, BRANCH_COLUMN_LIMITS.commits.min, BRANCH_COLUMN_LIMITS.commits.max),
		diff: readVcsNumberPreference(BRANCH_COLUMN_LIMITS.diff.key, BRANCH_COLUMN_LIMITS.diff.fallback, BRANCH_COLUMN_LIMITS.diff.min, BRANCH_COLUMN_LIMITS.diff.max),
	}));
	const [fileViewMode, setFileViewMode] = useState<VcsFileViewMode>(() => readVcsFileViewMode());
	const [selectedRefName, setSelectedRefName] = useState<string | null>(() => readQueryParam("ref"));
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(() => readQueryParam("commit"));
	const [selectedFilePath, setSelectedFilePath] = useState<string | null>(() => readQueryParam("file"));
	const [hasUserClearedRef, setHasUserClearedRef] = useState(false);
	const [hasUserClearedCommit, setHasUserClearedCommit] = useState(false);
	const [hasUserClearedFile, setHasUserClearedFile] = useState(false);
	const [isFileSectionCollapsed, setFileSectionCollapsed] = useState(false);

	const selectedInventoryTarget = useMemo(() => {
		if (inventoryQuery.state.status !== "ready") {
			return null;
		}
		return selectedRefName;
	}, [inventoryQuery.state, selectedRefName]);

	const logInput = useMemo(
		() => ({
			ref: selectedInventoryTarget,
			refs: selectedInventoryTarget ? [selectedInventoryTarget] : [],
		}),
		[selectedInventoryTarget],
	);
	const logQuery = usePaginatedRepositoryLog({
		input: logInput,
		message: "Failed to load commits.",
		enabled: Boolean(workspaceId && selectedInventoryTarget),
		workspaceId,
		pageSize: 50,
	});
	const commitDiffQuery = useTrpcInputQuery<RuntimeGitCommitDiffResponse>(
		"workspace.getRepositoryCommitDiff",
		{ commitHash: selectedCommitHash ?? "" },
		"Failed to load commit diff.",
		Boolean(workspaceId && selectedCommitHash),
		workspaceId,
	);
	const files = toFileChanges(commitDiffQuery.state);
	const selectedFile = findFileByPath(files, selectedFilePath);

	useEffect(() => {
		if (selectedRefName || hasUserClearedRef || inventoryQuery.state.status !== "ready") {
			return;
		}
		const next = inventoryQuery.state.data.workspaceTarget?.target ?? inventoryQuery.state.data.items[0]?.target ?? null;
		if (next) {
			setSelectedRefName(next);
			writeQueryParam("ref", next);
		}
	}, [hasUserClearedRef, inventoryQuery.state, selectedRefName]);

	useEffect(() => {
		if (logQuery.state.status !== "ready") {
			return;
		}
		if (hasUserClearedCommit) {
			return;
		}
		const hasSelectedCommit = selectedCommitHash
			? logQuery.state.data.commits.some((commit) => commit.hash === selectedCommitHash)
			: false;
		if (!hasSelectedCommit) {
			const nextCommit = logQuery.state.data.commits[0]?.hash ?? null;
			setSelectedCommitHash(nextCommit);
			setSelectedFilePath(null);
			writeQueryParam("commit", nextCommit);
			writeQueryParam("file", null);
		}
	}, [hasUserClearedCommit, logQuery.state, selectedCommitHash]);

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
			setHasUserClearedCommit(true);
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
		setHasUserClearedCommit(false);
		setHasUserClearedFile(false);
		setFileSectionCollapsed(false);
		writeQueryParam("ref", target);
		writeQueryParam("commit", null);
		writeQueryParam("file", null);
		setCollapsedColumns((current) => ({ ...current, commits: false }));
	}

	function selectCommit(commit: RuntimeGitCommit): void {
		if (selectedCommitHash === commit.hash) {
			setSelectedCommitHash(null);
			setSelectedFilePath(null);
			setHasUserClearedCommit(true);
			setHasUserClearedFile(true);
			setFileSectionCollapsed(false);
			writeQueryParam("commit", null);
			writeQueryParam("file", null);
			return;
		}
		setSelectedCommitHash(commit.hash);
		setSelectedFilePath(null);
		setHasUserClearedCommit(false);
		setHasUserClearedFile(false);
		setFileSectionCollapsed(false);
		writeQueryParam("commit", commit.hash);
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

	return (
		<VcsShell
			projectState={projectState}
			currentPath={currentPath}
			title="Branches"
			subtitle="Bookmarks, remote work, commits, and changes"
			kicker={<StatusChip label="Read only" tone="blue" />}
		>
			{!workspaceId ? (
				<NoProjectSelected action={<SelectProjectButton onClick={projectState.onAddProject} />}>
					Select a project to show JJ bookmarks, remotes, local branches, tags, and commits.
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
							refsState={refsQuery.state}
							filter={filter}
							setFilter={setFilter}
							search={search}
							setSearch={setSearch}
							selectedRefName={selectedRefName}
							selectedCommitHash={selectedCommitHash}
							selectedFilePath={selectedFilePath}
							selectedFile={selectedFile}
							selectedRefTarget={selectedInventoryTarget}
							logState={logQuery.state}
							isLoadingMoreCommits={logQuery.isLoadingMore}
							hasMoreCommits={logQuery.hasMore}
							diffState={commitDiffQuery.state}
							collapsedColumns={collapsedColumns}
							columnWidths={columnWidths}
							fileViewMode={fileViewMode}
							isFileSectionCollapsed={isFileSectionCollapsed}
							onColumnCollapsedChange={(column, collapsed) => setCollapsedColumns((current) => ({ ...current, [column]: collapsed }))}
							onColumnWidthChange={setColumnWidth}
							onFileViewModeChange={changeFileViewMode}
							onFileSectionCollapsedChange={changeFileSectionCollapsed}
							onSelectRef={selectRef}
							onSelectCommit={selectCommit}
							onSelectFile={selectFile}
							onLoadMoreCommits={logQuery.loadMore}
							onCloseDiff={() => {
								setSelectedFilePath(null);
								setHasUserClearedFile(true);
								writeQueryParam("file", null);
							}}
						/>
					)}
				</QueryGate>
			)}
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
					id="commits"
					title="Commits"
					width={columnWidths.commits}
					minWidth={BRANCH_COLUMN_LIMITS.commits.min}
					maxWidth={BRANCH_COLUMN_LIMITS.commits.max}
					onCollapse={() => undefined}
					onWidthChange={() => undefined}
				>
					<CommitRowsSkeleton />
				</VcsColumn>
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
	refsState,
	filter,
	setFilter,
	search,
	setSearch,
	selectedRefName,
	selectedCommitHash,
	selectedFilePath,
	selectedFile,
	selectedRefTarget,
	logState,
	isLoadingMoreCommits,
	hasMoreCommits,
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
	onSelectCommit,
	onSelectFile,
	onLoadMoreCommits,
	onCloseDiff,
}: {
	inventory: VcsJjInventoryResponse;
	refsState: QueryState<RuntimeGitRefsResponse>;
	filter: BranchFilter;
	setFilter: (filter: BranchFilter) => void;
	search: string;
	setSearch: (value: string) => void;
	selectedRefName: string | null;
	selectedCommitHash: string | null;
	selectedFilePath: string | null;
	selectedFile: VcsFileChange | null;
	selectedRefTarget: string | null;
	logState: QueryState<RuntimeGitLogResponse>;
	isLoadingMoreCommits: boolean;
	hasMoreCommits: boolean;
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
	onSelectCommit: (commit: RuntimeGitCommit) => void;
	onSelectFile: (path: string) => void;
	onLoadMoreCommits: () => void;
	onCloseDiff: () => void;
}): React.ReactElement {
	const refsCount = refsState.status === "ready" && refsState.data.ok ? refsState.data.refs.length : inventory.items.length;
	const visibleItems = inventory.items.filter((item) => {
		if (filter === "prs" && !item.pr) {
			return false;
		}
		if (filter === "local" && !["current", "applied", "local", "older"].includes(item.group)) {
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
		{ current: [], applied: [], remote: [], local: [], tags: [], older: [] },
	);
	const activeItem =
		selectedRefName ? inventory.items.find((item) => getItemTarget(item) === selectedRefName) ?? null : null;
	const activeFiles = toFileChanges(diffState);

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
							activeItem={activeItem}
							selectedRefName={selectedRefName}
							onSelectRef={onSelectRef}
						/>
					</VcsColumn>
				)}
				{collapsedColumns.commits ? (
					<VcsCollapsedColumn
						label="Commits"
						count={logState.status === "ready" && logState.data.ok ? logState.data.totalCount : undefined}
						onExpand={() => onColumnCollapsedChange("commits", false)}
					/>
				) : (
					<VcsColumn
						id="commits"
						title={activeItem?.name ?? "Commits"}
						count={logState.status === "ready" && logState.data.ok ? logState.data.totalCount : undefined}
						width={columnWidths.commits}
						minWidth={BRANCH_COLUMN_LIMITS.commits.min}
						maxWidth={BRANCH_COLUMN_LIMITS.commits.max}
						onCollapse={() => onColumnCollapsedChange("commits", true)}
						onWidthChange={(width) => onColumnWidthChange("commits", width)}
						onScrollNearEnd={hasMoreCommits ? onLoadMoreCommits : undefined}
					>
						<CommitGraphColumn
							hasSelectedRef={Boolean(selectedRefTarget)}
							state={logState}
							isLoadingMore={isLoadingMoreCommits}
							hasMore={hasMoreCommits}
							diffState={diffState}
							selectedCommitHash={selectedCommitHash}
							selectedFilePath={selectedFilePath}
							fileViewMode={fileViewMode}
							isFileSectionCollapsed={isFileSectionCollapsed}
							onFileViewModeChange={onFileViewModeChange}
							onFileSectionCollapsedChange={onFileSectionCollapsedChange}
							onSelectCommit={onSelectCommit}
							onSelectFile={onSelectFile}
							onLoadMore={onLoadMoreCommits}
						/>
					</VcsColumn>
				)}
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
			</div>
			<DiagnosticsPanel diagnostics={inventory.diagnostics} />
			{selectedCommitHash && diffState.status === "ready" && diffState.data.ok && activeFiles.length === 0 ? (
				<div className="mt-3 max-w-md">
					<EmptyState title="No file changes">This commit did not return any file changes.</EmptyState>
				</div>
			) : null}
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
	activeItem,
	selectedRefName,
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
	activeItem: VcsJjInventoryItem | null;
	selectedRefName: string | null;
	onSelectRef: (item: VcsJjInventoryItem) => void;
}): React.ReactElement {
	return (
		<>
			<div className="border-b border-border px-3 py-3">
				<div className="rounded-md border border-border bg-surface-0 p-3">
					<div className="text-xs font-medium text-text-tertiary">Current workspace target</div>
					<div className="mt-2 flex min-w-0 items-center gap-2">
						<div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg">
							<GitBranch size={14} />
						</div>
						<div className="min-w-0">
							<div className="truncate text-sm font-semibold text-text-primary">
								{inventory.workspaceTarget?.name ?? inventory.jj.currentBookmark ?? "Current change"}
							</div>
							<div className="truncate font-mono text-[11px] text-text-tertiary">
								{inventory.workspaceTarget?.changeId ?? inventory.jj.currentChangeId ?? "unknown"}
							</div>
						</div>
					</div>
					<div className="mt-3 border-t border-border pt-2 text-xs text-text-secondary">
						{refsCount} refs · {inventory.items.filter((item) => item.pr).length} PRs
					</div>
				</div>
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
						placeholder="Search refs"
						className="min-w-0 flex-1 border-0 bg-transparent text-text-primary outline-none placeholder:text-text-tertiary"
					/>
				</label>
			</div>
			<div className="min-h-0 flex-1">
				{visibleItems.length === 0 ? (
					<div className="p-3">
						<EmptyState title="No branch data">No refs matched the active filter.</EmptyState>
					</div>
				) : (
					(Object.keys(groupedItems) as VcsJjInventoryItem["group"][]).map((group) =>
						groupedItems[group].length > 0 ? (
							<section key={group} className="border-b border-border">
								<header className="bg-surface-0 px-3 py-2 text-xs font-medium text-text-tertiary">
									{GROUP_LABELS[group]}
								</header>
								{groupedItems[group].map((item) => (
							<BranchRow
								key={item.id}
								item={item}
								selected={getItemTarget(item) === selectedRefName}
								onSelect={() => onSelectRef(item)}
							/>
								))}
							</section>
						) : null,
					)
				)}
			</div>
		</>
	);
}

function BranchRow({
	item,
	selected,
	onSelect,
}: {
	item: VcsJjInventoryItem;
	selected: boolean;
	onSelect: () => void;
}): React.ReactElement {
	return (
		<button
			type="button"
			className={cn(
				"flex w-full min-w-0 flex-col gap-2 px-3 py-3 text-left hover:bg-surface-2",
				selected && "bg-surface-2",
				selected && SELECTED_REF_MARKER_CLASS,
			)}
			onClick={onSelect}
		>
			<div className="flex min-w-0 items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<span className="text-text-tertiary">{itemIcon(item)}</span>
					<span className="truncate text-sm font-semibold text-text-primary">{item.name}</span>
				</div>
				{item.isCurrent ? <StatusChip label="Workspace" tone="neutral" /> : null}
			</div>
			<div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
				{item.pr ? <StatusChip label={`PR #${item.pr.number}`} tone="green" icon={<GitPullRequest size={12} />} /> : null}
				<StatusChip label={item.type.replace("_", " ")} tone={item.type === "remote" ? "blue" : "neutral"} />
				{item.tracked ? <span>tracked</span> : null}
				{item.remoteName ? <span>{item.remoteName}</span> : null}
				{item.changeId ? <code>{item.changeId}</code> : null}
			</div>
		</button>
	);
}

function CommitGraphColumn({
	hasSelectedRef,
	state,
	isLoadingMore,
	hasMore,
	diffState,
	selectedCommitHash,
	selectedFilePath,
	fileViewMode,
	isFileSectionCollapsed,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelectCommit,
	onSelectFile,
	onLoadMore,
}: {
	hasSelectedRef: boolean;
	state: QueryState<RuntimeGitLogResponse>;
	isLoadingMore: boolean;
	hasMore: boolean;
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	selectedCommitHash: string | null;
	selectedFilePath: string | null;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelectCommit: (commit: RuntimeGitCommit) => void;
	onSelectFile: (path: string) => void;
	onLoadMore: () => void;
}): React.ReactElement {
	if (!hasSelectedRef) {
		return <div className="p-3"><EmptyState title="Select a branch">Choose a branch or bookmark to show its commits.</EmptyState></div>;
	}
	if (state.status === "loading") {
		return <CommitRowsSkeleton />;
	}
	if (state.status === "error") {
		return <div className="p-3"><EmptyState title="Commit history unavailable">{state.message}</EmptyState></div>;
	}
	if (!state.data.ok) {
		return <div className="p-3"><EmptyState title="Commit history unavailable">{state.data.error ?? "The selected ref could not be read."}</EmptyState></div>;
	}
	if (state.data.commits.length === 0) {
		return <div className="p-3"><EmptyState title="No commits">No commits were returned for this ref.</EmptyState></div>;
	}

	const selectedFiles = toFileChanges(diffState);
	const selectedError =
		diffState.status === "error"
			? diffState.message
			: diffState.status === "ready" && !diffState.data.ok
				? diffState.data.error ?? "The selected commit diff could not be read."
				: null;

	return (
		<div className="py-1">
			{state.data.commits.map((commit, index) => {
				const selected = selectedCommitHash === commit.hash;
				return (
					<div key={commit.hash} className={cn("border-b border-divider last:border-b-0", selected && "bg-surface-2")}>
						<button
							type="button"
							className="relative flex w-full min-w-0 gap-3 px-3 py-3 text-left hover:bg-surface-2"
							onClick={() => onSelectCommit(commit)}
						>
							{selected ? <span aria-hidden className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-accent" /> : null}
							<div className="relative flex w-7 shrink-0 justify-center">
								<span className="absolute bottom-[-13px] top-[-13px] w-px bg-accent/70" />
								<span
									className={cn(
										"relative mt-1 grid h-3 w-3 place-items-center rounded-full border border-accent bg-surface-1",
										index === 0 && "bg-accent",
									)}
								/>
							</div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium text-text-primary">{commit.message}</div>
								<div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-tertiary">
									<GitCommit size={12} />
									<code>{commit.changeId ?? commit.shortHash}</code>
									<span>{commit.authorName}</span>
									<span>{formatRelativeTime(commit.date)}</span>
								</div>
							</div>
						</button>
						{selected ? (
							<VcsInlineFileSection
								title="Commit files"
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
			})}
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

function CommitRowsSkeleton({ rows = 10 }: { rows?: number }): React.ReactElement {
	return (
		<div className="py-1">
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="flex min-w-0 gap-3 border-b border-divider px-3 py-3">
					<div className="relative flex w-7 shrink-0 justify-center">
						<span className="absolute bottom-[-13px] top-[-13px] w-px bg-border" />
						<span className="kb-skeleton relative mt-1 h-3 w-3 rounded-full" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="kb-skeleton h-4 w-4/5" />
						<div className="mt-2 flex gap-2">
							<div className="kb-skeleton h-3 w-14" />
							<div className="kb-skeleton h-3 w-20" />
							<div className="kb-skeleton h-3 w-16" />
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
