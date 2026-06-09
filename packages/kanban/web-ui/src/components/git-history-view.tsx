import { GitBranch, ListTree, Rows3, Trash2 } from "lucide-react";
import { type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent, useCallback, useRef, useState } from "react";

import { CollapsedHistoryRail } from "@/components/git-history/collapsed-history-rail";
import { GitCommitDiffPanel } from "@/components/git-history/git-commit-diff-panel";
import { GitCommitListPanel } from "@/components/git-history/git-commit-list-panel";
import { GitRefsPanel } from "@/components/git-history/git-refs-panel";
import type { UseGitHistoryDataResult } from "@/components/git-history/use-git-history-data";
import { Button } from "@/components/ui/button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogBody,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ResizeHandle } from "@/resize/resize-handle";
import {
	COLLAPSED_GIT_HISTORY_PANEL_WIDTH,
	MIN_GIT_COMMITS_PANEL_WIDTH,
	MIN_GIT_REFS_PANEL_WIDTH,
	useGitHistoryLayout,
} from "@/resize/use-git-history-layout";
import { clampAtLeast } from "@/resize/resize-persistence";
import { useResizeDrag } from "@/resize/use-resize-drag";
import type { RuntimeGitCommit } from "@/runtime/types";
import { relayReactHorizontalWheelScroll } from "@/utils/horizontal-wheel-scroll";

function CommitDiffHeader({ commit }: { commit: RuntimeGitCommit }): React.ReactElement {
	return (
		<div
			style={{
				padding: "10px 12px",
				borderBottom: "1px solid var(--color-divider)",
				background: "var(--color-surface-1)",
			}}
		>
			<div
				style={{
					fontSize: 14,
					color: "var(--color-text-primary)",
					marginBottom: 4,
					lineHeight: 1.4,
				}}
			>
				{commit.message}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					fontSize: 10,
					color: "var(--color-text-tertiary)",
				}}
			>
				<span>{commit.authorName}</span>
				<span>
					{new Date(commit.date).toLocaleDateString(undefined, {
						year: "numeric",
						month: "short",
						day: "numeric",
					})}
				</span>
				<code className="font-mono">{commit.shortHash}</code>
			</div>
		</div>
	);
}

interface GitHistoryViewProps {
	workspaceId: string | null;
	gitHistory: UseGitHistoryDataResult;
	onCheckoutBranch?: (branch: string) => void;
	onDiscardWorkingChanges?: () => void;
	isDiscardWorkingChangesPending?: boolean;
}

