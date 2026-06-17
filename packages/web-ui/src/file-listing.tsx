import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderTree, List, Package } from "lucide-react";
import {
	type DragEvent as ReactDragEvent,
	type ReactNode,
	useMemo,
	useState,
} from "react";

import { cn } from "./cn";
import { FileTypeIcon } from "./file-type-icon";
import { buildFileTree, buildPackageFileTree, type FileTreeNode } from "./file-tree";

export type FileListingViewMode = "list" | "tree" | "package";

export interface FileListingFileContext<TFile extends { path: string }> {
	file: TFile;
	path: string;
	name: string;
	directory: string;
	isSelected: boolean;
	mode: FileListingViewMode;
	node?: FileTreeNode;
}

export interface FileListingDirectoryContext {
	node: FileTreeNode;
	depth: number;
	isCollapsed: boolean;
}

export interface FileListingProps<TFile extends { path: string }> {
	files: TFile[];
	mode: FileListingViewMode;
	selectedPath: string | null;
	onSelectPath: (path: string) => void;
	getPath?: (file: TFile) => string;
	getFileKey?: (file: TFile) => string;
	className?: string;
	fileRowTestId?: string;
	directoryRowTestId?: string;
	filePathDataAttribute?: string;
	directoryPathDataAttribute?: string;
	collapsedDirectoryPaths?: ReadonlySet<string>;
	onDirectoryToggle?: (path: string) => void;
	onFileDragStart?: (event: ReactDragEvent<HTMLButtonElement>, file: TFile) => void;
	getFileRowClassName?: (context: FileListingFileContext<TFile>) => string | false | null | undefined;
	getDirectoryRowClassName?: (context: FileListingDirectoryContext) => string | false | null | undefined;
	renderFileLeading?: (context: FileListingFileContext<TFile>) => ReactNode;
	renderFileLabel?: (context: FileListingFileContext<TFile>) => ReactNode;
	renderFileMeta?: (context: FileListingFileContext<TFile>) => ReactNode;
	renderDirectoryMeta?: (context: FileListingDirectoryContext) => ReactNode;
}

export function getFilePathName(path: string): string {
	return path.split("/").filter(Boolean).at(-1) ?? path;
}

