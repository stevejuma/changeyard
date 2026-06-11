export const columnIndicatorColors: Record<string, string> = {
	backlog: "var(--color-text-primary)",
	ready: "var(--color-text-primary)",
	in_progress: "var(--color-accent)",
	blocked: "var(--color-status-gold)",
	review: "var(--color-accent-2)",
	done: "var(--color-status-green)",
	abandoned: "var(--color-status-red)",
	trash: "var(--color-status-red)",
};

export const columnBackgroundColors: Record<string, string> = {
	backlog: "var(--color-surface-0)",
	ready: "var(--color-surface-0)",
	in_progress: "var(--color-surface-0)",
	blocked: "var(--color-surface-0)",
	review: "var(--color-surface-0)",
	done: "var(--color-surface-0)",
	abandoned: "var(--color-surface-0)",
	trash: "var(--color-surface-0)",
};
