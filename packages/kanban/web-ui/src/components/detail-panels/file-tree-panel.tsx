import {
	ChevronDown,
	ChevronRight,
	FileArchive,
	FileCode,
	FileCog,
	FileImage,
	FileJson,
	FileText,
	FileType,
	Folder,
	FolderOpen,
	FolderTree,
	List,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/components/ui/cn";
import type { RuntimeWorkspaceFileChange } from "@/runtime/types";
import { buildFileTree, type FileTreeNode } from "@/utils/file-tree";

interface FileDiffStats {
	added: number;
	removed: number;
}

export type FileTreePanelViewMode = "tree" | "list";

function getPathName(path: string): string {
	return path.split("/").filter(Boolean).at(-1) ?? path;
}

function getFileExtension(path: string): string {
	const name = getPathName(path).toLowerCase();
	const dotIndex = name.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === name.length - 1) {
		return "";
	}
	return name.slice(dotIndex + 1);
}

function FileExtensionIcon({ path, selected = false }: { path: string; selected?: boolean }): React.ReactElement {
	const extension = getFileExtension(path);
	const baseClassName = selected ? "shrink-0 text-accent-fg" : "shrink-0";
	const iconProps = { size: 14, className: baseClassName };
	if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "css", "scss", "html", "rs", "go", "py", "sh"].includes(extension)) {
		return <FileCode {...iconProps} style={selected ? undefined : { color: "var(--color-status-blue)" }} />;
	}
	if (["json", "jsonc", "lock"].includes(extension)) {
		return <FileJson {...iconProps} style={selected ? undefined : { color: "var(--color-status-gold)" }} />;
	}
	if (["md", "mdx", "txt", "rst"].includes(extension)) {
		return <FileType {...iconProps} style={selected ? undefined : { color: "var(--color-status-purple)" }} />;
	}
	if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(extension)) {
		return <FileImage {...iconProps} style={selected ? undefined : { color: "var(--color-status-green)" }} />;
	}
	if (["zip", "gz", "tgz", "tar"].includes(extension)) {
		return <FileArchive {...iconProps} style={selected ? undefined : { color: "var(--color-status-red)" }} />;
	}
	if (["yml", "yaml", "toml", "ini", "env"].includes(extension) || getPathName(path).startsWith(".")) {
		return <FileCog {...iconProps} style={selected ? undefined : { color: "var(--color-text-tertiary)" }} />;
	}
	return <FileText {...iconProps} />;
}

function FileTreeViewToggle({
	mode,
	onModeChange,
}: {
	mode: FileTreePanelViewMode;
	onModeChange: (mode: FileTreePanelViewMode) => void;
}): React.ReactElement {
	return (
		<div className="mb-2 inline-flex shrink-0 rounded-md border border-divider bg-surface-0 p-0.5">
			<button
				type="button"
				aria-label="Show files as list"
				title="List"
				onClick={() => onModeChange("list")}
				className={cn(
					"grid h-6 w-6 place-items-center rounded border border-transparent text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary",
					mode === "list" ? "border-accent/30 bg-accent/15 text-accent" : null,
				)}
			>
				<List size={14} />
			</button>
			<button
				type="button"
				aria-label="Show files as folders"
				title="Folder tree"
				onClick={() => onModeChange("tree")}
				className={cn(
					"grid h-6 w-6 place-items-center rounded border border-transparent text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary",
					mode === "tree" ? "border-accent/30 bg-accent/15 text-accent" : null,
				)}
			>
				<FolderTree size={14} />
			</button>
		</div>
	);
}

