import { useCallback, useState } from "react";

import { useLayoutResetEffect } from "@/resize/layout-customizations";
import { clampAtLeast, readOptionalPersistedResizeNumber } from "@/resize/resize-persistence";
import {
	getResizePreferenceDefaultValue,
	loadBooleanResizePreference,
	loadResizePreference,
	persistBooleanResizePreference,
	persistResizePreference,
	type ResizeBooleanPreference,
	type ResizeNumberPreference,
} from "@/resize/resize-preferences";
import { LocalStorageKey } from "@/storage/local-storage-store";

export const MIN_GIT_REFS_PANEL_WIDTH = 180;
export const MIN_GIT_COMMITS_PANEL_WIDTH = 260;
export const MIN_GIT_DIFF_CONTENT_PANEL_WIDTH = 360;
export const DEFAULT_GIT_DIFF_CONTENT_PANEL_WIDTH = 720;
export const COLLAPSED_GIT_HISTORY_PANEL_WIDTH = 36;
export const MIN_GIT_FILE_TREE_PANEL_WIDTH = 180;
export const DEFAULT_GIT_FILE_TREE_PANEL_WIDTH = 260;

const REFS_PANEL_WIDTH_PREFERENCE: ResizeNumberPreference = {
	key: LocalStorageKey.GitHistoryRefsPanelWidth,
	defaultValue: 220,
	normalize: (value) => clampAtLeast(value, MIN_GIT_REFS_PANEL_WIDTH, true),
};

const COMMITS_PANEL_WIDTH_PREFERENCE: ResizeNumberPreference = {
	key: LocalStorageKey.GitHistoryCommitsPanelWidth,
	defaultValue: 360,
	normalize: (value) => clampAtLeast(value, MIN_GIT_COMMITS_PANEL_WIDTH, true),
};

const DIFF_CONTENT_PANEL_WIDTH_PREFERENCE: ResizeNumberPreference = {
	key: LocalStorageKey.GitHistoryDiffContentPanelWidth,
	defaultValue: DEFAULT_GIT_DIFF_CONTENT_PANEL_WIDTH,
	normalize: (value) => clampAtLeast(value, MIN_GIT_DIFF_CONTENT_PANEL_WIDTH, true),
};

const FILE_TREE_WIDTH_PREFERENCE: ResizeNumberPreference = {
	key: LocalStorageKey.GitDiffFileTreePanelWidth,
	defaultValue: () => {
		const migratedRatio = readOptionalPersistedResizeNumber({
			key: LocalStorageKey.GitDiffFileTreePanelRatio,
		});
		if (migratedRatio !== undefined) {
			return clampAtLeast(Math.round(DEFAULT_GIT_DIFF_CONTENT_PANEL_WIDTH * migratedRatio), MIN_GIT_FILE_TREE_PANEL_WIDTH, true);
		}
		return DEFAULT_GIT_FILE_TREE_PANEL_WIDTH;
	},
	normalize: (value) => clampAtLeast(value, MIN_GIT_FILE_TREE_PANEL_WIDTH, true),
};

const REFS_PANEL_COLLAPSED_PREFERENCE: ResizeBooleanPreference = {
	key: LocalStorageKey.GitHistoryRefsPanelCollapsed,
	defaultValue: false,
};

const COMMITS_PANEL_COLLAPSED_PREFERENCE: ResizeBooleanPreference = {
	key: LocalStorageKey.GitHistoryCommitsPanelCollapsed,
	defaultValue: false,
};

const FILE_TREE_COLLAPSED_PREFERENCE: ResizeBooleanPreference = {
	key: LocalStorageKey.GitDiffFileTreePanelCollapsed,
	defaultValue: false,
};

