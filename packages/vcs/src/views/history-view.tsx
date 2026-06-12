import { History } from "lucide-react";

import { StatusChip } from "@/components/ui/status-chip";
import { DiagnosticsPanel, EmptyState, KeyValue, PageBody, Panel, QueryGate, StatCard } from "@/components/vcs-panels";
import { VcsShell } from "@/components/vcs-shell";
import type { QueryState, VcsJjStateResponse } from "@/runtime/types";

export function HistoryView({ state, currentPath }: { state: QueryState<VcsJjStateResponse>; currentPath: string }): React.ReactElement {
	return (
		<VcsShell currentPath={currentPath} title="Operation History" subtitle="Current JJ read-model history and restore context" kicker={<StatusChip label="Read only" tone="blue" />}>
			<PageBody>
				<QueryGate state={state} loading="Loading JJ history context." errorTitle="History failed">
					{(data) => {
						const recentChanges = [...data.changes].reverse().slice(0, 12);
						return (
							<>
								<div className="grid gap-3 md:grid-cols-3">
									<StatCard label="Recent changes" value={`${recentChanges.length}`} />
									<StatCard label="Working copy files" value={`${data.unassignedChanges.length}`} />
									<StatCard label="Restore surface" tone="gold" value="Board preview flow" />
								</div>
								<div className="grid gap-3 lg:grid-cols-[1fr_320px]">
									<Panel title="Recent change history">
										{recentChanges.length === 0 ? (
											<EmptyState title="No changes">No JJ changes were available from the runtime state.</EmptyState>
										) : (
											<div className="divide-y divide-border">
												{recentChanges.map((change) => (
													<div className="grid gap-1 py-2 first:pt-0 last:pb-0" key={change.changeId}>
														<div className="truncate text-sm font-medium text-text-primary">{change.description}</div>
														<div className="font-mono text-xs text-text-tertiary">
															{change.changeId} · {change.commitId}
														</div>
														<div className="text-xs text-text-secondary">
															Parents: {change.parentChangeIds.length > 0 ? change.parentChangeIds.join(", ") : "root"}
															{change.bookmarks.length > 0 ? ` · bookmarks: ${change.bookmarks.join(", ")}` : ""}
														</div>
													</div>
												))}
											</div>
										)}
									</Panel>
									<Panel title="Restore context">
										<KeyValue label="Undo / redo" value="Available from the JJ board through preview and confirmation." />
										<KeyValue label="File restore" value="Available from the working-copy file list when a concrete path can be previewed." />
										<KeyValue
											label="Runtime note"
											value="The original operations/restore tRPC procedures are still not separate endpoints; current restore behavior is covered by preview/apply operations."
										/>
									</Panel>
								</div>
								<Panel title="Operation endpoint review">
									<div className="flex items-start gap-2 text-[13px] text-text-secondary">
										<History size={15} className="mt-0.5 text-text-tertiary" />
										`vcs.operations` and `vcs.restoreOperation` are not added in this repair because undo, redo, and file restore already flow through `vcs.previewOperation` and `vcs.applyOperation`; this deviation is recorded in the review plan.
									</div>
								</Panel>
								<DiagnosticsPanel diagnostics={data.diagnostics} />
							</>
						);
					}}
				</QueryGate>
			</PageBody>
		</VcsShell>
	);
}
