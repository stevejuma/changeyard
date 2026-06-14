import {
	ArchiveX,
	ArrowDown,
	ArrowUp,
	CheckCircle2,
	CircleArrowDown,
	GitBranch,
	GitMerge,
	History,
	Layers3,
	LayoutDashboard,
	MoreHorizontal,
	Play,
	Settings,
	Terminal,
	Workflow,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { VcsProjectNavigationPanel } from "@/components/project-navigation-panel";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { CopyValueButton } from "@/components/ui/copy-value-button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import { VcsFileDiffColumn, VcsInlineFileSection, findFileByPath, type VcsFileChange } from "@/components/vcs-file-columns";
import { VcsConsolePanel } from "@/components/vcs-console-panel";
import { KeyValue } from "@/components/vcs-panels";
import { ResizableBottomPane } from "@/resize/resizable-bottom-pane";
import type { QueryState, RuntimeGitCommit, RuntimeProjectSummary, RuntimeProjectsResponse } from "@/runtime/types";
import {
	toRuntimeQueryState,
	useApplyVcsOperationMutation,
	useGetRepositoryCommitDiffQuery,
	useGetRepositoryLogQuery,
	useLazyPreviewVcsOperationQuery,
} from "@/runtime/vcs-api";
import { readVcsFileViewMode, readVcsNumberPreference, VCS_LAYOUT_STORAGE_KEYS, writeVcsFileViewMode, writeVcsNumberPreference, type VcsFileViewMode } from "@/utils/vcs-ui-preferences";
import { isVcsNavItemActive, withWorkspaceParam } from "@/utils/vcs-navigation";
import { shouldHandleVcsLinkClick, useVcsRouter } from "@/utils/vcs-router";
import {
	areVcsWorkspaceOperationsEqual,
	type VcsDiffResult,
	type VcsOperationPreview,
	type VcsWorkspaceFileChange,
	type VcsWorkspaceOperation,
	type VcsWorkspaceState,
} from "@/vcs-workspace-contracts";

const navItems = [
	{ href: "/vcs/jj", label: "Workspace", icon: Layers3 },
	{ href: "/vcs/jj/branches", label: "Branches", icon: GitBranch },
	{ href: "/vcs/jj/history", label: "History", icon: History },
] as const;

const surfaceLinks = [
	{ href: "/", label: "Dashboard", icon: LayoutDashboard },
	{ href: "/kanban", label: "Kanban", icon: Workflow },
] as const;

const CONSOLE_HEIGHT_LIMITS = {
	min: 220,
	max: 760,
	fallback: 280,
	key: VCS_LAYOUT_STORAGE_KEYS.consoleHeight,
} as const;

const ACTIVE_GRAPH_COLUMN_LIMITS = {
	min: 420,
	max: 820,
	fallback: 520,
	key: "changeyard.vcs.active-change.commits.width",
} as const;

const ACTIVE_GRAPH_DIFF_LIMITS = {
	min: 420,
	max: 980,
	fallback: 640,
	key: "changeyard.vcs.active-change.diff.width",
} as const;

const ACTIVE_GRAPH_PAGE_SIZE = 50;

const ACTIVE_GRAPH_ROW_HEIGHT = 90;
const ACTIVE_GRAPH_LANE_COLORS = [
	"var(--color-status-blue)",
	"var(--color-status-green)",
	"var(--color-status-orange)",
	"var(--color-status-violet)",
	"var(--color-status-rose)",
	"var(--color-status-cyan)",
	"var(--color-status-lime)",
	"var(--color-status-gold)",
];
const ACTIVE_GRAPH_REMOTE_LANE_COLOR = "color-mix(in srgb, var(--color-status-blue) 75%, white 10%)";
const ACTIVE_GRAPH_LANE_WIDTH = 12;
const ACTIVE_GRAPH_NODE_RADIUS = 4;
const ACTIVE_GRAPH_LEFT_PAD = 8;

type VcsRepositoryStatusState = {
	workspacePath: string | null;
	workspaceState: QueryState<VcsWorkspaceState>;
	diffState: QueryState<VcsDiffResult>;
};

export type VcsShellProjectState = {
	projectsState: QueryState<RuntimeProjectsResponse>;
	currentProject: RuntimeProjectSummary | null;
	currentProjectId: string | null;
	removingProjectId: string | null;
	isProjectNavCollapsed: boolean;
	onProjectNavCollapsedChange: (collapsed: boolean) => void;
	onSelectProject: (projectId: string) => void;
	onAddProject: () => void;
	onRemoveProject: (projectId: string) => Promise<boolean>;
	onClearOtherProjects: () => Promise<boolean>;
	onOpenSettings: () => void;
	repositoryStatus?: VcsRepositoryStatusState;
};

function normalizeDisplayPath(path: string): string {
	return path.replaceAll("\\", "/");
}

function formatPathForDisplay(path: string): string {
	const normalized = normalizeDisplayPath(path);
	const unixMatch = normalized.match(/^\/(?:Users|home)\/[^/]+/);
	const windowsMatch = normalized.match(/^[A-Za-z]:\/Users\/[^/]+/);
	const homePrefix = unixMatch?.[0] ?? windowsMatch?.[0] ?? null;
	if (!homePrefix) {
		return normalized;
	}
	if (normalized === homePrefix) {
		return "~";
	}
	return normalized.startsWith(`${homePrefix}/`) ? `~/${normalized.slice(homePrefix.length + 1)}` : normalized;
}

function summarizeFiles(files: VcsWorkspaceFileChange[]): { fileCount: number; additions: number; deletions: number } {
	return files.reduce(
		(summary, file) => ({
			fileCount: summary.fileCount + 1,
			additions: summary.additions + (file.additions ?? 0),
			deletions: summary.deletions + (file.deletions ?? 0),
		}),
		{ fileCount: 0, additions: 0, deletions: 0 },
	);
}

function repositoryModeLabel(mode: VcsWorkspaceState["mode"]): string {
	switch (mode) {
		case "normal":
			return "Open";
		case "editing":
			return "Editing";
		case "conflicted":
			return "Conflicted";
		case "unsupported":
			return "Unsupported";
	}
}

function findActiveCommit(state: VcsWorkspaceState): { changeId: string; commitHash: string | null } | null {
	const activeChangeId = state.headId;
	if (!activeChangeId) {
		return null;
	}
	for (const stack of state.stacks) {
		for (const commit of stack.commits) {
			if (commit.commitId !== activeChangeId) {
				continue;
			}
			const commitHash = typeof commit.metadata?.commitHash === "string" ? commit.metadata.commitHash : commit.displayId;
			return { changeId: activeChangeId, commitHash };
		}
	}
	return { changeId: activeChangeId, commitHash: null };
}

function formatRelativeTime(timestamp: string | null): string {
	if (!timestamp) {
		return "unknown";
	}
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return "unknown";
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
	return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
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

function commitLabelTone(label: string): StatusChipTone {
	switch (label) {
		case "conflict":
			return "red";
		case "divergent":
			return "orange";
		case "hidden":
			return "purple";
		case "empty":
			return "neutral";
		default:
			return "blue";
	}
}

function toFileChanges(files?: Array<{ path: string; status: VcsFileChange["status"]; additions?: number; deletions?: number; patch?: string }>): VcsFileChange[] {
	return (files ?? []).map((file) => ({
		path: file.path,
		status: file.status,
		additions: file.additions,
		deletions: file.deletions,
		patch: file.patch,
	}));
}

interface ActiveGraphLane {
	hash: string;
	color: string;
}

interface ActiveGraphRow {
	commit: RuntimeGitCommit;
	commitLane: number;
	lanes: ActiveGraphLane[];
	mergeFromLanes: number[];
	convergingLanes: number[];
	splitFromLane: number | null;
	commitStartsLane: boolean;
	isFirst: boolean;
}

function activeGraphLaneX(lane: number): number {
	return ACTIVE_GRAPH_LEFT_PAD + lane * ACTIVE_GRAPH_LANE_WIDTH + ACTIVE_GRAPH_LANE_WIDTH / 2;
}

function activeGraphContentLeft(row: ActiveGraphRow): number {
	let rightmostLane = row.commitLane;
	for (let index = 0; index < row.lanes.length; index += 1) {
		if (index > rightmostLane) {
			rightmostLane = index;
		}
	}
	for (const lane of row.mergeFromLanes) {
		if (lane > rightmostLane) {
			rightmostLane = lane;
		}
	}
	return ACTIVE_GRAPH_LEFT_PAD + (rightmostLane + 1) * ACTIVE_GRAPH_LANE_WIDTH + 10;
}

function buildActiveChangeCommitGraph(commits: RuntimeGitCommit[]): ActiveGraphRow[] {
	const rows: ActiveGraphRow[] = [];
	let lanes: ActiveGraphLane[] = [];
	let colorIndex = 0;

	function nextColor(): string {
		const color = ACTIVE_GRAPH_LANE_COLORS[colorIndex % ACTIVE_GRAPH_LANE_COLORS.length] ?? ACTIVE_GRAPH_LANE_COLORS[0]!;
		colorIndex += 1;
		return color;
	}

	for (let commitIndex = 0; commitIndex < commits.length; commitIndex += 1) {
		const commit = commits[commitIndex]!;
		let commitStartsLane = false;
		let commitLane = lanes.findIndex((lane) => lane.hash === commit.hash);
		if (commitLane === -1) {
			commitStartsLane = true;
			commitLane = lanes.length;
			lanes.push({
				hash: commit.hash,
				color: commit.relation === "upstream" ? ACTIVE_GRAPH_REMOTE_LANE_COLOR : nextColor(),
			});
		}

		const currentLanes = lanes.map((lane) => ({ ...lane }));
		const mergeFromLanes: number[] = [];
		const convergingLanes = currentLanes
			.map((lane, laneIndex) => (lane.hash === commit.hash && laneIndex !== commitLane ? laneIndex : -1))
			.filter((laneIndex) => laneIndex !== -1);
		let splitFromLane: number | null = null;

		const firstParent = commit.parentHashes[0];
		const otherParents = commit.parentHashes.slice(1);
		const firstParentLane = firstParent ? currentLanes.findIndex((lane) => lane.hash === firstParent) : -1;
		if (commitLane === currentLanes.length - 1 && firstParentLane !== -1 && firstParentLane !== commitLane) {
			splitFromLane = firstParentLane;
		}

		if (firstParent) {
			lanes[commitLane] = { hash: firstParent, color: currentLanes[commitLane]?.color ?? nextColor() };
		} else {
			lanes = lanes.filter((_, laneIndex) => laneIndex !== commitLane);
		}

		for (const parentHash of otherParents) {
			const existingLane = lanes.findIndex((lane) => lane.hash === parentHash);
			if (existingLane !== -1) {
				mergeFromLanes.push(existingLane);
			} else {
				const newLane = lanes.length;
				lanes.push({ hash: parentHash, color: nextColor() });
				mergeFromLanes.push(newLane);
			}
		}

		lanes = lanes.filter((lane, laneIndex, currentLanesAfterUpdate) => {
			return currentLanesAfterUpdate.findIndex((candidate) => candidate.hash === lane.hash) === laneIndex;
		});

		rows.push({
			commit,
			commitLane,
			lanes: currentLanes,
			mergeFromLanes,
			convergingLanes,
			splitFromLane,
			commitStartsLane,
			isFirst: commitIndex === 0,
		});
	}

	return rows;
}

function ActiveChangeCommitGraphSvg({ row, maxLanes }: { row: ActiveGraphRow; maxLanes: number }): React.ReactElement {
	const width = ACTIVE_GRAPH_LEFT_PAD + maxLanes * ACTIVE_GRAPH_LANE_WIDTH + ACTIVE_GRAPH_LANE_WIDTH;
	const centerY = ACTIVE_GRAPH_ROW_HEIGHT / 2;
	const commitX = activeGraphLaneX(row.commitLane);
	const commitColor = row.lanes[row.commitLane]?.color ?? ACTIVE_GRAPH_LANE_COLORS[0]!;
	const isUpstreamCommit = row.commit.relation === "upstream";

	return (
		<svg
			width={width}
			height={ACTIVE_GRAPH_ROW_HEIGHT}
			className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible"
		>
			{row.lanes.map((lane, laneIndex) => {
				const x = activeGraphLaneX(laneIndex);
				const isConvergingLane = row.convergingLanes.includes(laneIndex);
				const isSplitCommitLane = row.splitFromLane !== null && laneIndex === row.commitLane;
				const isCommitStartLane = row.commitStartsLane && laneIndex === row.commitLane;
				const y1 = row.isFirst || (isCommitStartLane && !isSplitCommitLane) ? centerY : 0;
				const y2 = isConvergingLane || isSplitCommitLane ? centerY : ACTIVE_GRAPH_ROW_HEIGHT;
				return <line key={`lane-${laneIndex}`} x1={x} y1={y1} x2={x} y2={y2} stroke={lane.color} strokeWidth={2.5} />;
			})}
			{row.splitFromLane !== null ? (
				<path
					d={`M ${activeGraphLaneX(row.splitFromLane)} ${ACTIVE_GRAPH_ROW_HEIGHT} C ${activeGraphLaneX(row.splitFromLane)} ${ACTIVE_GRAPH_ROW_HEIGHT - 10}, ${commitX} ${centerY + 10}, ${commitX} ${centerY}`}
					fill="none"
					stroke={row.lanes[row.splitFromLane]?.color ?? commitColor}
					strokeWidth={2.5}
				/>
			) : null}
			{row.mergeFromLanes.map((fromLane) => (
				<path
					key={`merge-${fromLane}`}
					d={`M ${commitX} ${centerY} C ${commitX} ${centerY + 14}, ${activeGraphLaneX(fromLane)} ${centerY + 6}, ${activeGraphLaneX(fromLane)} ${ACTIVE_GRAPH_ROW_HEIGHT}`}
					fill="none"
					stroke={row.lanes[fromLane]?.color ?? commitColor}
					strokeWidth={2.5}
				/>
			))}
			{row.convergingLanes.map((fromLane) => (
				<path
					key={`converge-${fromLane}`}
					d={`M ${activeGraphLaneX(fromLane)} ${centerY} C ${activeGraphLaneX(fromLane)} ${centerY + 8}, ${commitX} ${centerY + 8}, ${commitX} ${centerY}`}
					fill="none"
					stroke={row.lanes[fromLane]?.color ?? commitColor}
					strokeWidth={2.5}
				/>
			))}
			<circle
				cx={commitX}
				cy={centerY}
				r={isUpstreamCommit ? ACTIVE_GRAPH_NODE_RADIUS + 0.5 : ACTIVE_GRAPH_NODE_RADIUS}
				fill={isUpstreamCommit ? "var(--color-surface-0)" : commitColor}
				stroke={commitColor}
				strokeWidth={isUpstreamCommit ? 2 : 0}
			/>
		</svg>
	);
}

function VcsRepositoryStatus({
	status,
	isGraphOpen,
	onToggleGraph,
}: {
	status?: VcsRepositoryStatusState;
	isGraphOpen: boolean;
	onToggleGraph: () => void;
}): React.ReactElement | null {
	if (!status?.workspacePath || status.workspaceState.status !== "ready") {
		return null;
	}
	const state = status.workspaceState.data;
	const activeCommit = findActiveCommit(state);
	const files =
		status.diffState.status === "ready" && status.diffState.data.ok
			? status.diffState.data.files
			: state.workingCopy.files;
	const summary = summarizeFiles(files);
	const modeLabel = repositoryModeLabel(state.mode);
	const modeTone =
		state.mode === "conflicted"
			? "border-status-red/40 bg-status-red/10 text-status-red"
			: state.mode === "editing"
				? "border-status-orange/40 bg-status-orange/10 text-status-orange"
				: "border-border bg-surface-2 text-text-secondary";

	return (
		<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
			<span className="min-w-0 truncate font-mono text-xs text-text-secondary" title={status.workspacePath}>
				{formatPathForDisplay(status.workspacePath)}
			</span>
			<span className={cn("inline-flex h-7 shrink-0 items-center rounded-md border px-2 text-xs font-medium", modeTone)}>
				{modeLabel}
			</span>
			{activeCommit ? (
				<Button
					variant={isGraphOpen ? "primary" : "default"}
					size="sm"
					icon={<GitBranch size={12} />}
					title={isGraphOpen ? "Hide active change graph" : "Show active change graph"}
					aria-label={`${isGraphOpen ? "Hide" : "Show"} active change graph ${activeCommit.changeId}`}
					onClick={onToggleGraph}
					className={cn("max-w-[190px] font-mono text-xs", isGraphOpen ? "ring-1 ring-accent" : "bg-surface-2")}
				>
					<span className="truncate">{activeCommit.changeId}</span>
				</Button>
			) : null}
			<span className="shrink-0 font-mono text-xs text-text-tertiary">
				({summary.fileCount} {summary.fileCount === 1 ? "file" : "files"}
				<span className="text-status-green"> +{summary.additions}</span>
				<span className="text-status-red"> -{summary.deletions}</span>)
			</span>
			<div className="flex shrink-0 items-center gap-0 text-text-tertiary">
				<Button variant="ghost" size="sm" icon={<CircleArrowDown size={16} />} aria-label="Fetch from upstream" title="Fetch from upstream" disabled />
				<Button variant="ghost" size="sm" icon={<ArrowDown size={13} />} aria-label="Pull from upstream" title="Pull from upstream" disabled>
					0
				</Button>
				<Button variant="ghost" size="sm" icon={<ArrowUp size={13} />} aria-label="Push to upstream" title="Push to upstream" disabled>
					0
				</Button>
			</div>
		</div>
	);
}

function ActiveChangeGraphView({
	workspaceId,
	status,
}: {
	workspaceId: string | null;
	status?: VcsRepositoryStatusState;
}): React.ReactElement {
	const activeCommit = status?.workspaceState.status === "ready" ? findActiveCommit(status.workspaceState.data) : null;
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(activeCommit?.commitHash ?? null);
	const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
	const [selectionWasCleared, setSelectionWasCleared] = useState(false);
	const [autoOpenedFileForCommitHash, setAutoOpenedFileForCommitHash] = useState<string | null>(null);
	const [fileViewMode, setFileViewMode] = useState<VcsFileViewMode>(() => readVcsFileViewMode());
	const [isFileSectionCollapsed, setFileSectionCollapsed] = useState(false);
	const [logCursor, setLogCursor] = useState<string | null>(null);
	const [pendingOperation, setPendingOperation] = useState<VcsWorkspaceOperation | null>(null);
	const [operationApplyError, setOperationApplyError] = useState<string | null>(null);
	const [isApplyingOperation, setApplyingOperation] = useState(false);
	const [graphWidth, setGraphWidth] = useState(() =>
		readVcsNumberPreference(
			ACTIVE_GRAPH_COLUMN_LIMITS.key,
			ACTIVE_GRAPH_COLUMN_LIMITS.fallback,
			ACTIVE_GRAPH_COLUMN_LIMITS.min,
			ACTIVE_GRAPH_COLUMN_LIMITS.max,
		),
	);
	const [diffWidth, setDiffWidth] = useState(() =>
		readVcsNumberPreference(
			ACTIVE_GRAPH_DIFF_LIMITS.key,
			ACTIVE_GRAPH_DIFF_LIMITS.fallback,
			ACTIVE_GRAPH_DIFF_LIMITS.min,
			ACTIVE_GRAPH_DIFF_LIMITS.max,
		),
	);
	const logResult = useGetRepositoryLogQuery(
		{
			workspaceId: workspaceId ?? "",
			input: {
				ref: activeCommit?.changeId ?? null,
				pageSize: ACTIVE_GRAPH_PAGE_SIZE,
				cursor: logCursor,
			},
		},
		{ skip: !workspaceId || !activeCommit },
	);
	const [previewVcsOperation, previewResult] = useLazyPreviewVcsOperationQuery();
	const [applyVcsOperation] = useApplyVcsOperationMutation();
	const isLoading = logResult.isLoading || logResult.isFetching;
	const commits = logResult.data?.ok ? logResult.data.commits : [];
	const errorMessage = logResult.isError ? "Could not load active change graph." : logResult.data && !logResult.data.ok ? (logResult.data.error ?? "Could not load active change graph.") : null;
	const selectedCommit = commits.find((commit) => commit.hash === selectedCommitHash) ?? null;
	const selectedCommitHashForDiff = selectedCommit?.hash ?? null;
	const selectedCommitDiffResult = useGetRepositoryCommitDiffQuery(
		{ workspaceId: workspaceId ?? "", commitHash: selectedCommitHashForDiff ?? "" },
		{ skip: !workspaceId || !selectedCommitHashForDiff },
	);
	const selectedFiles = selectedCommit && selectedCommitDiffResult.data?.ok ? toFileChanges(selectedCommitDiffResult.data.files) : [];
	const selectedFile = findFileByPath(selectedFiles, selectedFilePath);
	const selectedDiffError =
		selectedCommitDiffResult.isError
			? "The selected commit diff could not be read."
			: selectedCommitDiffResult.data && !selectedCommitDiffResult.data.ok
				? selectedCommitDiffResult.data.error ?? "The selected commit diff could not be read."
				: null;
	const hasMoreCommits = Boolean(logResult.data?.ok && logResult.data.hasMore && logResult.data.nextCursor);
	const graphRows = useMemo(() => buildActiveChangeCommitGraph(commits), [commits]);
	const previewState = toRuntimeQueryState<VcsOperationPreview>(previewResult, "Failed to preview workspace operation.");
	const maxLanes = Math.max(
		1,
		...graphRows.map((row) =>
			Math.max(row.lanes.length, row.mergeFromLanes.length > 0 ? Math.max(...row.mergeFromLanes) + 1 : 0),
		),
	);

	useEffect(() => {
		if (!activeCommit) {
			setSelectedCommitHash(null);
			setLogCursor(null);
			setSelectionWasCleared(false);
			setAutoOpenedFileForCommitHash(null);
			return;
		}
		setSelectedCommitHash((current) => current ?? activeCommit.commitHash ?? activeCommit.changeId);
		setLogCursor(null);
		setSelectionWasCleared(false);
		setAutoOpenedFileForCommitHash(null);
	}, [activeCommit?.changeId, activeCommit?.commitHash]);

	useEffect(() => {
		if (commits.length === 0) {
			return;
		}
		if (!selectedCommitHash && selectionWasCleared) {
			return;
		}
		if (selectedCommitHash && commits.some((commit) => commit.hash === selectedCommitHash)) {
			return;
		}
		const activeHash =
			commits.find((commit) => commit.changeId === activeCommit?.changeId || commit.hash === activeCommit?.commitHash)?.hash ?? null;
		setSelectedCommitHash(activeHash ?? commits[0]?.hash ?? null);
		setSelectedFilePath(null);
		setAutoOpenedFileForCommitHash(null);
	}, [activeCommit?.changeId, activeCommit?.commitHash, commits, selectedCommitHash, selectionWasCleared]);

	useEffect(() => {
		if (!selectedFilePath || selectedFiles.some((file) => file.path === selectedFilePath)) {
			return;
		}
		setSelectedFilePath(null);
	}, [selectedFilePath, selectedFiles]);

	useEffect(() => {
		if (!selectedCommitHash || selectedFilePath || autoOpenedFileForCommitHash === selectedCommitHash) {
			return;
		}
		const firstPath = selectedCommitDiffResult.data?.ok ? selectedCommitDiffResult.data.files[0]?.path : null;
		if (!firstPath) {
			return;
		}
		setSelectedFilePath(firstPath);
		setAutoOpenedFileForCommitHash(selectedCommitHash);
	}, [autoOpenedFileForCommitHash, selectedCommitDiffResult.data, selectedCommitHash, selectedFilePath]);

	function loadMoreCommits(): void {
		if (!logResult.data?.ok || !logResult.data.nextCursor || logResult.isFetching) {
			return;
		}
		setLogCursor(logResult.data.nextCursor);
	}

	function selectCommit(commit: RuntimeGitCommit): void {
		if (selectedCommitHash === commit.hash) {
			setSelectedCommitHash(null);
			setSelectedFilePath(null);
			setFileSectionCollapsed(false);
			setSelectionWasCleared(true);
			setAutoOpenedFileForCommitHash(null);
			return;
		}
		setSelectedCommitHash(commit.hash);
		setSelectedFilePath(null);
		setFileSectionCollapsed(false);
		setSelectionWasCleared(false);
		setAutoOpenedFileForCommitHash(null);
	}

	function openWorkspaceOperationPreview(operation: VcsWorkspaceOperation): void {
		if (!workspaceId) {
			return;
		}
		setPendingOperation(operation);
		setOperationApplyError(null);
		void previewVcsOperation({ workspaceId, input: { operation } });
	}

	function closeWorkspaceOperationPreview(): void {
		setPendingOperation(null);
		setOperationApplyError(null);
	}

	async function applyPendingWorkspaceOperation(): Promise<void> {
		if (!workspaceId || !pendingOperation) {
			return;
		}
		if (previewState.status !== "ready" || !areVcsWorkspaceOperationsEqual(previewState.data.operation, pendingOperation)) {
			setOperationApplyError("Preview is stale. Reopen the operation preview and try again.");
			return;
		}
		setApplyingOperation(true);
		setOperationApplyError(null);
		try {
			const result = await applyVcsOperation({
				workspaceId,
				input: { operation: pendingOperation },
			}).unwrap();
			if (!result.ok) {
				throw new Error(result.summary || "Workspace operation failed.");
			}
			closeWorkspaceOperationPreview();
			if (pendingOperation.kind === "abandon_commit") {
				setSelectedCommitHash(null);
				setSelectedFilePath(null);
				setSelectionWasCleared(true);
			}
		} catch (error) {
			setOperationApplyError(error instanceof Error ? error.message : "Workspace operation failed.");
		} finally {
			setApplyingOperation(false);
		}
	}

	function findSquashTargetCommit(commit: RuntimeGitCommit): RuntimeGitCommit | null {
		const parentHash = commit.parentHashes[0];
		if (!parentHash) {
			return null;
		}
		return commits.find((candidate) => candidate.hash === parentHash) ?? null;
	}

	return (
		<section className="flex h-full min-h-0 flex-col bg-surface-0">
			<div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3">
				<div className="flex h-full min-h-0 gap-3">
			<section
				className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
						style={{ width: graphWidth, minWidth: graphWidth }}
			>
				<header className="flex h-10 shrink-0 items-center gap-2 border-b border-divider px-3">
					<GitBranch size={14} className="text-accent" />
					<div className="min-w-0 flex-1">
						<div className="truncate text-sm font-semibold">Active change graph</div>
					</div>
					{activeCommit ? (
						<code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-xs text-text-secondary">{activeCommit.changeId}</code>
					) : null}
				</header>
						<div
							className="min-h-0 flex-1 overflow-auto"
							onScroll={(event) => {
								const element = event.currentTarget;
								if (element.scrollHeight - element.scrollTop - element.clientHeight <= 180) {
									loadMoreCommits();
								}
							}}
						>
					{!activeCommit ? (
						<div className="flex h-full items-center justify-center p-4 text-sm text-text-tertiary">No active change is available.</div>
					) : isLoading ? (
						<ActiveChangeGraphSkeleton />
					) : errorMessage ? (
						<div className="m-3 rounded-md border border-status-red/40 bg-status-red/10 p-3 text-sm text-status-red">{errorMessage}</div>
					) : commits.length === 0 ? (
						<div className="flex h-full items-center justify-center p-4 text-sm text-text-tertiary">No commits were returned for this change.</div>
					) : (
						<div className="py-1">
							{commits.map((commit, index) => {
									const selected = selectedCommitHash === commit.hash;
								const graphRow = graphRows[index];
								return (
									<ActiveChangeGraphRow
										key={commit.hash}
										commit={commit}
											graphRow={graphRow}
											maxLanes={maxLanes}
											selected={selected}
											files={selectedFiles}
											selectedFilePath={selectedFilePath}
											isFilesLoading={selectedCommitDiffResult.isLoading || selectedCommitDiffResult.isFetching}
											fileErrorMessage={selectedDiffError}
											fileViewMode={fileViewMode}
											isFileSectionCollapsed={isFileSectionCollapsed}
											onFileViewModeChange={(mode) => {
												setFileViewMode(mode);
												writeVcsFileViewMode(mode);
											}}
											onFileSectionCollapsedChange={(collapsed) => {
												setFileSectionCollapsed(collapsed);
												if (collapsed) {
													setSelectedFilePath(null);
												}
											}}
											onSelect={() => selectCommit(commit)}
											onSelectFile={(path) => {
												setSelectedFilePath((current) => (current === path ? null : path));
											}}
											squashTargetCommit={findSquashTargetCommit(commit)}
											onOpenOperation={openWorkspaceOperationPreview}
									/>
								);
							})}
									{hasMoreCommits || logResult.isFetching ? (
										<div className="border-t border-divider p-2">
											<button
												type="button"
												className="flex h-8 w-full items-center justify-center rounded-md border border-border bg-surface-0 text-xs font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary disabled:opacity-60"
												disabled={logResult.isFetching}
												onClick={loadMoreCommits}
											>
												{logResult.isFetching ? "Loading more commits..." : "Load more commits"}
											</button>
										</div>
									) : null}
						</div>
					)}
				</div>
						<div
							role="separator"
							aria-orientation="vertical"
							aria-label="Resize active change graph column"
							title="Resize active change graph"
							className="absolute right-0 top-0 z-20 h-full w-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-accent/40"
							onPointerDown={(event) => {
								const startX = event.clientX;
								const startWidth = graphWidth;
								const previousUserSelect = document.body.style.userSelect;
								const previousCursor = document.body.style.cursor;

								function handlePointerMove(pointerEvent: PointerEvent): void {
									const width = Math.min(
										ACTIVE_GRAPH_COLUMN_LIMITS.max,
										Math.max(ACTIVE_GRAPH_COLUMN_LIMITS.min, startWidth + pointerEvent.clientX - startX),
									);
									setGraphWidth(writeVcsNumberPreference(
										ACTIVE_GRAPH_COLUMN_LIMITS.key,
										width,
										ACTIVE_GRAPH_COLUMN_LIMITS.min,
										ACTIVE_GRAPH_COLUMN_LIMITS.max,
									));
								}

								function stopResize(): void {
									document.body.style.userSelect = previousUserSelect;
									document.body.style.cursor = previousCursor;
									window.removeEventListener("pointermove", handlePointerMove);
									window.removeEventListener("pointerup", stopResize);
									window.removeEventListener("pointercancel", stopResize);
								}

								event.preventDefault();
								event.stopPropagation();
								document.body.style.userSelect = "none";
								document.body.style.cursor = "ew-resize";
								window.addEventListener("pointermove", handlePointerMove);
								window.addEventListener("pointerup", stopResize);
								window.addEventListener("pointercancel", stopResize);
							}}
						/>
			</section>
					{selectedFile ? (
				<VcsFileDiffColumn
					file={selectedFile}
					isLoading={selectedCommitDiffResult.isLoading || selectedCommitDiffResult.isFetching}
					width={diffWidth}
							minWidth={ACTIVE_GRAPH_DIFF_LIMITS.min}
							maxWidth={ACTIVE_GRAPH_DIFF_LIMITS.max}
					onWidthChange={(width) => {
								const normalized = writeVcsNumberPreference(
									ACTIVE_GRAPH_DIFF_LIMITS.key,
									width,
									ACTIVE_GRAPH_DIFF_LIMITS.min,
									ACTIVE_GRAPH_DIFF_LIMITS.max,
								);
						setDiffWidth(normalized);
					}}
					onClose={() => setSelectedFilePath(null)}
					/>
			) : null}
					<div
						aria-hidden
						className="h-full shrink-0"
						style={{ width: ACTIVE_GRAPH_DIFF_LIMITS.fallback, minWidth: ACTIVE_GRAPH_DIFF_LIMITS.fallback }}
					/>
				</div>
			</div>
			<WorkspaceOperationPreviewDialog
				operation={pendingOperation}
				previewState={previewState}
				applyError={operationApplyError}
				isApplying={isApplyingOperation}
				onApply={() => void applyPendingWorkspaceOperation()}
				onClose={closeWorkspaceOperationPreview}
			/>
		</section>
	);
}

function ActiveChangeGraphRow({
	commit,
	graphRow,
	maxLanes,
	selected,
	files,
	selectedFilePath,
	isFilesLoading,
	fileErrorMessage,
	fileViewMode,
	isFileSectionCollapsed,
	onFileViewModeChange,
	onFileSectionCollapsedChange,
	onSelect,
	onSelectFile,
	squashTargetCommit,
	onOpenOperation,
}: {
	commit: RuntimeGitCommit;
	graphRow: ActiveGraphRow | undefined;
	maxLanes: number;
	selected: boolean;
	files: VcsFileChange[];
	selectedFilePath: string | null;
	isFilesLoading: boolean;
	fileErrorMessage: string | null;
	fileViewMode: VcsFileViewMode;
	isFileSectionCollapsed: boolean;
	onFileViewModeChange: (mode: VcsFileViewMode) => void;
	onFileSectionCollapsedChange: (collapsed: boolean) => void;
	onSelect: () => void;
	onSelectFile: (path: string) => void;
	squashTargetCommit: RuntimeGitCommit | null;
	onOpenOperation: (operation: VcsWorkspaceOperation) => void;
}): React.ReactElement {
	const authorName = commit.authorName?.trim() || null;
	const title = commit.message || "Untitled commit";
	const changeDisplay = commit.changeId?.trim() || null;
	const bookmarkNames = commit.bookmarks ?? [];
	const labels = commit.labels ?? [];
	return (
		<div
			className={cn(
				"relative overflow-visible",
				selected && "bg-surface-3",
				selected && "before:absolute before:left-0 before:top-1/2 before:z-30 before:h-12 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-accent before:content-['']",
			)}
		>
			<span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-px bg-divider" />
			<section
				role="button"
				tabIndex={0}
				className="kb-git-commit-row relative z-10 flex w-full min-w-0 cursor-pointer items-center gap-2 text-left"
				style={{
					height: ACTIVE_GRAPH_ROW_HEIGHT,
					paddingLeft: graphRow ? activeGraphContentLeft(graphRow) : ACTIVE_GRAPH_LEFT_PAD,
					paddingRight: 12,
					border: "none",
					fontFamily: "inherit",
				}}
				onPointerUp={(event) => {
					if (event.button !== 0) {
						return;
					}
					onSelect();
				}}
				onKeyDown={(event) => {
					if (event.target !== event.currentTarget) {
						return;
					}
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						onSelect();
					}
				}}
			>
				{graphRow ? <ActiveChangeCommitGraphSvg row={graphRow} maxLanes={maxLanes} /> : null}
				<div className="relative z-10 min-w-0 flex-1 py-2">
						<div className="flex min-w-0 items-center gap-2">
							<Avatar
								src={commit.authorAvatarUrl ?? null}
								name={authorName}
								email={commit.authorEmail}
								initials={authorInitials(authorName)}
							className="h-5 w-5"
						/>
							<span className="kb-git-commit-row-message min-w-0 truncate text-sm font-semibold text-text-primary">
								{title}
							</span>
							<div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 overflow-hidden">
								{labels.length > 0 ? (
									<>
									{labels.map((label) => (
										<StatusChip
											key={label}
											label={label}
											tone={commitLabelTone(label)}
											className="shrink-0 px-1.5 py-0 text-[10px] leading-4"
										/>
									))}
									</>
								) : null}
								<ActiveChangeCommitActionMenu
									commit={commit}
									squashTargetCommit={squashTargetCommit}
									onOpenOperation={onOpenOperation}
								/>
							</div>
						</div>
						<div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-text-tertiary">
							<CopyValueButton
							displayValue={commit.shortHash}
							copyValue={commit.hash}
							className="h-5 max-w-[9rem] border-transparent bg-transparent px-0.5 text-xs"
						/>
						{changeDisplay ? (
							<>
								<span className="shrink-0 text-text-tertiary">•</span>
									<CopyValueButton
										label="Change:"
										displayValue={changeDisplay}
										copyValue={changeDisplay}
										highlightPrefix={commit.changeIdUniquePrefix}
										className="h-5 max-w-[13rem] border-transparent bg-transparent px-0.5 text-xs"
									/>
								</>
						) : null}
					</div>
					<div className="kb-scrollbar-hidden mt-1 flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain pb-0.5 text-xs text-text-secondary">
						<span className="shrink-0">{formatRelativeTime(commit.date)}</span>
						{bookmarkNames.map((bookmarkName) => (
							<StatusChip
								key={bookmarkName}
								label={bookmarkName}
								tone="red"
								className="max-w-[16rem] shrink-0"
							/>
						))}
					</div>
				</div>
			</section>
			{selected ? (
				<div
					className="pb-2"
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<VcsInlineFileSection
						title="Changed files"
						files={files}
						selectedPath={selectedFilePath}
						isLoading={isFilesLoading}
						errorMessage={fileErrorMessage}
						viewMode={fileViewMode}
						onViewModeChange={onFileViewModeChange}
						collapsed={isFileSectionCollapsed}
						onCollapsedChange={onFileSectionCollapsedChange}
						onSelectPath={onSelectFile}
					/>
				</div>
			) : null}
		</div>
	);
}

function ActiveChangeCommitActionMenu({
	commit,
	squashTargetCommit,
	onOpenOperation,
}: {
	commit: RuntimeGitCommit;
	squashTargetCommit: RuntimeGitCommit | null;
	onOpenOperation: (operation: VcsWorkspaceOperation) => void;
}): React.ReactElement {
	const changeId = commit.changeId?.trim() || null;
	const checkoutCommitId = changeId ?? commit.hash;
	const squashTargetChangeId = squashTargetCommit?.changeId?.trim() || null;
	const squashDisabledReason =
		!changeId
			? "This commit is missing a JJ change id."
			: !squashTargetCommit
				? "This commit has no loaded parent commit to squash into."
				: !squashTargetChangeId
					? "The parent commit is missing a JJ change id."
					: null;

	function openOperation(event: Event, operation: VcsWorkspaceOperation): void {
		event.preventDefault();
		event.stopPropagation();
		onOpenOperation(operation);
	}

	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				<Button
					variant="ghost"
					size="sm"
					icon={<MoreHorizontal size={14} />}
					aria-label={`Commit actions ${commit.message || commit.shortHash}`}
					onPointerDown={(event) => event.stopPropagation()}
					onPointerUp={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				/>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content
					side="bottom"
					align="end"
					sideOffset={4}
					className="z-[100] min-w-[220px] rounded-md border border-border-bright bg-surface-1 p-1 shadow-xl"
					onCloseAutoFocus={(event) => event.preventDefault()}
					onPointerDown={(event) => event.stopPropagation()}
					onPointerUp={(event) => event.stopPropagation()}
					onClick={(event) => event.stopPropagation()}
				>
					<ActiveChangeCommitMenuItem
						icon={<CheckCircle2 size={16} />}
						label="Checkout commit"
						description={`Run jj edit ${checkoutCommitId}`}
						onSelect={(event) => openOperation(event, { kind: "checkout_commit", commitId: checkoutCommitId })}
					/>
					<ActiveChangeCommitMenuItem
						icon={<ArchiveX size={16} />}
						label="Abandon commit"
						disabled={!changeId}
						description={changeId ? `Abandon ${changeId}` : "This commit is missing a JJ change id."}
						onSelect={(event) => {
							if (changeId) {
								openOperation(event, { kind: "abandon_commit", commitId: changeId });
							}
						}}
					/>
					<ActiveChangeCommitMenuItem
						icon={<GitMerge size={16} />}
						label="Squash into parent"
						disabled={Boolean(squashDisabledReason)}
						description={squashDisabledReason ?? `Squash ${changeId} into ${squashTargetChangeId}`}
						onSelect={(event) => {
							if (changeId && squashTargetChangeId) {
								openOperation(event, { kind: "squash_commits", sourceCommitId: changeId, targetCommitId: squashTargetChangeId });
							}
						}}
					/>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

function ActiveChangeCommitMenuItem({
	icon,
	label,
	disabled,
	description,
	onSelect,
}: {
	icon: ReactNode;
	label: string;
	disabled?: boolean;
	description?: string;
	onSelect: (event: Event) => void;
}): React.ReactElement {
	return (
		<DropdownMenu.Item
			disabled={disabled}
			aria-label={description ? `${label}. ${description}` : label}
			className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-[13px] text-text-primary outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-surface-3"
			onSelect={onSelect}
		>
			<span className="shrink-0 text-text-tertiary">{icon}</span>
			<span>{label}</span>
		</DropdownMenu.Item>
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

function ActiveChangeGraphSkeleton({ rows = 8 }: { rows?: number }): React.ReactElement {
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

export function VcsShell({
	projectState,
	currentPath,
	title: _title,
	subtitle: _subtitle,
	kicker: _kicker,
	actions,
	children,
}: {
	projectState: VcsShellProjectState;
	currentPath: string;
	title: string;
	subtitle?: ReactNode;
	kicker?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
}): React.ReactElement {
	const { navigate } = useVcsRouter();
	const [isConsoleOpen, setConsoleOpen] = useState(false);
	const [isRepositoryGraphOpen, setRepositoryGraphOpen] = useState(false);
	const [consoleHeight, setConsoleHeight] = useState(() =>
		readVcsNumberPreference(CONSOLE_HEIGHT_LIMITS.key, CONSOLE_HEIGHT_LIMITS.fallback, CONSOLE_HEIGHT_LIMITS.min, CONSOLE_HEIGHT_LIMITS.max),
	);
	const projectName = projectState.currentProject?.name ?? "No project selected";

	useEffect(() => {
		setRepositoryGraphOpen(false);
	}, [projectState.currentProjectId]);

	return (
		<div className="flex h-screen min-h-0 bg-surface-0 text-text-primary">
			<VcsProjectNavigationPanel
				projectsState={projectState.projectsState}
				currentProjectId={projectState.currentProjectId}
				removingProjectId={projectState.removingProjectId}
				isCollapsed={projectState.isProjectNavCollapsed}
				onCollapsedChange={projectState.onProjectNavCollapsedChange}
				onSelectProject={projectState.onSelectProject}
				onAddProject={projectState.onAddProject}
				onRemoveProject={projectState.onRemoveProject}
				onClearOtherProjects={projectState.onClearOtherProjects}
				/>
				<div className="flex min-w-0 flex-1 flex-col">
					<header className="flex min-h-[49px] shrink-0 items-center justify-between gap-3 border-b border-divider bg-surface-1 px-3">
						<div className="flex min-w-0 flex-1 items-center gap-3">
							<div className="min-w-0">
								<h1 className="truncate text-sm font-semibold text-text-primary">{projectName}</h1>
							</div>
							<div className="hidden h-5 w-px shrink-0 bg-border md:block" />
							<div className="hidden min-w-0 flex-1 md:flex">
								<VcsRepositoryStatus
									status={projectState.repositoryStatus}
									isGraphOpen={isRepositoryGraphOpen}
									onToggleGraph={() => setRepositoryGraphOpen((current) => !current)}
								/>
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-2">
						<nav className="hidden items-center gap-1 lg:flex" aria-label="VCS views">
							{navItems.map((item) => {
								const Icon = item.icon;
								const active = isVcsNavItemActive(item.href, currentPath);
								const href = withWorkspaceParam(item.href, projectState.currentProjectId);
								return (
									<a
										key={item.href}
										href={href}
										onClick={(event) => {
											if (!shouldHandleVcsLinkClick(event)) {
												return;
											}
											event.preventDefault();
											setRepositoryGraphOpen(false);
											navigate(href);
										}}
										aria-current={active ? "page" : undefined}
										className={cn(
											"inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary",
											active && "bg-surface-3 text-text-primary",
										)}
									>
										<Icon size={14} />
										<span>{item.label}</span>
									</a>
								);
							})}
						</nav>
						<div className="hidden h-5 w-px bg-border lg:block" />
						<nav className="hidden items-center gap-1 lg:flex" aria-label="Changeyard surfaces">
							{surfaceLinks.map((item) => {
								const Icon = item.icon;
								return (
									<a
										key={item.href}
										href={item.href}
										data-changeyard-surface-link
										className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary"
									>
										<Icon size={14} />
										<span>{item.label}</span>
									</a>
								);
							})}
						</nav>
						{actions}
						<Button
							variant="ghost"
							size="sm"
							icon={<Settings size={14} />}
							aria-label="Open settings"
							title="Open settings"
							onClick={projectState.onOpenSettings}
						>
							Settings
						</Button>
						<Button
							variant="default"
							size="sm"
							icon={<Terminal size={14} />}
							disabled={!projectState.currentProjectId}
							aria-label={isConsoleOpen ? "Close console" : "Open console"}
							title={projectState.currentProjectId ? (isConsoleOpen ? "Close console" : "Open console") : "Select a project to open console"}
							onClick={() => setConsoleOpen((current) => !current)}
						/>
					</div>
				</header>
				<nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface-1 px-2 py-2 lg:hidden" aria-label="VCS views">
					{navItems.map((item) => {
						const Icon = item.icon;
						const active = isVcsNavItemActive(item.href, currentPath);
						const href = withWorkspaceParam(item.href, projectState.currentProjectId);
						return (
							<a
								key={item.href}
								href={href}
								onClick={(event) => {
									if (!shouldHandleVcsLinkClick(event)) {
										return;
									}
									event.preventDefault();
									setRepositoryGraphOpen(false);
									navigate(href);
								}}
								className={cn(
									"inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium",
									active
										? "border-border-bright bg-surface-3 text-text-primary"
										: "border-transparent bg-transparent text-text-secondary hover:bg-surface-3 hover:text-text-primary",
								)}
							>
								<Icon size={14} />
								{item.label}
							</a>
						);
					})}
					<button
						type="button"
						onClick={projectState.onOpenSettings}
						className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary"
					>
						<Settings size={14} />
						Settings
					</button>
					{surfaceLinks.map((item) => {
						const Icon = item.icon;
						return (
							<a
								key={item.href}
								href={item.href}
								data-changeyard-surface-link
								className="inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary"
							>
								<Icon size={14} />
								{item.label}
							</a>
						);
					})}
					</nav>
					<main className="min-h-0 flex-1 overflow-hidden bg-surface-0">
						{isRepositoryGraphOpen ? (
							<ActiveChangeGraphView
								workspaceId={projectState.currentProjectId}
								status={projectState.repositoryStatus}
							/>
						) : (
							children
						)}
					</main>
					{isConsoleOpen ? (
						<ResizableBottomPane
						minHeight={CONSOLE_HEIGHT_LIMITS.min}
						initialHeight={consoleHeight}
						onHeightChange={(height) => {
							const normalized = writeVcsNumberPreference(
								CONSOLE_HEIGHT_LIMITS.key,
								height,
								CONSOLE_HEIGHT_LIMITS.min,
								CONSOLE_HEIGHT_LIMITS.max,
							);
							setConsoleHeight(normalized);
						}}
					>
						<VcsConsolePanel
							workspaceId={projectState.currentProjectId}
							workspaceName={projectState.currentProject?.name ?? null}
							onClose={() => setConsoleOpen(false)}
						/>
					</ResizableBottomPane>
				) : null}
			</div>
		</div>
	);
}

export function NoProjectSelected({
	title = "Select a project",
	children = "Choose a Git or JJ project from the project rail to load VCS data.",
	action,
}: {
	title?: string;
	children?: ReactNode;
	action?: ReactNode;
}): React.ReactElement {
	return (
		<div className="flex h-full items-center justify-center p-4">
			<div className="w-full max-w-md rounded-lg border border-border bg-surface-1 p-4 text-center shadow-sm">
				<div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-md border border-border bg-surface-2 text-accent">
					<Workflow size={18} />
				</div>
				<h2 className="text-sm font-semibold text-text-primary">{title}</h2>
				<div className="mt-2 text-[13px] leading-5 text-text-secondary">{children}</div>
				{action ? <div className="mt-3 flex justify-center">{action}</div> : null}
			</div>
		</div>
	);
}

export function SelectProjectButton({ onClick }: { onClick: () => void }): React.ReactElement {
	return (
		<Button variant="primary" size="sm" onClick={onClick}>
			Add Project
		</Button>
	);
}
