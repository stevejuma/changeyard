import type { ReactNode } from "react";

import { COLLAPSED_GIT_HISTORY_PANEL_WIDTH } from "@/resize/use-git-history-layout";

export function CollapsedHistoryRail({
	label,
	count,
	icon,
	onExpand,
	ariaLabel,
}: {
	label: string;
	count?: number | string | null;
	icon: ReactNode;
	onExpand: () => void;
	ariaLabel: string;
}): React.ReactElement {
	return (
		<div
			style={{
				display: "flex",
				width: COLLAPSED_GIT_HISTORY_PANEL_WIDTH,
				minWidth: COLLAPSED_GIT_HISTORY_PANEL_WIDTH,
				flexShrink: 0,
				borderRight: "1px solid var(--color-divider)",
				background: "var(--color-surface-1)",
			}}
		>
			<button
				type="button"
				aria-label={ariaLabel}
				title={count == null ? label : `${label} (${count})`}
				onClick={onExpand}
				style={{
					display: "flex",
					flex: "1 1 0",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "flex-start",
					gap: 10,
					padding: "8px 4px 12px",
					border: "none",
					background: "transparent",
					color: "var(--color-text-secondary)",
					cursor: "pointer",
				}}
			>
				<span style={{ display: "inline-flex", color: "var(--color-text-primary)" }}>{icon}</span>
				<span
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						fontSize: 11,
						fontWeight: 600,
						writingMode: "vertical-rl",
						textOrientation: "mixed",
					}}
				>
					<span>{label}</span>
					{count == null ? null : (
						<span style={{ fontWeight: 500, color: "var(--color-text-tertiary)" }}>{count}</span>
					)}
				</span>
			</button>
		</div>
	);
}
