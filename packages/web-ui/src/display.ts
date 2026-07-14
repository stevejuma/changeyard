/** Return the compact single-character avatar label used by review surfaces. */
export function authorInitial(value: string | null | undefined): string {
	const name = value?.trim();
	if (!name) return "?";
	const parts = name.split(/[\s._-]+/).filter(Boolean);
	return (parts[0]?.[0] ?? "?").toUpperCase();
}

/** Format an additions/deletions count consistently across board and review views. */
export function formatDiffDelta(value: number, prefix: "+" | "-"): string {
	return `${prefix}${value > 0 ? value : 0}`;
}
