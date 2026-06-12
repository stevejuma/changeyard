import { GitBranch, GitCommit, GitPullRequest, Search, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/components/ui/cn";
import { FileStatusChip, StatusChip } from "@/components/ui/status-chip";
import { DiagnosticsPanel, EmptyState, Panel, QueryGate } from "@/components/vcs-panels";
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
import { useTrpcInputQuery, useTrpcQuery } from "@/runtime/trpc-client";

type BranchFilter = "all" | "prs" | "local";

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
	const [selectedRefName, setSelectedRefName] = useState<string | null>(() => readQueryParam("ref"));
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(() => readQueryParam("commit"));

	const selectedInventoryTarget = useMemo(() => {
		if (inventoryQuery.state.status !== "ready") {
			return null;
		}
		return selectedRefName ?? inventoryQuery.state.data.workspaceTarget?.target ?? inventoryQuery.state.data.items[0]?.target ?? null;
	}, [inventoryQuery.state, selectedRefName]);

	const logQuery = useTrpcInputQuery<RuntimeGitLogResponse>(
		"workspace.getRepositoryLog",
		{
			ref: selectedInventoryTarget,
			refs: selectedInventoryTarget ? [selectedInventoryTarget] : [],
			maxCount: 150,
		},
		"Failed to load commits.",
		Boolean(workspaceId && selectedInventoryTarget),
		workspaceId,
	);
	const commitDiffQuery = useTrpcInputQuery<RuntimeGitCommitDiffResponse>(
		"workspace.getRepositoryCommitDiff",
		{ commitHash: selectedCommitHash ?? "" },
		"Failed to load commit diff.",
		Boolean(workspaceId && selectedCommitHash),
		workspaceId,
	);

	useEffect(() => {
		if (selectedRefName || inventoryQuery.state.status !== "ready") {
			return;
		}
		const next = inventoryQuery.state.data.workspaceTarget?.target ?? inventoryQuery.state.data.items[0]?.target ?? null;
		if (next) {
			setSelectedRefName(next);
			writeQueryParam("ref", next);
		}
	}, [inventoryQuery.state, selectedRefName]);

	useEffect(() => {
		if (logQuery.state.status !== "ready") {
			return;
		}
		const hasSelectedCommit = selectedCommitHash
			? logQuery.state.data.commits.some((commit) => commit.hash === selectedCommitHash)
			: false;
		if (!hasSelectedCommit) {
			const nextCommit = logQuery.state.data.commits[0]?.hash ?? null;
			setSelectedCommitHash(nextCommit);
			writeQueryParam("commit", nextCommit);
		}
	}, [logQuery.state, selectedCommitHash]);

	function selectRef(item: VcsJjInventoryItem): void {
		const target = getItemTarget(item);
		setSelectedRefName(target);
		setSelectedCommitHash(null);
		writeQueryParam("ref", target);
		writeQueryParam("commit", null);
	}

	function selectCommit(commit: RuntimeGitCommit): void {
		setSelectedCommitHash(commit.hash);
		writeQueryParam("commit", commit.hash);
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
				<QueryGate state={inventoryQuery.state} loading="Loading branch inventory." errorTitle="Branch inventory failed">
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
							logState={logQuery.state}
							diffState={commitDiffQuery.state}
							onSelectRef={selectRef}
							onSelectCommit={selectCommit}
						/>
					)}
				</QueryGate>
			)}
		</VcsShell>
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
	logState,
	diffState,
	onSelectRef,
	onSelectCommit,
}: {
	inventory: VcsJjInventoryResponse;
	refsState: QueryState<RuntimeGitRefsResponse>;
	filter: BranchFilter;
	setFilter: (filter: BranchFilter) => void;
	search: string;
	setSearch: (value: string) => void;
	selectedRefName: string | null;
	selectedCommitHash: string | null;
	logState: QueryState<RuntimeGitLogResponse>;
	diffState: QueryState<RuntimeGitCommitDiffResponse>;
	onSelectRef: (item: VcsJjInventoryItem) => void;
	onSelectCommit: (commit: RuntimeGitCommit) => void;
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
		inventory.items.find((item) => getItemTarget(item) === selectedRefName) ??
		inventory.workspaceTarget ??
		inventory.items[0] ??
		null;

	return (
		<div className="flex h-full min-h-0">
			<aside className="flex w-[360px] shrink-0 flex-col overflow-hidden border-r border-divider bg-surface-1">
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
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-semibold text-text-primary">Branches</h2>
						<StatusChip label={`${visibleItems.length}`} tone="neutral" />
					</div>
					<div className="mt-3 grid grid-cols-3 rounded-md border border-border bg-surface-0 p-1">
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
				<div className="min-h-0 flex-1 overflow-y-auto">
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
											selected={getItemTarget(item) === selectedRefName || item.id === activeItem?.id}
											onSelect={() => onSelectRef(item)}
										/>
									))}
								</section>
							) : null,
						)
					)}
				</div>
			</aside>
			<section
				className="min-w-0 flex-1 overflow-auto p-3"
				style={{
					backgroundImage: "radial-gradient(color-mix(in srgb, var(--color-text-tertiary) 18%, transparent) 1px, transparent 1px)",
					backgroundSize: "10px 10px",
				}}
			>
				<div className="grid min-h-full gap-3 xl:grid-cols-[minmax(360px,520px)_minmax(420px,1fr)]">
					<CommitGraphPanel
						item={activeItem}
						state={logState}
						selectedCommitHash={selectedCommitHash}
						onSelectCommit={onSelectCommit}
					/>
					<CommitDiffPanel state={diffState} selectedCommitHash={selectedCommitHash} />
				</div>
				<DiagnosticsPanel diagnostics={inventory.diagnostics} />
			</section>
		</div>
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
				"flex w-full min-w-0 flex-col gap-2 border-l-2 px-3 py-3 text-left hover:bg-surface-2",
				selected ? "border-accent bg-surface-2" : "border-transparent",
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

