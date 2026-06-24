import { FileListing, FileListingViewModeToggle } from "@changeyard/web-ui";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, FolderOpen, X } from "lucide-react";
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useMemo } from "react";

import { parsePatchToHunks, parsePatchToRows, ReadOnlyUnifiedDiff, type UnifiedDiffHunk } from "@/components/shared/diff-renderer";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FileTypeIcon } from "@/components/ui/file-type-icon";
import { FileStatusGlyph } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/vcs-panels";
import { clampNumber, type VcsFileViewMode } from "@/utils/vcs-ui-preferences";

export type VcsColumnId = "refs" | "commits" | "operations" | "stack" | "unstaged" | "pull-request";

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
	headerActions,
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
	headerActions?: React.ReactNode;
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
				{headerActions ? <div className="ml-auto flex shrink-0 items-center gap-2">{headerActions}</div> : null}
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

function VcsFileStats({
	file,
	isSelected,
}: {
	file: VcsFileChange;
	isSelected: boolean;
}): React.ReactElement | null {
	if ((file.additions ?? 0) <= 0 && (file.deletions ?? 0) <= 0) {
		return null;
	}

	return (
		<span className="ml-auto flex shrink-0 gap-1 font-mono text-[10px]">
			{(file.additions ?? 0) > 0 ? <span className={isSelected ? "text-text-primary" : "text-status-green"}>+{file.additions}</span> : null}
			{(file.deletions ?? 0) > 0 ? <span className={isSelected ? "text-text-primary" : "text-status-red"}>-{file.deletions}</span> : null}
		</span>
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
	onFileDragStart,
	collapsed = false,
	onCollapsedChange,
	className,
	conflictPaths,
	fillHeight = false,
}: {
	title?: string;
	files: VcsFileChange[];
	selectedPath: string | null;
	isLoading?: boolean;
	errorMessage?: string | null;
	viewMode: VcsFileViewMode;
	onViewModeChange: (mode: VcsFileViewMode) => void;
	onSelectPath: (path: string) => void;
	onFileDragStart?: (event: ReactDragEvent<HTMLButtonElement>, file: VcsFileChange) => void;
	collapsed?: boolean;
	onCollapsedChange?: (collapsed: boolean) => void;
	className?: string;
	conflictPaths?: ReadonlySet<string>;
	fillHeight?: boolean;
}): React.ReactElement {
	const additions = files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
	const deletions = files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
	const conflictCount = conflictPaths ? files.filter((file) => conflictPaths.has(file.path)).length : 0;
	const conflictPathValues = useMemo(() => Array.from(conflictPaths ?? []), [conflictPaths]);
	function hasConflict(path: string): boolean {
		return Boolean(conflictPaths?.has(path));
	}
	function directoryHasConflict(path: string): boolean {
		return conflictPathValues.some((conflictPath) => conflictPath === path || conflictPath.startsWith(`${path}/`));
	}
	const headerContent = (
		<>
			{collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
			<span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{title}</span>
			<span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold">{files.length}</span>
			{conflictCount > 0 ? (
				<span className="inline-flex items-center gap-1 rounded-full border border-status-red/35 bg-status-red/10 px-1.5 py-0.5 text-[11px] font-semibold text-status-red">
					<AlertTriangle size={11} />
					{conflictCount}
				</span>
			) : null}
			{additions > 0 ? <span className="text-[12px] font-medium text-status-green">+{additions}</span> : null}
			{deletions > 0 ? <span className="text-[12px] font-medium text-status-red">-{deletions}</span> : null}
			<FileListingViewModeToggle mode={viewMode} onModeChange={onViewModeChange} />
		</>
	);

	return (
		<div className={cn("mx-2 mb-2 rounded-lg border border-divider bg-surface-0", fillHeight && "flex min-h-0 flex-col", className)}>
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
			{collapsed ? null : <div className={cn("border-t border-divider", fillHeight && "min-h-0 flex-1")}>
				{isLoading ? (
					<FileRowsSkeleton />
				) : errorMessage ? (
					<div className="px-2 py-2 text-[12px] text-status-red">{errorMessage}</div>
				) : files.length === 0 ? (
					<div className="px-2 py-2 text-[12px] text-text-tertiary">No changed files.</div>
				) : (
					<div className={cn("overflow-y-auto px-1 py-1", fillHeight ? "h-full" : "max-h-[250px]")}>
						<FileListing
							files={files}
							mode={viewMode}
							selectedPath={selectedPath}
							onSelectPath={onSelectPath}
							getFileKey={fileKey}
							fileRowTestId="vcs-file-row"
							directoryRowTestId="vcs-directory-row"
							onFileDragStart={onFileDragStart}
							getFileRowClassName={({ path, isSelected }) =>
								cn(hasConflict(path) && "kb-file-tree-row-conflict", hasConflict(path) && isSelected && "ring-1 ring-status-red/60")
							}
							getDirectoryRowClassName={({ node }) => cn(directoryHasConflict(node.path) && "kb-file-tree-row-conflict")}
							renderFileLeading={({ file, mode }) => (mode === "list" ? <FileStatusGlyph status={file.status} /> : null)}
							renderFileLabel={({ path, name, mode }) => (
								<span className="min-w-0 flex-1 truncate">{mode === "list" ? path : name}</span>
							)}
							renderFileMeta={({ file, path, isSelected }) => (
								<>
									<VcsFileStats file={file} isSelected={isSelected} />
									{hasConflict(path) ? <AlertTriangle size={16} className="ml-auto shrink-0 text-status-red" /> : null}
								</>
							)}
							renderDirectoryMeta={({ node }) =>
								directoryHasConflict(node.path) ? (
									<AlertTriangle size={16} className="ml-auto shrink-0 text-status-red" />
								) : null
							}
						/>
					</div>
				)}
			</div>}
		</div>
	);
}

export type VcsDiffHunkDragPayload = {
	path: string;
	hunkId: string;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
};

function hunkDragPayload(file: VcsFileChange, hunk: UnifiedDiffHunk): VcsDiffHunkDragPayload {
	return {
		path: file.path,
		hunkId: `${file.path}:${hunk.id}`,
		oldStart: hunk.oldStart,
		oldLines: hunk.oldLines,
		newStart: hunk.newStart,
		newLines: hunk.newLines,
	};
}

function ReadOnlyDiff({
	file,
	onHunkDragStart,
}: {
	file: VcsFileChange;
	onHunkDragStart?: (event: ReactDragEvent<HTMLDivElement>, hunk: VcsDiffHunkDragPayload) => void;
}): React.ReactElement {
	if (onHunkDragStart) {
		const hunks = parsePatchToHunks(file.patch ?? "");
		if (hunks.length === 0) {
			return <div className="px-3 py-3 text-[12px] text-text-tertiary">No textual diff available.</div>;
		}
		return (
			<div className="grid gap-2 p-2">
				{hunks.map((hunk) => {
					const payload = hunkDragPayload(file, hunk);
					return (
						<div
							key={hunk.id}
							data-testid="vcs-diff-hunk"
							data-file-path={file.path}
							data-hunk-id={payload.hunkId}
							draggable
							className="overflow-hidden rounded-md border border-divider bg-surface-0 transition-shadow hover:border-accent/40 hover:shadow-sm"
							onDragStart={(event) => onHunkDragStart(event, payload)}
						>
							<div className="border-b border-divider bg-surface-1 px-2 py-1 font-mono text-[11px] text-text-secondary">
								{hunk.header}
							</div>
							<ReadOnlyUnifiedDiff rows={hunk.rows} path={file.path} />
						</div>
					);
				})}
			</div>
		);
	}
	const rows = parsePatchToRows(file.patch ?? "");
	if (rows.length === 0) {
		return <div className="px-3 py-3 text-[12px] text-text-tertiary">No textual diff available.</div>;
	}
	return <ReadOnlyUnifiedDiff rows={rows} path={file.path} />;
}

export function VcsFileDiffContent({
	file,
	onHunkDragStart,
}: {
	file: VcsFileChange | null;
	onHunkDragStart?: (event: ReactDragEvent<HTMLDivElement>, hunk: VcsDiffHunkDragPayload) => void;
}): React.ReactElement {
	return file ? (
		<div className="overflow-hidden rounded-md border border-border bg-surface-0">
			<ReadOnlyDiff file={file} onHunkDragStart={onHunkDragStart} />
		</div>
	) : (
		<EmptyState title="Select a file">Choose a changed file to inspect its diff.</EmptyState>
	);
}

export function VcsFileDiffColumn({
	file,
	isLoading = false,
	width = 640,
	minWidth = 420,
	maxWidth = 980,
	onWidthChange,
	onClose,
	onHunkDragStart,
	topContent,
	content,
}: {
	file: VcsFileChange | null;
	isLoading?: boolean;
	width?: number;
	minWidth?: number;
	maxWidth?: number;
	onWidthChange?: (width: number) => void;
	onClose: () => void;
	onHunkDragStart?: (event: ReactDragEvent<HTMLDivElement>, hunk: VcsDiffHunkDragPayload) => void;
	topContent?: ReactNode;
	content?: ReactNode;
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
			{topContent}
			<header className="flex h-10 shrink-0 items-center gap-2 border-b border-divider px-3">
				{file ? <FileTypeIcon path={file.path} title={file.path} /> : <FileTypeIcon path="diff" />}
				<span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-text-primary" title={file?.path}>
					{file?.path ?? (isLoading ? "Loading diff" : "Diff")}
				</span>
				{file ? <FileStatusGlyph status={file.status} /> : null}
				<Button
					variant="ghost"
					size="sm"
					icon={<X size={14} />}
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
				) : content ? (
					content
				) : file ? (
					<VcsFileDiffContent file={file} onHunkDragStart={onHunkDragStart} />
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
