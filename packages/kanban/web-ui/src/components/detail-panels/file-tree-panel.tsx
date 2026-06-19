import {
	FileListing,
	FileListingViewModeToggle,
	getFileDirectory,
	getFilePathName,
	type FileListingViewMode,
} from "@changeyard/web-ui";
import { FolderOpen } from "lucide-react";
import { useState } from "react";

import { cn } from "@/components/ui/cn";
import type { RuntimeWorkspaceFileChange } from "@/runtime/types";
import { LocalStorageKey, readLocalStorageItem, writeLocalStorageItem } from "@/storage/local-storage-store";

export type FileTreePanelViewMode = FileListingViewMode;

export function normalizeFileTreePanelViewMode(value: string | null | undefined): FileTreePanelViewMode | null {
	return value === "list" || value === "tree" || value === "package" ? value : null;
}

export function readFileTreePanelViewModePreference(
	key: LocalStorageKey,
	fallback: FileTreePanelViewMode = "tree",
): FileTreePanelViewMode {
	return normalizeFileTreePanelViewMode(readLocalStorageItem(key)) ?? fallback;
}

export function writeFileTreePanelViewModePreference(
	key: LocalStorageKey,
	mode: FileTreePanelViewMode,
): FileTreePanelViewMode {
	writeLocalStorageItem(key, mode);
	return mode;
}

function FileDiffStats({
	added,
	removed,
	isSelected,
}: {
	added: number;
	removed: number;
	isSelected: boolean;
}): React.ReactElement | null {
	if (added <= 0 && removed <= 0) {
		return null;
	}
	return (
		<span className="ml-auto flex shrink-0 gap-1 font-mono text-[10px]">
			{added > 0 ? <span className={isSelected ? "text-text-primary" : "text-status-green"}>+{added}</span> : null}
			{removed > 0 ? <span className={isSelected ? "text-text-primary" : "text-status-red"}>-{removed}</span> : null}
		</span>
	);
}

function FileListLabel({
	path,
	isSelected,
}: {
	path: string;
	isSelected: boolean;
}): React.ReactElement {
	const directory = getFileDirectory(path);
	return (
		<span className="min-w-0 flex-1">
			<span className="block truncate">{getFilePathName(path)}</span>
			{directory ? (
				<span className={cn("block truncate text-[10px]", isSelected ? "text-text-secondary" : "text-text-tertiary")}>
					{directory}
				</span>
			) : null}
		</span>
	);
}

export function FileTreePanel({
	workspaceFiles,
	selectedPath,
	onSelectPath,
	panelFlex,
	viewMode,
	defaultViewMode = "tree",
	onViewModeChange,
	showViewModeToggle = false,
	viewModeStorageKey,
}: {
	workspaceFiles: RuntimeWorkspaceFileChange[] | null;
	selectedPath: string | null;
	onSelectPath: (path: string) => void;
	panelFlex?: string;
	viewMode?: FileTreePanelViewMode;
	defaultViewMode?: FileTreePanelViewMode;
	onViewModeChange?: (mode: FileTreePanelViewMode) => void;
	showViewModeToggle?: boolean;
	viewModeStorageKey?: LocalStorageKey;
}): React.ReactElement {
	const [internalViewMode, setInternalViewMode] = useState<FileTreePanelViewMode>(() =>
		viewModeStorageKey ? readFileTreePanelViewModePreference(viewModeStorageKey, defaultViewMode) : defaultViewMode,
	);
	const resolvedViewMode = viewMode ?? internalViewMode;
	const files = workspaceFiles ?? [];
	const setViewMode = (mode: FileTreePanelViewMode): void => {
		setInternalViewMode(mode);
		if (viewModeStorageKey) {
			writeFileTreePanelViewModePreference(viewModeStorageKey, mode);
		}
		onViewModeChange?.(mode);
	};

	return (
		<div
			style={{
				display: "flex",
				flex: panelFlex ?? "0.6 1 0",
				flexDirection: "column",
				minWidth: 0,
				minHeight: 0,
				background: "var(--color-surface-0)",
			}}
		>
			<div
				style={{
					flex: "1 1 0",
					minHeight: 0,
					overflowX: "hidden",
					overflowY: "auto",
					padding: 8,
				}}
			>
				{showViewModeToggle ? (
					<FileListingViewModeToggle className="mb-2" mode={resolvedViewMode} onModeChange={setViewMode} />
				) : null}
				{files.length === 0 ? (
					<div className="kb-empty-state-center">
						<div className="flex flex-col items-center justify-center gap-3 py-12 text-text-tertiary">
							<FolderOpen size={40} />
						</div>
					</div>
				) : (
					<FileListing
						files={files}
						mode={resolvedViewMode}
						selectedPath={selectedPath}
						onSelectPath={onSelectPath}
						renderFileLabel={({ path, name, isSelected, mode }) =>
							mode === "list" ? <FileListLabel path={path} isSelected={isSelected} /> : <span className="truncate">{name}</span>
						}
						renderFileMeta={({ file, isSelected }) => (
							<FileDiffStats added={file.additions} removed={file.deletions} isSelected={isSelected} />
						)}
					/>
				)}
			</div>
		</div>
	);
}
