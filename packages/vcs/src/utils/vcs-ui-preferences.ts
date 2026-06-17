import type { LineDiffAlgorithm } from "@changeyard/merge/react";

export type VcsFileViewMode = "list" | "tree";

export type VcsMergeEditorPreferences = {
	ignoreWhitespace: boolean;
	ignoreCase: boolean;
	lineDiffAlgorithm: LineDiffAlgorithm;
	syncHorizontalScroll: boolean;
	editableSideControls: boolean;
};

export const VCS_LAYOUT_STORAGE_KEYS = {
	projectNavCollapsed: "changeyard.vcs.project-nav.collapsed",
	branchesRefsWidth: "changeyard.vcs.branches.refs.width",
	branchesCommitsWidth: "changeyard.vcs.branches.commits.width",
	branchesDiffWidth: "changeyard.vcs.branches.diff.width",
	branchesRefsCollapsed: "changeyard.vcs.branches.refs.collapsed",
	branchesStackCollapsed: "changeyard.vcs.branches.stack.collapsed",
	historyOperationsWidth: "changeyard.vcs.history.operations.width",
	historyCommitsWidth: "changeyard.vcs.history.commits.width",
	historyDiffWidth: "changeyard.vcs.history.diff.width",
	historyOperationsCollapsed: "changeyard.vcs.history.operations.collapsed",
	historyCommitsCollapsed: "changeyard.vcs.history.commits.collapsed",
	workspaceUnstagedWidth: "changeyard.vcs.workspace.unstaged.width",
	workspaceWorkingCopyCollapsed: "changeyard.vcs.workspace.working-copy.collapsed",
	consoleHeight: "changeyard.vcs.console.height",
	fileViewMode: "changeyard.vcs.file-view-mode",
} as const;

export const VCS_LAYOUT_STORAGE_KEY_VALUES = Object.values(VCS_LAYOUT_STORAGE_KEYS);

export const VCS_F_MODE_ENABLED_STORAGE_KEY = "changeyard.vcs.f-mode.enabled";
export const VCS_MERGE_EDITOR_PREFERENCES_STORAGE_KEY = "changeyard.vcs.merge-editor.preferences";

export const DEFAULT_VCS_MERGE_EDITOR_PREFERENCES: VcsMergeEditorPreferences = {
	ignoreWhitespace: true,
	ignoreCase: false,
	lineDiffAlgorithm: "words_with_space",
	syncHorizontalScroll: true,
	editableSideControls: true,
};

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

export function readVcsBooleanPreference(key: string, fallback = false): boolean {
	if (typeof window === "undefined") {
		return fallback;
	}
	const storedValue = window.localStorage.getItem(key);
	if (storedValue === "1" || storedValue === "true") {
		return true;
	}
	if (storedValue === "0" || storedValue === "false") {
		return false;
	}
	return fallback;
}

export function writeVcsBooleanPreference(key: string, value: boolean): boolean {
	if (typeof window !== "undefined") {
		window.localStorage.setItem(key, value ? "1" : "0");
	}
	return value;
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

function normalizeLineDiffAlgorithm(value: unknown): LineDiffAlgorithm {
	return value === "characters" || value === "words" || value === "words_with_space"
		? value
		: DEFAULT_VCS_MERGE_EDITOR_PREFERENCES.lineDiffAlgorithm;
}

export function normalizeVcsMergeEditorPreferences(value: Partial<VcsMergeEditorPreferences> | null | undefined): VcsMergeEditorPreferences {
	return {
		...DEFAULT_VCS_MERGE_EDITOR_PREFERENCES,
		...(value ?? {}),
		lineDiffAlgorithm: normalizeLineDiffAlgorithm(value?.lineDiffAlgorithm),
	};
}

export function readVcsMergeEditorPreferences(): VcsMergeEditorPreferences {
	if (typeof window === "undefined") {
		return DEFAULT_VCS_MERGE_EDITOR_PREFERENCES;
	}
	const storedValue = window.localStorage.getItem(VCS_MERGE_EDITOR_PREFERENCES_STORAGE_KEY);
	if (!storedValue) {
		return DEFAULT_VCS_MERGE_EDITOR_PREFERENCES;
	}
	try {
		const parsed = JSON.parse(storedValue) as Partial<VcsMergeEditorPreferences>;
		return normalizeVcsMergeEditorPreferences(parsed);
	} catch {
		return DEFAULT_VCS_MERGE_EDITOR_PREFERENCES;
	}
}

export function writeVcsMergeEditorPreferences(preferences: VcsMergeEditorPreferences): VcsMergeEditorPreferences {
	const normalized = normalizeVcsMergeEditorPreferences(preferences);
	if (typeof window !== "undefined") {
		window.localStorage.setItem(VCS_MERGE_EDITOR_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
	}
	return normalized;
}

export function resetVcsLayoutPreferences(): void {
	if (typeof window === "undefined") {
		return;
	}
	for (const key of VCS_LAYOUT_STORAGE_KEY_VALUES) {
		window.localStorage.removeItem(key);
	}
	const dynamicKeys: string[] = [];
	for (let index = 0; index < window.localStorage.length; index += 1) {
		const key = window.localStorage.key(index);
		if (key && key.startsWith("changeyard.vcs.workspace.stack.") && key.endsWith(".collapsed")) {
			dynamicKeys.push(key);
		}
	}
	for (const key of dynamicKeys) {
		window.localStorage.removeItem(key);
	}
}
