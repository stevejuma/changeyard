import { ChevronDown, ChevronLeft, ChevronRight, FileText, Folder, FolderOpen, FolderTree, List } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useMemo } from "react";

import { parsePatchToRows, ReadOnlyUnifiedDiff } from "@/components/shared/diff-renderer";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FileStatusGlyph } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/vcs-panels";
import { buildFileTree, type FileTreeNode } from "@/utils/file-tree";
import { clampNumber, type VcsFileViewMode } from "@/utils/vcs-ui-preferences";

export type VcsColumnId = "refs" | "commits" | "operations" | "stack";

export type VcsFileChange = {
	path: string;
	previousPath?: string;
	status: "modified" | "added" | "deleted" | "renamed" | "copied" | "unknown";
	additions?: number;
	deletions?: number;
	patch?: string;
};

function startHorizontalResize({
	event,
	width,
	minWidth,
	maxWidth,
	resizeFrom,
	onWidthChange,
}: {
	event: ReactPointerEvent<HTMLDivElement>;
	width: number;
	minWidth: number;
	maxWidth: number;
	resizeFrom: "left" | "right";
	onWidthChange: (width: number) => void;
}): void {
	event.preventDefault();
	event.stopPropagation();
	const startX = event.clientX;
	const startWidth = width;
	const previousUserSelect = document.body.style.userSelect;
	const previousCursor = document.body.style.cursor;

	function handlePointerMove(pointerEvent: PointerEvent): void {
		const delta = resizeFrom === "right" ? pointerEvent.clientX - startX : startX - pointerEvent.clientX;
		onWidthChange(clampNumber(startWidth + delta, minWidth, maxWidth));
	}

	function stopResize(): void {
		document.body.style.userSelect = previousUserSelect;
		document.body.style.cursor = previousCursor;
		window.removeEventListener("pointermove", handlePointerMove);
		window.removeEventListener("pointerup", stopResize);
		window.removeEventListener("pointercancel", stopResize);
	}

	document.body.style.userSelect = "none";
	document.body.style.cursor = "ew-resize";
	window.addEventListener("pointermove", handlePointerMove);
	window.addEventListener("pointerup", stopResize);
	window.addEventListener("pointercancel", stopResize);
}

export function VcsColumn({
	id,
	title,
	count,
	width,
	minWidth = 240,
	maxWidth = 760,
	onCollapse,
	onWidthChange,
	onScrollNearEnd,
	hideHeader = false,
	headerContent,
	children,
}: {
	id: VcsColumnId;
	title: string;
	count?: number;
	width: number;
	minWidth?: number;
	maxWidth?: number;
	onCollapse: () => void;
	onWidthChange?: (width: number) => void;
	onScrollNearEnd?: () => void;
	hideHeader?: boolean;
	headerContent?: React.ReactNode;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<section
			data-column-id={id}
			className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
			style={{ width, minWidth: width }}
		>
			<header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-divider px-3">
				{hideHeader ? (
					<div className="min-w-0 flex-1">{headerContent}</div>
				) : (
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate text-sm font-semibold text-text-primary">{title}</span>
						{count === undefined ? null : <span className="text-xs text-text-secondary">{count}</span>}
					</div>
				)}
				<Button
					variant="ghost"
					size="sm"
					icon={<ChevronLeft size={14} />}
					aria-label={`Collapse ${title} column`}
					title={`Collapse ${title}`}
					onClick={onCollapse}
				/>
			</header>
			<div
				className="min-h-0 flex-1 overflow-y-auto"
				onScroll={(event) => {
					if (!onScrollNearEnd) {
						return;
					}
					const element = event.currentTarget;
					if (element.scrollHeight - element.scrollTop - element.clientHeight <= 180) {
						onScrollNearEnd();
					}
				}}
			>
				{children}
			</div>
			{onWidthChange ? (
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label={`Resize ${title} column`}
					title={`Resize ${title}`}
					className="absolute right-0 top-0 z-20 h-full w-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-accent/40"
					onPointerDown={(event) => {
						startHorizontalResize({ event, width, minWidth, maxWidth, resizeFrom: "right", onWidthChange });
					}}
				/>
			) : null}
		</section>
	);
}

export function VcsCollapsedColumn({
	label,
	count,
	onExpand,
}: {
	label: string;
	count?: number;
	onExpand: () => void;
}): React.ReactElement {
	return (
		<section
			className="flex h-full min-h-0 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-1"
			style={{ width: 44, minWidth: 44 }}
		>
			<button
				type="button"
				aria-label={`Expand ${label} column`}
				title={count === undefined ? label : `${label} (${count})`}
				onClick={onExpand}
				className="flex flex-1 flex-col items-center gap-2 px-1 py-2 text-text-secondary hover:text-text-primary"
			>
				<span className="inline-flex items-center gap-1 text-[11px] font-semibold [writing-mode:vertical-rl]">
					<span>{label}</span>
					{count === undefined ? null : <span className="font-medium text-text-tertiary">{count}</span>}
				</span>
				<ChevronRight size={14} />
			</button>
		</section>
	);
}