export function useGitHistoryLayout(): {
	commitsPanelWidth: number;
	diffContentPanelWidth: number;
	fileTreePanelWidth: number;
	isCommitsPanelCollapsed: boolean;
	isFileTreePanelCollapsed: boolean;
	isRefsPanelCollapsed: boolean;
	refsPanelWidth: number;
	setCommitsPanelCollapsed: (collapsed: boolean) => void;
	setCommitsPanelWidth: (width: number) => void;
	setDiffContentPanelWidth: (width: number) => void;
	setFileTreePanelCollapsed: (collapsed: boolean) => void;
	setFileTreePanelWidth: (width: number) => void;
	setRefsPanelCollapsed: (collapsed: boolean) => void;
	setRefsPanelWidth: (width: number) => void;
} {
	const [refsPanelWidth, setRefsPanelWidthState] = useState(() => loadResizePreference(REFS_PANEL_WIDTH_PREFERENCE));
	const [commitsPanelWidth, setCommitsPanelWidthState] = useState(() =>
		loadResizePreference(COMMITS_PANEL_WIDTH_PREFERENCE),
	);
	const [diffContentPanelWidth, setDiffContentPanelWidthState] = useState(() =>
		loadResizePreference(DIFF_CONTENT_PANEL_WIDTH_PREFERENCE),
	);
	const [fileTreePanelWidth, setFileTreePanelWidthState] = useState(() =>
		loadResizePreference(FILE_TREE_WIDTH_PREFERENCE),
	);
	const [isRefsPanelCollapsed, setRefsPanelCollapsedState] = useState(() =>
		loadBooleanResizePreference(REFS_PANEL_COLLAPSED_PREFERENCE),
	);
	const [isCommitsPanelCollapsed, setCommitsPanelCollapsedState] = useState(() =>
		loadBooleanResizePreference(COMMITS_PANEL_COLLAPSED_PREFERENCE),
	);
	const [isFileTreePanelCollapsed, setFileTreePanelCollapsedState] = useState(() =>
		loadBooleanResizePreference(FILE_TREE_COLLAPSED_PREFERENCE),
	);

	const setRefsPanelWidth = useCallback((width: number) => {
		setRefsPanelWidthState(persistResizePreference(REFS_PANEL_WIDTH_PREFERENCE, width));
	}, []);

	const setCommitsPanelWidth = useCallback((width: number) => {
		setCommitsPanelWidthState(persistResizePreference(COMMITS_PANEL_WIDTH_PREFERENCE, width));
	}, []);

	const setDiffContentPanelWidth = useCallback((width: number) => {
		setDiffContentPanelWidthState(persistResizePreference(DIFF_CONTENT_PANEL_WIDTH_PREFERENCE, width));
	}, []);

	const setFileTreePanelWidth = useCallback((width: number) => {
		setFileTreePanelWidthState(persistResizePreference(FILE_TREE_WIDTH_PREFERENCE, width));
	}, []);

	const setRefsPanelCollapsed = useCallback((collapsed: boolean) => {
		setRefsPanelCollapsedState(persistBooleanResizePreference(REFS_PANEL_COLLAPSED_PREFERENCE, collapsed));
	}, []);

	const setCommitsPanelCollapsed = useCallback((collapsed: boolean) => {
		setCommitsPanelCollapsedState(persistBooleanResizePreference(COMMITS_PANEL_COLLAPSED_PREFERENCE, collapsed));
	}, []);

	const setFileTreePanelCollapsed = useCallback((collapsed: boolean) => {
		setFileTreePanelCollapsedState(persistBooleanResizePreference(FILE_TREE_COLLAPSED_PREFERENCE, collapsed));
	}, []);

	useLayoutResetEffect(() => {
		setRefsPanelWidthState(getResizePreferenceDefaultValue(REFS_PANEL_WIDTH_PREFERENCE));
		setCommitsPanelWidthState(getResizePreferenceDefaultValue(COMMITS_PANEL_WIDTH_PREFERENCE));
		setDiffContentPanelWidthState(getResizePreferenceDefaultValue(DIFF_CONTENT_PANEL_WIDTH_PREFERENCE));
		setFileTreePanelWidthState(getResizePreferenceDefaultValue(FILE_TREE_WIDTH_PREFERENCE));
		setRefsPanelCollapsedState(REFS_PANEL_COLLAPSED_PREFERENCE.defaultValue);
		setCommitsPanelCollapsedState(COMMITS_PANEL_COLLAPSED_PREFERENCE.defaultValue);
		setFileTreePanelCollapsedState(FILE_TREE_COLLAPSED_PREFERENCE.defaultValue);
	});

	return {
		refsPanelWidth,
		commitsPanelWidth,
		diffContentPanelWidth,
		fileTreePanelWidth,
		isRefsPanelCollapsed,
		isCommitsPanelCollapsed,
		isFileTreePanelCollapsed,
		setRefsPanelWidth,
		setCommitsPanelWidth,
		setDiffContentPanelWidth,
		setFileTreePanelWidth,
		setRefsPanelCollapsed,
		setCommitsPanelCollapsed,
		setFileTreePanelCollapsed,
	};
}
