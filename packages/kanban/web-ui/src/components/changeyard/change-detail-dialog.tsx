import {
	Bot,
	CheckCircle2,
	ClipboardCheck,
	FileDiff,
	GitPullRequest,
	PlayCircle,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { MarkdownDocumentEditor, MarkdownDocumentPreview } from "@/components/markdown-document";
import { PlanningGateList } from "@/components/changeyard/planning-gate-list";
import { type DiffLineComment, DiffViewerPanel } from "@/components/detail-panels/diff-viewer-panel";
import { FileTreePanel } from "@/components/detail-panels/file-tree-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { PathDisplay } from "@/components/ui/path-display";
import { ChangeStatusChip, StatusChip } from "@/components/ui/status-chip";
import type { RuntimeChangeyardChangeDetail, RuntimeTaskSessionSummary } from "@/runtime/types";
import { useRuntimeChangeWorkspaceChanges } from "@/runtime/use-runtime-change-workspace-changes";
import { LocalStorageKey } from "@/storage/local-storage-store";

export type ChangeDetailAction =
	| "validate"
	| "sync"
	| "start"
	| "verify"
	| "complete"
	| "review"
	| "approve"
	| "requestChanges";

type DetailTab = "details" | "changes";

const CHANGE_DETAIL_DIFF_POLL_INTERVAL_MS = 1_500;

function actionsForStatus(status: string): ChangeDetailAction[] {
	switch (status) {
		case "draft":
			return ["validate"];
		case "ready":
			return ["sync", "start"];
		case "synced":
			return ["start"];
		case "changes_requested":
			return ["start", "review"];
		case "in_progress":
			return ["verify", "complete"];
		case "ready_for_pr":
		case "pr_open":
		case "in_review":
		case "approved":
			return ["review"];
		default:
			return [];
	}
}

function actionMeta(action: ChangeDetailAction): {
	label: string;
	icon: ReactElement;
	variant: "default" | "primary" | "danger" | "ghost";
} {
	switch (action) {
		case "validate":
			return { label: "Validate", icon: <ClipboardCheck size={14} />, variant: "default" };
		case "sync":
			return { label: "Sync", icon: <RefreshCw size={14} />, variant: "default" };
		case "start":
			return { label: "Start", icon: <PlayCircle size={14} />, variant: "primary" };
		case "verify":
			return { label: "Verify", icon: <ShieldCheck size={14} />, variant: "default" };
		case "complete":
			return { label: "Complete", icon: <CheckCircle2 size={14} />, variant: "primary" };
		case "review":
			return { label: "Review", icon: <GitPullRequest size={14} />, variant: "primary" };
		case "approve":
			return { label: "Approve", icon: <CheckCircle2 size={14} />, variant: "primary" };
		case "requestChanges":
			return { label: "Request Changes", icon: <RefreshCw size={14} />, variant: "default" };
	}
}

function PropertyRow({ label, children }: { label: string; children: ReactNode }): ReactElement {
	return (
		<div className="grid grid-cols-[82px_minmax(0,1fr)] items-start gap-3 border-b border-divider/60 py-2 last:border-b-0">
			<div className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">{label}</div>
			<div className="min-w-0 text-sm text-text-secondary">{children}</div>
		</div>
	);
}

function getSessionStateTone(state: RuntimeTaskSessionSummary["state"]): "neutral" | "green" | "red" | "purple" | "gold" {
	switch (state) {
		case "running":
			return "purple";
		case "awaiting_review":
			return "gold";
		case "failed":
		case "interrupted":
			return "red";
		case "idle":
			return "neutral";
		default:
			return "neutral";
	}
}

function formatResumeCommand(command: string[] | undefined): string | null {
	return command && command.length > 0 ? command.join(" ") : null;
}

function SessionProperty({ summary }: { summary?: RuntimeTaskSessionSummary | null }): ReactElement {
	if (!summary) {
		return <span className="text-text-tertiary">No active session</span>;
	}
	const provider = summary.agentId ?? summary.externalSession?.provider ?? "session";
	const sessionId = summary.externalSession?.sessionId ?? null;
	const resumeCommand = formatResumeCommand(summary.externalSession?.resumeCommand);
	return (
		<div className="space-y-1.5">
			<div className="flex flex-wrap gap-1.5">
				<StatusChip label={provider} icon={<Bot size={12} />} tone="cyan" />
				<StatusChip label={summary.state} tone={getSessionStateTone(summary.state)} />
			</div>
			{sessionId ? <div className="break-all font-mono text-xs text-text-tertiary">{sessionId}</div> : null}
			{resumeCommand ? <div className="break-all font-mono text-xs text-text-tertiary">{resumeCommand}</div> : null}
		</div>
	);
}

function DetailTabButton({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: ReactNode;
	onClick: () => void;
}): ReactElement {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
				active ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:bg-surface-2 hover:text-text-primary",
			)}
		>
			{children}
		</button>
	);
}