export function GitHistoryView({
	workspaceId,
	gitHistory,
	onCheckoutBranch,
	onDiscardWorkingChanges,
	isDiscardWorkingChangesPending = false,
}: GitHistoryViewProps): React.ReactElement {
	const [isDiscardAlertOpen, setIsDiscardAlertOpen] = useState(false);
	const historyScrollContainerRef = useRef<HTMLDivElement | null>(null);
	const { startDrag: startRefsPanelResize } = useResizeDrag();
	const { startDrag: startCommitsPanelResize } = useResizeDrag();
	const {
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
		setRefsPanelCollapsed,
		setCommitsPanelCollapsed,
		setFileTreePanelCollapsed,
	} = useGitHistoryLayout();

	const handleRefsSeparatorMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			const startX = event.clientX;
			const startWidth = refsPanelWidth;
			startRefsPanelResize(event, {
				axis: "x",
				cursor: "ew-resize",
				onMove: (pointerX) => {
					setRefsPanelWidth(clampAtLeast(startWidth + (pointerX - startX), MIN_GIT_REFS_PANEL_WIDTH, true));
				},
				onEnd: (pointerX) => {
					setRefsPanelWidth(clampAtLeast(startWidth + (pointerX - startX), MIN_GIT_REFS_PANEL_WIDTH, true));
				},
			});
		},
		[refsPanelWidth, setRefsPanelWidth, startRefsPanelResize],
	);

	const handleCommitsSeparatorMouseDown = useCallback(
		(event: ReactMouseEvent<HTMLDivElement>) => {
			const startX = event.clientX;
			const startWidth = commitsPanelWidth;
			startCommitsPanelResize(event, {
				axis: "x",
				cursor: "ew-resize",
				onMove: (pointerX) => {
					setCommitsPanelWidth(
						clampAtLeast(startWidth + (pointerX - startX), MIN_GIT_COMMITS_PANEL_WIDTH, true),
					);
				},
				onEnd: (pointerX) => {
					setCommitsPanelWidth(
						clampAtLeast(startWidth + (pointerX - startX), MIN_GIT_COMMITS_PANEL_WIDTH, true),
					);
				},
			});
		},
		[commitsPanelWidth, setCommitsPanelWidth, startCommitsPanelResize],
	);

	const handleHistoryColumnWheelCapture = useCallback((event: ReactWheelEvent<HTMLElement>) => {
		relayReactHorizontalWheelScroll(event, historyScrollContainerRef.current);
	}, []);

	const refsColumnWidth = isRefsPanelCollapsed ? COLLAPSED_GIT_HISTORY_PANEL_WIDTH : refsPanelWidth;
	const commitsColumnWidth = isCommitsPanelCollapsed ? COLLAPSED_GIT_HISTORY_PANEL_WIDTH : commitsPanelWidth;
	const filesColumnWidth = isFileTreePanelCollapsed ? COLLAPSED_GIT_HISTORY_PANEL_WIDTH : fileTreePanelWidth;
	const diffResizeHandleWidth = isFileTreePanelCollapsed ? 0 : 1;
	const historyCanvasWidth =
		refsColumnWidth +
		commitsColumnWidth +
		diffContentPanelWidth +
		filesColumnWidth +
		diffResizeHandleWidth +
		(isRefsPanelCollapsed || isCommitsPanelCollapsed ? 0 : 1) +
		(isCommitsPanelCollapsed ? 0 : 1);

	if (!workspaceId) {
		return (
			<div
				className="flex flex-col items-center justify-center gap-3 py-12 text-text-tertiary"
				style={{ flex: 1, background: "var(--color-surface-0)" }}
			>
				<GitBranch size={48} />
				<h3 className="font-semibold text-text-primary">No project selected</h3>
			</div>
		);
	}

	return (
		<div
			ref={historyScrollContainerRef}
			style={{
				flex: "1 1 0",
				minHeight: 0,
				overflowX: "auto",
				overflowY: "hidden",
				background: "var(--color-surface-0)",
			}}
		>
			<div
				data-testid="git-history-canvas"
				style={{
					display: "flex",
					width: historyCanvasWidth,
					minWidth: historyCanvasWidth,
					flex: "0 0 auto",
					minHeight: "100%",
				}}
			>
				{isRefsPanelCollapsed ? (
					<CollapsedHistoryRail
						label="Refs"
						count={gitHistory.refs.length + (gitHistory.hasWorkingCopy ? 1 : 0)}
						icon={<ListTree size={14} />}
						ariaLabel="Expand refs panel"
						onExpand={() => setRefsPanelCollapsed(false)}
					/>
				) : (
					<GitRefsPanel
						refs={gitHistory.refs}
						selectedRefName={gitHistory.viewMode === "working-copy" ? null : (gitHistory.activeRef?.name ?? null)}
						isLoading={gitHistory.isRefsLoading}
						errorMessage={gitHistory.refsErrorMessage}
						panelWidth={refsPanelWidth}
						workingCopyChanges={gitHistory.hasWorkingCopy ? gitHistory.workingCopyFileCount : null}
						isWorkingCopySelected={gitHistory.viewMode === "working-copy"}
						onSelectRef={gitHistory.selectRef}
						onSelectWorkingCopy={gitHistory.hasWorkingCopy ? gitHistory.selectWorkingCopy : undefined}
						onCheckoutRef={onCheckoutBranch}
						onCollapse={() => setRefsPanelCollapsed(true)}
						onBodyWheelCapture={handleHistoryColumnWheelCapture}
					/>
				)}
				{!isRefsPanelCollapsed && !isCommitsPanelCollapsed ? (
					<ResizeHandle
						orientation="vertical"
						ariaLabel="Resize repository refs and commits panels"
						onMouseDown={handleRefsSeparatorMouseDown}
						className="z-10"
					/>
				) : null}
				{isCommitsPanelCollapsed ? (
					<CollapsedHistoryRail
						label="Commits"
						count={gitHistory.totalCommitCount || gitHistory.commits.length}
						icon={<Rows3 size={14} />}
						ariaLabel="Expand commits panel"
						onExpand={() => setCommitsPanelCollapsed(false)}
					/>
				) : (
					<GitCommitListPanel
						commits={gitHistory.commits}
						totalCount={gitHistory.totalCommitCount}
						selectedCommitHash={gitHistory.viewMode === "commit" ? gitHistory.selectedCommitHash : null}
						isLoading={gitHistory.isLogLoading}
						isLoadingMore={gitHistory.isLoadingMoreCommits}
						canLoadMore={gitHistory.commits.length < gitHistory.totalCommitCount}
						errorMessage={gitHistory.logErrorMessage}
						refs={gitHistory.refs}
						panelWidth={commitsPanelWidth}
						onSelectCommit={gitHistory.selectCommit}
						onLoadMore={gitHistory.loadMoreCommits}
						onCollapse={() => setCommitsPanelCollapsed(true)}
						onBodyWheelCapture={handleHistoryColumnWheelCapture}
					/>
				)}
				{!isCommitsPanelCollapsed ? (
					<ResizeHandle
						orientation="vertical"
						ariaLabel="Resize repository commits and diff panels"
						onMouseDown={handleCommitsSeparatorMouseDown}
						className="z-10"
					/>
				) : null}
				<GitCommitDiffPanel
					diffSource={gitHistory.diffSource}
					isLoading={gitHistory.isDiffLoading}
					errorMessage={gitHistory.diffErrorMessage}
					selectedPath={gitHistory.selectedDiffPath}
					onSelectPath={gitHistory.selectDiffPath}
					diffContentPanelWidth={diffContentPanelWidth}
					fileTreePanelWidth={fileTreePanelWidth}
					isFileTreePanelCollapsed={isFileTreePanelCollapsed}
					setDiffContentPanelWidth={setDiffContentPanelWidth}
					setFileTreePanelCollapsed={setFileTreePanelCollapsed}
					onBodyWheelCapture={handleHistoryColumnWheelCapture}
					headerContent={
						gitHistory.viewMode === "commit" && gitHistory.selectedCommit ? (
							<CommitDiffHeader commit={gitHistory.selectedCommit} />
						) : gitHistory.viewMode === "working-copy" ? (
							<div
								className="kb-git-working-copy-header"
								style={{
									display: "flex",
									alignItems: "center",
									padding: "10px 12px",
									borderBottom: "1px solid var(--color-border)",
									fontSize: 14,
									color: "var(--color-text-primary)",
								}}
							>
								<span style={{ flex: 1 }}>Working Copy Changes</span>
								{onDiscardWorkingChanges ? (
									<Button
										variant="danger"
										size="sm"
										icon={<Trash2 size={14} />}
										aria-label="Discard all changes"
										disabled={isDiscardWorkingChangesPending}
										onClick={() => setIsDiscardAlertOpen(true)}
									>
										{isDiscardWorkingChangesPending ? <Spinner size={14} /> : null}
									</Button>
								) : null}
							</div>
						) : null
					}
				/>
			</div>
			<AlertDialog
				open={isDiscardAlertOpen}
				onOpenChange={(open) => {
					if (!open) setIsDiscardAlertOpen(false);
				}}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>Discard all changes?</AlertDialogTitle>
				</AlertDialogHeader>
				<AlertDialogBody>
					<AlertDialogDescription>
						Are you sure you want to discard all working copy changes? This cannot be undone.
					</AlertDialogDescription>
				</AlertDialogBody>
				<AlertDialogFooter>
					<AlertDialogCancel asChild>
						<Button
							variant="default"
							onClick={() => setIsDiscardAlertOpen(false)}
							disabled={isDiscardWorkingChangesPending}
						>
							Cancel
						</Button>
					</AlertDialogCancel>
					<AlertDialogAction asChild>
						<Button
							variant="danger"
							disabled={isDiscardWorkingChangesPending}
							onClick={() => {
								setIsDiscardAlertOpen(false);
								onDiscardWorkingChanges?.();
							}}
						>
							{isDiscardWorkingChangesPending ? <Spinner size={14} /> : null}
							Discard All
						</Button>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialog>
		</div>
	);
}