export function getFileDirectory(path: string): string {
	return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function defaultFileKey<TFile extends { path: string }>(file: TFile): string {
	return file.path;
}

export function FileListingViewModeToggle({
	mode,
	onModeChange,
	className,
}: {
	mode: FileListingViewMode;
	onModeChange: (mode: FileListingViewMode) => void;
	className?: string;
}): React.ReactElement {
	return (
		<div className={cn("inline-flex shrink-0 rounded-md border border-divider bg-surface-0 p-0.5", className)}>
			<button
				type="button"
				aria-label="Show files as list"
				title="List"
				className={cn(
					"grid h-6 w-6 place-items-center rounded border border-transparent text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary",
					mode === "list" && "border-accent/30 bg-accent/15 text-accent",
				)}
				onClick={(event) => {
					event.stopPropagation();
					onModeChange("list");
				}}
			>
				<List size={14} />
			</button>
			<button
				type="button"
				aria-label="Show files as folders"
				title="Folder tree"
				className={cn(
					"grid h-6 w-6 place-items-center rounded border border-transparent text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary",
					mode === "tree" && "border-accent/30 bg-accent/15 text-accent",
				)}
				onClick={(event) => {
					event.stopPropagation();
					onModeChange("tree");
				}}
			>
				<FolderTree size={14} />
			</button>
			<button
				type="button"
				aria-label="Show files as packages"
				title="Package tree"
				className={cn(
					"grid h-6 w-6 place-items-center rounded border border-transparent text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary",
					mode === "package" && "border-accent/30 bg-accent/15 text-accent",
				)}
				onClick={(event) => {
					event.stopPropagation();
					onModeChange("package");
				}}
			>
				<Package size={14} />
			</button>
		</div>
	);
}

export function FileListing<TFile extends { path: string }>({
	files,
	mode,
	selectedPath,
	onSelectPath,
	getPath = (file) => file.path,
	getFileKey = defaultFileKey,
	className,
	fileRowTestId,
	directoryRowTestId,
	filePathDataAttribute = "data-file-path",
	directoryPathDataAttribute = "data-directory-path",
	collapsedDirectoryPaths,
	onDirectoryToggle,
	onFileDragStart,
	getFileRowClassName,
	getDirectoryRowClassName,
	renderFileLeading,
	renderFileLabel,
	renderFileMeta,
	renderDirectoryMeta,
}: FileListingProps<TFile>): React.ReactElement {
	const [internalCollapsedDirectoryPaths, setInternalCollapsedDirectoryPaths] = useState<Set<string>>(() => new Set());
	const resolvedCollapsedDirectoryPaths = collapsedDirectoryPaths ?? internalCollapsedDirectoryPaths;
	const filesByPath = useMemo(() => {
		const next = new Map<string, TFile>();
		for (const file of files) {
			next.set(getPath(file), file);
		}
		return next;
	}, [files, getPath]);
	const paths = useMemo(() => files.map((file) => getPath(file)), [files, getPath]);
	const tree = useMemo(
		() => (mode === "package" ? buildPackageFileTree(paths) : buildFileTree(paths)),
		[mode, paths],
	);
	const sortedFiles = useMemo(
		() => [...files].sort((left, right) => getPath(left).localeCompare(getPath(right))),
		[files, getPath],
	);

	function toggleDirectory(path: string): void {
		if (onDirectoryToggle) {
			onDirectoryToggle(path);
			return;
		}
		setInternalCollapsedDirectoryPaths((current) => {
			const next = new Set(current);
			if (next.has(path)) {
				next.delete(path);
			} else {
				next.add(path);
			}
			return next;
		});
	}

	function renderFileRow({
		file,
		path,
		node,
		depth,
	}: {
		file: TFile;
		path: string;
		node?: FileTreeNode;
		depth?: number;
	}): React.ReactElement {
		const isSelected = path === selectedPath;
		const context: FileListingFileContext<TFile> = {
			file,
			path,
			name: node?.name ?? getFilePathName(path),
			directory: getFileDirectory(path),
			isSelected,
			mode,
			node,
		};
		const dataAttributes: Record<string, string> = {
			[filePathDataAttribute]: path,
		};

		return (
			<button
				type="button"
				key={getFileKey(file)}
				data-testid={fileRowTestId}
				draggable={Boolean(onFileDragStart)}
				className={cn(
					"kb-file-tree-row",
					isSelected && "kb-file-tree-row-selected",
					getFileRowClassName?.(context),
				)}
				style={depth === undefined ? undefined : { paddingLeft: depth * 12 + 8 }}
				onDragStart={(event) => onFileDragStart?.(event, file)}
				onClick={() => onSelectPath(path)}
				{...dataAttributes}
			>
				{depth === undefined ? null : <span className="w-3 shrink-0" />}
				<FileTypeIcon path={path} />
				{renderFileLeading?.(context)}
				{renderFileLabel?.(context) ?? <span className="min-w-0 flex-1 truncate">{path}</span>}
				{renderFileMeta?.(context)}
			</button>
		);
	}

	function renderNode(node: FileTreeNode, depth: number): React.ReactElement | null {
		if (node.type === "file") {
			const file = filesByPath.get(node.path);
			return file ? renderFileRow({ file, path: node.path, node, depth }) : null;
		}

		const isCollapsed = resolvedCollapsedDirectoryPaths.has(node.path);
		const context: FileListingDirectoryContext = { node, depth, isCollapsed };
		const dataAttributes: Record<string, string> = {
			[directoryPathDataAttribute]: node.path,
		};

		return (
			<div key={node.path}>
				<button
					type="button"
					data-testid={directoryRowTestId}
					aria-expanded={!isCollapsed}
					className={cn(
						"kb-file-tree-row kb-file-tree-row-directory cursor-pointer hover:bg-surface-2 hover:text-text-primary",
						getDirectoryRowClassName?.(context),
					)}
					style={{ paddingLeft: depth * 12 + 8 }}
					onClick={() => toggleDirectory(node.path)}
					{...dataAttributes}
				>
					{isCollapsed ? <ChevronRight size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
					{isCollapsed ? <Folder size={14} className="shrink-0" /> : <FolderOpen size={14} className="shrink-0" />}
					<span className="min-w-0 flex-1 truncate">{node.name}</span>
					{renderDirectoryMeta?.(context)}
				</button>
				{node.children.length > 0 && !isCollapsed ? (
					<div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
				) : null}
			</div>
		);
	}

	return (
		<div className={className}>
			{mode === "list"
				? sortedFiles.map((file) => renderFileRow({ file, path: getPath(file) }))
				: tree.map((node) => renderNode(node, 0))}
		</div>
	);
}
