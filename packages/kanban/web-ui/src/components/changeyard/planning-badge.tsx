import type { ReactElement } from "react";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import type { RuntimeChangeyardPlanningSummary } from "@/runtime/types";

function summarizePlanning(summary: RuntimeChangeyardPlanningSummary): string {
	if (summary.gateSummary.fail > 0) {
		return String(summary.gateSummary.fail);
	}
	if (summary.gateSummary.pending > 0) {
		return String(summary.gateSummary.pending);
	}
	if (summary.gateSummary.warning > 0) {
		return String(summary.gateSummary.warning);
	}
	return String(summary.gateSummary.pass);
}

export function PlanningBadge({
	planning,
	className,
}: {
	planning: RuntimeChangeyardPlanningSummary | null;
	className?: string;
}): ReactElement {
	if (!planning) {
		return <StatusChip label="No planning" className={className} />;
	}

	const gateTone: StatusChipTone =
		planning.gateSummary.fail > 0 ? "red" : planning.gateSummary.pending > 0 ? "gold" : "green";

	return (
		<>
			<StatusChip
				label={`${planning.model} ${planning.strictness === "strict" ? "strict" : "normal"}`}
				tone="gold"
				className={className}
			/>
			<StatusChip label={planning.phase} tone="gold" />
			<StatusChip label={summarizePlanning(planning)} tone={gateTone} />
		</>
	);
}
