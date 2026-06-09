import type { ReactElement } from "react";
import { cn } from "@/components/ui/cn";
import type { RuntimeChangeyardPlanningSummary } from "@/runtime/types";

function summarizePlanning(summary: RuntimeChangeyardPlanningSummary): string {
	if (summary.gateSummary.fail > 0) {
		return `${summary.gateSummary.fail} failing`;
	}
	if (summary.gateSummary.pending > 0) {
		return `${summary.gateSummary.pending} pending`;
	}
	if (summary.gateSummary.warning > 0) {
		return `${summary.gateSummary.warning} warnings`;
	}
	return `${summary.gateSummary.pass} passed`;
}

export function PlanningBadge({
	planning,
	className,
}: {
	planning: RuntimeChangeyardPlanningSummary | null;
	className?: string;
}): ReactElement {
	if (!planning) {
		return (
			<span
				className={cn(
					"inline-flex items-center rounded-full border border-divider bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-secondary",
					className,
				)}
			>
				No planning
			</span>
		);
	}

	const toneClassName =
		planning.gateSummary.fail > 0
			? "border-[color:var(--color-status-red)]/35 bg-[color:var(--color-status-red)]/10 text-[color:var(--color-status-red)]"
			: planning.gateSummary.pending > 0
				? "border-[color:var(--color-status-gold)]/35 bg-[color:var(--color-status-gold)]/10 text-[color:var(--color-status-gold)]"
				: "border-[color:var(--color-status-green)]/35 bg-[color:var(--color-status-green)]/10 text-[color:var(--color-status-green)]";

	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
				toneClassName,
				className,
			)}
		>
			{planning.model} {planning.strictness === "strict" ? "strict" : "normal"} · {planning.phase} ·{" "}
			{summarizePlanning(planning)}
		</span>
	);
}
