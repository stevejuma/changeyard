import { Check, ChevronDown, ChevronRight, Command, CornerDownLeft, MessageSquare, Pencil, X } from "lucide-react";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MarkdownMessageEditor, MarkdownMessagePreview } from "./markdown-message-editor";
import {
	buildDisplayItems,
	buildUnifiedDiffRows,
	CollapsedBlockControls,
	DiffRowText,
	getHighlightedLineHtml,
	resolvePrismGrammar,
	resolvePrismLanguage,
	truncatePathMiddle,
	type UnifiedDiffRow,
	useIncrementalExpand,
} from "./diff-renderer";
import { Button } from "./button";
import { buildFileTree } from "./file-tree";
import { authorInitial } from "./display";

export type ReviewDiffFileStatus = "modified" | "added" | "deleted" | "renamed";

export interface ReviewDiffFileChange {
	path: string;
	previousPath?: string;
	status: ReviewDiffFileStatus;
	oldText: string | null;
	newText: string | null;
	additions: number;
	deletions: number;
}

interface FileDiffGroup {
	path: string;
	entries: Array<{
		id: string;
		isBinary: boolean;
		oldText: string | null;
		newText: string;
	}>;
	added: number;
	removed: number;
}

export interface DiffLineComment {
	id?: string;
	filePath: string;
	lineNumber: number;
	lineText: string;
	variant: "added" | "removed" | "context";
	comment: string;
	author?: string | null;
	authorAvatarUrl?: string | null;
	authorAssociation?: string | null;
	createdAt?: string | null;
	url?: string | null;
	readOnly?: boolean;
}

export interface DiffLineScrollTarget {
	path: string;
	lineNumber: number;
	variant?: DiffLineComment["variant"];
	nonce: number;
}

export type DiffViewMode = "unified" | "split";

const INITIAL_DIFF_SECTION_BATCH_SIZE = 2;
const DIFF_SECTION_RENDER_BATCH_SIZE = 4;
const DIFF_SECTION_RENDER_BATCH_DELAY_MS = 50;

const BINARY_FILE_EXTENSIONS = new Set([
	"avif",
	"bmp",
	"gif",
	"gz",
	"ico",
	"jpeg",
	"jpg",
	"mov",
	"mp3",
	"mp4",
	"pdf",
	"png",
	"tar",
	"tgz",
	"webm",
	"webp",
	"zip",
]);

const isMacPlatform =
	typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

function isBinaryFilePath(filePath: string): boolean {
	const normalizedPath = filePath.replaceAll("\\", "/");
	const basename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
	const dotIndex = basename.lastIndexOf(".");
	if (dotIndex < 0 || dotIndex === basename.length - 1) {
		return false;
	}
	return BINARY_FILE_EXTENSIONS.has(basename.slice(dotIndex + 1).toLowerCase());
}

function commentKey(filePath: string, lineNumber: number, variant: DiffLineComment["variant"]): string {
	return `${filePath}:${variant}:${lineNumber}`;
}

function commentRenderKey(comment: DiffLineComment, index: number): string {
	return comment.id ?? `${comment.filePath}:${comment.variant}:${comment.lineNumber}:${index}`;
}

function formatCommentsForTerminal(comments: DiffLineComment[]): string {
	const lines: string[] = [];
	for (const comment of comments) {
		lines.push(`${comment.filePath}:${comment.lineNumber} | ${comment.lineText}`);
		for (const commentLine of comment.comment.split("\n")) {
			lines.push(`> ${commentLine}`);
		}
		lines.push("");
	}
	return lines.join("\n").trimEnd();
}

function formatCommentDate(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
	});
}

function flattenFilePathsForDisplay(paths: string[]): string[] {
	const tree = buildFileTree(paths);
	const ordered: string[] = [];

	function walk(nodes: ReturnType<typeof buildFileTree>): void {
		for (const node of nodes) {
			if (node.type === "file") {
				ordered.push(node.path);
				continue;
			}
			walk(node.children);
		}
	}

	walk(tree);
	return ordered;
}

function getSectionTopWithinScrollContainer(container: HTMLElement, section: HTMLElement): number {
	const containerRect = container.getBoundingClientRect();
	const sectionRect = section.getBoundingClientRect();
	return container.scrollTop + sectionRect.top - (containerRect.top + container.clientTop);
}

