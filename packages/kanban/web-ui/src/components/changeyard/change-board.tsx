import { FileText, Plus } from "lucide-react";
import type { ReactElement } from "react";

import { PlanningBadge } from "@/components/changeyard/planning-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import type { RuntimeChangeyardChangeListItem } from "@/runtime/types";

type ChangeColumnId = "backlog" | "ready" | "in_progress" | "blocked" | "review" | "done" | "abandoned";

const CHANGE_COLUMNS: Array<{ id: ChangeColumnId; title: string; statuses: string[] }> = [
	{ id: "backlog", title: "Backlog", statuses: ["draft"] },
	{ id: "ready", title: "Ready", statuses: ["ready", "synced"] },
	{ id: "in_progress", title: "In Progress", statuses: ["in_progress", "changes_requested"] },
	{ id: "blocked", title: "Blocked", statuses: ["blocked"] },
	{ id: "review", title: "Review / PR", statuses: ["ready_for_pr", "pr_open", "in_review"] },
	{ id: "done", title: "Done", statuses: ["approved", "merged"] },
	{ id: "abandoned", title: "Abandoned", statuses: ["abandoned"] },
];

function columnForStatus(status: string): ChangeColumnId {
	for (const column of CHANGE_COLUMNS) {
		if (column.statuses.includes(status)) {
			return column.id;
		}
	}
	return "backlog";
}

export function ChangeBoard({
	changes,
	selectedChangeId,
	isLoading = false,
	onSelectChange,
	onCreateChange,
}: {
	changes: RuntimeChangeyardChangeListItem[];
	selectedChangeId: string | null;
	isLoading?: boolean;
	onSelectChange: (changeId: string) => void;
	onCreateChange?: () => void;
}): ReactElement {
	const grouped = new Map<ChangeColumnId, RuntimeChangeyardChangeListItem[]>();
	for (const column of CHANGE_COLUMNS) {
		grouped.set(column.id, []);
	}
	for (const change of changes) {
		grouped.get(columnForStatus(change.status))?.push(change);
	}

	return (
		<section className="border-b border-divider bg-surface-0 px-3 py-3">
			<div className="mb-3 flex items-center gap-2">
				<FileText size={14} className="text-text-secondary" />
				<h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Canonical Changes</h2>
				{onCreateChange ? (
					<Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={onCreateChange} className="ml-auto h-7">
						Create
					</Button>
				) : null}
			</div>
			{isLoading ? (
				<p className="text-sm text-text-secondary">Loading canonical change files…</p>
			) : (
				<div className="flex gap-3 overflow-x-auto pb-1">
					{CHANGE_COLUMNS.map((column) => {
						const cards = grouped.get(column.id) ?? [];
						return (
							<section
								key={column.id}
								className="flex min-h-[240px] w-[280px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
							>
								<div className="flex items-center justify-between border-b border-divider px-3 py-2">
									<div className="flex items-center gap-2">
										<span className="text-sm font-semibold text-text-primary">{column.title}</span>
										<span className="text-xs text-text-secondary">{cards.length}</span>
									</div>
								</div>
								<div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
									{cards.length === 0 ? (
										<div className="rounded-md border border-dashed border-divider px-3 py-4 text-sm text-text-secondary">
											No changes
										</div>
									) : (
										cards.map((change) => {
											const selected = change.id === selectedChangeId;
											return (
												<button
													key={change.id}
													type="button"
													onClick={() => onSelectChange(change.id)}
													className={cn(
														"rounded-lg border px-3 py-2 text-left transition-colors",
														selected
															? "border-accent bg-surface-2"
															: "border-divider bg-surface-0 hover:bg-surface-2",
													)}
												>
													<div className="mb-1 flex items-start justify-between gap-2">
														<span className="line-clamp-2 text-sm font-semibold text-text-primary">{change.title}</span>
														<span className="shrink-0 text-[11px] uppercase tracking-wide text-text-tertiary">
															{change.id}
														</span>
													</div>
													<p className="mb-2 text-xs text-text-secondary">
														{change.status} · {change.type}
													</p>
													<div className="flex flex-wrap items-center gap-2">
														<PlanningBadge planning={change.planning} />
														{change.workspace?.path ? (
															<span className="truncate text-[11px] text-text-tertiary">{change.workspace.path}</span>
														) : null}
													</div>
												</button>
											);
										})
									)}
								</div>
							</section>
						);
					})}
				</div>
			)}
		</section>
	);
}