function FileTreeRow({
	node,
	depth,
	selectedPath,
	onSelectPath,
	diffStatsByPath,
	expandedDirectories,
	onToggleDirectory,
}: {
	node: FileTreeNode;
	depth: number;
	selectedPath: string | null;
	onSelectPath: (path: string) => void;
	diffStatsByPath: Record<string, FileDiffStats>;
	expandedDirectories: Record<string, boolean>;
	onToggleDirectory: (path: string) => void;
}): React.ReactElement {
	const isDirectory = node.type === "directory";
	const isExpanded = isDirectory ? (expandedDirectories[node.path] ?? true) : false;
	const isSelected = !isDirectory && node.path === selectedPath;
	const fileStats = !isDirectory ? diffStatsByPath[node.path] : undefined;
	const rowClassName = `kb-file-tree-row${isDirectory ? " kb-file-tree-row-directory" : ""}${isSelected ? " kb-file-tree-row-selected" : ""}`;
	const addedStatClassName = isSelected ? "text-accent-fg" : "text-status-green";
	const removedStatClassName = isSelected ? "text-accent-fg" : "text-status-red";

	return (
		<div>
			<button
				type="button"
				className={rowClassName}
				style={{ paddingLeft: depth * 12 + 8 }}
				aria-expanded={isDirectory ? isExpanded : undefined}
				onClick={() => {
					if (isDirectory) {
						onToggleDirectory(node.path);
					} else {
						onSelectPath(node.path);
					}
				}}
			>
				{isDirectory ? (
					isExpanded ? (
						<ChevronDown size={12} className="shrink-0" />
					) : (
						<ChevronRight size={12} className="shrink-0" />
					)
				) : (
					<span className="w-3 shrink-0" />
				)}
				{isDirectory ? (
					isExpanded ? (
						<FolderOpen size={14} className="shrink-0" />
					) : (
						<Folder size={14} className="shrink-0" />
					)
				) : (
					<FileExtensionIcon path={node.path} selected={isSelected} />
				)}
				<span className="truncate">{node.name}</span>
				{fileStats ? (
					<span className="font-mono" style={{ marginLeft: "auto", fontSize: 10, display: "flex", gap: 4 }}>
						{fileStats.added > 0 ? <span className={addedStatClassName}>+{fileStats.added}</span> : null}
						{fileStats.removed > 0 ? <span className={removedStatClassName}>-{fileStats.removed}</span> : null}
					</span>
				) : null}
			</button>
			{isExpanded && node.children.length > 0 ? (
				<div>
					{node.children.map((child) => (
						<FileTreeRow
							key={child.path}
							node={child}
							depth={depth + 1}
							selectedPath={selectedPath}
							onSelectPath={onSelectPath}
							diffStatsByPath={diffStatsByPath}
							expandedDirectories={expandedDirectories}
							onToggleDirectory={onToggleDirectory}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

function FileListRow({
	file,
	selectedPath,
	onSelectPath,
}: {
	file: RuntimeWorkspaceFileChange;
	selectedPath: string | null;
	onSelectPath: (path: string) => void;
}): React.ReactElement {
	const isSelected = file.path === selectedPath;
	const directory = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
	return (
		<button
			type="button"
			className={cn("kb-file-tree-row", isSelected ? "kb-file-tree-row-selected" : null)}
			onClick={() => onSelectPath(file.path)}
		>
			<FileExtensionIcon path={file.path} selected={isSelected} />
			<span className="min-w-0 flex-1">
				<span className="block truncate">{getPathName(file.path)}</span>
				{directory ? (
					<span className={cn("block truncate text-[10px]", isSelected ? "text-accent-fg" : "text-text-tertiary")}>
						{directory}
					</span>
				) : null}
			</span>
			<span className="flex shrink-0 gap-1 font-mono text-[10px]">
				{file.additions > 0 ? <span className={isSelected ? "text-accent-fg" : "text-status-green"}>+{file.additions}</span> : null}
				{file.deletions > 0 ? <span className={isSelected ? "text-accent-fg" : "text-status-red"}>-{file.deletions}</span> : null}
			</span>
		</button>
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
}: {
	workspaceFiles: RuntimeWorkspaceFileChange[] | null;
	selectedPath: string | null;
	onSelectPath: (path: string) => void;
	panelFlex?: string;
	viewMode?: FileTreePanelViewMode;
	defaultViewMode?: FileTreePanelViewMode;
	onViewModeChange?: (mode: FileTreePanelViewMode) => void;
	showViewModeToggle?: boolean;
}): React.ReactElement {
	const [internalViewMode, setInternalViewMode] = useState<FileTreePanelViewMode>(defaultViewMode);
	const [expandedDirectories, setExpandedDirectories] = useState<Record<string, boolean>>({});
	const resolvedViewMode = viewMode ?? internalViewMode;
	const referencedPaths = useMemo(() => {
		return workspaceFiles?.map((file) => file.path) ?? [];
	}, [workspaceFiles]);
	const tree = useMemo(() => buildFileTree(referencedPaths), [referencedPaths]);
	const sortedFiles = useMemo(
		() => [...(workspaceFiles ?? [])].sort((a, b) => a.path.localeCompare(b.path)),
		[workspaceFiles],
	);
	const diffStatsByPath = useMemo(() => {
		const stats: Record<string, FileDiffStats> = {};
		for (const file of workspaceFiles ?? []) {
			stats[file.path] = {
				added: file.additions,
				removed: file.deletions,
			};
		}
		return stats;
	}, [workspaceFiles]);
	const setViewMode = (mode: FileTreePanelViewMode): void => {
		setInternalViewMode(mode);
		onViewModeChange?.(mode);
	};
	const toggleDirectory = (path: string): void => {
		setExpandedDirectories((current) => ({ ...current, [path]: !(current[path] ?? true) }));
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
				{showViewModeToggle ? <FileTreeViewToggle mode={resolvedViewMode} onModeChange={setViewMode} /> : null}
				{tree.length === 0 ? (
					<div className="kb-empty-state-center">
						<div className="flex flex-col items-center justify-center gap-3 py-12 text-text-tertiary">
							<FolderOpen size={40} />
						</div>
					</div>
				) : resolvedViewMode === "list" ? (
					<div>
						{sortedFiles.map((file) => (
							<FileListRow
								key={file.path}
								file={file}
								selectedPath={selectedPath}
								onSelectPath={onSelectPath}
							/>
						))}
					</div>
				) : (
					<div>
						{tree.map((node) => (
							<FileTreeRow
								key={node.path}
								node={node}
								depth={0}
								selectedPath={selectedPath}
								onSelectPath={onSelectPath}
								diffStatsByPath={diffStatsByPath}
								expandedDirectories={expandedDirectories}
								onToggleDirectory={toggleDirectory}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
