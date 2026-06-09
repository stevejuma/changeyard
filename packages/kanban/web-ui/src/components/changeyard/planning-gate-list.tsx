import type { ReactElement } from "react";
import { cn } from "@/components/ui/cn";
import type { RuntimeChangeyardPlanningSummary } from "@/runtime/types";

function gateTone(status: string): string {
	switch (status) {
		case "pass":
			return "text-[color:var(--color-status-green)]";
		case "fail":
			return "text-[color:var(--color-status-red)]";
		case "warning":
			return "text-[color:var(--color-status-orange)]";
		case "pending":
			return "text-[color:var(--color-status-gold)]";
		default:
			return "text-text-tertiary";
	}
}

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
					<span className={cn("text-xs font-semibold uppercase tracking-wide", gateTone(status))}>{status}</span>
				</div>
			))}
		</div>
	);
}
