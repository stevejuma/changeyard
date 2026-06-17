import {
	ArrowLeft,
	CheckCircle2,
	ChevronLeft,
	FileDiff,
	Files,
	MessageSquare,
	PanelLeft,
	PanelRight,
	Plus,
	RefreshCw,
	Save,
} from "lucide-react";
import {
	type MouseEvent as ReactMouseEvent,
	type ReactElement,
	type WheelEvent as ReactWheelEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { type DiffLineComment, DiffViewerPanel } from "@/components/detail-panels/diff-viewer-panel";
import { FileTreePanel, type FileTreePanelViewMode } from "@/components/detail-panels/file-tree-panel";
import { CollapsedHistoryRail } from "@/components/git-history/collapsed-history-rail";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { MarkdownMessageEditor } from "@/components/ui/markdown-message-editor";
import { Spinner } from "@/components/ui/spinner";
import { ChangeStatusChip } from "@/components/ui/status-chip";
import { ResizeHandle } from "@/resize/resize-handle";
import { clampAtLeast, readPersistedResizeNumber, writePersistedResizeNumber } from "@/resize/resize-persistence";
import { useResizeDrag } from "@/resize/use-resize-drag";
import {
	COLLAPSED_GIT_HISTORY_PANEL_WIDTH,
	useGitHistoryLayout,
} from "@/resize/use-git-history-layout";
import { getRuntimeTrpcClient } from "@/runtime/trpc-client";
import type {
	RuntimeChangeyardChangeDetail,
	RuntimeChangeyardChangeListItem,
	RuntimeChangeyardReviewDetail,
	RuntimeChangeyardReviewRequiredChange,
	RuntimeChangeyardReviewSummary,
} from "@/runtime/types";
import { useRuntimeChangeWorkspaceChanges } from "@/runtime/use-runtime-change-workspace-changes";
import { LocalStorageKey } from "@/storage/local-storage-store";

const REVIEW_DIFF_POLL_INTERVAL_MS = 1_500;
const REVIEW_STACK_PANEL_WIDTH = 300;
const REVIEW_DRAFT_PANEL_DEFAULT_WIDTH = 460;
const REVIEW_DRAFT_PANEL_MIN_WIDTH = 380;
const REVIEW_TRAILING_SPACE_WIDTH = 180;

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

function normalizeRequiredChanges(items: RuntimeChangeyardReviewRequiredChange[]): RuntimeChangeyardReviewRequiredChange[] {
	return items.map((item) => ({ checked: item.checked, text: item.text.trim() })).filter((item) => item.text);
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

function reviewDraftFingerprint(input: {
	summary: string;
	requiredChanges: RuntimeChangeyardReviewRequiredChange[];
	inlineComments: Array<{ path: string; line: number; body: string }>;
}): string {
	return JSON.stringify({
		summary: input.summary.trim(),
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

export function ChangeReviewModal({
	open,
	change,
	changes,
	workspaceId,
	onOpenChange,
	onSelectChange,
	onReviewChanged,
}: {
	open: boolean;
	change: RuntimeChangeyardChangeDetail | null;
	changes: RuntimeChangeyardChangeListItem[];
	workspaceId: string | null;
	onOpenChange: (open: boolean) => void;
	onSelectChange: (changeId: string) => void;
	onReviewChanged: (change: RuntimeChangeyardChangeDetail, message: string) => void;
}): ReactElement | null {
	const [reviews, setReviews] = useState<RuntimeChangeyardReviewSummary[]>([]);
	const [activeReview, setActiveReview] = useState<RuntimeChangeyardReviewDetail | null>(null);
	const [summary, setSummary] = useState("");
	const [requiredChanges, setRequiredChanges] = useState<RuntimeChangeyardReviewRequiredChange[]>([]);
	const [comments, setComments] = useState<Map<string, DiffLineComment>>(new Map());
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isStackCollapsed, setStackCollapsed] = useState(false);
	const [isDraftCollapsed, setDraftCollapsed] = useState(false);
	const [isReviewFilesCollapsed, setReviewFilesCollapsed] = useState(false);
	const [reviewFileViewMode, setReviewFileViewMode] = useState<FileTreePanelViewMode>("tree");
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

	const changeId = open && change ? change.id : null;
	const {
		changes: workspaceChanges,
		isLoading: isWorkspaceChangesLoading,
		isRuntimeAvailable,
		refresh: refreshWorkspaceChanges,
	} = useRuntimeChangeWorkspaceChanges(
		changeId,
		workspaceId,
		open ? REVIEW_DIFF_POLL_INTERVAL_MS : null,
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

	const loadReviews = useCallback(async () => {
		if (!open || !workspaceId || !change) {
			setReviews([]);
			setActiveReview(null);
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			const client = getRuntimeTrpcClient(workspaceId);
			const list = await client.changes.reviewList.query({ id: change.id });
			setReviews(list.reviews);
			const latest = list.reviews[list.reviews.length - 1] ?? null;
			if (!latest) {
				setActiveReview(null);
				setSummary("");
				setRequiredChanges([]);
				setComments(new Map());
				return;
			}
			const detail = await client.changes.reviewGet.query({ id: change.id, review: latest.review });
			setActiveReview(detail);
			setSummary(detail.summary);
			setRequiredChanges(detail.requiredChanges.length ? detail.requiredChanges : [{ checked: false, text: "" }]);
			setComments(reviewCommentsToDiffMap(detail));
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : String(loadError));
		} finally {
			setIsLoading(false);
		}
	}, [change, open, workspaceId]);

	useEffect(() => {
		void loadReviews();
	}, [loadReviews]);

	const reloadReviewSurface = useCallback(async () => {
		await Promise.all([loadReviews(), refreshWorkspaceChanges()]);
	}, [loadReviews, refreshWorkspaceChanges]);

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

	useEffect(() => {
		if (selectedPath && availablePaths.includes(selectedPath)) {
			return;
		}
		setSelectedPath(availablePaths[0] ?? null);
	}, [availablePaths, selectedPath]);

	if (!open || !change) {
		return null;
	}

	const saveReview = async (): Promise<RuntimeChangeyardReviewDetail | null> => {
		if (!workspaceId || !activeReview) {
			return null;
		}
		setIsSaving(true);
		setError(null);
		try {
			const next = await getRuntimeTrpcClient(workspaceId).changes.reviewUpdate.mutate({
				id: change.id,
				review: activeReview.review,
				summary,
				requiredChanges: normalizeRequiredChanges(requiredChanges),
				inlineComments: diffMapToReviewComments(comments),
				expectedLastModifiedAt: activeReview.lastModifiedAt,
			});
			setActiveReview(next);
			setSummary(next.summary);
			setRequiredChanges(next.requiredChanges.length ? next.requiredChanges : [{ checked: false, text: "" }]);
			setComments(reviewCommentsToDiffMap(next));
			return next;
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : String(saveError));
			return null;
		} finally {
			setIsSaving(false);
		}
	};

	const startReview = async (): Promise<void> => {
		if (!workspaceId) {
			return;
		}
		setIsSaving(true);
		setError(null);
		try {
			const response = await getRuntimeTrpcClient(workspaceId).changes.reviewStart.mutate({ id: change.id });
			onReviewChanged(response.change, response.message);
			await loadReviews();
		} catch (startError) {
			setError(startError instanceof Error ? startError.message : String(startError));
		} finally {
			setIsSaving(false);
		}
	};

	const completeReview = async (decision: "comment" | "approve" | "request-changes"): Promise<void> => {
		if (!workspaceId || !activeReview) {
			return;
		}
		const next = isDirty ? await saveReview() : activeReview;
		if (!next) {
			return;
		}
		setIsSaving(true);
		setError(null);
		try {
			const response = await getRuntimeTrpcClient(workspaceId).changes.reviewComplete.mutate({
				id: change.id,
				decision,
			});
			onReviewChanged(response.change, response.message);
			await loadReviews();
		} catch (completeError) {
			setError(completeError instanceof Error ? completeError.message : String(completeError));
		} finally {
			setIsSaving(false);
		}
	};

	const hasRealSummary = Boolean(summary.trim() && summary.trim() !== "Review the change here.");
	const canComplete = Boolean(activeReview && hasRealSummary);
	const canComment = Boolean(activeReview && (hasRealSummary || persistedComments.length > 0));
	const stackColumnWidth = isStackCollapsed ? COLLAPSED_GIT_HISTORY_PANEL_WIDTH : REVIEW_STACK_PANEL_WIDTH;
	const fileColumnWidth = isReviewFilesCollapsed ? COLLAPSED_GIT_HISTORY_PANEL_WIDTH : fileTreePanelWidth;
	const draftColumnWidth = isDraftCollapsed ? COLLAPSED_GIT_HISTORY_PANEL_WIDTH : reviewDraftPanelWidth;
	const draftResizeHandleWidth = isDraftCollapsed ? 0 : 1;
	const reviewCanvasWidth =
		stackColumnWidth +
		diffContentPanelWidth +
		fileColumnWidth +
		draftColumnWidth +
		draftResizeHandleWidth +
		REVIEW_TRAILING_SPACE_WIDTH;

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
						<ChangeStatusChip status={change.status} />
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
					disabled={isSaving || isLoading || isWorkspaceChangesLoading}
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
					variant="default"
					size="sm"
					icon={<MessageSquare size={14} />}
					onClick={() => void completeReview("comment")}
					disabled={!canComment || isSaving}
				>
					Comment
				</Button>
				<Button
					variant="default"
					size="sm"
					icon={<RefreshCw size={14} />}
					onClick={() => void completeReview("request-changes")}
					disabled={!canComplete || isSaving}
				>
					Request Changes
				</Button>
				<Button
					variant="primary"
					size="sm"
					icon={<CheckCircle2 size={14} />}
					onClick={() => void completeReview("approve")}
					disabled={!canComplete || isSaving}
				>
					Approve
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
								subtitle={workspaceFiles ? `${workspaceFiles.length} changed` : "Loading"}
								onCollapse={() => setReviewFilesCollapsed(true)}
							/>
							{workspaceFiles && workspaceFiles.length > 0 ? (
								<FileTreePanel
									workspaceFiles={workspaceFiles}
									selectedPath={selectedPath}
									onSelectPath={setSelectedPath}
									panelFlex="1 1 0"
									viewMode={reviewFileViewMode}
									onViewModeChange={setReviewFileViewMode}
									showViewModeToggle
								/>
							) : (
								<div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-text-secondary">
									{!hasWorkspacePath
										? "Start this change to create a workspace before reviewing file changes."
										: workspaceFiles === null
											? isWorkspaceChangesLoading
												? "Loading file changes..."
												: "File changes are not loaded yet. Use Reload to try again."
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
									{workspaceFiles ? `${workspaceFiles.length} files` : hasWorkspacePath ? "Loading files" : "No workspace"}
								</div>
							</div>
							{isWorkspaceChangesLoading ? <Spinner size={14} /> : null}
						</div>
						{!hasWorkspacePath ? (
							<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
								Start this change to create a workspace before reviewing file changes.
							</div>
						) : !isRuntimeAvailable ? (
							<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
								Runtime workspace changes are not available for this project.
							</div>
						) : workspaceFiles === null ? (
							<div className="flex flex-1 items-center justify-center text-sm text-text-secondary">
								{isWorkspaceChangesLoading ? (
									<>
										<Spinner size={16} />
										<span className="ml-2">Loading diff...</span>
									</>
								) : (
									<span>Diff is not loaded yet. Use Reload to try again.</span>
								)}
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
							/>
						)}
					</main>

					{isDraftCollapsed ? (
						<CollapsedHistoryRail
							label="Review"
							count={persistedComments.length}
							icon={<PanelRight size={14} />}
							ariaLabel="Expand review draft panel"
							onExpand={() => setDraftCollapsed(false)}
						/>
					) : (
						<aside
							className="flex min-h-0 shrink-0 flex-col bg-surface-0"
							style={{ width: reviewDraftPanelWidth, minWidth: reviewDraftPanelWidth }}
						>
							<PanelHeader
								title="Review Draft"
								subtitle={activeReview ? `review-${String(activeReview.review).padStart(3, "0")}.md` : "No review file"}
								onCollapse={() => setDraftCollapsed(true)}
							/>
							{!activeReview ? (
								<div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center text-sm text-text-secondary">
									<p>No local review exists for this change yet.</p>
									<Button variant="primary" icon={<Plus size={14} />} onClick={startReview} disabled={isSaving}>
										Start Review
									</Button>
								</div>
							) : (
								<div className="min-h-0 flex-1 overflow-y-auto p-3">
									<label className="mb-3 block">
										<span className="mb-1 block text-xs font-semibold uppercase text-text-tertiary">
											Summary
										</span>
										<MarkdownMessageEditor
											value={summary}
											onChange={setSummary}
											height="180px"
											placeholder="Summarize the review decision."
											disabled={isSaving}
										/>
									</label>
									<div className="mb-3">
										<div className="mb-1 flex items-center justify-between">
											<span className="text-xs font-semibold uppercase text-text-tertiary">Required Changes</span>
											<Button
												variant="ghost"
												size="sm"
												icon={<Plus size={13} />}
												onClick={() => setRequiredChanges((items) => [...items, { checked: false, text: "" }])}
												disabled={isSaving}
											>
												Add
											</Button>
										</div>
										<div className="space-y-2">
											{requiredChanges.map((item, index) => (
												<div key={index} className="flex gap-2">
													<input
														type="checkbox"
														checked={item.checked}
														onChange={(event) =>
															setRequiredChanges((items) =>
																items.map((candidate, candidateIndex) =>
																	candidateIndex === index
																		? { ...candidate, checked: event.target.checked }
																		: candidate,
																),
															)
														}
														disabled={isSaving}
														className="mt-2"
													/>
													<input
														value={item.text}
														onChange={(event) =>
															setRequiredChanges((items) =>
																items.map((candidate, candidateIndex) =>
																	candidateIndex === index
																		? { ...candidate, text: event.target.value }
																		: candidate,
																),
															)
														}
														placeholder="Required change"
														disabled={isSaving}
														className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm text-text-primary focus:border-border-focus focus:outline-none"
													/>
												</div>
											))}
										</div>
									</div>
									<div>
										<div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase text-text-tertiary">
											<MessageSquare size={13} />
											Inline Comments
										</div>
										{persistedComments.length === 0 ? (
											<p className="rounded-md border border-divider bg-surface-1 px-3 py-2 text-sm text-text-secondary">
												Click a diff line to add an inline comment.
											</p>
										) : (
											<div className="space-y-2">
												{persistedComments.map((comment) => (
													<div key={`${comment.path}:${comment.line}:${comment.body}`} className="rounded-md border border-divider bg-surface-1 p-2">
														<div className="mb-1 font-mono text-xs text-text-tertiary">
															{comment.path}:{comment.line}
														</div>
														<div className="text-sm text-text-primary">{comment.body}</div>
													</div>
												))}
											</div>
										)}
									</div>
								</div>
							)}
						</aside>
					)}
					{isDraftCollapsed ? null : (
						<ResizeHandle
							orientation="vertical"
							ariaLabel="Resize review draft panel"
							onMouseDown={handleDraftPanelResizeMouseDown}
						/>
					)}
					<div
						aria-hidden
						data-testid="review-trailing-space"
						className="h-full shrink-0 bg-surface-0"
						style={{ width: REVIEW_TRAILING_SPACE_WIDTH, minWidth: REVIEW_TRAILING_SPACE_WIDTH }}
					/>
				</div>
			</div>
		</div>
	);
}