function fileKey(file: VcsFileChange): string {
	return `${file.previousPath ?? ""}:${file.path}`;
}

function FileTreeRow({
	node,
	depth,
	selectedPath,
	onSelectPath,
	filesByPath,
}: {
	node: FileTreeNode;
	depth: number;
	selectedPath: string | null;
	onSelectPath: (path: string) => void;
	filesByPath: Map<string, VcsFileChange>;
}): React.ReactElement {
	const isDirectory = node.type === "directory";
	const isSelected = !isDirectory && node.path === selectedPath;
	const file = filesByPath.get(node.path);
	const addedClassName = isSelected ? "text-accent-fg" : "text-status-green";
	const removedClassName = isSelected ? "text-accent-fg" : "text-status-red";

	return (
		<div>
			<button
				type="button"
				className={cn(
					"kb-file-tree-row",
					isDirectory && "kb-file-tree-row-directory",
					isSelected && "kb-file-tree-row-selected",
				)}
				style={{ paddingLeft: depth * 12 + 8 }}
				onClick={() => {
					if (!isDirectory) {
						onSelectPath(node.path);
					}
				}}
			>
				{isDirectory ? <Folder size={14} /> : <FileText size={14} />}
				<span className="truncate">{node.name}</span>
				{file ? (
					<span className="ml-auto flex gap-1 font-mono text-[10px]">
						{(file.additions ?? 0) > 0 ? <span className={addedClassName}>+{file.additions}</span> : null}
						{(file.deletions ?? 0) > 0 ? <span className={removedClassName}>-{file.deletions}</span> : null}
					</span>
				) : null}
			</button>
			{node.children.length > 0 ? (
				<div>
					{node.children.map((child) => (
						<FileTreeRow
							key={child.path}
							node={child}
							depth={depth + 1}
							selectedPath={selectedPath}
							onSelectPath={onSelectPath}
							filesByPath={filesByPath}
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
	file: VcsFileChange;
	selectedPath: string | null;
	onSelectPath: (path: string) => void;
}): React.ReactElement {
	const isSelected = file.path === selectedPath;
	const addedClassName = isSelected ? "text-accent-fg" : "text-status-green";
	const removedClassName = isSelected ? "text-accent-fg" : "text-status-red";

	return (
		<button
			type="button"
			className={cn("kb-file-tree-row", isSelected && "kb-file-tree-row-selected")}
			onClick={() => onSelectPath(file.path)}
		>
			<FileText size={14} />
			<FileStatusGlyph status={file.status} />
			<span className="min-w-0 flex-1 truncate">{file.path}</span>
			<span className="flex shrink-0 gap-1 font-mono text-[10px]">
				{(file.additions ?? 0) > 0 ? <span className={addedClassName}>+{file.additions}</span> : null}
				{(file.deletions ?? 0) > 0 ? <span className={removedClassName}>-{file.deletions}</span> : null}
			</span>
		</button>
	);
}

function FileViewToggle({
	mode,
	onModeChange,
}: {
	mode: VcsFileViewMode;
	onModeChange: (mode: VcsFileViewMode) => void;
}): React.ReactElement {
	return (
		<div className="inline-flex shrink-0 rounded-md border border-divider bg-surface-0 p-0.5">
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
		</div>
	);
}

function FileRowsSkeleton({ rows = 4 }: { rows?: number }): React.ReactElement {
	return (
		<div className="grid gap-1 px-1 py-1">
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="flex h-8 items-center gap-2 px-2">
					<div className="kb-skeleton h-4 w-4 shrink-0 rounded" />
					<div className="kb-skeleton h-3 min-w-0 flex-1" />
					<div className="kb-skeleton h-3 w-10 shrink-0" />
				</div>
			))}
		</div>
	);
}

export function VcsInlineFileSection({
	title = "Changed files",
	files,
	selectedPath,
	isLoading,
	errorMessage,
	viewMode,
	onViewModeChange,
	onSelectPath,
	collapsed = false,
	onCollapsedChange,
}: {
	title?: string;
	files: VcsFileChange[];
	selectedPath: string | null;
	isLoading?: boolean;
	errorMessage?: string | null;
	viewMode: VcsFileViewMode;
	onViewModeChange: (mode: VcsFileViewMode) => void;
	onSelectPath: (path: string) => void;
	collapsed?: boolean;
	onCollapsedChange?: (collapsed: boolean) => void;
}): React.ReactElement {
	const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
	const tree = useMemo(() => buildFileTree(files.map((file) => file.path)), [files]);
	const additions = files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
	const deletions = files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
	const headerContent = (
		<>
			{collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
			<span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{title}</span>
			<span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold">{files.length}</span>
			{additions > 0 ? <span className="text-[12px] font-medium text-status-green">+{additions}</span> : null}
			{deletions > 0 ? <span className="text-[12px] font-medium text-status-red">-{deletions}</span> : null}
			<FileViewToggle mode={viewMode} onModeChange={onViewModeChange} />
		</>
	);

	return (
		<div className="mx-2 mb-2 rounded-lg border border-divider bg-surface-0">
				{onCollapsedChange ? (
					<div
						role="button"
						tabIndex={0}
						className="flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-left"
						onClick={(event) => {
							event.stopPropagation();
							onCollapsedChange(!collapsed);
						}}
						onKeyDown={(event) => {
							if (event.target !== event.currentTarget) {
								return;
							}
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onCollapsedChange(!collapsed);
							}
						}}
						aria-expanded={!collapsed}
					>
						{headerContent}
					</div>
				) : (
				<div className="flex w-full items-center gap-2 px-2 py-2 text-left">{headerContent}</div>
			)}
			{collapsed ? null : <div className="border-t border-divider">
				{isLoading ? (
					<FileRowsSkeleton />
				) : errorMessage ? (
					<div className="px-2 py-2 text-[12px] text-status-red">{errorMessage}</div>
				) : files.length === 0 ? (
					<div className="px-2 py-2 text-[12px] text-text-tertiary">No changed files.</div>
				) : (
					<div className="max-h-[250px] overflow-y-auto px-1 py-1">
						{viewMode === "tree"
							? tree.map((node) => (
									<FileTreeRow
										key={node.path}
										node={node}
										depth={0}
										selectedPath={selectedPath}
										onSelectPath={onSelectPath}
										filesByPath={filesByPath}
									/>
								))
							: files.map((file) => (
									<FileListRow
										key={fileKey(file)}
										file={file}
										selectedPath={selectedPath}
										onSelectPath={onSelectPath}
									/>
								))}
					</div>
				)}
			</div>}
		</div>
	);
}

function ReadOnlyDiff({ file }: { file: VcsFileChange }): React.ReactElement {
	const rows = parsePatchToRows(file.patch ?? "");
	if (rows.length === 0) {
		return <div className="px-3 py-3 text-[12px] text-text-tertiary">No textual diff available.</div>;
	}
	return <ReadOnlyUnifiedDiff rows={rows} path={file.path} />;
}

export function VcsFileDiffColumn({
	file,
	isLoading = false,
	width = 640,
	minWidth = 420,
	maxWidth = 980,
	onWidthChange,
	onClose,
}: {
	file: VcsFileChange | null;
	isLoading?: boolean;
	width?: number;
	minWidth?: number;
	maxWidth?: number;
	onWidthChange?: (width: number) => void;
	onClose: () => void;
}): React.ReactElement {
	return (
		<section
			data-testid="vcs-file-diff-column"
			className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-1"
			style={{ width, minWidth: width }}
		>
			{onWidthChange ? (
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize diff column"
					title="Resize diff"
					className="absolute right-0 top-0 z-20 h-full w-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-accent/40"
					onPointerDown={(event) => {
						startHorizontalResize({ event, width, minWidth, maxWidth, resizeFrom: "right", onWidthChange });
					}}
				/>
			) : null}
			<header className="flex h-10 shrink-0 items-center gap-2 border-b border-divider px-3">
				<FileText size={14} className="shrink-0 text-text-tertiary" />
				<span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-text-primary" title={file?.path}>
					{file?.path ?? (isLoading ? "Loading diff" : "Diff")}
				</span>
				{file ? <FileStatusGlyph status={file.status} /> : null}
				<Button
					variant="ghost"
					size="sm"
					icon={<ChevronRight size={14} />}
					aria-label="Close diff column"
					title="Close diff"
					onClick={onClose}
				/>
			</header>
			<div className="min-h-0 flex-1 overflow-auto p-2">
				{isLoading ? (
					<div className="grid gap-2 rounded-md border border-border bg-surface-0 p-3">
						<div className="kb-skeleton h-4 w-2/5" />
						<div className="kb-skeleton h-32 w-full" />
						<div className="kb-skeleton h-24 w-full" />
					</div>
				) : file ? (
					<div className="overflow-hidden rounded-md border border-border bg-surface-0">
						<ReadOnlyDiff file={file} />
					</div>
				) : (
					<EmptyState title="Select a file">Choose a changed file to inspect its diff.</EmptyState>
				)}
			</div>
		</section>
	);
}

export function VcsFileListEmpty(): React.ReactElement {
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-12 text-text-tertiary">
			<FolderOpen size={40} />
		</div>
	);
}

export function findFileByPath(files: VcsFileChange[], path: string | null): VcsFileChange | null {
	if (!path) {
		return null;
	}
	return files.find((file) => file.path === path) ?? null;
}

export function getFirstFilePath(files: VcsFileChange[]): string | null {
	return files[0]?.path ?? null;
}

export function getFileChangeKey(file: VcsFileChange): string {
	return fileKey(file);
}
