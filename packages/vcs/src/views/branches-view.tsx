import { GitBranch } from "lucide-react";

import { StatusChip } from "@/components/ui/status-chip";
import { DiagnosticsPanel, EmptyState, KeyValue, PageBody, Panel, QueryGate, StatCard } from "@/components/vcs-panels";
import { VcsShell } from "@/components/vcs-shell";
import type { QueryState, VcsJjStateResponse } from "@/runtime/types";

export function BranchesView({ state, currentPath }: { state: QueryState<VcsJjStateResponse>; currentPath: string }): React.ReactElement {
	return (
		<VcsShell currentPath={currentPath} title="Bookmark Inventory" subtitle="Local JJ bookmarks, lane heads, and remote tracking" kicker={<StatusChip label="Read only" tone="blue" />}>
			<PageBody>
				<QueryGate state={state} loading="Loading bookmark inventory." errorTitle="Bookmark inventory failed">
					{(data) => (
						<>
							<div className="grid gap-3 md:grid-cols-3">
								<StatCard label="Current bookmark" value={data.jj.currentBookmark ? <code>{data.jj.currentBookmark}</code> : "none"} />
								<StatCard label="Stack lanes" value={`${data.lanes.length}`} />
								<StatCard label="Tracked bookmarks" value={`${data.bookmarks.filter((bookmark) => bookmark.tracked || bookmark.synced).length}`} />
							</div>
							<div className="grid gap-3 lg:grid-cols-[1fr_320px]">
								<Panel title="Bookmarks">
									{data.bookmarks.length === 0 ? (
										<EmptyState title="No bookmarks">No local JJ bookmarks were detected.</EmptyState>
									) : (
										<div className="divide-y divide-border">
											{data.bookmarks.map((bookmark) => (
												<div className="grid gap-1 py-2 first:pt-0 last:pb-0" key={bookmark.name}>
													<div className="flex min-w-0 items-center justify-between gap-2">
														<div className="truncate text-sm font-medium text-text-primary">{bookmark.name}</div>
														<div className="flex gap-1">
															{bookmark.tracked ? <StatusChip label="tracked" tone="blue" /> : <StatusChip label="local" tone="neutral" />}
															{bookmark.synced ? <StatusChip label="synced" tone="green" /> : null}
														</div>
													</div>
													<div className="font-mono text-xs text-text-tertiary">
														{bookmark.changeId} · {bookmark.commitId}
													</div>
												</div>
											))}
										</div>
									)}
								</Panel>
								<Panel title="Lane heads">
									{data.lanes.length === 0 ? (
										<EmptyState title="No stacks">Create or import local JJ bookmarks to populate stack lanes.</EmptyState>
									) : (
										data.lanes.map((lane) => (
											<KeyValue
												key={lane.id}
												label={lane.headBookmark}
												value={
													<span className="inline-flex items-center gap-2">
														<GitBranch size={13} className="text-text-tertiary" />
														{lane.segments.length} change segments
													</span>
												}
											/>
										))
									)}
								</Panel>
							</div>
							<DiagnosticsPanel diagnostics={data.diagnostics} />
						</>
					)}
				</QueryGate>
			</PageBody>
		</VcsShell>
	);
}
