import {
	ArrowLeft,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	FileDiff,
	FileText,
	Files,
	GitCommit,
	GitCommitVertical,
	ListChecks,
	MessageSquare,
	PanelLeft,
	PanelRight,
	Pencil,
	Plus,
	RefreshCw,
	Save,
	Send,
	Trash2,
} from "lucide-react";
import * as RadixCheckbox from "@radix-ui/react-checkbox";
import * as RadixRadioGroup from "@radix-ui/react-radio-group";
import { skipToken } from "@reduxjs/toolkit/query";
import {
	type MouseEvent as ReactMouseEvent,
	type ReactElement,
	type ReactNode,
	type WheelEvent as ReactWheelEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import {
	type DiffLineComment,
	type DiffLineScrollTarget,
	DiffViewerPanel,
} from "@/components/detail-panels/diff-viewer-panel";
import {
	FileTreePanel,
	readFileTreePanelViewModePreference,
	type FileTreePanelViewMode,
	writeFileTreePanelViewModePreference,
} from "@/components/detail-panels/file-tree-panel";
import { CollapsedHistoryRail } from "@/components/git-history/collapsed-history-rail";
import { buildUnifiedDiffRows, parsePatchToRows, ReadOnlyUnifiedDiff } from "@/components/shared/diff-renderer";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { MarkdownMessageEditor, MarkdownMessagePreview } from "@/components/ui/markdown-message-editor";
import { ChangeStatusChip } from "@/components/ui/status-chip";
import { ResizeHandle } from "@/resize/resize-handle";
import { clampAtLeast, readPersistedResizeNumber, writePersistedResizeNumber } from "@/resize/resize-persistence";
import { useResizeDrag } from "@/resize/use-resize-drag";
import {
	COLLAPSED_GIT_HISTORY_PANEL_WIDTH,
	useGitHistoryLayout,
} from "@/resize/use-git-history-layout";
import {
	useGetChangeBoardFileDiffQuery,
	useGetChangeBoardFilesQuery,
	useGetChangeBoardSummaryQuery,
	useReviewCompleteMutation,
	useReviewGetQuery,
	useReviewListQuery,
	useReviewStartMutation,
	useReviewUpdateMutation,
} from "@/runtime/kanban-api";
import type {
	RuntimeChangeyardBoardFileDiffResponse,
	RuntimeChangeyardBoardFilesResponse,
	RuntimeChangeyardBoardFileSummary,
	RuntimeChangeyardChangeDetail,
	RuntimeChangeyardChangeListItem,
	RuntimeChangeyardReviewDetail,
	RuntimeChangeyardReviewRequiredChange,
	RuntimeChangeyardReviewSummary,
	RuntimeChangeyardBoardSummaryResponse,
	RuntimeGitCommit,
	RuntimeWorkspaceFileChange,
} from "@/runtime/types";
import { useRuntimeChangeWorkspaceChanges } from "@/runtime/use-runtime-change-workspace-changes";
import { LocalStorageKey } from "@/storage/local-storage-store";

const REVIEW_STACK_PANEL_WIDTH = 300;
const REVIEW_DRAFT_PANEL_DEFAULT_WIDTH = 460;
const REVIEW_DRAFT_PANEL_MIN_WIDTH = 380;
const REVIEW_TRAILING_SPACE_WIDTH = 180;
const REVIEW_COMMIT_DIFF_PANEL_WIDTH = 520;
const REVIEW_SUMMARY_PLACEHOLDER = "Review the change here.";
const REQUIRED_CHANGE_PLACEHOLDER = "Add any required changes, or leave this checklist as a record";

type ReviewDecision = "comment" | "approve" | "request-changes";

function normalizeReviewSummary(value: string): string {
	const trimmed = value.trim();
	return trimmed === REVIEW_SUMMARY_PLACEHOLDER ? "" : trimmed;
}

function isRequiredChangePlaceholder(text: string): boolean {
	const normalized = text.trim().toLowerCase().replace(/\.$/, "");
	return normalized === "none" || normalized === REQUIRED_CHANGE_PLACEHOLDER.toLowerCase();
}

function formatReviewDate(value: string | null | undefined): string {
	if (!value) {
		return "Unknown time";
	}
	return new Date(value).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function reviewDecisionLabel(decision: ReviewDecision | string): string {
	if (decision === "approve" || decision === "approved") {
		return "approved";
	}
	if (decision === "request-changes" || decision === "changes_requested") {
		return "requested changes";
	}
	if (decision === "comment" || decision === "commented") {
		return "commented";
	}
	return String(decision).replaceAll("_", " ");
}

function formatDelta(value: number, prefix: "+" | "-"): string {
	return value > 0 ? `${prefix}${value}` : `${prefix}0`;
}

function getBoardScopeKey(scope: "all" | { commitHash: string }): string {
	return scope === "all" ? "all" : `commit:${scope.commitHash}`;
}

function diffCommentKey(filePath: string, lineNumber: number, variant: DiffLineComment["variant"]): string {
	return `${filePath}:${variant}:${lineNumber}`;
}

function reviewCommentsToDiffMap(review: RuntimeChangeyardReviewDetail | null): Map<string, DiffLineComment> {
	const map = new Map<string, DiffLineComment>();
	for (const comment of review?.inlineComments ?? []) {
		map.set(diffCommentKey(comment.path, comment.line, "added"), {
			filePath: comment.path,
			lineNumber: comment.line,
			lineText: "",
			variant: "added",
			comment: comment.body,
		});
	}
	return map;
}

function diffMapToReviewComments(comments: Map<string, DiffLineComment>): Array<{ path: string; line: number; body: string }> {
	return Array.from(comments.values())
		.map((comment) => ({
			path: comment.filePath,
			line: comment.lineNumber,
			body: comment.comment.trim(),
		}))
		.filter((comment) => comment.path && comment.line > 0 && comment.body);
}

function hasReviewableStatus(status: string): boolean {
	return ["ready_for_pr", "pr_open", "in_review", "changes_requested", "approved"].includes(status);
}

function getUiOnlyDoneStatus(status: string): "approved" | "merged" | null {
	if (status === "ready_for_pr" || status === "in_review") {
		return "approved";
	}
	if (status === "pr_open" || status === "approved") {
		return "merged";
	}
	return null;
}

function normalizeRequiredChanges(items: RuntimeChangeyardReviewRequiredChange[]): RuntimeChangeyardReviewRequiredChange[] {
	return items
		.map((item) => ({ checked: item.checked, text: item.text.trim() }))
		.filter((item) => item.text && !isRequiredChangePlaceholder(item.text));
}

function normalizeInlineComments(items: Array<{ path: string; line: number; body: string }>): Array<{ path: string; line: number; body: string }> {
	return items
		.map((item) => ({
			path: item.path.trim(),
			line: item.line,
			body: item.body.trim(),
		}))
		.filter((item) => item.path && item.line > 0 && item.body);
}

function readLineAt(text: string | null | undefined, lineNumber: number): string {
	if (!text || lineNumber <= 0) {
		return "";
	}
	return text.split(/\r?\n/)[lineNumber - 1]?.trimEnd() ?? "";
}

function resolveInlineCommentLineText(
	comment: DiffLineComment,
	workspaceFiles: RuntimeWorkspaceFileChange[] | null,
): string {
	const existing = comment.lineText.trimEnd();
	if (existing) {
		return existing;
	}
	const file = workspaceFiles?.find((candidate) => candidate.path === comment.filePath);
	if (!file) {
		return "";
	}
	const primaryText = comment.variant === "removed" ? file.oldText : file.newText;
	const fallbackText = comment.variant === "removed" ? file.newText : file.oldText;
	return readLineAt(primaryText, comment.lineNumber) || readLineAt(fallbackText, comment.lineNumber);
}

interface RequiredChangeReference {
	path: string;
	line: number;
	body: string;
}

function parseRequiredChangeReference(text: string): RequiredChangeReference | null {
	const match = /^(.+?):(\d+):\s*([\s\S]*)$/.exec(text.trim());
	if (!match || !match[1] || !match[2] || match[3] == null) {
		return null;
	}
	return {
		path: match[1].trim(),
		line: Number(match[2]),
		body: match[3].trim(),
	};
}

function formatRequiredChangeText(reference: RequiredChangeReference | null, body: string): string {
	const trimmed = body.trim();
	if (!reference) {
		return trimmed;
	}
	return `${reference.path}:${reference.line}: ${trimmed}`;
}

function requiredChangeToDiffComment(item: RuntimeChangeyardReviewRequiredChange): DiffLineComment | null {
	const reference = parseRequiredChangeReference(item.text);
	if (!reference) {
		return null;
	}
	return {
		filePath: reference.path,
		lineNumber: reference.line,
		lineText: "",
		variant: "added",
		comment: reference.body,
	};
}

function resolveRequiredChangeLineText(
	item: RuntimeChangeyardReviewRequiredChange,
	workspaceFiles: RuntimeWorkspaceFileChange[] | null,
): string {
	const comment = requiredChangeToDiffComment(item);
	return comment ? resolveInlineCommentLineText(comment, workspaceFiles) : "";
}

function reviewDraftFingerprint(input: {
	summary: string;
	requiredChanges: RuntimeChangeyardReviewRequiredChange[];
	inlineComments: Array<{ path: string; line: number; body: string }>;
}): string {
	return JSON.stringify({
		summary: normalizeReviewSummary(input.summary),
		requiredChanges: normalizeRequiredChanges(input.requiredChanges),
		inlineComments: normalizeInlineComments(input.inlineComments),
	});
}

function PanelHeader({
	title,
	subtitle,
	onCollapse,
}: {
	title: string;
	subtitle?: string | null;
	onCollapse: () => void;
}): ReactElement {
	return (
		<div className="flex h-11 items-center gap-2 border-b border-divider bg-surface-1 px-3">
			<div className="min-w-0 flex-1">
				<div className="truncate text-xs font-semibold uppercase text-text-tertiary">{title}</div>
				{subtitle ? <div className="truncate text-[11px] text-text-tertiary">{subtitle}</div> : null}
			</div>
			<Button
				variant="ghost"
				size="sm"
				icon={<ChevronLeft size={14} />}
				aria-label={`Collapse ${title} panel`}
				onClick={onCollapse}
			/>
		</div>
	);
}

function ConversationEvent({
	icon,
	title,
	meta,
	children,
}: {
	icon: ReactElement;
	title: string;
	meta?: string | null;
	children?: ReactNode;
}): ReactElement {
	return (
		<div className="relative pl-9">
			<div className="absolute left-3 top-0 bottom-[-12px] w-px bg-divider" aria-hidden />
			<div className="absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-divider bg-surface-1 text-text-secondary">
				{icon}
			</div>
			<div className="rounded-md border border-divider bg-surface-1">
				<div className="flex items-center justify-between gap-2 border-b border-divider px-3 py-2">
					<div className="min-w-0 truncate text-sm font-medium text-text-primary">{title}</div>
					{meta ? <div className="shrink-0 text-[11px] text-text-tertiary">{meta}</div> : null}
				</div>
				{children ? <div className="p-3 text-sm text-text-secondary">{children}</div> : null}
			</div>
		</div>
	);
}

function RequiredChangeRow({
	item,
	index,
	lineText,
	disabled,
	onCheckedChange,
	onTextChange,
	onDelete,
	onNavigate,
}: {
	item: RuntimeChangeyardReviewRequiredChange;
	index: number;
	lineText: string;
	disabled: boolean;
	onCheckedChange: (index: number, checked: boolean) => void;
	onTextChange: (index: number, text: string) => void;
	onDelete: (index: number) => void;
	onNavigate: (comment: DiffLineComment) => void;
}): ReactElement {
	const id = `review-required-change-${index}`;
	const [isEditing, setEditing] = useState(item.text.trim().length === 0);
	const reference = parseRequiredChangeReference(item.text);
	const comment = requiredChangeToDiffComment(item);
	const body = reference?.body ?? item.text;
	const locationLabel = reference ? `${reference.path}:${reference.line}` : null;
	const updateBody = (nextBody: string): void => {
		onTextChange(index, formatRequiredChangeText(reference, nextBody));
	};
	return (
		<div className="rounded-md border border-divider bg-surface-0 p-2">
			<div className="flex items-start gap-2">
				<RadixCheckbox.Root
					id={id}
					checked={item.checked}
					onCheckedChange={(checked) => onCheckedChange(index, checked === true)}
					disabled={disabled}
					className="mt-1 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-border-bright bg-surface-3 data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-default disabled:opacity-40"
				>
					<RadixCheckbox.Indicator>
						<Check size={11} className="text-white" />
					</RadixCheckbox.Indicator>
				</RadixCheckbox.Root>
				<label htmlFor={id} className="sr-only">
					Required change {index + 1}
				</label>
				<div className="min-w-0 flex-1 space-y-2">
					{locationLabel && comment ? (
						<div className="overflow-hidden rounded-md border border-divider bg-surface-1">
							<div className="flex items-center justify-between gap-2 border-b border-divider bg-surface-2 px-2.5 py-1.5">
								<button
									type="button"
									onClick={() => onNavigate(comment)}
									className="min-w-0 truncate font-mono text-xs font-medium text-accent hover:underline"
								>
									{locationLabel}
								</button>
								<Button
									variant="ghost"
									size="sm"
									icon={<ExternalLink size={12} />}
									aria-label={`View required change ${locationLabel} in diff`}
									onClick={() => onNavigate(comment)}
									className="h-6 shrink-0 px-1.5"
								/>
							</div>
							<div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 px-2.5 py-2 font-mono text-xs">
								<span className="select-none text-right text-text-tertiary">{comment.lineNumber}</span>
								{lineText ? (
									<code className="min-w-0 truncate whitespace-pre text-text-primary" title={lineText}>
										{lineText}
									</code>
								) : (
									<span className="min-w-0 text-text-tertiary">Line snippet unavailable in the current diff.</span>
								)}
							</div>
						</div>
					) : null}
					{isEditing ? (
						<div className="space-y-2">
							<MarkdownMessageEditor
								value={body}
								onChange={updateBody}
								height="140px"
								placeholder="Required change"
								disabled={disabled}
								className="cy-markdown-editor-compact"
							/>
							<div className="flex justify-end">
								<Button
									variant="default"
									size="sm"
									onClick={() => setEditing(false)}
									disabled={disabled || body.trim().length === 0}
								>
									Done
								</Button>
							</div>
						</div>
					) : (
						<div className={cn("rounded-md border border-transparent px-1 py-0.5", item.checked ? "opacity-65" : null)}>
							<MarkdownMessagePreview value={body} emptyLabel="No required-change details." className="text-sm" />
						</div>
					)}
				</div>
				<div className="flex shrink-0 flex-col gap-1">
					<Button
						variant="ghost"
						size="sm"
						icon={<Check size={13} />}
						aria-label={item.checked ? `Reopen required change ${index + 1}` : `Resolve required change ${index + 1}`}
						onClick={() => onCheckedChange(index, !item.checked)}
						disabled={disabled}
						className={cn("h-7 px-2", item.checked ? "text-text-secondary" : "text-status-green")}
					>
						{item.checked ? "Reopen" : "Resolve"}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						icon={<Pencil size={13} />}
						aria-label={`Edit required change ${index + 1}`}
						onClick={() => setEditing(true)}
						disabled={disabled}
						className="h-7 px-2"
					/>
					<Button
						variant="ghost"
						size="sm"
						icon={<Trash2 size={13} />}
						aria-label={`Delete required change ${index + 1}`}
						onClick={() => onDelete(index)}
						disabled={disabled}
						className="h-7 px-2 text-status-red"
					/>
				</div>
			</div>
		</div>
	);
}

function InlineCommentConversationCard({
	comment,
	lineText,
	disabled,
	onNavigate,
	onDelete,
}: {
	comment: DiffLineComment;
	lineText: string;
	disabled: boolean;
	onNavigate: (comment: DiffLineComment) => void;
	onDelete: (comment: DiffLineComment) => void;
}): ReactElement {
	const locationLabel = `${comment.filePath}:${comment.lineNumber}`;
	const sideLabel = comment.variant === "removed" ? "L" : "R";

	return (
		<div className="space-y-3">
			<div className="overflow-hidden rounded-md border border-divider bg-surface-0">
				<div className="flex items-center justify-between gap-2 border-b border-divider bg-surface-2 px-2.5 py-1.5">
					<button
						type="button"
						onClick={() => onNavigate(comment)}
						className="min-w-0 truncate font-mono text-xs font-medium text-accent hover:underline"
					>
						{locationLabel}
					</button>
					<Button
						variant="ghost"
						size="sm"
						icon={<ExternalLink size={12} />}
						aria-label={`View ${locationLabel} in diff`}
						onClick={() => onNavigate(comment)}
						className="h-6 shrink-0 px-1.5"
					/>
				</div>
				<div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 px-2.5 py-2 font-mono text-xs">
					<span className="select-none text-right text-text-tertiary">
						{sideLabel}
						{comment.lineNumber}
					</span>
					{lineText ? (
						<code className="min-w-0 truncate whitespace-pre text-text-primary" title={lineText}>
							{lineText}
						</code>
					) : (
						<span className="min-w-0 text-text-tertiary">Line snippet unavailable in the current diff.</span>
					)}
				</div>
			</div>
			<div className="flex items-start justify-between gap-2">
				<MarkdownMessagePreview value={comment.comment} emptyLabel="" className="min-w-0 flex-1" />
				<Button
					variant="ghost"
					size="sm"
					icon={<Trash2 size={13} />}
					aria-label={`Delete inline comment on ${locationLabel}`}
					onClick={() => onDelete(comment)}
					disabled={disabled}
					className="shrink-0 text-status-red"
				/>
			</div>
		</div>
	);
}

type ReviewCommitFileSelection = {
	commitHash: string;
	path: string;
};

function ReviewCommitFileRow({
	file,
	selected,
	onSelect,
}: {
	file: RuntimeChangeyardBoardFileSummary;
	selected: boolean;
	onSelect: (file: RuntimeChangeyardBoardFileSummary) => void;
}): ReactElement {
	return (
		<button
			type="button"
			aria-label={`View diff for ${file.path}`}
			className={cn(
				"flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-3",
				selected ? "bg-surface-3" : null,
			)}
			onClick={() => onSelect(file)}
		>
			<span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-text-tertiary">
				{file.status.charAt(0).toUpperCase()}
			</span>
			<span className="min-w-0 flex-1 truncate text-text-secondary" title={file.path}>
				{file.previousPath ? `${file.previousPath} -> ${file.path}` : file.path}
			</span>
			<span className="shrink-0 text-status-green">{formatDelta(file.additions, "+")}</span>
			<span className="shrink-0 text-status-red">{formatDelta(file.deletions, "-")}</span>
		</button>
	);
}

function ReviewCommitTimelineCard({
	commit,
	filesResponse,
	isExpanded,
	isSelected,
	isLoading,
	error,
	selectedFile,
	onSelectCommit,
	onToggle,
	onSelectFile,
}: {
	commit: RuntimeGitCommit;
	filesResponse: RuntimeChangeyardBoardFilesResponse | null;
	isExpanded: boolean;
	isSelected: boolean;
	isLoading: boolean;
	error: Error | null;
	selectedFile: ReviewCommitFileSelection | null;
	onSelectCommit: (commit: RuntimeGitCommit) => void;
	onToggle: (commit: RuntimeGitCommit) => void;
	onSelectFile: (commit: RuntimeGitCommit, file: RuntimeChangeyardBoardFileSummary) => void;
}): ReactElement {
	const files = filesResponse?.files ?? [];
	const additions = files.reduce((total, file) => total + file.additions, 0);
	const deletions = files.reduce((total, file) => total + file.deletions, 0);
	return (
		<div className={cn("overflow-hidden rounded-md border border-divider bg-surface-0", isSelected ? "border-accent/60" : null)}>
			<div className="flex items-center gap-2 bg-surface-1 px-2 py-2">
				<button
					type="button"
					className="grid h-6 w-6 shrink-0 place-items-center rounded text-text-secondary hover:bg-surface-3 hover:text-text-primary"
					aria-label={isExpanded ? `Collapse commit ${commit.shortHash}` : `Expand commit ${commit.shortHash}`}
					onClick={() => onToggle(commit)}
				>
					{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
				</button>
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-2 text-left"
					onClick={() => onSelectCommit(commit)}
				>
					<GitCommitVertical size={14} className="shrink-0 text-text-tertiary" />
					<span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{commit.message}</span>
					<span className="shrink-0 font-mono text-[11px] text-text-tertiary">{commit.shortHash}</span>
				</button>
			</div>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-divider px-3 py-1.5 text-[11px] text-text-tertiary">
				<span className="truncate">{commit.authorName}</span>
				<span>{formatReviewDate(commit.date)}</span>
				{files.length > 0 ? (
					<>
						<span>{files.length} {files.length === 1 ? "file" : "files"}</span>
						<span className="text-status-green">+{additions}</span>
						<span className="text-status-red">-{deletions}</span>
					</>
				) : null}
			</div>
			{isExpanded ? (
				<div className="border-t border-divider p-1">
					{isLoading ? (
						<div className="px-1 py-2">
							<FileChangesSkeleton rows={3} />
						</div>
					) : error ? (
						<div className="px-2 py-2 text-xs text-status-red">{error.message}</div>
					) : files.length > 0 ? (
						<div className="max-h-48 overflow-y-auto">
							{files.map((file) => (
								<ReviewCommitFileRow
									key={`${commit.hash}:${file.previousPath ?? ""}:${file.path}`}
									file={file}
									selected={selectedFile?.commitHash === commit.hash && selectedFile.path === file.path}
									onSelect={(selected) => onSelectFile(commit, selected)}
								/>
							))}
						</div>
					) : (
						<div className="px-2 py-2 text-xs text-text-tertiary">No changed files for this commit.</div>
					)}
				</div>
			) : null}
		</div>
	);
}

function ReviewCommitDiffPanel({
	selection,
	diff,
	isLoading,
	error,
	onClose,
}: {
	selection: ReviewCommitFileSelection;
	diff: RuntimeChangeyardBoardFileDiffResponse | null;
	isLoading: boolean;
	error: Error | null;
	onClose: () => void;
}): ReactElement {
	const rows = diff?.patch
		? parsePatchToRows(diff.patch)
		: diff?.file
			? buildUnifiedDiffRows(diff.file.oldText, diff.file.newText ?? "")
			: [];
	return (
		<aside
			className="flex min-h-0 shrink-0 flex-col border-l border-divider bg-surface-0"
			style={{ width: REVIEW_COMMIT_DIFF_PANEL_WIDTH, minWidth: REVIEW_COMMIT_DIFF_PANEL_WIDTH }}
		>
			<div className="flex h-11 items-center gap-2 border-b border-divider bg-surface-1 px-3">
				<FileText size={14} className="shrink-0 text-text-tertiary" />
				<div className="min-w-0 flex-1">
					<div className="truncate text-xs font-semibold uppercase text-text-tertiary">Commit Diff</div>
					<div className="truncate text-[11px] text-text-tertiary" title={selection.path}>
						{selection.path}
					</div>
				</div>
				<Button variant="ghost" size="sm" aria-label="Close commit diff" onClick={onClose}>
					Close
				</Button>
			</div>
			<div className="min-h-0 flex-1 overflow-auto p-3">
				{isLoading ? (
					<FileDiffSkeleton />
				) : error ? (
					<div className="rounded-md border border-status-red/30 bg-status-red/10 px-3 py-2 text-sm text-status-red">
						{error.message}
					</div>
				) : rows.length > 0 ? (
					<div className="overflow-hidden rounded-md border border-border bg-surface-0">
						<ReadOnlyUnifiedDiff rows={rows} path={selection.path} />
					</div>
				) : (
					<div className="text-sm text-text-tertiary">No textual diff available.</div>
				)}
			</div>
		</aside>
	);
}

function SubmitReviewDialog({
	open,
	decision,
	body,
	isSaving,
	error,
	canSubmit,
	onOpenChange,
	onDecisionChange,
	onBodyChange,
	onSubmit,
}: {
	open: boolean;
	decision: ReviewDecision;
	body: string;
	isSaving: boolean;
	error: string | null;
	canSubmit: boolean;
	onOpenChange: (open: boolean) => void;
	onDecisionChange: (decision: ReviewDecision) => void;
	onBodyChange: (body: string) => void;
	onSubmit: () => void;
}): ReactElement {
	const options: Array<{ value: ReviewDecision; label: string; description: string }> = [
		{ value: "comment", label: "Comment", description: "Submit general feedback without explicit approval." },
		{ value: "approve", label: "Approve", description: "Submit feedback and approve these changes." },
		{ value: "request-changes", label: "Request changes", description: "Submit feedback that must be addressed." },
	];

	return (
		<Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-3xl">
			<DialogHeader title="Finish your review" icon={<GitPullRequestIcon />} />
			<DialogBody className="flex flex-col gap-4">
				{error ? (
					<div className="rounded-md border border-status-red/30 bg-status-red/10 px-3 py-2 text-sm text-status-red">
						{error}
					</div>
				) : null}
				<MarkdownMessageEditor
					value={body}
					onChange={onBodyChange}
					height="260px"
					placeholder="Leave a summary for this review."
					disabled={isSaving}
					autoFocus
				/>
				<RadixRadioGroup.Root
					value={decision}
					onValueChange={(value) => onDecisionChange(value as ReviewDecision)}
					className="flex flex-col gap-3"
				>
					{options.map((option) => (
						<label key={option.value} className="flex cursor-pointer items-start gap-3 text-text-primary">
							<RadixRadioGroup.Item
								value={option.value}
								disabled={isSaving}
								className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border-bright bg-surface-2 data-[state=checked]:border-accent disabled:opacity-40"
							>
								<RadixRadioGroup.Indicator className="h-2.5 w-2.5 rounded-full bg-accent" />
							</RadixRadioGroup.Item>
							<span>
								<span className="block text-sm font-semibold">{option.label}</span>
								<span className="block text-sm text-text-secondary">{option.description}</span>
							</span>
						</label>
					))}
				</RadixRadioGroup.Root>
			</DialogBody>
			<DialogFooter>
				<Button variant="default" onClick={() => onOpenChange(false)} disabled={isSaving}>
					Cancel
				</Button>
				<Button variant="primary" icon={<Send size={14} />} onClick={onSubmit} disabled={!canSubmit || isSaving}>
					Submit review
				</Button>
			</DialogFooter>
		</Dialog>
	);
}

function GitPullRequestIcon(): ReactElement {
	return <MessageSquare size={16} />;
}

function errorToMessage(error: unknown, fallback = "Request failed."): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
		return error.message;
	}
	return fallback;
}

function errorToError(error: unknown, fallback = "Request failed."): Error {
	return error instanceof Error ? error : new Error(errorToMessage(error, fallback));
}

function SkeletonLine({ className }: { className?: string }): ReactElement {
	return <div className={cn("kb-skeleton h-3 rounded-sm", className)} />;
}

function FileChangesSkeleton({ rows = 7 }: { rows?: number }): ReactElement {
	return (
		<div className="space-y-2" role="status" aria-label="Loading file changes">
			{Array.from({ length: rows }).map((_, index) => (
				<div key={`file-changes-skeleton-${index}`} className="flex items-center gap-2 px-2 py-1.5">
					<SkeletonLine className="h-5 w-5 shrink-0 rounded-full" />
					<SkeletonLine
						className={cn(
							"min-w-0 flex-1",
							index % 3 === 0 ? "w-9/12" : index % 3 === 1 ? "w-7/12" : "w-10/12",
						)}
					/>
					<SkeletonLine className="h-2.5 w-8 shrink-0" />
					<SkeletonLine className="h-2.5 w-7 shrink-0" />
				</div>
			))}
		</div>
	);
}

function FileDiffSkeleton(): ReactElement {
	return (
		<div className="min-h-0 flex-1 overflow-hidden p-3" role="status" aria-label="Loading file diff">
			<div className="overflow-hidden rounded-md border border-border bg-surface-0">
				<div className="border-b border-divider bg-surface-1 px-3 py-2">
					<SkeletonLine className="h-3 w-48" />
				</div>
				<div className="space-y-2 p-3">
					{Array.from({ length: 14 }).map((_, index) => (
						<div key={`file-diff-skeleton-${index}`} className="flex items-center gap-3">
							<SkeletonLine className="h-2.5 w-8 shrink-0" />
							<SkeletonLine
								className={cn(
									"h-2.5",
									index % 4 === 0 ? "w-7/12" : index % 4 === 1 ? "w-10/12" : "w-9/12",
								)}
							/>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export function ChangeReviewModalSkeleton({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}): ReactElement | null {
	if (!open) {
		return null;
	}
	return (
		<div className="fixed inset-0 z-50 flex min-h-0 min-w-0 flex-col bg-surface-0 text-text-primary">
			<header className="flex h-12 shrink-0 items-center gap-3 border-b border-divider bg-surface-1 px-3">
				<Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} onClick={() => onOpenChange(false)}>
					Back
				</Button>
				<FileDiff size={16} className="shrink-0 text-text-secondary" />
				<div className="min-w-0 flex-1">
					<SkeletonLine className="mb-2 h-4 w-64" />
					<SkeletonLine className="h-2.5 w-32" />
				</div>
			</header>
			<div className="flex min-h-0 flex-1">
				<aside className="w-[300px] shrink-0 border-r border-divider p-3">
					{Array.from({ length: 5 }).map((_, index) => (
						<div key={`review-change-skeleton-${index}`} className="mb-3 rounded-md border border-divider bg-surface-1 p-3">
							<SkeletonLine className="mb-3 w-20" />
							<SkeletonLine className="mb-2 w-full" />
							<SkeletonLine className="w-2/3" />
						</div>
					))}
				</aside>
				<main className="min-w-0 flex-1 p-5" role="status" aria-label="Loading review">
					<SkeletonLine className="mb-5 h-7 w-56" />
					<SkeletonLine className="mb-3 w-full" />
					<SkeletonLine className="mb-8 w-10/12" />
					<SkeletonLine className="mb-5 h-6 w-48" />
					{Array.from({ length: 4 }).map((_, index) => (
						<SkeletonLine key={`review-body-skeleton-${index}`} className="mb-3 w-full" />
					))}
				</main>
			</div>
		</div>
	);
}

export function ChangeReviewModal({
	open,
	change,
	changes,
	workspaceId,
	workspacePath = null,
	onOpenChange,
	onSelectChange,
	onReviewChanged,
	onMarkDone,
}: {
	open: boolean;
	change: RuntimeChangeyardChangeDetail | null;
	changes: RuntimeChangeyardChangeListItem[];
	workspaceId: string | null;
	workspacePath?: string | null;
	onOpenChange: (open: boolean) => void;
	onSelectChange: (changeId: string) => void;
	onReviewChanged: (change: RuntimeChangeyardChangeDetail, message: string) => void;
	onMarkDone?: (changeId: string, status: "approved" | "merged") => Promise<void> | void;
}): ReactElement | null {
	const [reviews, setReviews] = useState<RuntimeChangeyardReviewSummary[]>([]);
	const [summary, setSummary] = useState("");
	const [requiredChanges, setRequiredChanges] = useState<RuntimeChangeyardReviewRequiredChange[]>([]);
	const [comments, setComments] = useState<Map<string, DiffLineComment>>(new Map());
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [lineScrollTarget, setLineScrollTarget] = useState<DiffLineScrollTarget | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [isMarkingDone, setIsMarkingDone] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isStackCollapsed, setStackCollapsed] = useState(false);
	const [isDraftCollapsed, setDraftCollapsed] = useState(false);
	const [isReviewFilesCollapsed, setReviewFilesCollapsed] = useState(false);
	const [reviewFileViewMode, setReviewFileViewMode] = useState<FileTreePanelViewMode>(() =>
		readFileTreePanelViewModePreference(LocalStorageKey.ReviewFileTreeViewMode),
	);
	const [isSubmitDialogOpen, setSubmitDialogOpen] = useState(false);
	const [submitDecision, setSubmitDecision] = useState<ReviewDecision>("comment");
	const [submitSummary, setSubmitSummary] = useState("");
	const [boardSummary, setBoardSummary] = useState<RuntimeChangeyardBoardSummaryResponse | null>(null);
	const [boardSummaryError, setBoardSummaryError] = useState<Error | null>(null);
	const [expandedCommitHash, setExpandedCommitHash] = useState<string | null>(null);
	const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null);
	const [commitFiles, setCommitFiles] = useState<Record<string, RuntimeChangeyardBoardFilesResponse | null>>({});
	const [commitFileErrors, setCommitFileErrors] = useState<Record<string, Error | null>>({});
	const [selectedCommitFile, setSelectedCommitFile] = useState<ReviewCommitFileSelection | null>(null);
	const [commitFileDiff, setCommitFileDiff] = useState<RuntimeChangeyardBoardFileDiffResponse | null>(null);
	const [commitFileDiffError, setCommitFileDiffError] = useState<Error | null>(null);
	const [reviewDraftPanelWidth, setReviewDraftPanelWidth] = useState(() =>
		readPersistedResizeNumber({
			key: LocalStorageKey.ReviewDraftPanelWidth,
			fallback: REVIEW_DRAFT_PANEL_DEFAULT_WIDTH,
			normalize: (value) => clampAtLeast(value, REVIEW_DRAFT_PANEL_MIN_WIDTH, true),
		}),
	);
	const reviewScrollerRef = useRef<HTMLDivElement | null>(null);
	const { startDrag: startDraftPanelResize } = useResizeDrag();
	const {
		diffContentPanelWidth,
		fileTreePanelWidth,
	} = useGitHistoryLayout();
	const [reviewStartMutation] = useReviewStartMutation();
	const [reviewUpdateMutation] = useReviewUpdateMutation();
	const [reviewCompleteMutation] = useReviewCompleteMutation();

	const changeId = open && change ? change.id : null;
	const reviewScope = changeId && workspaceId ? { workspaceId, workspacePath, input: { id: changeId } } : skipToken;
	const reviewListQuery = useReviewListQuery(reviewScope);
	const reviewsForCurrentChange = reviewListQuery.currentData?.reviews ?? [];
	const latestReviewSummary = reviewsForCurrentChange[reviewsForCurrentChange.length - 1] ?? null;
	const reviewGetQueryArg =
		changeId && workspaceId && latestReviewSummary
			? { workspaceId, workspacePath, input: { id: changeId, review: latestReviewSummary.review } }
			: skipToken;
	const reviewGetQuery = useReviewGetQuery(reviewGetQueryArg);
	const boardSummaryQueryArg = changeId && workspaceId ? { workspaceId, workspacePath, id: changeId } : skipToken;
	const boardSummaryQuery = useGetChangeBoardSummaryQuery(boardSummaryQueryArg);
	const boardFilesQueryArg =
		changeId && workspaceId && expandedCommitHash
			? { workspaceId, workspacePath, input: { id: changeId, scope: { commitHash: expandedCommitHash } } }
			: skipToken;
	const boardFilesQuery = useGetChangeBoardFilesQuery(boardFilesQueryArg);
	const boardFileDiffQueryArg =
		changeId && workspaceId && selectedCommitFile
			? {
					workspaceId,
					workspacePath,
					input: {
						id: changeId,
						scope: { commitHash: selectedCommitFile.commitHash },
						path: selectedCommitFile.path,
					},
				}
			: skipToken;
	const boardFileDiffQuery = useGetChangeBoardFileDiffQuery(boardFileDiffQueryArg);
	const activeReview = reviewGetQuery.currentData ?? null;
	const {
		changes: workspaceChanges,
		isLoading: isWorkspaceChangesLoading,
		isRuntimeAvailable,
		refresh: refreshWorkspaceChanges,
	} = useRuntimeChangeWorkspaceChanges(
		changeId,
		workspaceId,
		null,
		workspacePath,
	);
	const workspaceFiles = workspaceChanges?.files ?? null;
	const hasWorkspacePath = Boolean(change?.workspace?.path);
	const availablePaths = useMemo(() => workspaceFiles?.map((file) => file.path) ?? [], [workspaceFiles]);
	const reviewableChanges = useMemo(
		() => changes.filter((candidate) => hasReviewableStatus(candidate.status)),
		[changes],
	);
	const activeIndex = change ? reviewableChanges.findIndex((candidate) => candidate.id === change.id) : -1;
	const persistedComments = useMemo(() => diffMapToReviewComments(comments), [comments]);
	const isDirty = Boolean(activeReview)
		&& reviewDraftFingerprint({ summary, requiredChanges, inlineComments: persistedComments })
			!== reviewDraftFingerprint({
				summary: activeReview?.summary ?? "",
				requiredChanges: activeReview?.requiredChanges ?? [],
				inlineComments: activeReview?.inlineComments ?? [],
			});

	const reloadReviewSurface = useCallback(async () => {
		const refreshes: Promise<unknown>[] = [refreshWorkspaceChanges()];
		if (changeId && workspaceId) {
			refreshes.push(reviewListQuery.refetch());
			if (latestReviewSummary) {
				refreshes.push(reviewGetQuery.refetch());
			}
			refreshes.push(boardSummaryQuery.refetch());
			if (expandedCommitHash) {
				refreshes.push(boardFilesQuery.refetch());
			}
			if (selectedCommitFile) {
				refreshes.push(boardFileDiffQuery.refetch());
			}
		}
		await Promise.all(refreshes);
	}, [
		boardFileDiffQuery,
		boardFilesQuery,
		boardSummaryQuery,
		changeId,
		expandedCommitHash,
		latestReviewSummary,
		refreshWorkspaceChanges,
		reviewGetQuery,
		reviewListQuery,
		selectedCommitFile,
		workspaceId,
	]);

	const reviewSurfaceKey = changeId && workspaceId ? `${workspaceId}:${workspacePath ?? ""}:${changeId}` : null;
	const draftReviewKey = activeReview ? `${reviewSurfaceKey}:review-${activeReview.review}` : null;
	const initializedDraftReviewKeyRef = useRef<string | null>(null);

	useEffect(() => {
		initializedDraftReviewKeyRef.current = null;
		setReviews([]);
		setSummary("");
		setSubmitSummary("");
		setRequiredChanges([]);
		setComments(new Map());
		setBoardSummary(null);
		setBoardSummaryError(null);
		setCommitFiles({});
		setCommitFileErrors({});
		setSelectedCommitHash(null);
		setExpandedCommitHash(null);
		setSelectedCommitFile(null);
		setCommitFileDiff(null);
		setCommitFileDiffError(null);
	}, [reviewSurfaceKey]);

	useEffect(() => {
		if (!reviewSurfaceKey || !reviewListQuery.currentData) {
			return;
		}
		setReviews(reviewListQuery.currentData.reviews);
		if (reviewListQuery.currentData.reviews.length === 0) {
			initializedDraftReviewKeyRef.current = null;
			setSummary("");
			setSubmitSummary("");
			setRequiredChanges([]);
			setComments(new Map());
		}
	}, [reviewListQuery.currentData, reviewSurfaceKey]);

	useEffect(() => {
		if (!reviewSurfaceKey || !activeReview || !draftReviewKey) {
			return;
		}
		if (initializedDraftReviewKeyRef.current === draftReviewKey) {
			return;
		}
		initializedDraftReviewKeyRef.current = draftReviewKey;
		setSummary(normalizeReviewSummary(activeReview.summary));
		setSubmitSummary(normalizeReviewSummary(activeReview.summary));
		setRequiredChanges(normalizeRequiredChanges(activeReview.requiredChanges));
		setComments(reviewCommentsToDiffMap(activeReview));
	}, [activeReview, draftReviewKey, reviewSurfaceKey]);

	useEffect(() => {
		if (!reviewSurfaceKey) {
			return;
		}
		if (reviewListQuery.isError) {
			setError(errorToMessage(reviewListQuery.error, "Failed to load reviews."));
			return;
		}
		if (reviewGetQuery.isError) {
			setError(errorToMessage(reviewGetQuery.error, "Failed to load review."));
			return;
		}
	}, [reviewGetQuery.error, reviewGetQuery.isError, reviewListQuery.error, reviewListQuery.isError, reviewSurfaceKey]);

	useEffect(() => {
		if (!reviewSurfaceKey || !boardSummaryQuery.currentData) {
			return;
		}
		setBoardSummary(boardSummaryQuery.currentData);
		setBoardSummaryError(null);
	}, [boardSummaryQuery.currentData, reviewSurfaceKey]);

	useEffect(() => {
		if (!reviewSurfaceKey) {
			return;
		}
		if (boardSummaryQuery.isError) {
			setBoardSummaryError(errorToError(boardSummaryQuery.error, "Failed to load board summary."));
		}
	}, [boardSummaryQuery.error, boardSummaryQuery.isError, reviewSurfaceKey]);

	useEffect(() => {
		if (!reviewSurfaceKey || !expandedCommitHash || !boardFilesQuery.currentData) {
			return;
		}
		setCommitFiles((current) => ({ ...current, [expandedCommitHash]: boardFilesQuery.currentData ?? null }));
		setCommitFileErrors((current) => ({ ...current, [expandedCommitHash]: null }));
	}, [boardFilesQuery.currentData, expandedCommitHash, reviewSurfaceKey]);

	useEffect(() => {
		if (!reviewSurfaceKey || !expandedCommitHash) {
			return;
		}
		if (boardFilesQuery.isError) {
			setCommitFileErrors((current) => ({
				...current,
				[expandedCommitHash]: errorToError(boardFilesQuery.error, "Failed to load commit files."),
			}));
		}
	}, [boardFilesQuery.error, boardFilesQuery.isError, expandedCommitHash, reviewSurfaceKey]);

	useEffect(() => {
		if (!reviewSurfaceKey || !selectedCommitFile) {
			setCommitFileDiff(null);
			setCommitFileDiffError(null);
			return;
		}
		if (boardFileDiffQuery.currentData) {
			setCommitFileDiff(boardFileDiffQuery.currentData);
			setCommitFileDiffError(null);
		}
	}, [boardFileDiffQuery.currentData, reviewSurfaceKey, selectedCommitFile]);

	useEffect(() => {
		if (!reviewSurfaceKey || !selectedCommitFile) {
			return;
		}
		if (boardFileDiffQuery.isError) {
			setCommitFileDiffError(errorToError(boardFileDiffQuery.error, "Failed to load commit file diff."));
			setCommitFileDiff(null);
		}
	}, [boardFileDiffQuery.error, boardFileDiffQuery.isError, reviewSurfaceKey, selectedCommitFile]);

	const toggleCommit = useCallback(
		(commit: RuntimeGitCommit) => {
			const nextExpanded = expandedCommitHash === commit.hash ? null : commit.hash;
			setExpandedCommitHash(nextExpanded);
			setSelectedCommitHash(commit.hash);
		},
		[expandedCommitHash],
	);

	const selectCommit = useCallback(
		(commit: RuntimeGitCommit) => {
			setSelectedCommitHash(commit.hash);
			setExpandedCommitHash(commit.hash);
		},
		[],
	);

	const selectCommitFile = useCallback(
		(commit: RuntimeGitCommit, file: RuntimeChangeyardBoardFileSummary) => {
			setSelectedCommitHash(commit.hash);
			setExpandedCommitHash(commit.hash);
			setSelectedCommitFile({ commitHash: commit.hash, path: file.path });
		},
		[],
	);

	const handleDiffWheelCapture = useCallback((event: ReactWheelEvent<HTMLElement>) => {
		if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
			return;
		}
		const scroller = reviewScrollerRef.current;
		if (!scroller) {
			return;
		}
		scroller.scrollLeft += event.deltaX;
		event.preventDefault();
	}, []);

	const handleDraftPanelResizeMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			const startX = event.clientX;
			const startWidth = reviewDraftPanelWidth;
			const applyResize = (pointerX: number): number => {
				const width = clampAtLeast(startWidth + (pointerX - startX), REVIEW_DRAFT_PANEL_MIN_WIDTH, true);
				setReviewDraftPanelWidth(width);
				return width;
			};
			startDraftPanelResize(event, {
				axis: "x",
				cursor: "ew-resize",
				onMove: applyResize,
				onEnd: (pointerX) => {
					writePersistedResizeNumber({
						key: LocalStorageKey.ReviewDraftPanelWidth,
						value: applyResize(pointerX),
						normalize: (value) => clampAtLeast(value, REVIEW_DRAFT_PANEL_MIN_WIDTH, true),
					});
				},
			});
		},
		[reviewDraftPanelWidth, startDraftPanelResize],
	);
	const setPersistedReviewFileViewMode = useCallback((mode: FileTreePanelViewMode) => {
		setReviewFileViewMode(writeFileTreePanelViewModePreference(LocalStorageKey.ReviewFileTreeViewMode, mode));
	}, []);

	useEffect(() => {
		if (selectedPath && availablePaths.includes(selectedPath)) {
			return;
		}
		setSelectedPath(availablePaths[0] ?? null);
	}, [availablePaths, selectedPath]);

	const addRequiredChange = useCallback((text = "") => {
		setRequiredChanges((items) => [...normalizeRequiredChanges(items), { checked: false, text }]);
	}, []);

	const updateRequiredChangeChecked = useCallback((index: number, checked: boolean) => {
		setRequiredChanges((items) =>
			items.map((item, itemIndex) => (itemIndex === index ? { ...item, checked } : item)),
		);
	}, []);

	const updateRequiredChangeText = useCallback((index: number, text: string) => {
		setRequiredChanges((items) =>
			items.map((item, itemIndex) => (itemIndex === index ? { ...item, text } : item)),
		);
	}, []);

	const deleteRequiredChange = useCallback((index: number) => {
		setRequiredChanges((items) => items.filter((_, itemIndex) => itemIndex !== index));
	}, []);

	const insertRequiredChangeFromComment = useCallback(
		(comment: DiffLineComment) => {
			addRequiredChange(`${comment.filePath}:${comment.lineNumber}: ${comment.comment.trim()}`);
		},
		[addRequiredChange],
	);

	const navigateToInlineComment = useCallback((comment: DiffLineComment) => {
		setSelectedPath(comment.filePath);
		setLineScrollTarget({
			path: comment.filePath,
			lineNumber: comment.lineNumber,
			variant: comment.variant,
			nonce: Date.now(),
		});
	}, []);

	const deleteInlineComment = useCallback((comment: DiffLineComment) => {
		setComments((current) => {
			const next = new Map(current);
			next.delete(diffCommentKey(comment.filePath, comment.lineNumber, comment.variant));
			return next;
		});
	}, []);

	if (!open || !change) {
		return null;
	}

	const saveReview = async (summaryOverride?: string): Promise<RuntimeChangeyardReviewDetail | null> => {
		if (!workspaceId || !change || !activeReview) {
			return null;
		}
		const nextSummary = normalizeReviewSummary(summaryOverride ?? summary);
		setIsSaving(true);
		setError(null);
		try {
			const next = await reviewUpdateMutation({
				workspaceId,
				workspacePath,
				input: {
					id: change.id,
					review: activeReview.review,
					summary: nextSummary,
					requiredChanges: normalizeRequiredChanges(requiredChanges),
					inlineComments: diffMapToReviewComments(comments),
					expectedLastModifiedAt: activeReview.lastModifiedAt,
				},
			}).unwrap();
			initializedDraftReviewKeyRef.current = null;
			await reviewGetQuery.refetch();
			return next;
		} catch (saveError) {
			setError(errorToMessage(saveError));
			return null;
		} finally {
			setIsSaving(false);
		}
	};

	const startReview = async (): Promise<void> => {
		if (!workspaceId || !change) {
			return;
		}
		setIsSaving(true);
		setError(null);
		try {
			const response = await reviewStartMutation({ workspaceId, workspacePath, id: change.id }).unwrap();
			onReviewChanged(response.change, response.message);
			await reviewListQuery.refetch();
		} catch (startError) {
			setError(errorToMessage(startError));
		} finally {
			setIsSaving(false);
		}
	};

	const openSubmitDialog = (decision: ReviewDecision = "comment"): void => {
		setSubmitDecision(decision);
		setSubmitSummary(normalizeReviewSummary(summary));
		setError(null);
		setSubmitDialogOpen(true);
	};

	const submitReview = async (): Promise<void> => {
		if (!workspaceId || !change || !activeReview) {
			return;
		}
		const finalSummary = normalizeReviewSummary(submitSummary);
		const hasDraftContent =
			finalSummary.length > 0 ||
			persistedComments.length > 0 ||
			normalizeRequiredChanges(requiredChanges).length > 0;
		if (submitDecision !== "comment" && finalSummary.length === 0) {
			setError("Approve and Request changes reviews require a summary.");
			return;
		}
		if (submitDecision === "comment" && !hasDraftContent) {
			setError("Comment reviews require a summary, inline comment, or required change.");
			return;
		}
		const next = await saveReview(finalSummary);
		if (!next) {
			return;
		}
		setIsSaving(true);
		setError(null);
		try {
			const response = await reviewCompleteMutation({
				workspaceId,
				workspacePath,
				input: {
					id: change.id,
					decision: submitDecision,
				},
			}).unwrap();
			onReviewChanged(response.change, response.message);
			setSubmitDialogOpen(false);
			await reviewListQuery.refetch();
		} catch (completeError) {
			setError(errorToMessage(completeError));
		} finally {
			setIsSaving(false);
		}
	};

	const canSubmitReview =
		submitDecision === "comment"
			? Boolean(normalizeReviewSummary(submitSummary) || persistedComments.length > 0 || normalizeRequiredChanges(requiredChanges).length > 0)
			: Boolean(normalizeReviewSummary(submitSummary));
	const isReviewSurfaceLoading =
		!reviewSurfaceKey ||
		reviewListQuery.isLoading ||
		(Boolean(latestReviewSummary) && (reviewGetQuery.isLoading || (!activeReview && reviewGetQuery.isFetching)));
	const boardSummaryLoading =
		boardSummaryQuery.isLoading || (boardSummaryQuery.isFetching && boardSummaryQuery.currentData === undefined);
	const expandedCommitFilesLoading =
		boardFilesQuery.isLoading || (boardFilesQuery.isFetching && boardFilesQuery.currentData === undefined);
	const selectedCommitFileDiffLoading =
		boardFileDiffQuery.isLoading || (boardFileDiffQuery.isFetching && boardFileDiffQuery.currentData === undefined);
	const visibleRequiredChanges = normalizeRequiredChanges(requiredChanges);
	const visibleInlineComments = Array.from(comments.values()).filter((comment) => comment.comment.trim().length > 0);
	const visibleCommits = boardSummary?.commits ?? [];
	const doneStatus = change ? getUiOnlyDoneStatus(change.status) : null;
	const isMissingRequiredCommit = Boolean(boardSummary && visibleCommits.length === 0);
	const canMarkDoneWithoutReview = Boolean(!activeReview && doneStatus && (!hasWorkspacePath || isMissingRequiredCommit));
	const markDoneReason = !hasWorkspacePath
		? "This change does not have a workspace to review."
		: isMissingRequiredCommit
			? "No reviewable commit was found for this change."
			: "";
	const visibleSummary = normalizeReviewSummary(summary);
	const totalAdditions = workspaceFiles?.reduce((sum, file) => sum + file.additions, 0) ?? 0;
	const totalDeletions = workspaceFiles?.reduce((sum, file) => sum + file.deletions, 0) ?? 0;
	const hasConversationActivity =
		visibleInlineComments.length > 0 ||
		visibleRequiredChanges.length > 0 ||
		visibleCommits.length > 0 ||
		Boolean(activeReview?.completedAt && visibleSummary);
	const stackColumnWidth = isStackCollapsed ? COLLAPSED_GIT_HISTORY_PANEL_WIDTH : REVIEW_STACK_PANEL_WIDTH;
	const fileColumnWidth = isReviewFilesCollapsed ? COLLAPSED_GIT_HISTORY_PANEL_WIDTH : fileTreePanelWidth;
	const draftColumnWidth = isDraftCollapsed ? COLLAPSED_GIT_HISTORY_PANEL_WIDTH : reviewDraftPanelWidth;
	const draftResizeHandleWidth = isDraftCollapsed ? 0 : 1;
	const commitDiffColumnWidth = selectedCommitFile ? REVIEW_COMMIT_DIFF_PANEL_WIDTH : 0;
	const reviewCanvasWidth =
		stackColumnWidth +
		diffContentPanelWidth +
		fileColumnWidth +
		draftColumnWidth +
		draftResizeHandleWidth +
		commitDiffColumnWidth +
		REVIEW_TRAILING_SPACE_WIDTH;

	const markDoneWithoutReview = async (): Promise<void> => {
		if (!change || !doneStatus || !onMarkDone) {
			return;
		}
		setIsMarkingDone(true);
		setError(null);
		try {
			await onMarkDone(change.id, doneStatus);
		} catch (markError) {
			setError(markError instanceof Error ? markError.message : String(markError));
		} finally {
			setIsMarkingDone(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex min-h-0 min-w-0 flex-col bg-surface-0 text-text-primary">
			<header className="flex h-12 shrink-0 items-center gap-3 border-b border-divider bg-surface-1 px-3">
				<Button
					variant="ghost"
					size="sm"
					icon={<ArrowLeft size={15} />}
					onClick={() => onOpenChange(false)}
				>
					Back
				</Button>
				<FileDiff size={16} className="shrink-0 text-text-secondary" />
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-semibold text-text-primary">
						Review {change.id}: {change.title}
					</div>
					<div className="flex items-center gap-2 text-[11px] text-text-tertiary">
						<span>{activeReview ? `review-${String(activeReview.review).padStart(3, "0")}.md` : "No review file"}</span>
						{isDirty ? <span>Unsaved draft</span> : null}
					</div>
				</div>
				{error ? <span className="max-w-[360px] truncate text-xs text-status-red">{error}</span> : null}
				<Button
					variant="default"
					size="sm"
					icon={<RefreshCw size={14} />}
					onClick={() => void reloadReviewSurface()}
					disabled={isSaving || isReviewSurfaceLoading || isWorkspaceChangesLoading}
				>
					Reload
				</Button>
				<Button
					variant="default"
					size="sm"
					icon={<Save size={14} />}
					onClick={() => void saveReview()}
					disabled={!activeReview || !isDirty || isSaving}
				>
					Save Draft
				</Button>
				<Button
					variant="primary"
					size="sm"
					icon={<Send size={14} />}
					onClick={() => openSubmitDialog("comment")}
					disabled={!activeReview || isSaving}
				>
					Submit review
				</Button>
			</header>
			<div
				ref={reviewScrollerRef}
				data-testid="review-horizontal-scroller"
				className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
			>
				<div
					className="flex h-full min-h-0"
					style={{
						width: reviewCanvasWidth,
						minWidth: reviewCanvasWidth,
					}}
				>
					{isStackCollapsed ? (
						<CollapsedHistoryRail
							label="Changes"
							count={reviewableChanges.length}
							icon={<PanelLeft size={14} />}
							ariaLabel="Expand review changes panel"
							onExpand={() => setStackCollapsed(false)}
						/>
					) : (
						<aside
							className="flex min-h-0 shrink-0 flex-col border-r border-divider bg-surface-0"
							style={{ width: REVIEW_STACK_PANEL_WIDTH, minWidth: REVIEW_STACK_PANEL_WIDTH }}
						>
							<PanelHeader
								title="Review Changes"
								subtitle={`${reviewableChanges.length} reviewable`}
								onCollapse={() => setStackCollapsed(true)}
							/>
							<div className="min-h-0 flex-1 overflow-y-auto p-2">
								{reviewableChanges.map((candidate, index) => (
									<button
										key={candidate.id}
										type="button"
										className={cn(
											"mb-2 w-full rounded-md border px-3 py-2 text-left transition-colors",
											candidate.id === change.id
												? "border-border-focus bg-surface-3"
												: "border-divider bg-surface-1 hover:bg-surface-2",
										)}
										onClick={() => onSelectChange(candidate.id)}
									>
										<div className="mb-1 flex items-center justify-between gap-2">
											<span className="font-mono text-xs text-text-tertiary">{candidate.id}</span>
											<span className="text-[11px] text-text-tertiary">{index + 1}</span>
										</div>
										<div className="line-clamp-2 text-sm font-medium text-text-primary">{candidate.title}</div>
										<div className="mt-2">
											<ChangeStatusChip status={candidate.status} />
										</div>
									</button>
								))}
							</div>
							<div className="flex gap-2 border-t border-divider p-2">
								<Button
									variant="default"
									size="sm"
									disabled={activeIndex <= 0}
									onClick={() => {
										const previous = reviewableChanges[activeIndex - 1];
										if (previous) onSelectChange(previous.id);
									}}
								>
									Previous
								</Button>
								<Button
									variant="default"
									size="sm"
									disabled={activeIndex < 0 || activeIndex >= reviewableChanges.length - 1}
									onClick={() => {
										const next = reviewableChanges[activeIndex + 1];
										if (next) onSelectChange(next.id);
									}}
								>
									Next
								</Button>
							</div>
						</aside>
					)}

					{isReviewFilesCollapsed ? (
						<CollapsedHistoryRail
							label="Files"
							count={workspaceFiles?.length ?? null}
							icon={<Files size={14} />}
							ariaLabel="Expand review files panel"
							onExpand={() => setReviewFilesCollapsed(false)}
						/>
					) : (
						<aside
							className="flex min-h-0 shrink-0 flex-col border-r border-divider bg-surface-0"
							style={{ width: fileTreePanelWidth, minWidth: fileTreePanelWidth }}
						>
							<PanelHeader
								title="Files"
								subtitle={workspaceFiles ? `${workspaceFiles.length} changed` : null}
								onCollapse={() => setReviewFilesCollapsed(true)}
							/>
							{workspaceFiles && workspaceFiles.length > 0 ? (
								<FileTreePanel
									workspaceFiles={workspaceFiles}
									selectedPath={selectedPath}
									onSelectPath={setSelectedPath}
									panelFlex="1 1 0"
									viewMode={reviewFileViewMode}
									onViewModeChange={setPersistedReviewFileViewMode}
									showViewModeToggle
								/>
							) : workspaceFiles === null && isWorkspaceChangesLoading ? (
								<div className="min-h-0 flex-1 overflow-hidden p-3">
									<FileChangesSkeleton />
								</div>
							) : (
								<div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-text-secondary">
									{!hasWorkspacePath
										? "Start this change to create a workspace before reviewing file changes."
										: workspaceFiles === null
											? "File changes are not loaded yet. Use Reload to try again."
											: "No workspace file changes recorded for this review."}
								</div>
							)}
						</aside>
					)}

					<main
						className="flex min-h-0 shrink-0 flex-col border-r border-divider bg-surface-0"
						style={{ width: diffContentPanelWidth, minWidth: diffContentPanelWidth }}
						onWheelCapture={handleDiffWheelCapture}
					>
						<div className="flex h-11 items-center gap-2 border-b border-divider bg-surface-1 px-3">
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-semibold text-text-primary">{change.title}</div>
								<div className="text-[11px] text-text-tertiary">
									{workspaceFiles ? (
										`${workspaceFiles.length} files`
									) : hasWorkspacePath && isWorkspaceChangesLoading ? (
										<SkeletonLine className="mt-1 h-2.5 w-20" />
									) : hasWorkspacePath ? (
										"Files not loaded"
									) : (
										"No workspace"
									)}
								</div>
							</div>
						</div>
						{!hasWorkspacePath ? (
							<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
								Start this change to create a workspace before reviewing file changes.
							</div>
						) : !isRuntimeAvailable ? (
							<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
								Runtime workspace changes are not available for this project.
							</div>
						) : workspaceFiles === null && isWorkspaceChangesLoading ? (
							<FileDiffSkeleton />
						) : workspaceFiles === null ? (
							<div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
								<span>Diff is not loaded yet. Use Reload to try again.</span>
							</div>
						) : workspaceFiles.length === 0 ? (
							<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
								No workspace file changes recorded for this review.
							</div>
						) : (
							<DiffViewerPanel
								workspaceFiles={workspaceFiles}
								selectedPath={selectedPath}
								onSelectedPathChange={setSelectedPath}
								viewMode="unified"
								comments={comments}
								onCommentsChange={setComments}
								onInsertRequiredChange={insertRequiredChangeFromComment}
								scrollTarget={lineScrollTarget}
							/>
						)}
					</main>

					{isDraftCollapsed ? (
						<CollapsedHistoryRail
							label="Conversation"
							count={visibleCommits.length + visibleInlineComments.length + visibleRequiredChanges.length}
							icon={<PanelRight size={14} />}
							ariaLabel="Expand review conversation panel"
							onExpand={() => setDraftCollapsed(false)}
						/>
					) : (
						<aside
							className="flex min-h-0 shrink-0 flex-col bg-surface-0"
							style={{ width: reviewDraftPanelWidth, minWidth: reviewDraftPanelWidth }}
						>
							<PanelHeader
								title="Conversation"
								subtitle={activeReview ? `review-${String(activeReview.review).padStart(3, "0")}.md` : "No review file"}
								onCollapse={() => setDraftCollapsed(true)}
							/>
							{isReviewSurfaceLoading ? (
								<div className="space-y-4 p-3" role="status" aria-label="Loading review conversation">
									{Array.from({ length: 4 }).map((_, index) => (
										<div key={`review-conversation-skeleton-${index}`} className="rounded-md border border-divider bg-surface-1 p-3">
											<SkeletonLine className="mb-3 w-1/2" />
											<SkeletonLine className="mb-2 w-full" />
											<SkeletonLine className="w-2/3" />
										</div>
									))}
								</div>
							) : !activeReview ? (
								<div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center text-sm text-text-secondary">
									<p>No local review exists for this change yet.</p>
									{canMarkDoneWithoutReview ? (
										<div className="max-w-sm rounded-md border border-divider bg-surface-1 px-3 py-3 text-left">
											<p className="text-sm text-text-secondary">{markDoneReason}</p>
											<p className="mt-1 text-xs text-text-tertiary">
												You can mark it done without creating a review, or start a review draft if you still want to capture notes.
											</p>
											<Button
												className="mt-3"
												variant="primary"
												size="sm"
												icon={<CheckCircle2 size={14} />}
												onClick={() => void markDoneWithoutReview()}
												disabled={isSaving || isMarkingDone || !onMarkDone}
											>
												{isMarkingDone ? "Marking Done..." : "Mark Done"}
											</Button>
										</div>
									) : null}
									<Button variant="default" icon={<Plus size={14} />} onClick={startReview} disabled={isSaving || isMarkingDone}>
										Start Review
									</Button>
								</div>
							) : (
								<div className="min-h-0 flex-1 overflow-y-auto p-3">
									<div className="space-y-3">
										<ConversationEvent
											icon={<MessageSquare size={14} />}
											title={`${activeReview.reviewer ?? "Reviewer"} started review`}
											meta={formatReviewDate(activeReview.createdAt)}
										>
											<div className="flex items-center gap-2">
												<ChangeStatusChip status={change.status} />
												<span className="text-text-tertiary">{change.id}</span>
											</div>
										</ConversationEvent>

										<ConversationEvent icon={<GitCommit size={14} />} title="Local file changes">
											{workspaceFiles === null ? (
												isWorkspaceChangesLoading ? (
													<div role="status" aria-label="Loading file changes">
														<SkeletonLine className="h-3 w-44" />
													</div>
												) : (
													<span>File changes are not loaded.</span>
												)
											) : (
												<span>
													{workspaceFiles.length} {workspaceFiles.length === 1 ? "file" : "files"} changed ·{" "}
													<span className="text-status-green">+{totalAdditions}</span>{" "}
													<span className="text-status-red">-{totalDeletions}</span>
												</span>
											)}
										</ConversationEvent>

										<ConversationEvent icon={<GitCommitVertical size={14} />} title="Commits">
											{boardSummaryLoading ? (
												<span>Loading commits...</span>
											) : boardSummaryError ? (
												<span className="text-status-red">{boardSummaryError.message}</span>
											) : visibleCommits.length > 0 ? (
												<div className="space-y-2">
													{visibleCommits.map((commit) => (
														<ReviewCommitTimelineCard
															key={commit.hash}
														commit={commit}
														filesResponse={commitFiles[commit.hash] ?? null}
														isExpanded={expandedCommitHash === commit.hash}
														isSelected={selectedCommitHash === commit.hash}
														isLoading={expandedCommitHash === commit.hash && expandedCommitFilesLoading}
														error={commitFileErrors[commit.hash] ?? null}
														selectedFile={selectedCommitFile}
															onSelectCommit={selectCommit}
															onToggle={toggleCommit}
															onSelectFile={selectCommitFile}
														/>
													))}
												</div>
											) : (
												<span>{boardSummary?.error ?? "No commits available for this change."}</span>
											)}
										</ConversationEvent>

										<div className="relative pl-9">
											<div className="absolute left-3 top-0 bottom-[-12px] w-px bg-divider" aria-hidden />
											<div className="absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-divider bg-surface-1 text-text-secondary">
												<ListChecks size={14} />
											</div>
											<div className="rounded-md border border-divider bg-surface-1">
												<div className="flex items-center justify-between gap-2 border-b border-divider px-3 py-2">
													<div className="text-sm font-medium text-text-primary">Required changes</div>
													<Button
														variant="ghost"
														size="sm"
														icon={<Plus size={13} />}
														onClick={() => addRequiredChange()}
														disabled={isSaving}
													>
														Add
													</Button>
												</div>
												<div className="space-y-2 p-2">
													{requiredChanges.length === 0 ? (
														<p className="px-1 py-2 text-sm text-text-tertiary">No required changes.</p>
													) : (
														requiredChanges.map((item, index) => (
															<RequiredChangeRow
																key={index}
																item={item}
																index={index}
																lineText={resolveRequiredChangeLineText(item, workspaceFiles)}
																disabled={isSaving}
																onCheckedChange={updateRequiredChangeChecked}
																onTextChange={updateRequiredChangeText}
																onDelete={deleteRequiredChange}
																onNavigate={navigateToInlineComment}
															/>
														))
													)}
												</div>
											</div>
										</div>

										{visibleInlineComments.length > 0 ? (
											visibleInlineComments.map((comment) => (
												<ConversationEvent
													key={`${comment.filePath}:${comment.variant}:${comment.lineNumber}:${comment.comment}`}
													icon={<MessageSquare size={14} />}
													title={`Comment on ${comment.filePath}:${comment.lineNumber}`}
												>
													<InlineCommentConversationCard
														comment={comment}
														lineText={resolveInlineCommentLineText(comment, workspaceFiles)}
														disabled={isSaving}
														onNavigate={navigateToInlineComment}
														onDelete={deleteInlineComment}
													/>
												</ConversationEvent>
											))
										) : (
											<ConversationEvent icon={<MessageSquare size={14} />} title="Inline comments">
												Click a diff line to add an inline comment.
											</ConversationEvent>
										)}

										{activeReview.completedAt && visibleSummary ? (
											<ConversationEvent
												icon={<CheckCircle2 size={14} />}
												title={`${activeReview.reviewer ?? "Reviewer"} ${reviewDecisionLabel(activeReview.status)}`}
												meta={formatReviewDate(activeReview.completedAt)}
											>
												<MarkdownMessagePreview value={visibleSummary} emptyLabel="" />
											</ConversationEvent>
										) : null}

										{!hasConversationActivity ? (
											<p className="rounded-md border border-dashed border-divider px-3 py-3 text-sm text-text-tertiary">
												No review conversation activity yet.
											</p>
										) : null}
									</div>
								</div>
							)}
						</aside>
					)}
					{isDraftCollapsed ? null : (
						<ResizeHandle
							orientation="vertical"
							ariaLabel="Resize conversation panel"
							onMouseDown={handleDraftPanelResizeMouseDown}
						/>
					)}
					{selectedCommitFile ? (
							<ReviewCommitDiffPanel
								selection={selectedCommitFile}
								diff={commitFileDiff}
								isLoading={selectedCommitFileDiffLoading}
								error={commitFileDiffError}
								onClose={() => setSelectedCommitFile(null)}
						/>
					) : null}
					<div
						aria-hidden
						data-testid="review-trailing-space"
						className="h-full shrink-0 bg-surface-0"
						style={{ width: REVIEW_TRAILING_SPACE_WIDTH, minWidth: REVIEW_TRAILING_SPACE_WIDTH }}
					/>
				</div>
			</div>
			<SubmitReviewDialog
				open={isSubmitDialogOpen}
				decision={submitDecision}
				body={submitSummary}
				isSaving={isSaving}
				error={error}
				canSubmit={canSubmitReview}
				onOpenChange={setSubmitDialogOpen}
				onDecisionChange={setSubmitDecision}
				onBodyChange={setSubmitSummary}
				onSubmit={() => void submitReview()}
			/>
		</div>
	);
}
