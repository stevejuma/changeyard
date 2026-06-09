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

export const MIN_GIT_FILE_TREE_PANEL_WIDTH = 180;
export const DEFAULT_GIT_FILE_TREE_PANEL_WIDTH = 260;

const FILE_TREE_WIDTH_PREFERENCE: ResizeNumberPreference = {
	key: LocalStorageKey.GitDiffFileTreePanelWidth,
	defaultValue: () => {
		const migratedRatio = readOptionalPersistedResizeNumber({
			key: LocalStorageKey.GitDiffFileTreePanelRatio,
		});
		if (migratedRatio !== undefined) {
			return clampAtLeast(Math.round(720 * migratedRatio), MIN_GIT_FILE_TREE_PANEL_WIDTH, true);
		}
		return DEFAULT_GIT_FILE_TREE_PANEL_WIDTH;
	},
	normalize: (value) => clampAtLeast(value, MIN_GIT_FILE_TREE_PANEL_WIDTH, true),
};

const FILE_TREE_COLLAPSED_PREFERENCE: ResizeBooleanPreference = {
	key: LocalStorageKey.GitDiffFileTreePanelCollapsed,
	defaultValue: false,
};

export function useGitCommitDiffLayout(): {
	fileTreePanelWidth: number;
	isFileTreePanelCollapsed: boolean;
	setFileTreePanelCollapsed: (collapsed: boolean) => void;
	setFileTreePanelWidth: (width: number) => void;
} {
	const [fileTreePanelWidth, setFileTreePanelWidthState] = useState(() =>
		loadResizePreference(FILE_TREE_WIDTH_PREFERENCE),
	);
	const [isFileTreePanelCollapsed, setFileTreePanelCollapsedState] = useState(() =>
		loadBooleanResizePreference(FILE_TREE_COLLAPSED_PREFERENCE),
	);

	const setFileTreePanelWidth = useCallback((width: number) => {
		setFileTreePanelWidthState(persistResizePreference(FILE_TREE_WIDTH_PREFERENCE, width));
	}, []);

	const setFileTreePanelCollapsed = useCallback((collapsed: boolean) => {
		setFileTreePanelCollapsedState(persistBooleanResizePreference(FILE_TREE_COLLAPSED_PREFERENCE, collapsed));
	}, []);

	useLayoutResetEffect(() => {
		setFileTreePanelWidthState(getResizePreferenceDefaultValue(FILE_TREE_WIDTH_PREFERENCE));
		setFileTreePanelCollapsedState(FILE_TREE_COLLAPSED_PREFERENCE.defaultValue);
	});

	return {
		fileTreePanelWidth,
		isFileTreePanelCollapsed,
		setFileTreePanelWidth,
		setFileTreePanelCollapsed,
	};
}
