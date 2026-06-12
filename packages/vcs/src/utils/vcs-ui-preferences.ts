export type VcsFileViewMode = "list" | "tree";

export const VCS_LAYOUT_STORAGE_KEYS = {
	branchesRefsWidth: "changeyard.vcs.branches.refs.width",
	branchesCommitsWidth: "changeyard.vcs.branches.commits.width",
	branchesDiffWidth: "changeyard.vcs.branches.diff.width",
	historyOperationsWidth: "changeyard.vcs.history.operations.width",
	historyCommitsWidth: "changeyard.vcs.history.commits.width",
	historyDiffWidth: "changeyard.vcs.history.diff.width",
	consoleHeight: "changeyard.vcs.console.height",
	fileViewMode: "changeyard.vcs.file-view-mode",
} as const;

export const VCS_LAYOUT_STORAGE_KEY_VALUES = Object.values(VCS_LAYOUT_STORAGE_KEYS);

export function clampNumber(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.round(value)));
}

export function readVcsNumberPreference(key: string, fallback: number, min: number, max: number): number {
	if (typeof window === "undefined") {
		return fallback;
	}
	const storedValue = window.localStorage.getItem(key);
	if (!storedValue) {
		return fallback;
	}
	const parsed = Number(storedValue);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}
	return clampNumber(parsed, min, max);
}

export function writeVcsNumberPreference(key: string, value: number, min: number, max: number): number {
	const normalized = clampNumber(value, min, max);
	if (typeof window !== "undefined") {
		window.localStorage.setItem(key, String(normalized));
	}
	return normalized;
}

export function readVcsFileViewMode(): VcsFileViewMode {
	if (typeof window === "undefined") {
		return "tree";
	}
	return window.localStorage.getItem(VCS_LAYOUT_STORAGE_KEYS.fileViewMode) === "list" ? "list" : "tree";
}

export function writeVcsFileViewMode(mode: VcsFileViewMode): VcsFileViewMode {
	if (typeof window !== "undefined") {
		window.localStorage.setItem(VCS_LAYOUT_STORAGE_KEYS.fileViewMode, mode);
	}
	return mode;
}

export function resetVcsLayoutPreferences(): void {
	if (typeof window === "undefined") {
		return;
	}
	for (const key of VCS_LAYOUT_STORAGE_KEY_VALUES) {
		window.localStorage.removeItem(key);
	}
}
