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
}: {
	planning: RuntimeChangeyardPlanningSummary | null;
}): ReactElement {
	if (!planning) {
		return <p className="text-sm text-text-secondary">No planning gates for this change.</p>;
	}

	const gates = Object.entries(planning.gates);
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