export function ChangeDetailDialog({
	change,
	open,
	workspaceId,
	repoRoot,
	sessionSummary = null,
	isActionPending = false,
	actionError = null,
	onOpenChange,
	onRunAction,
	onSaveBody,
}: {
	change: RuntimeChangeyardChangeDetail | null;
	open: boolean;
	workspaceId: string | null;
	repoRoot?: string | null;
	sessionSummary?: RuntimeTaskSessionSummary | null;
	isActionPending?: boolean;
	actionError?: string | null;
	onOpenChange: (open: boolean) => void;
	onRunAction: (action: ChangeDetailAction, changeId: string) => void;
	onSaveBody: (input: { changeId: string; body: string; expectedUpdatedAt?: string | null }) => void;
}): ReactElement | null {
	const [mode, setMode] = useState<"preview" | "edit">("preview");
	const [detailTab, setDetailTab] = useState<DetailTab>("details");
	const [draftBody, setDraftBody] = useState("");
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [diffComments, setDiffComments] = useState<Map<string, DiffLineComment>>(new Map());
	const changeId = open && change ? change.id : null;
	const { changes: workspaceChanges, isRuntimeAvailable } = useRuntimeChangeWorkspaceChanges(
		changeId,
		workspaceId,
		open && detailTab === "changes" ? CHANGE_DETAIL_DIFF_POLL_INTERVAL_MS : null,
	);

	useEffect(() => {
		if (!change) {
			setMode("preview");
			setDetailTab("details");
			setDraftBody("");
			setSelectedPath(null);
			setDiffComments(new Map());
			return;
		}
		setDraftBody(change.body);
		setMode("preview");
		setDetailTab("details");
		setSelectedPath(null);
		setDiffComments(new Map());
	}, [change]);

	const workspaceFiles = workspaceChanges?.files ?? null;
	const availablePaths = useMemo(() => workspaceFiles?.map((file) => file.path) ?? [], [workspaceFiles]);

	useEffect(() => {
		if (selectedPath && availablePaths.includes(selectedPath)) {
			return;
		}
		setSelectedPath(availablePaths[0] ?? null);
	}, [availablePaths, selectedPath]);

	if (!change) {
		return null;
	}

	const availableActions = actionsForStatus(change.status);
	const isDirty = draftBody !== change.body;
	const totalAdditions = workspaceFiles?.reduce((sum, file) => sum + file.additions, 0) ?? 0;
	const totalDeletions = workspaceFiles?.reduce((sum, file) => sum + file.deletions, 0) ?? 0;
	const workspaceFileCount = workspaceFiles?.length ?? 0;
	const hasWorkspacePath = Boolean(change.workspace?.path);
	const hasWorkspaceFileChanges = workspaceFileCount > 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange} contentClassName="!max-w-[1180px] h-[88vh]">
			<DialogHeader title={change.title} icon={<FileDiff size={16} />}>
				<div className="ml-auto flex min-w-0 items-center justify-end gap-2">
					{availableActions.map((action) => {
						const meta = actionMeta(action);
						return (
							<Button
								key={action}
								variant={meta.variant}
								size="sm"
								icon={meta.icon}
								onClick={() => onRunAction(action, change.id)}
								disabled={isActionPending}
							>
								{meta.label}
							</Button>
						);
					})}
				</div>
			</DialogHeader>
			<DialogBody className="flex min-h-0 flex-col gap-4">
				{actionError ? (
					<div className="rounded-md border border-[color:var(--color-status-red)]/25 bg-[color:var(--color-status-red)]/8 px-3 py-2">
						<p className="text-sm text-[color:var(--color-status-red)]">{actionError}</p>
					</div>
				) : null}

				<div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
					<aside className="flex min-h-0 flex-col rounded-md border border-divider bg-surface-0">
						<div className="flex gap-1 border-b border-divider bg-surface-1 p-2">
							<DetailTabButton active={detailTab === "details"} onClick={() => setDetailTab("details")}>
								Details
							</DetailTabButton>
							<DetailTabButton active={detailTab === "changes"} onClick={() => setDetailTab("changes")}>
								Changes
							</DetailTabButton>
						</div>
						<div className="min-h-0 flex-1 overflow-hidden px-3 py-2">
							{detailTab === "details" ? (
								<div className="flex h-full min-h-0 flex-col">
									<div className="min-h-0 flex-1 overflow-y-auto">
										<PropertyRow label="Status">
											<ChangeStatusChip status={change.status} />
										</PropertyRow>
										<PropertyRow label="Type">
											<StatusChip label={change.type} />
										</PropertyRow>
										<PropertyRow label="Session">
											<SessionProperty summary={sessionSummary} />
										</PropertyRow>
										<PropertyRow label="Path">
											<PathDisplay path={change.path} repoRoot={repoRoot} />
										</PropertyRow>
										<PropertyRow label="Workspace">
											{change.workspace?.path ? (
												<PathDisplay path={change.workspace.path} repoRoot={repoRoot} />
											) : (
												<span className="text-text-tertiary">Not started</span>
											)}
										</PropertyRow>
										<PropertyRow label="Branch">
											{change.workspace?.branch ? (
												<span className="break-all font-mono text-xs">{change.workspace.branch}</span>
											) : (
												<span className="text-text-tertiary">None</span>
											)}
										</PropertyRow>
										{hasWorkspaceFileChanges ? (
											<>
												<PropertyRow label="Files">
													<span>{workspaceFileCount}</span>
												</PropertyRow>
												<PropertyRow label="Diff">
													<span>
														<span className="text-status-green">+{totalAdditions}</span>{" "}
														<span className="text-status-red">-{totalDeletions}</span>
													</span>
												</PropertyRow>
											</>
										) : null}
										<PropertyRow label="Labels">
											{change.labels.length ? (
												<div className="flex flex-wrap gap-1.5">
													{change.labels.map((label) => (
														<StatusChip key={label} label={label} />
													))}
												</div>
											) : (
												<span className="text-text-tertiary">None</span>
											)}
										</PropertyRow>
										<PropertyRow label="Updated">
											{change.updatedAt ? (
												<span>{new Date(change.updatedAt).toLocaleString()}</span>
											) : (
												<span className="text-text-tertiary">Unknown</span>
											)}
										</PropertyRow>
										<div className="border-b border-divider/60 py-2 text-sm font-semibold text-text-primary">
											Planning Gates
										</div>
										<PlanningGateList planning={change.planning} variant="properties" />
									</div>
									{change.planning?.nextAction ? (
										<div className="mt-3 shrink-0 rounded-md border border-status-gold/35 bg-status-gold/10 px-3 py-2">
											<div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-status-gold">
												Next Action
											</div>
											<p className="text-sm font-medium leading-relaxed text-text-primary">
												{change.planning.nextAction}
											</p>
										</div>
									) : null}
								</div>
							) : (
								<div className="flex h-full min-h-0 flex-col">
									{hasWorkspaceFileChanges ? (
										<FileTreePanel
											workspaceFiles={workspaceFiles}
											selectedPath={selectedPath}
											onSelectPath={setSelectedPath}
											panelFlex="1 1 0"
											showViewModeToggle
											viewModeStorageKey={LocalStorageKey.ChangeDetailFileTreeViewMode}
										/>
									) : (
										<div className="flex flex-1 items-center justify-center px-3 text-center text-sm text-text-secondary">
											{!hasWorkspacePath
												? "Start this change to create a workspace before reviewing file changes."
												: workspaceFiles === null
													? "Loading workspace changes..."
													: "No workspace file changes recorded for this change."}
										</div>
									)}
								</div>
							)}
						</div>
					</aside>

					<div className="flex min-h-0 flex-col rounded-md border border-divider bg-surface-0">
						{detailTab === "details" ? (
							<>
								<div className="flex items-center gap-2 border-b border-divider px-3 py-2">
									<Button
										variant={mode === "preview" ? "primary" : "ghost"}
										size="sm"
										onClick={() => setMode("preview")}
										disabled={isActionPending}
									>
										Preview
									</Button>
									<Button
										variant={mode === "edit" ? "primary" : "ghost"}
										size="sm"
										onClick={() => setMode("edit")}
										disabled={isActionPending}
									>
										Edit
									</Button>
								</div>
								<div className="min-h-0 flex-1 overflow-y-auto">
									{mode === "edit" ? (
										<MarkdownDocumentEditor
											value={draftBody}
											onChange={setDraftBody}
											disabled={isActionPending}
											className="h-full"
										/>
									) : (
										<div className="px-4 py-3">
											<MarkdownDocumentPreview
												source={draftBody}
												emptyLabel="This change body is currently empty."
											/>
										</div>
									)}
								</div>
							</>
						) : !hasWorkspacePath ? (
							<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
								Start this change to create a workspace before reviewing file changes.
							</div>
						) : !isRuntimeAvailable ? (
							<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
								Runtime workspace changes are not available for this project.
							</div>
						) : workspaceFiles === null ? (
							<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
								Loading workspace changes...
							</div>
						) : !hasWorkspaceFileChanges ? (
							<div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-secondary">
								No workspace file changes recorded for this change.
							</div>
						) : (
							<DiffViewerPanel
								workspaceFiles={workspaceFiles}
								selectedPath={selectedPath}
								onSelectedPathChange={setSelectedPath}
								viewMode="unified"
								comments={diffComments}
								onCommentsChange={setDiffComments}
							/>
						)}
					</div>
				</div>
			</DialogBody>
			<DialogFooter>
				<Button variant="default" onClick={() => onOpenChange(false)} disabled={isActionPending}>
					Close
				</Button>
				<Button variant="ghost" onClick={() => setDraftBody(change.body)} disabled={!isDirty || isActionPending}>
					Reset
				</Button>
				<Button
					variant="primary"
					onClick={() =>
						onSaveBody({
							changeId: change.id,
							body: draftBody,
							expectedUpdatedAt: change.updatedAt ?? null,
						})
					}
					disabled={!isDirty || isActionPending}
				>
					Save Markdown
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