function InlineComment({
	comment,
	onChange,
	onDelete,
	onInsertRequiredChange,
}: {
	comment: DiffLineComment;
	onChange?: (text: string) => void;
	onDelete?: () => void;
	onInsertRequiredChange?: (comment: DiffLineComment) => void;
}): React.ReactElement {
	const [draft, setDraft] = useState(comment.comment);
	const [isEditing, setEditing] = useState(comment.comment.trim().length === 0);
	const lineSide = comment.variant === "removed" ? "L" : "R";
	const lineLabel = `${lineSide}${comment.lineNumber}`;
	const canSubmit = draft.trim().length > 0;
	const readOnly = comment.readOnly || !onChange || !onDelete;

	useEffect(() => {
		setDraft(comment.comment);
		if (!readOnly && comment.comment.trim().length === 0) {
			setEditing(true);
		}
	}, [comment.comment, readOnly]);

	if (!isEditing && comment.comment.trim().length > 0) {
		const author = comment.author?.trim() || null;
		const date = formatCommentDate(comment.createdAt);
		return (
			<div className="kb-diff-inline-comment">
				<div className="rounded-md border border-border bg-surface-0">
					<div className="flex items-center justify-between gap-2 border-b border-divider bg-surface-1 px-3 py-2">
						<div className="flex min-w-0 items-center gap-2 text-xs text-text-secondary">
							{comment.authorAvatarUrl ? (
								<img
									src={comment.authorAvatarUrl}
									alt={author ? `${author} avatar` : "Comment author avatar"}
									className="h-5 w-5 shrink-0 rounded-full border border-border bg-surface-2 object-cover"
								/>
							) : author ? (
								<span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-[10px] font-semibold">
									{authorInitial(author)}
								</span>
							) : null}
							<span className="min-w-0 truncate">
								{author ? <span className="font-semibold text-text-primary">{author}</span> : "Comment"}
								<span> on line {lineLabel}</span>
								{date ? <span className="text-text-tertiary"> · {date}</span> : null}
							</span>
						</div>
						{comment.authorAssociation ? (
							<span className="shrink-0 rounded-full border border-border bg-surface-1 px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">
								{comment.authorAssociation}
							</span>
						) : null}
						{!readOnly ? (
						<div className="flex shrink-0 gap-1">
							<Button
								variant="ghost"
								size="sm"
								icon={<Pencil size={13} />}
								aria-label={`Edit comment on line ${lineLabel}`}
								onClick={() => setEditing(true)}
								className="h-7 px-2"
							/>
							<Button
								variant="ghost"
								size="sm"
								icon={<X size={13} />}
								aria-label={`Delete comment on line ${lineLabel}`}
								onClick={onDelete}
								className="h-7 px-2 text-status-red"
							/>
						</div>
						) : null}
					</div>
					<div className="px-3 py-2">
						<MarkdownMessagePreview value={comment.comment} emptyLabel="" className="text-sm" />
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="kb-diff-inline-comment">
			<div className="rounded-md border border-border bg-surface-0">
				<div className="border-b border-divider bg-surface-1 px-3 py-2 text-sm font-medium text-text-primary">
					Add a comment on line {lineLabel}
				</div>
				<div className="p-2">
					<MarkdownMessageEditor
						value={draft}
						onChange={setDraft}
						height="140px"
						placeholder="Add a comment..."
						autoFocus
						onEscape={onDelete}
						className="cy-markdown-editor-compact"
					/>
					<div className="mt-2 flex items-center justify-end gap-2">
						<Button variant="default" size="sm" onClick={onDelete}>
							Cancel
						</Button>
						<Button
							variant="default"
							size="sm"
							icon={<MessageSquare size={13} />}
							disabled={!canSubmit}
								onClick={() => {
									const text = draft.trim();
									if (!text) {
										return;
									}
									onChange?.(text);
									setDraft(text);
									setEditing(false);
								}}
						>
							Comment
						</Button>
						{onInsertRequiredChange ? (
							<Button
								variant="primary"
								size="sm"
								icon={<Check size={13} />}
								disabled={!canSubmit}
								onClick={() => {
									const text = draft.trim();
									if (!text) {
										return;
									}
									onInsertRequiredChange({ ...comment, comment: text });
								}}
							>
								Insert changes
							</Button>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

const UnifiedDiff = memo(function UnifiedDiff({
	path,
	oldText,
	newText,
	comments,
	commentsByLine,
	onAddComment,
	onUpdateComment,
	onDeleteComment,
	onInsertRequiredChange,
}: {
	path: string;
	oldText: string | null | undefined;
	newText: string;
	comments: Map<string, DiffLineComment>;
	commentsByLine: Map<string, DiffLineComment[]>;
	onAddComment: (
		filePath: string,
		lineNumber: number,
		lineText: string,
		variant: "added" | "removed" | "context",
	) => void;
	onUpdateComment: (
		filePath: string,
		lineNumber: number,
		variant: "added" | "removed" | "context",
		text: string,
	) => void;
	onDeleteComment: (
		filePath: string,
		lineNumber: number,
		variant: "added" | "removed" | "context",
	) => void;
	onInsertRequiredChange?: (comment: DiffLineComment) => void;
}): React.ReactElement {
	const { expandedBlocks, expandTop, expandBottom, expandAll } = useIncrementalExpand();
	const prismLanguage = useMemo(() => resolvePrismLanguage(path), [path]);
	const prismGrammar = useMemo(() => resolvePrismGrammar(prismLanguage), [prismLanguage]);
	const rows = useMemo(() => buildUnifiedDiffRows(oldText, newText), [oldText, newText]);
	const displayItems = useMemo(() => buildDisplayItems(rows, expandedBlocks), [expandedBlocks, rows]);

	const renderRow = (row: UnifiedDiffRow): React.ReactElement => {
		const rowKey = row.lineNumber != null ? commentKey(path, row.lineNumber, row.variant) : null;
		const rowComments = rowKey ? commentsByLine.get(rowKey) ?? [] : [];
		const hasComment = rowComments.length > 0;
		const baseClass =
			row.variant === "added"
				? "kb-diff-row kb-diff-row-added"
				: row.variant === "removed"
					? "kb-diff-row kb-diff-row-removed"
					: "kb-diff-row kb-diff-row-context";
		const rowClass = hasComment ? `${baseClass} kb-diff-row-commented` : baseClass;
		const canClickRow = row.lineNumber != null && !hasComment;
		const highlightedLineHtml = row.segments ? null : getHighlightedLineHtml(row.text, prismGrammar, prismLanguage);

		const handleRowClick =
			row.lineNumber != null && !hasComment
				? () => {
						onAddComment(path, row.lineNumber!, row.text, row.variant);
					}
				: undefined;

		return (
			<div key={row.key}>
				<div
					className={rowClass}
					data-diff-line-number={row.lineNumber ?? undefined}
					data-diff-line-variant={row.lineNumber == null ? undefined : row.variant}
					style={canClickRow ? undefined : { cursor: "default" }}
					onClick={handleRowClick}
				>
					<span className="kb-diff-line-number" style={{ color: "var(--color-text-tertiary)" }}>
						<span className="kb-diff-line-number-text">{row.lineNumber ?? ""}</span>
						{row.lineNumber != null ? (
							<span
								className="kb-diff-comment-gutter"
								onClick={
									hasComment
										? (event) => {
												event.stopPropagation();
												onDeleteComment(path, row.lineNumber!, row.variant);
											}
										: undefined
								}
								style={hasComment ? { cursor: "pointer" } : undefined}
							>
								<span className="kb-diff-gutter-icon-comment">
									<MessageSquare size={12} />
								</span>
								<span className="kb-diff-gutter-icon-delete">
									<X size={12} className="text-status-red" />
								</span>
							</span>
						) : null}
					</span>
					<DiffRowText
						row={row}
						highlightedLineHtml={highlightedLineHtml}
						grammar={prismGrammar}
						language={prismLanguage}
					/>
				</div>
				{rowComments.map((comment, index) => (
					<InlineComment
						key={commentRenderKey(comment, index)}
						comment={comment}
						onChange={
							comment.readOnly ? undefined : (text) => onUpdateComment(path, row.lineNumber!, row.variant, text)
						}
						onDelete={comment.readOnly ? undefined : () => onDeleteComment(path, row.lineNumber!, row.variant)}
						onInsertRequiredChange={comment.readOnly ? undefined : onInsertRequiredChange}
					/>
				))}
			</div>
		);
	};

	return (
		<>
			{displayItems.map((item) => {
				if (item.type === "row") {
					return renderRow(item.row);
				}

				return (
					<div key={item.block.id}>
						<CollapsedBlockControls
							block={item.block}
							onExpandTop={expandTop}
							onExpandBottom={expandBottom}
							onExpandAll={expandAll}
						/>
						{item.block.expanded ? item.block.rows.map((row) => renderRow(row)) : null}
					</div>
				);
			})}
		</>
	);
});

interface SplitDiffRowPair {
	key: string;
	left: UnifiedDiffRow | null;
	right: UnifiedDiffRow | null;
}

function pairRowsForSplit(rows: UnifiedDiffRow[]): SplitDiffRowPair[] {
	const pairs: SplitDiffRowPair[] = [];
	let index = 0;
	while (index < rows.length) {
		const row = rows[index];
		if (!row) {
			index += 1;
			continue;
		}

		if (row.variant === "removed") {
			// Collect contiguous removed block
			const removedStart = index;
			while (index < rows.length && rows[index]!.variant === "removed") {
				index += 1;
			}
			const removedBlock = rows.slice(removedStart, index);

			// Collect contiguous added block immediately following
			const addedStart = index;
			while (index < rows.length && rows[index]!.variant === "added") {
				index += 1;
			}
			const addedBlock = rows.slice(addedStart, index);

			// Pair positionally
			const pairCount = Math.max(removedBlock.length, addedBlock.length);
			for (let pi = 0; pi < pairCount; pi += 1) {
				const left = removedBlock[pi] ?? null;
				const right = addedBlock[pi] ?? null;
				const key =
					left && right
						? `pair-${left.key}-${right.key}`
						: left
							? `pair-left-${left.key}`
							: `pair-right-${right!.key}`;
				pairs.push({ key, left, right });
			}
			continue;
		}

		if (row.variant === "added") {
			pairs.push({
				key: `pair-right-${row.key}`,
				left: null,
				right: row,
			});
			index += 1;
			continue;
		}

		pairs.push({
			key: `pair-context-${row.key}`,
			left: row,
			right: row,
		});
		index += 1;
	}

	return pairs;
}

function isCommentableOnSplitSide(row: UnifiedDiffRow, side: "left" | "right"): boolean {
	if (row.variant === "removed") {
		return side === "left";
	}
	if (row.variant === "added") {
		return side === "right";
	}
	return side === "right";
}

const SplitDiff = memo(function SplitDiff({
	path,
	oldText,
	newText,
	comments,
	commentsByLine,
	onAddComment,
	onUpdateComment,
	onDeleteComment,
	onInsertRequiredChange,
}: {
	path: string;
	oldText: string | null | undefined;
	newText: string;
	comments: Map<string, DiffLineComment>;
	commentsByLine: Map<string, DiffLineComment[]>;
	onAddComment: (
		filePath: string,
		lineNumber: number,
		lineText: string,
		variant: "added" | "removed" | "context",
	) => void;
	onUpdateComment: (
		filePath: string,
		lineNumber: number,
		variant: "added" | "removed" | "context",
		text: string,
	) => void;
	onDeleteComment: (
		filePath: string,
		lineNumber: number,
		variant: "added" | "removed" | "context",
	) => void;
	onInsertRequiredChange?: (comment: DiffLineComment) => void;
}): React.ReactElement {
	const { expandedBlocks, expandTop, expandBottom, expandAll } = useIncrementalExpand();
	const prismLanguage = useMemo(() => resolvePrismLanguage(path), [path]);
	const prismGrammar = useMemo(() => resolvePrismGrammar(prismLanguage), [prismLanguage]);
	const rows = useMemo(() => buildUnifiedDiffRows(oldText, newText), [oldText, newText]);
	const displayItems = useMemo(() => buildDisplayItems(rows, expandedBlocks), [expandedBlocks, rows]);

	const renderSide = (row: UnifiedDiffRow, side: "left" | "right"): React.ReactElement => {
		const rowLineNumber = row.lineNumber;
		if (rowLineNumber == null) {
			return <></>;
		}

		const canCommentOnSide = isCommentableOnSplitSide(row, side);
		const rowKey = canCommentOnSide ? commentKey(path, rowLineNumber, row.variant) : null;
		const rowComments = rowKey ? commentsByLine.get(rowKey) ?? [] : [];
		const hasComment = rowComments.length > 0;
		const baseClass =
			row.variant === "added"
				? "kb-diff-row kb-diff-row-added"
				: row.variant === "removed"
					? "kb-diff-row kb-diff-row-removed"
					: "kb-diff-row kb-diff-row-context";
		const rowClass = hasComment
			? `${baseClass} kb-diff-row-commented`
			: canCommentOnSide
				? baseClass
				: `${baseClass} kb-diff-row-noncommentable`;
		const canClickRow = canCommentOnSide && !hasComment;
		const highlightedLineHtml = getHighlightedLineHtml(row.text, prismGrammar, prismLanguage);

		return (
			<div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
				<div
					className={rowClass}
					data-diff-line-number={rowLineNumber}
					data-diff-line-variant={row.variant}
					style={canClickRow ? undefined : { cursor: "default" }}
					onClick={
						canClickRow
							? () => {
									onAddComment(path, rowLineNumber, row.text, row.variant);
								}
							: undefined
					}
				>
					<span className="kb-diff-line-number" style={{ color: "var(--color-text-tertiary)" }}>
						<span className="kb-diff-line-number-text">{rowLineNumber}</span>
						{canCommentOnSide ? (
							<span
								className="kb-diff-comment-gutter"
								onClick={
									hasComment
										? (event) => {
												event.stopPropagation();
												onDeleteComment(path, rowLineNumber, row.variant);
											}
										: undefined
								}
								style={hasComment ? { cursor: "pointer" } : undefined}
							>
								<span className="kb-diff-gutter-icon-comment">
									<MessageSquare size={12} />
								</span>
								<span className="kb-diff-gutter-icon-delete">
									<X size={12} className="text-status-red" />
								</span>
							</span>
						) : null}
					</span>
					<DiffRowText
						row={row}
						highlightedLineHtml={highlightedLineHtml}
						grammar={prismGrammar}
						language={prismLanguage}
					/>
				</div>
				{rowComments.map((comment, index) => (
					<InlineComment
						key={commentRenderKey(comment, index)}
						comment={comment}
						onChange={comment.readOnly ? undefined : (text) => onUpdateComment(path, rowLineNumber, row.variant, text)}
						onDelete={comment.readOnly ? undefined : () => onDeleteComment(path, rowLineNumber, row.variant)}
						onInsertRequiredChange={comment.readOnly ? undefined : onInsertRequiredChange}
					/>
				))}
			</div>
		);
	};

	const renderPairs = (sourceRows: UnifiedDiffRow[]): React.ReactElement[] => {
		const pairs = pairRowsForSplit(sourceRows);
		return pairs.map((pair) => (
			<div key={pair.key} className="kb-diff-split-grid-row">
				<div
					className={`kb-diff-split-cell ${pair.left ? "kb-diff-split-cell-filled" : "kb-diff-split-cell-placeholder"}`}
				>
					{pair.left ? renderSide(pair.left, "left") : null}
				</div>
				<div
					className={`kb-diff-split-cell kb-diff-split-cell-right ${pair.right ? "kb-diff-split-cell-filled" : "kb-diff-split-cell-placeholder"}`}
				>
					{pair.right ? renderSide(pair.right, "right") : null}
				</div>
			</div>
		));
	};

	const renderDisplayItems = (): React.ReactElement[] => {
		const renderedItems: React.ReactElement[] = [];
		let pendingRows: UnifiedDiffRow[] = [];

		const flushPendingRows = (): void => {
			if (pendingRows.length === 0) {
				return;
			}
			renderedItems.push(...renderPairs(pendingRows));
			pendingRows = [];
		};

		for (const item of displayItems) {
			if (item.type === "row") {
				pendingRows.push(item.row);
				continue;
			}

			flushPendingRows();
			renderedItems.push(
				<div key={item.block.id}>
					<div className="kb-diff-split-grid-row">
						<div className="kb-diff-split-cell kb-diff-split-cell-filled">
							<CollapsedBlockControls
								block={item.block}
								onExpandTop={expandTop}
								onExpandBottom={expandBottom}
								onExpandAll={expandAll}
							/>
						</div>
						<div className="kb-diff-split-cell kb-diff-split-cell-filled kb-diff-split-cell-right">
							<CollapsedBlockControls
								block={item.block}
								onExpandTop={expandTop}
								onExpandBottom={expandBottom}
								onExpandAll={expandAll}
							/>
						</div>
					</div>
					{item.block.expanded ? renderPairs(item.block.rows) : null}
				</div>,
			);
		}

		flushPendingRows();
		return renderedItems;
	};

	return (
		<div className="kb-diff-split-grid-shell">
			<div className="kb-diff-split-grid-backgrounds" aria-hidden>
				<div className="kb-diff-split-grid-background-column" />
				<div className="kb-diff-split-grid-background-column kb-diff-split-grid-background-column-right" />
			</div>
			<div className="kb-diff-split-grid-content">{renderDisplayItems()}</div>
		</div>
	);
});

export function DiffViewerPanel({
	workspaceFiles,
	selectedPath,
	onSelectedPathChange,
	onAddToTerminal,
	onSendToTerminal,
	comments,
	onCommentsChange,
	readOnlyComments = [],
	onInsertRequiredChange,
	scrollTarget,
	viewMode = "unified",
	useInternalScroll = true,
}: {
	workspaceFiles: ReviewDiffFileChange[] | null;
	selectedPath: string | null;
	onSelectedPathChange: (path: string) => void;
	onAddToTerminal?: (formatted: string) => void;
	onSendToTerminal?: (formatted: string) => void;
	comments: Map<string, DiffLineComment>;
	onCommentsChange: (comments: Map<string, DiffLineComment>) => void;
	readOnlyComments?: readonly DiffLineComment[];
	onInsertRequiredChange?: (comment: DiffLineComment) => void;
	scrollTarget?: DiffLineScrollTarget | null;
	viewMode?: DiffViewMode;
	useInternalScroll?: boolean;
}): React.ReactElement {
	const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const sectionElementsRef = useRef<Record<string, HTMLElement | null>>({});
	const scrollSyncSelectionRef = useRef<{ path: string; at: number } | null>(null);
	const suppressScrollSyncUntilRef = useRef(0);
	const programmaticScrollUntilRef = useRef(0);
	const programmaticScrollClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const highlightClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const scrollSyncFrameRef = useRef<number | null>(null);
	const scrollSyncPendingRef = useRef(false);
	const pendingPathScrollRef = useRef<string | null>(null);
	const [renderedGroupCount, setRenderedGroupCount] = useState(INITIAL_DIFF_SECTION_BATCH_SIZE);

	const diffEntries = useMemo(() => {
		return (workspaceFiles ?? []).map((file, index) => ({
			id: `workspace-${file.path}-${index}`,
			path: file.path,
			isBinary: isBinaryFilePath(file.path),
			oldText: file.oldText,
			newText: file.newText ?? "",
			additions: file.additions,
			deletions: file.deletions,
			timestamp: 0,
			toolTitle: `${file.status} (${file.additions}+/${file.deletions}-)`,
		}));
	}, [workspaceFiles]);

	const groupedByPath = useMemo((): FileDiffGroup[] => {
		const sourcePaths = workspaceFiles?.map((file) => file.path) ?? [];
		const orderedPaths = flattenFilePathsForDisplay(sourcePaths);
		const orderIndex = new Map(orderedPaths.map((path, index) => [path, index]));
		const map = new Map<string, FileDiffGroup>();
		for (const entry of diffEntries) {
			let group = map.get(entry.path);
			if (!group) {
				group = {
					path: entry.path,
					entries: [],
					added: 0,
					removed: 0,
				};
				map.set(entry.path, group);
			}
			group.entries.push({
				id: entry.id,
				isBinary: entry.isBinary,
				oldText: entry.oldText,
				newText: entry.newText,
			});
			if (!entry.isBinary) {
				group.added += entry.additions;
				group.removed += entry.deletions;
			}
		}
		return Array.from(map.values()).sort((a, b) => {
			const aIndex = orderIndex.get(a.path) ?? Number.MAX_SAFE_INTEGER;
			const bIndex = orderIndex.get(b.path) ?? Number.MAX_SAFE_INTEGER;
			if (aIndex !== bIndex) {
				return aIndex - bIndex;
			}
			return a.path.localeCompare(b.path);
		});
	}, [diffEntries, workspaceFiles]);

	const visibleGroups = useMemo(
		() => groupedByPath.slice(0, Math.min(renderedGroupCount, groupedByPath.length)),
		[groupedByPath, renderedGroupCount],
	);
	const commentsByLine = useMemo(() => {
		const next = new Map<string, DiffLineComment[]>();
		for (const comment of comments.values()) {
			const key = commentKey(comment.filePath, comment.lineNumber, comment.variant);
			next.set(key, [...(next.get(key) ?? []), comment]);
		}
		for (const comment of readOnlyComments) {
			const variants: DiffLineComment["variant"][] =
				comment.variant === "removed" ? ["removed"] : ["added", "context"];
			for (const variant of variants) {
				const key = commentKey(comment.filePath, comment.lineNumber, variant);
				next.set(key, [...(next.get(key) ?? []), { ...comment, variant, readOnly: true }]);
			}
		}
		return next;
	}, [comments, readOnlyComments]);

	useEffect(() => {
		setRenderedGroupCount(Math.min(INITIAL_DIFF_SECTION_BATCH_SIZE, groupedByPath.length));
	}, [groupedByPath]);

	useEffect(() => {
		if (renderedGroupCount >= groupedByPath.length) {
			return;
		}
		const timer = window.setTimeout(() => {
			setRenderedGroupCount((current) => Math.min(current + DIFF_SECTION_RENDER_BATCH_SIZE, groupedByPath.length));
		}, DIFF_SECTION_RENDER_BATCH_DELAY_MS);
		return () => {
			window.clearTimeout(timer);
		};
	}, [groupedByPath.length, renderedGroupCount]);

	useEffect(() => {
		if (!selectedPath) {
			return;
		}
		const selectedIndex = groupedByPath.findIndex((group) => group.path === selectedPath);
		if (selectedIndex < 0 || selectedIndex < renderedGroupCount) {
			return;
		}
		pendingPathScrollRef.current = selectedPath;
		setRenderedGroupCount(Math.min(selectedIndex + 1, groupedByPath.length));
	}, [groupedByPath, renderedGroupCount, selectedPath]);

	const resolveActivePath = useCallback((): string | null => {
		if (!useInternalScroll) {
			return null;
		}
		const container = scrollContainerRef.current;
		if (!container || groupedByPath.length === 0) {
			return null;
		}

		const probeOffset = container.scrollTop + 80;
		let activePath = groupedByPath[0]?.path ?? null;
		for (const group of groupedByPath) {
			const section = sectionElementsRef.current[group.path];
			if (!section) {
				continue;
			}
			if (getSectionTopWithinScrollContainer(container, section) <= probeOffset) {
				activePath = group.path;
				continue;
			}
			break;
		}

		return activePath;
	}, [groupedByPath, useInternalScroll]);

	const syncSelectedPathToScrollPosition = useCallback(() => {
		if (Date.now() < programmaticScrollUntilRef.current) {
			return;
		}
		if (Date.now() < suppressScrollSyncUntilRef.current) {
			return;
		}
		const activePath = resolveActivePath();
		if (!activePath || activePath === selectedPath) {
			return;
		}

		scrollSyncSelectionRef.current = {
			path: activePath,
			at: Date.now(),
		};
		onSelectedPathChange(activePath);
	}, [onSelectedPathChange, resolveActivePath, selectedPath]);

	const handleDiffScroll = useCallback(() => {
		if (!useInternalScroll) {
			return;
		}
		if (scrollSyncPendingRef.current) {
			return;
		}
		scrollSyncPendingRef.current = true;
		scrollSyncFrameRef.current = window.requestAnimationFrame(() => {
			scrollSyncPendingRef.current = false;
			scrollSyncFrameRef.current = null;
			syncSelectedPathToScrollPosition();
		});
	}, [syncSelectedPathToScrollPosition, useInternalScroll]);

	const scrollToPath = useCallback((path: string) => {
		const container = scrollContainerRef.current;
		const section = sectionElementsRef.current[path];
		if (!section) {
			return;
		}
		if (!useInternalScroll || !container) {
			section.scrollIntoView({ block: "start", behavior: "auto" });
			return;
		}
		programmaticScrollUntilRef.current = Date.now() + 320;
		if (programmaticScrollClearTimerRef.current) {
			clearTimeout(programmaticScrollClearTimerRef.current);
		}
		programmaticScrollClearTimerRef.current = setTimeout(() => {
			programmaticScrollUntilRef.current = 0;
			programmaticScrollClearTimerRef.current = null;
		}, 320);
		const sectionStyle = window.getComputedStyle(section);
		const marginTop = Number.parseFloat(sectionStyle.marginTop) || 0;
		const targetScrollTop = Math.max(0, getSectionTopWithinScrollContainer(container, section) - marginTop);
		container.scrollTop = targetScrollTop;
	}, [useInternalScroll]);

	const scrollToLine = useCallback(
		(target: DiffLineScrollTarget) => {
			const container = scrollContainerRef.current;
			const section = sectionElementsRef.current[target.path];
			if (!section) {
				return;
			}
			const lineSelector = `[data-diff-line-number="${target.lineNumber}"]`;
			const variantSelector = target.variant ? `${lineSelector}[data-diff-line-variant="${target.variant}"]` : lineSelector;
			const row =
				section.querySelector<HTMLElement>(variantSelector)
				?? section.querySelector<HTMLElement>(lineSelector);
			if (!row) {
				scrollToPath(target.path);
				return;
			}
			if (!useInternalScroll || !container) {
				row.scrollIntoView({ block: "center", behavior: "auto" });
				row.classList.add("kb-diff-row-linked");
				if (highlightClearTimerRef.current) {
					clearTimeout(highlightClearTimerRef.current);
				}
				highlightClearTimerRef.current = setTimeout(() => {
					row.classList.remove("kb-diff-row-linked");
					highlightClearTimerRef.current = null;
				}, 1600);
				return;
			}
			programmaticScrollUntilRef.current = Date.now() + 420;
			if (programmaticScrollClearTimerRef.current) {
				clearTimeout(programmaticScrollClearTimerRef.current);
			}
			programmaticScrollClearTimerRef.current = setTimeout(() => {
				programmaticScrollUntilRef.current = 0;
				programmaticScrollClearTimerRef.current = null;
			}, 420);
			const targetScrollTop = Math.max(0, getSectionTopWithinScrollContainer(container, row) - 72);
			container.scrollTop = targetScrollTop;
			if (highlightClearTimerRef.current) {
				clearTimeout(highlightClearTimerRef.current);
			}
			row.classList.add("kb-diff-row-linked");
			highlightClearTimerRef.current = setTimeout(() => {
				row.classList.remove("kb-diff-row-linked");
				highlightClearTimerRef.current = null;
			}, 1600);
		},
		[scrollToPath, useInternalScroll],
	);

	useEffect(() => {
		return () => {
			if (scrollSyncFrameRef.current !== null) {
				window.cancelAnimationFrame(scrollSyncFrameRef.current);
			}
			if (programmaticScrollClearTimerRef.current) {
				clearTimeout(programmaticScrollClearTimerRef.current);
			}
			if (highlightClearTimerRef.current) {
				clearTimeout(highlightClearTimerRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (!selectedPath) {
			return;
		}

		const syncSelection = scrollSyncSelectionRef.current;
		if (syncSelection && syncSelection.path === selectedPath && Date.now() - syncSelection.at < 150) {
			scrollSyncSelectionRef.current = null;
			return;
		}
		scrollSyncSelectionRef.current = null;
		if (!sectionElementsRef.current[selectedPath]) {
			pendingPathScrollRef.current = selectedPath;
			return;
		}
		pendingPathScrollRef.current = null;
		scrollToPath(selectedPath);
	}, [scrollToPath, selectedPath]);

	useEffect(() => {
		const pendingPath = pendingPathScrollRef.current;
		if (!pendingPath || !sectionElementsRef.current[pendingPath]) {
			return;
		}
		pendingPathScrollRef.current = null;
		scrollToPath(pendingPath);
	}, [renderedGroupCount, scrollToPath]);

	useEffect(() => {
		if (!scrollTarget) {
			return;
		}
		setExpandedPaths((prev) =>
			prev[scrollTarget.path] === false ? { ...prev, [scrollTarget.path]: true } : prev,
		);
		requestAnimationFrame(() => {
			requestAnimationFrame(() => scrollToLine(scrollTarget));
		});
	}, [scrollTarget, scrollToLine]);

	const handleAddComment = useCallback(
		(filePath: string, lineNumber: number, lineText: string, variant: "added" | "removed" | "context") => {
			const key = commentKey(filePath, lineNumber, variant);
			if (comments.has(key)) {
				return;
			}
			const next = new Map(comments);
			// Remove any existing empty comment boxes before opening a new one
			for (const [existingKey, existingComment] of next) {
				if (existingComment.comment.trim() === "") {
					next.delete(existingKey);
				}
			}
			next.set(key, {
				filePath,
				lineNumber,
				lineText,
				variant,
				comment: "",
			});
			onCommentsChange(next);
		},
		[comments, onCommentsChange],
	);

	const handleUpdateComment = useCallback(
		(filePath: string, lineNumber: number, variant: "added" | "removed" | "context", text: string) => {
			const key = commentKey(filePath, lineNumber, variant);
			const existing = comments.get(key);
			if (!existing) {
				return;
			}
			const next = new Map(comments);
			next.set(key, { ...existing, comment: text });
			onCommentsChange(next);
		},
		[comments, onCommentsChange],
	);

	const handleDeleteComment = useCallback(
		(filePath: string, lineNumber: number, variant: "added" | "removed" | "context") => {
			const next = new Map(comments);
			next.delete(commentKey(filePath, lineNumber, variant));
			onCommentsChange(next);
		},
		[comments, onCommentsChange],
	);

	const handleInsertRequiredChange = useCallback(
		(comment: DiffLineComment) => {
			onInsertRequiredChange?.(comment);
			handleDeleteComment(comment.filePath, comment.lineNumber, comment.variant);
		},
		[handleDeleteComment, onInsertRequiredChange],
	);

	const nonEmptyComments = useMemo(() => {
		return Array.from(comments.values()).filter((c) => c.comment.trim().length > 0);
	}, [comments]);

	const buildFormattedComments = useCallback((): string | null => {
		if (nonEmptyComments.length === 0) {
			return null;
		}
		const sorted = [...nonEmptyComments].sort((a, b) => {
			const pathCmp = a.filePath.localeCompare(b.filePath);
			if (pathCmp !== 0) {
				return pathCmp;
			}
			return a.lineNumber - b.lineNumber;
		});
		return formatCommentsForTerminal(sorted);
	}, [nonEmptyComments]);

	const handleAddComments = useCallback(() => {
		const formatted = buildFormattedComments();
		if (!formatted || !onAddToTerminal) {
			return;
		}
		onAddToTerminal(formatted);
		onCommentsChange(new Map());
	}, [buildFormattedComments, onAddToTerminal, onCommentsChange]);

	const handleSendComments = useCallback(() => {
		const formatted = buildFormattedComments();
		if (!formatted || !onSendToTerminal) {
			return;
		}
		onSendToTerminal(formatted);
		onCommentsChange(new Map());
	}, [buildFormattedComments, onCommentsChange, onSendToTerminal]);

	const handleClearAllComments = useCallback(() => {
		onCommentsChange(new Map());
	}, [onCommentsChange]);

	const hasAnyComments = comments.size > 0;
	const nonEmptyCount = nonEmptyComments.length;

	useHotkeys(
		"meta+enter,ctrl+enter",
		(event) => {
			if (!onAddToTerminal || nonEmptyCount === 0) {
				return;
			}
			event.preventDefault();
			handleAddComments();
		},
		{
			enabled: Boolean(onAddToTerminal),
			enableOnFormTags: true,
			enableOnContentEditable: true,
			ignoreEventWhen: (event) => event.defaultPrevented,
			preventDefault: true,
		},
		[handleAddComments, nonEmptyCount, onAddToTerminal],
	);

	useHotkeys(
		"meta+shift+enter,ctrl+shift+enter",
		(event) => {
			if (!onSendToTerminal || nonEmptyCount === 0) {
				return;
			}
			event.preventDefault();
			handleSendComments();
		},
		{
			enabled: Boolean(onSendToTerminal),
			enableOnFormTags: true,
			enableOnContentEditable: true,
			ignoreEventWhen: (event) => event.defaultPrevented,
			preventDefault: true,
		},
		[handleSendComments, nonEmptyCount, onSendToTerminal],
	);

	return (
		<div
			style={{
				display: "flex",
				flex: useInternalScroll ? "1 1 0" : "0 0 auto",
				flexDirection: "column",
				minWidth: 0,
				minHeight: 0,
				background: useInternalScroll ? "var(--color-surface-0)" : "transparent",
			}}
		>
			{groupedByPath.length === 0 ? (
				<div className="kb-empty-state-center" style={{ flex: 1 }}>
					<div className="flex flex-col items-center justify-center gap-3 py-12 text-text-tertiary">
						<svg
							width="40"
							height="40"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect x="3" y="3" width="8" height="18" rx="1" />
							<rect x="13" y="3" width="8" height="18" rx="1" />
						</svg>
					</div>
				</div>
			) : (
				<>
					<div
						ref={scrollContainerRef}
						onScroll={useInternalScroll ? handleDiffScroll : undefined}
						style={{
							flex: useInternalScroll ? "1 1 0" : "0 0 auto",
							minHeight: 0,
							overflowY: useInternalScroll ? "auto" : "visible",
							overscrollBehaviorY: useInternalScroll ? "contain" : undefined,
							padding: useInternalScroll ? "0 12px 12px" : 0,
						}}
					>
						{visibleGroups.map((group, index) => {
							const isExpanded = expandedPaths[group.path] ?? true;
							const hasBinaryEntry = group.entries.some((entry) => entry.isBinary);
							return (
								<section
									key={group.path}
									className="kb-diff-file-section"
									ref={(node) => {
										sectionElementsRef.current[group.path] = node;
									}}
									style={{ marginTop: useInternalScroll || index > 0 ? 12 : 0 }}
								>
									<button
										type="button"
										className="kb-diff-file-header flex w-full items-center gap-2 rounded-t-md border border-border bg-surface-1 px-2 py-1.5 text-left text-[12px] text-text-primary hover:bg-surface-3 active:bg-surface-4 cursor-pointer"
										aria-expanded={isExpanded}
										aria-current={selectedPath === group.path ? "true" : undefined}
										onClick={() => {
											const container = scrollContainerRef.current;
											const sectionEl = sectionElementsRef.current[group.path];
											const previousTop = sectionEl?.getBoundingClientRect().top ?? null;
											const nextExpanded = !(expandedPaths[group.path] ?? true);
											suppressScrollSyncUntilRef.current = Date.now() + 250;
											setExpandedPaths((prev) => ({
												...prev,
												[group.path]: nextExpanded,
											}));
											if (!useInternalScroll) {
												return;
											}
											requestAnimationFrame(() => {
												if (previousTop == null || !container || !sectionEl) {
													return;
												}
												const nextTop = sectionEl.getBoundingClientRect().top;
												container.scrollTop += nextTop - previousTop;
											});
										}}
									>
										{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
										<span className="truncate" title={group.path} style={{ flex: "1 1 auto", minWidth: 0 }}>
											{truncatePathMiddle(group.path)}
										</span>
										<span style={{ flexShrink: 0 }}>
											<span className="text-status-green">+{group.added}</span>{" "}
											<span className="text-status-red">-{group.removed}</span>
											{group.added === 0 && group.removed === 0 && hasBinaryEntry ? (
												<span className="ml-2 text-text-tertiary">Binary</span>
											) : null}
										</span>
									</button>
									{isExpanded ? (
										<div
											className="rounded-b-md border-x border-b border-border bg-surface-1"
											style={{ overflow: "hidden" }}
										>
											{group.entries.map((entry) => (
												<div key={entry.id} className="kb-diff-entry">
													{entry.isBinary ? null : viewMode === "split" ? (
														<SplitDiff
															path={group.path}
															oldText={entry.oldText}
															newText={entry.newText}
															comments={comments}
															commentsByLine={commentsByLine}
															onAddComment={handleAddComment}
															onUpdateComment={handleUpdateComment}
															onDeleteComment={handleDeleteComment}
															onInsertRequiredChange={onInsertRequiredChange ? handleInsertRequiredChange : undefined}
														/>
													) : (
														<UnifiedDiff
															path={group.path}
															oldText={entry.oldText}
															newText={entry.newText}
															comments={comments}
															commentsByLine={commentsByLine}
															onAddComment={handleAddComment}
															onUpdateComment={handleUpdateComment}
															onDeleteComment={handleDeleteComment}
															onInsertRequiredChange={onInsertRequiredChange ? handleInsertRequiredChange : undefined}
														/>
													)}
												</div>
											))}
										</div>
									) : null}
								</section>
							);
						})}
					</div>
					{hasAnyComments && (onAddToTerminal || onSendToTerminal) ? (
						<div className="kb-diff-comments-footer">
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<span className="kb-diff-comments-count text-text-secondary">
									{nonEmptyCount} {nonEmptyCount === 1 ? "comment" : "comments"}
								</span>
								<Button variant="danger" size="sm" onClick={handleClearAllComments}>
									Clear All
								</Button>
							</div>
							<div style={{ display: "flex", gap: 4 }}>
								{onAddToTerminal ? (
									<Button
										variant="default"
										size="sm"
										disabled={nonEmptyCount === 0}
										onClick={handleAddComments}
									>
										<span style={{ display: "inline-flex", alignItems: "center" }}>
											<span>Add</span>
											<span
												style={{
													display: "inline-flex",
													alignItems: "center",
													gap: 2,
													marginLeft: 6,
												}}
												aria-hidden
											>
												{isMacPlatform ? <Command size={12} /> : <span style={{ fontSize: 12 }}>Ctrl</span>}
												<CornerDownLeft size={12} />
											</span>
										</span>
									</Button>
								) : null}
								{onSendToTerminal ? (
									<Button
										variant="primary"
										size="sm"
										disabled={nonEmptyCount === 0}
										onClick={handleSendComments}
									>
										<span style={{ display: "inline-flex", alignItems: "center" }}>
											<span>Send</span>
											<span
												style={{
													display: "inline-flex",
													alignItems: "center",
													gap: 2,
													marginLeft: 6,
												}}
												aria-hidden
											>
												{isMacPlatform ? <Command size={12} /> : <span style={{ fontSize: 12 }}>Ctrl</span>}
												<span style={{ fontSize: 12 }}>Shift</span>
												<CornerDownLeft size={12} />
											</span>
										</span>
									</Button>
								) : null}
							</div>
						</div>
					) : null}
				</>
			)}
		</div>
	);
}

export { DiffViewerPanel as ReviewDiffPanel };
