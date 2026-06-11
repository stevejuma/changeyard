import type { ReactElement } from "react";
import { PlanningGateStatusChip } from "@/components/ui/status-chip";
import type { RuntimeChangeyardPlanningSummary } from "@/runtime/types";

function formatGateLabel(gate: string): string {
	return gate
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (value) => value.toUpperCase());
}

export function PlanningGateList({
	planning,
	variant = "cards",
}: {
	planning: RuntimeChangeyardPlanningSummary | null;
	variant?: "cards" | "properties";
}): ReactElement {
	if (!planning) {
		if (variant === "properties") {
			return (
				<div className="grid grid-cols-[82px_minmax(0,1fr)] items-start gap-3 border-b border-divider/60 py-2 last:border-b-0">
					<div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Gates</div>
					<div className="min-w-0 text-sm text-text-tertiary">None</div>
				</div>
			);
		}
		return <p className="text-sm text-text-secondary">No planning gates for this change.</p>;
	}

	const gates = Object.entries(planning.gates);
	if (variant === "properties") {
		return (
			<>
				{gates.map(([gate, status]) => (
					<div
						key={gate}
						className="grid grid-cols-[82px_minmax(0,1fr)] items-start gap-3 border-b border-divider/60 py-2 last:border-b-0"
					>
						<div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
							{formatGateLabel(gate)}
						</div>
						<div className="min-w-0 text-sm text-text-secondary">
							<PlanningGateStatusChip status={status} />
						</div>
					</div>
				))}
			</>
		);
	}

	return (
		<div className="grid gap-2 sm:grid-cols-2">
			{gates.map(([gate, status]) => (
				<div
					key={gate}
					className="flex items-center justify-between rounded-md border border-divider bg-surface-1 px-3 py-2"
				>
					<span className="text-sm text-text-primary">{formatGateLabel(gate)}</span>
					<PlanningGateStatusChip status={status} />
				</div>
			))}
		</div>
	);
}
