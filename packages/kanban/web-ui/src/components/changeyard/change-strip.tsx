import type { ReactElement } from "react";
import { FileText, Plus } from "lucide-react";
import { PlanningBadge } from "@/components/changeyard/planning-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import type { RuntimeChangeyardChangeListItem } from "@/runtime/types";

export function ChangeStrip({
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
}): ReactElement | null {
	if (!isLoading && changes.length === 0) {
		return null;
	}

	return (
		<div className="border-b border-divider bg-surface-0 px-3 py-2">
			<div className="mb-2 flex items-center gap-2">
				<FileText size={14} className="text-text-secondary" />
				<h2 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Changes</h2>
				{onCreateChange ? (
					<Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={onCreateChange} className="ml-auto h-7">
						Create
					</Button>
				) : null}
			</div>
			{isLoading ? (
				<p className="text-sm text-text-secondary">Loading canonical change files…</p>
			) : (
				<div className="flex gap-2 overflow-x-auto pb-1">
					{changes.map((change) => {
						const selected = change.id === selectedChangeId;
						return (
							<button
								key={change.id}
								type="button"
								onClick={() => onSelectChange(change.id)}
								className={cn(
									"min-w-[260px] rounded-lg border px-3 py-2 text-left transition-colors",
									selected
										? "border-accent bg-surface-2"
										: "border-divider bg-surface-1 hover:bg-surface-2",
								)}
							>
								<div className="mb-1 flex items-center justify-between gap-2">
									<span className="truncate text-sm font-semibold text-text-primary">{change.title}</span>
									<span className="shrink-0 text-[11px] uppercase tracking-wide text-text-tertiary">{change.id}</span>
								</div>
								<p className="mb-2 text-xs text-text-secondary">
									{change.status} · {change.type}
								</p>
								<PlanningBadge planning={change.planning} />
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