function CommitGraphPanel({
	item,
	state,
	selectedCommitHash,
	onSelectCommit,
}: {
	item: VcsJjInventoryItem | null;
	state: QueryState<RuntimeGitLogResponse>;
	selectedCommitHash: string | null;
	onSelectCommit: (commit: RuntimeGitCommit) => void;
}): React.ReactElement {
	return (
		<Panel
			title={item ? item.name : "Commits"}
			actions={item ? <StatusChip label={item.type} tone={item.type === "remote" ? "blue" : "neutral"} /> : null}
			className="min-h-[520px] overflow-hidden"
		>
			{state.status === "loading" ? <EmptyState title="Loading commits">Reading the selected ref history.</EmptyState> : null}
			{state.status === "error" ? <EmptyState title="Commit history unavailable">{state.message}</EmptyState> : null}
			{state.status === "ready" && !state.data.ok ? (
				<EmptyState title="Commit history unavailable">{state.data.error ?? "The selected ref could not be read."}</EmptyState>
			) : null}
			{state.status === "ready" && state.data.ok && state.data.commits.length === 0 ? (
				<EmptyState title="No commits">No commits were returned for this ref.</EmptyState>
			) : null}
			{state.status === "ready" && state.data.ok && state.data.commits.length > 0 ? (
				<div className="max-h-[calc(100vh-150px)] overflow-y-auto">
					{state.data.commits.map((commit, index) => (
						<button
							key={commit.hash}
							type="button"
							className={cn(
								"relative flex w-full min-w-0 gap-3 border-b border-border px-2 py-3 text-left last:border-b-0 hover:bg-surface-2",
								selectedCommitHash === commit.hash && "bg-surface-2",
							)}
							onClick={() => onSelectCommit(commit)}
						>
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
					))}
				</div>
			) : null}
		</Panel>
	);
}

function CommitDiffPanel({
	state,
	selectedCommitHash,
}: {
	state: QueryState<RuntimeGitCommitDiffResponse>;
	selectedCommitHash: string | null;
}): React.ReactElement {
	if (!selectedCommitHash) {
		return (
			<Panel title="Changes" className="min-h-[520px]">
				<EmptyState title="Select a commit">Choose a commit in the graph to inspect its changes.</EmptyState>
			</Panel>
		);
	}
	return (
		<Panel title="Changes" actions={<code className="text-xs text-text-tertiary">{selectedCommitHash.slice(0, 12)}</code>} className="min-h-[520px] overflow-hidden">
			{state.status === "loading" ? <EmptyState title="Loading changes">Reading commit diff.</EmptyState> : null}
			{state.status === "error" ? <EmptyState title="Diff unavailable">{state.message}</EmptyState> : null}
			{state.status === "ready" && !state.data.ok ? (
				<EmptyState title="Diff unavailable">{state.data.error ?? "The selected commit diff could not be read."}</EmptyState>
			) : null}
			{state.status === "ready" && state.data.ok && state.data.files.length === 0 ? (
				<EmptyState title="No file changes">This commit did not return any file changes.</EmptyState>
			) : null}
			{state.status === "ready" && state.data.ok && state.data.files.length > 0 ? (
				<div className="grid max-h-[calc(100vh-150px)] min-h-[480px] grid-rows-[auto_1fr] overflow-hidden">
					<div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
						{state.data.files.map((file) => (
							<div key={`${file.previousPath ?? ""}:${file.path}`} className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-surface-0 px-2 py-1 text-xs">
								<FileStatusChip status={file.status} />
								<span className="max-w-[220px] truncate text-text-secondary">{file.path}</span>
								<span className="text-status-green">+{file.additions}</span>
								<span className="text-status-red">-{file.deletions}</span>
							</div>
						))}
					</div>
					<div className="overflow-auto pt-3">
						{state.data.files.map((file) => (
							<section key={`${file.previousPath ?? ""}:${file.path}`} className="mb-3 overflow-hidden rounded-md border border-border bg-surface-0">
								<header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
									<div className="min-w-0 truncate text-xs font-medium text-text-primary">{file.path}</div>
									<FileStatusChip status={file.status} />
								</header>
								<pre className="overflow-auto p-3 font-mono text-[11px] leading-5 text-text-secondary">
									{file.patch || "No textual patch available."}
								</pre>
							</section>
						))}
					</div>
				</div>
			) : null}
		</Panel>
	);
}
