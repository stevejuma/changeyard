import { GitBranch, GitPullRequest, Plus, RotateCcw, RotateCw, Save, Scissors, Trash2 } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";

import { PreviewDialog } from "@/components/preview-dialog";
import { SubmitStackDialog } from "@/components/submit-stack-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { FileStatusGlyph, StatusChip } from "@/components/ui/status-chip";
import { Tooltip } from "@/components/ui/tooltip";
import { DiagnosticsPanel, EmptyState, KeyValue, PageBody, Panel, QueryGate, StatCard } from "@/components/vcs-panels";
import { NoProjectSelected, SelectProjectButton, VcsShell, type VcsShellProjectState } from "@/components/vcs-shell";
import {
	createReorderPreviewRequest,
	initialPreviewUiState,
	type PreviewPlacement,
	previewUiReducer,
	validateReorderPreviewRequest,
} from "@/preview-state";
import type {
	QueryState,
	VcsApplyOperationResponse,
	VcsJjDiffResponse,
	VcsJjStateResponse,
	VcsOperationRequest,
	VcsPreviewOperationResponse,
	VcsSubmitStackPreviewResponse,
} from "@/runtime/types";
import { useApplyOperation, usePreviewOperation, useSubmitStack, useTrpcInputQuery } from "@/runtime/trpc-client";
import {
	commandPreview,
	createAbandonChangePreviewRequest,
	createAbsorbFilePreviewRequest,
	createBookmarkPreviewRequest,
	createChangePreviewRequest,
	createEditMessagePreviewRequest,
	createMoveBookmarkPreviewRequest,
	createRedoLastPreviewRequest,
	createRestoreFilePreviewRequest,
	createSquashChangePreviewRequest,
	createUndoLastPreviewRequest,
} from "@/vcs-operations";

type DraftState =
	| { kind: "bookmark"; changeId: string; name: string }
	| { kind: "message"; changeId: string; message: string }
	| { kind: "insert"; anchorChangeId: string; placement: PreviewPlacement; message: string }
	| { kind: "move-bookmark"; sourceChangeId: string; bookmarkName: string; targetChangeId: string }
	| { kind: "squash"; sourceChangeId: string }
	| { kind: "absorb"; paths: string[] }
	| null;

function invalidPreview(operation: VcsOperationRequest, message: string, affectedChangeIds: string[] = []): VcsPreviewOperationResponse {
	return {
		valid: false,
		operation,
		title: "Preview unavailable",
		description: message,
		risk: "high",
		commands: [],
		affectedChangeIds,
		affectedBookmarks: [],
		diagnostics: [{ level: "error", code: "preview_invalid", message }],
	};
}

function textInputClassName(extra?: string): string {
	return cn(
		"w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none",
		extra,
	);
}

export function JjBoardView({
	state,
	refreshState,
	diffState,
	refreshDiff,
	currentPath,
	projectState,
	workspaceId,
}: {
	state: QueryState<VcsJjStateResponse>;
	refreshState: () => void;
	diffState: QueryState<VcsJjDiffResponse>;
	refreshDiff: () => void;
	currentPath: string;
	projectState: VcsShellProjectState;
	workspaceId: string | null;
}): React.ReactElement {
	return (
		<VcsShell
			projectState={projectState}
			currentPath={currentPath}
			title="JJ Stack Board"
			subtitle="Grouped bookmark stacks, previews, confirmed operations, and submit flow"
			kicker={<StatusChip label="Preview gated" tone="gold" />}
		>
			{!workspaceId ? (
				<NoProjectSelected action={<SelectProjectButton onClick={projectState.onAddProject} />}>
					Select a project to load JJ stacks and previewable VCS actions.
				</NoProjectSelected>
			) : (
			<PageBody>
				<QueryGate state={state} loading="Loading JJ stacks." errorTitle="JJ board failed">
					{(data) => (
						<JjBoardReady
							data={data}
							refreshState={refreshState}
							diffState={diffState}
							refreshDiff={refreshDiff}
							workspaceId={workspaceId}
						/>
					)}
				</QueryGate>
			</PageBody>
			)}
		</VcsShell>
	);
}

function JjBoardReady({
	data,
	refreshState,
	diffState,
	refreshDiff,
	workspaceId,
}: {
	data: VcsJjStateResponse;
	refreshState: () => void;
	diffState: QueryState<VcsJjDiffResponse>;
	refreshDiff: () => void;
	workspaceId: string;
}): React.ReactElement {
	const [previewUiState, dispatchPreviewUi] = useReducer(previewUiReducer, initialPreviewUiState);
	const previewOperation = usePreviewOperation(workspaceId);
	const applyOperation = useApplyOperation(workspaceId);
	const submitStack = useSubmitStack(workspaceId);
	const [lastApplyResult, setLastApplyResult] = useState<VcsApplyOperationResponse | null>(null);
	const [draft, setDraft] = useState<DraftState>(null);
	const [submitTargetBookmark, setSubmitTargetBookmark] = useState("");
	const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
	const activeSourceId = previewUiState.dragSourceId ?? previewUiState.armedSourceId;

	const summary = useMemo(
		() => ({
			repository: data.jj.currentBookmark ?? data.jj.currentChangeId ?? "JJ detected",
			base: data.jj.defaultBase ?? data.git.defaultBranch ?? "Unknown",
			bookmarks: `${data.bookmarks.length} local`,
		}),
		[data],
	);

	const submitPreviewQuery = useTrpcInputQuery<VcsSubmitStackPreviewResponse>(
		"vcs.submitStackPreview",
		{ targetBookmark: submitTargetBookmark || undefined },
		"Failed to load stacked PR preview.",
		submitTargetBookmark.trim().length > 0,
		workspaceId,
	);

	useEffect(() => {
		if (!submitTargetBookmark) {
			setSubmitTargetBookmark(data.jj.currentBookmark ?? data.bookmarks[0]?.name ?? "");
		}
	}, [data.bookmarks, data.jj.currentBookmark, submitTargetBookmark]);

	function openOperationPreview(request: VcsOperationRequest, local?: VcsPreviewOperationResponse): void {
		dispatchPreviewUi({ type: "preview", request });
		if (local) {
			previewOperation.showLocal(local);
			return;
		}
		void previewOperation.preview(request);
	}

	function openReorderPreview(sourceChangeId: string, targetChangeId: string, placement: PreviewPlacement): void {
		const request = createReorderPreviewRequest(sourceChangeId, targetChangeId, placement);
		const validation = validateReorderPreviewRequest(data.changes, sourceChangeId, targetChangeId, placement);
		openOperationPreview(
			request,
			validation.valid ? undefined : invalidPreview(request, validation.reason ?? "This reorder is not valid.", [sourceChangeId, targetChangeId]),
		);
	}

	function previewBookmark(changeId: string, bookmarkName: string): void {
		const normalizedName = bookmarkName.trim();
		const request = createBookmarkPreviewRequest(changeId, normalizedName);
		if (!normalizedName) {
			openOperationPreview(request, invalidPreview(request, "Enter a bookmark name before previewing.", [changeId]));
			return;
		}
		if (data.bookmarks.some((bookmark) => bookmark.name === normalizedName)) {
			openOperationPreview(request, invalidPreview(request, `Bookmark ${normalizedName} already exists.`, [changeId]));
			return;
		}
		openOperationPreview(request);
	}

	function previewMessage(changeId: string, message: string): void {
		const normalizedMessage = message.trim();
		const request = createEditMessagePreviewRequest(changeId, normalizedMessage);
		openOperationPreview(
			request,
			normalizedMessage.length === 0 ? invalidPreview(request, "Enter a non-empty change description before previewing.", [changeId]) : undefined,
		);
	}

	function previewInsert(anchorChangeId: string, placement: PreviewPlacement, message: string): void {
		const normalizedMessage = message.trim();
		const request = createChangePreviewRequest(anchorChangeId, placement, normalizedMessage);
		openOperationPreview(
			request,
			normalizedMessage.length === 0 ? invalidPreview(request, "Enter a non-empty change description before previewing.", [anchorChangeId]) : undefined,
		);
	}

	function previewMoveBookmark(bookmarkName: string, sourceChangeId: string, targetChangeId: string): void {
		const normalizedName = bookmarkName.trim();
		const request = createMoveBookmarkPreviewRequest(normalizedName, targetChangeId);
		if (!normalizedName) {
			openOperationPreview(request, invalidPreview(request, "Choose a bookmark before previewing.", [sourceChangeId]));
			return;
		}
		if (sourceChangeId === targetChangeId) {
			openOperationPreview(request, invalidPreview(request, `Bookmark ${normalizedName} already points to ${targetChangeId}.`, [sourceChangeId]));
			return;
		}
		openOperationPreview(request);
	}

	function previewAbsorb(targetChangeId: string, paths: string[]): void {
		const normalizedPaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
		const request = createAbsorbFilePreviewRequest(targetChangeId, normalizedPaths);
		openOperationPreview(
			request,
			normalizedPaths.length === 0 ? invalidPreview(request, "Choose at least one working-copy file before previewing.", [targetChangeId]) : undefined,
		);
	}

	function previewRestore(paths: string[]): void {
		const normalizedPaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
		const request = createRestoreFilePreviewRequest(normalizedPaths);
		openOperationPreview(
			request,
			normalizedPaths.length === 0
				? invalidPreview(request, "Choose at least one working-copy file before previewing.", data.jj.currentChangeId ? [data.jj.currentChangeId] : [])
				: undefined,
		);
	}

	async function applyPreview(): Promise<void> {
		if (!previewUiState.pendingRequest) {
			return;
		}
		const result = await applyOperation.apply(previewUiState.pendingRequest);
		if (!result?.ok) {
			return;
		}
		setLastApplyResult(result);
		refreshState();
		refreshDiff();
		dispatchPreviewUi({ type: "close-preview" });
		dispatchPreviewUi({ type: "clear-arm" });
		setDraft(null);
		previewOperation.clear();
		applyOperation.clear();
	}

	async function handleSubmitStack(): Promise<void> {
		if (submitPreviewQuery.state.status !== "ready" || !submitPreviewQuery.state.data.available) {
			return;
		}
		const result = await submitStack.submit({ targetBookmark: submitTargetBookmark || undefined });
		if (result?.ok) {
			setSubmitDialogOpen(false);
			refreshState();
			refreshDiff();
			submitPreviewQuery.refresh();
		}
	}

	function clearPreview(): void {
		dispatchPreviewUi({ type: "close-preview" });
		dispatchPreviewUi({ type: "clear-arm" });
		setDraft(null);
		previewOperation.clear();
		applyOperation.clear();
	}

	return (
		<>
			<div className="grid gap-3 md:grid-cols-4">
				<StatCard label="Current" value={summary.repository} />
				<StatCard label="Base" value={summary.base} />
				<StatCard label="Bookmarks" value={summary.bookmarks} />
				<StatCard label="Publishing" tone={data.publishing.authenticated ? "green" : "orange"} value={data.publishing.authenticated ? "GitHub ready" : data.publishing.reason ?? "Unavailable"} />
			</div>
			<div className="grid min-h-[620px] gap-3 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
				<RepositoryPanel
					data={data}
					lastApplyResult={lastApplyResult}
					submitTargetBookmark={submitTargetBookmark}
					setSubmitTargetBookmark={setSubmitTargetBookmark}
					submitPreviewState={submitPreviewQuery.state}
					refreshSubmitPreview={submitPreviewQuery.refresh}
					submitState={submitStack.state}
					clearSubmit={submitStack.clear}
					openSubmitDialog={() => setSubmitDialogOpen(true)}
					openUndo={() => openOperationPreview(createUndoLastPreviewRequest())}
					openRedo={() => openOperationPreview(createRedoLastPreviewRequest())}
				/>
				<Panel title="Stacks" className="min-h-0">
					{data.stacks.length === 0 ? (
						<EmptyState title="No bookmark-backed stacks">Create or import local JJ bookmarks to populate stacks here.</EmptyState>
					) : (
						<div className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1">
							{data.stacks.map((stack) => (
								<section className="min-w-[260px] rounded-lg border border-border bg-surface-0" key={stack.id}>
									<header className="grid gap-2 border-b border-border px-3 py-2">
										<div className="flex items-center justify-between gap-2">
											<StatusChip label={stack.id} tone="blue" icon={<GitBranch size={12} />} />
											<span className="text-xs text-text-tertiary">{stack.changes.length} changes</span>
										</div>
										<div className="flex flex-wrap gap-1.5">
											{stack.heads.map((head) => (
												<StatusChip key={head.id} label={head.bookmarkName} tone={head.isCheckedOut ? "green" : "neutral"} />
											))}
										</div>
									</header>
									<div className="grid gap-2 p-2">
										{stack.changes.map((segment) => (
											<article
												className={cn(
													"rounded-lg border border-border bg-surface-1 p-3",
													segment.isCurrent && "border-accent",
													activeSourceId === segment.changeId && "ring-1 ring-accent",
												)}
												key={`${stack.id}-${segment.id}`}
												draggable
												onDragStart={() => dispatchPreviewUi({ type: "start-drag", sourceChangeId: segment.changeId })}
												onDragEnd={() => dispatchPreviewUi({ type: "end-drag" })}
											>
												<div className="flex min-w-0 items-start justify-between gap-2">
													<div className="min-w-0">
														<div className="truncate text-sm font-medium text-text-primary">{segment.title}</div>
														<div className="mt-1 font-mono text-[11px] text-text-tertiary">
															{segment.changeId} · {segment.commitId}
														</div>
													</div>
													{segment.isHead ? <StatusChip label="head" tone="green" /> : null}
												</div>
												{segment.remoteBookmarks.length > 0 ? (
													<div className="mt-2 text-xs text-text-secondary">Remote: {segment.remoteBookmarks.join(", ")}</div>
												) : null}
												<div className="mt-3 flex flex-wrap gap-1.5">
													<Tooltip content="Create a bookmark at this change">
														<Button size="sm" variant="ghost" icon={<GitBranch size={12} />} onClick={() => setDraft({ kind: "bookmark", changeId: segment.changeId, name: "" })}>
															Bookmark
														</Button>
													</Tooltip>
													<Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setDraft({ kind: "insert", anchorChangeId: segment.changeId, placement: "after", message: "New change" })}>
														Insert
													</Button>
													<Button size="sm" variant="ghost" icon={<Save size={12} />} onClick={() => setDraft({ kind: "message", changeId: segment.changeId, message: segment.title })}>
														Message
													</Button>
													<Button
														size="sm"
														variant="ghost"
														disabled={segment.bookmarks.length === 0}
														onClick={() => setDraft({ kind: "move-bookmark", sourceChangeId: segment.changeId, bookmarkName: segment.bookmarks[0] ?? "", targetChangeId: segment.changeId })}
													>
														Move ref
													</Button>
													<Button size="sm" variant="ghost" icon={<Scissors size={12} />} onClick={() => setDraft({ kind: "squash", sourceChangeId: segment.changeId })}>
														Squash
													</Button>
													<Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={() => openOperationPreview(createAbandonChangePreviewRequest(segment.changeId))}>
														Abandon
													</Button>
													<Button size="sm" variant={previewUiState.armedSourceId === segment.changeId ? "primary" : "ghost"} onClick={() => dispatchPreviewUi({ type: "arm-source", sourceChangeId: segment.changeId })}>
														{previewUiState.armedSourceId === segment.changeId ? "Cancel move" : "Move"}
													</Button>
												</div>
												<DraftPanel
													draft={draft}
													segment={segment}
													changes={data.changes}
													bookmarks={data.bookmarks}
													currentChangeId={data.jj.currentChangeId}
													setDraft={setDraft}
													previewBookmark={previewBookmark}
													previewMessage={previewMessage}
													previewInsert={previewInsert}
													previewMoveBookmark={previewMoveBookmark}
													previewSquash={(sourceChangeId, targetChangeId) => openOperationPreview(createSquashChangePreviewRequest(sourceChangeId, targetChangeId), sourceChangeId === targetChangeId ? invalidPreview(createSquashChangePreviewRequest(sourceChangeId, targetChangeId), "Source and target changes must be different.", [sourceChangeId]) : undefined)}
													previewAbsorb={previewAbsorb}
												/>
												{activeSourceId && activeSourceId !== segment.changeId ? (
													<MoveTargets
														sourceChangeId={activeSourceId}
														targetChangeId={segment.changeId}
														changes={data.changes}
														openReorderPreview={openReorderPreview}
													/>
												) : null}
											</article>
										))}
									</div>
								</section>
							))}
						</div>
					)}
				</Panel>
				<DetailsPanel
					data={data}
					diffState={diffState}
					draft={draft}
					setDraft={setDraft}
					previewRestore={previewRestore}
				/>
			</div>
			<DiagnosticsPanel diagnostics={data.diagnostics} />
			<PreviewDialog
				request={previewUiState.pendingRequest}
				previewState={previewOperation.state}
				applyState={applyOperation.state}
				onApply={() => void applyPreview()}
				onClose={clearPreview}
			/>
			<SubmitStackDialog
				preview={submitDialogOpen && submitPreviewQuery.state.status === "ready" ? submitPreviewQuery.state.data : null}
				submitState={submitStack.state}
				onSubmit={() => void handleSubmitStack()}
				onClose={() => setSubmitDialogOpen(false)}
			/>
		</>
	);
}

function RepositoryPanel({
	data,
	lastApplyResult,
	submitTargetBookmark,
	setSubmitTargetBookmark,
	submitPreviewState,
	refreshSubmitPreview,
	submitState,
	clearSubmit,
	openSubmitDialog,
	openUndo,
	openRedo,
}: {
	data: VcsJjStateResponse;
	lastApplyResult: VcsApplyOperationResponse | null;
	submitTargetBookmark: string;
	setSubmitTargetBookmark: (value: string) => void;
	submitPreviewState: QueryState<VcsSubmitStackPreviewResponse>;
	refreshSubmitPreview: () => void;
	submitState: ReturnType<typeof useSubmitStack>["state"];
	clearSubmit: () => void;
	openSubmitDialog: () => void;
	openUndo: () => void;
	openRedo: () => void;
}): React.ReactElement {
	return (
		<Panel title="Repository">
			<div className="grid gap-2">
				{lastApplyResult ? (
					<KeyValue
						label="Last operation"
						value={
							<div className="grid gap-2">
								<span>{lastApplyResult.ok ? "Applied" : "Failed"} {lastApplyResult.command ? `${lastApplyResult.command.command} ${lastApplyResult.command.args.join(" ")}` : ""}</span>
								<div className="flex gap-1.5">
									{lastApplyResult.ok && lastApplyResult.operation.kind === "undo_last" ? (
										<Button size="sm" variant="ghost" icon={<RotateCw size={12} />} onClick={openRedo}>Redo</Button>
									) : lastApplyResult.ok ? (
										<Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={openUndo}>Undo</Button>
									) : null}
								</div>
							</div>
						}
					/>
				) : null}
				<KeyValue label="Current" value={data.jj.currentBookmark ?? data.jj.currentChangeId ?? "JJ detected"} />
				<KeyValue label="Base" value={data.jj.defaultBase ?? data.git.defaultBranch ?? "Unknown"} />
				<KeyValue label="Bookmarks" value={`${data.bookmarks.length} local`} />
				<KeyValue label="Publishing" value={data.publishing.authenticated ? "GitHub ready" : data.publishing.reason ?? "Unavailable"} />
				<KeyValue
					label="Stack submit preview"
					value={
						<div className="grid gap-2">
							<select className={textInputClassName()} value={submitTargetBookmark} onChange={(event) => setSubmitTargetBookmark(event.target.value)}>
								<option value="" disabled>Select a bookmark</option>
								{data.bookmarks.map((bookmark) => (
									<option key={bookmark.name} value={bookmark.name}>{bookmark.name}</option>
								))}
							</select>
							<div className="flex flex-wrap gap-1.5">
								<Button size="sm" variant="ghost" onClick={refreshSubmitPreview}>Refresh</Button>
								<Button
									size="sm"
									variant="primary"
									icon={<GitPullRequest size={12} />}
									disabled={submitPreviewState.status !== "ready" || !submitPreviewState.data.available || submitState.status === "loading"}
									onClick={() => {
										clearSubmit();
										openSubmitDialog();
									}}
								>
									Submit stack
								</Button>
							</div>
							<SubmitPreviewSummary state={submitPreviewState} />
						</div>
					}
				/>
			</div>
		</Panel>
	);
}

function SubmitPreviewSummary({ state }: { state: QueryState<VcsSubmitStackPreviewResponse> }): React.ReactElement {
	if (state.status === "loading") {
		return <p className="text-xs text-text-tertiary">Loading submit preview.</p>;
	}
	if (state.status === "error") {
		return <p className="text-xs text-status-orange">{state.message}</p>;
	}
	if (!state.data.available) {
		return <p className="text-xs text-text-tertiary">{state.data.diagnostics[0]?.message ?? "Stack submit preview is unavailable."}</p>;
	}
	return (
		<div className="grid gap-2">
			<div className="rounded-md border border-border bg-surface-0 p-2 text-xs text-text-secondary">
				{state.data.repoOwner}/{state.data.repoName}
				{state.data.remoteName ? ` via ${state.data.remoteName}` : ""}
			</div>
			{state.data.items.map((item) => (
				<div className="rounded-md border border-border bg-surface-0 p-2 text-xs" key={`${item.bookmarkName}-${item.changeId}`}>
					<div className="font-medium text-text-primary">{item.bookmarkName}</div>
					<div className="text-text-tertiary">{item.action.replaceAll("_", " ")} · base <code>{item.baseBranch}</code></div>
				</div>
			))}
			{state.data.commands.length > 0 ? (
				<pre className="max-h-32 overflow-auto rounded-md border border-border bg-surface-0 p-2 font-mono text-[11px] text-text-secondary">
					{commandPreview(state.data.commands)}
				</pre>
			) : null}
		</div>
	);
}

function DraftPanel({
	draft,
	segment,
	changes,
	bookmarks,
	currentChangeId,
	setDraft,
	previewBookmark,
	previewMessage,
	previewInsert,
	previewMoveBookmark,
	previewSquash,
	previewAbsorb,
}: {
	draft: DraftState;
	segment: VcsJjStateResponse["stacks"][number]["changes"][number];
	changes: VcsJjStateResponse["changes"];
	bookmarks: VcsJjStateResponse["bookmarks"];
	currentChangeId: string | null;
	setDraft: (draft: DraftState) => void;
	previewBookmark: (changeId: string, bookmarkName: string) => void;
	previewMessage: (changeId: string, message: string) => void;
	previewInsert: (anchorChangeId: string, placement: PreviewPlacement, message: string) => void;
	previewMoveBookmark: (bookmarkName: string, sourceChangeId: string, targetChangeId: string) => void;
	previewSquash: (sourceChangeId: string, targetChangeId: string) => void;
	previewAbsorb: (targetChangeId: string, paths: string[]) => void;
}): React.ReactElement | null {
	if (!draft) {
		return null;
	}
	if (draft.kind === "bookmark" && draft.changeId === segment.changeId) {
		return (
			<div className="mt-3 grid gap-2 rounded-md border border-border bg-surface-0 p-2">
				<input className={textInputClassName()} value={draft.name} placeholder="feature/new-bookmark" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
				<div className="flex gap-1.5">
					<Button size="sm" variant="primary" disabled={draft.name.trim().length === 0} onClick={() => previewBookmark(segment.changeId, draft.name)}>Preview bookmark</Button>
					<Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
				</div>
			</div>
		);
	}
	if (draft.kind === "message" && draft.changeId === segment.changeId) {
		return (
			<div className="mt-3 grid gap-2 rounded-md border border-border bg-surface-0 p-2">
				<textarea className={textInputClassName("min-h-20 resize-y")} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} />
				<div className="flex gap-1.5">
					<Button size="sm" variant="primary" disabled={draft.message.trim().length === 0} onClick={() => previewMessage(segment.changeId, draft.message)}>Preview message</Button>
					<Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
				</div>
			</div>
		);
	}
	if (draft.kind === "insert" && draft.anchorChangeId === segment.changeId) {
		return (
			<div className="mt-3 grid gap-2 rounded-md border border-border bg-surface-0 p-2">
				<div className="flex gap-1.5">
					<Button size="sm" variant={draft.placement === "before" ? "primary" : "ghost"} onClick={() => setDraft({ ...draft, placement: "before" })}>Before</Button>
					<Button size="sm" variant={draft.placement === "after" ? "primary" : "ghost"} onClick={() => setDraft({ ...draft, placement: "after" })}>After</Button>
				</div>
				<textarea className={textInputClassName("min-h-20 resize-y")} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} />
				<div className="flex gap-1.5">
					<Button size="sm" variant="primary" disabled={draft.message.trim().length === 0} onClick={() => previewInsert(segment.changeId, draft.placement, draft.message)}>Preview insert</Button>
					<Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
				</div>
			</div>
		);
	}
	if (draft.kind === "move-bookmark" && draft.sourceChangeId === segment.changeId) {
		return (
			<div className="mt-3 grid gap-2 rounded-md border border-border bg-surface-0 p-2">
				<select className={textInputClassName()} value={draft.bookmarkName} onChange={(event) => setDraft({ ...draft, bookmarkName: event.target.value })}>
					{segment.bookmarks.map((bookmarkName) => <option key={bookmarkName} value={bookmarkName}>{bookmarkName}</option>)}
				</select>
				<select className={textInputClassName()} value={draft.targetChangeId} onChange={(event) => setDraft({ ...draft, targetChangeId: event.target.value })}>
					{changes.map((change) => <option key={change.changeId} value={change.changeId}>{change.changeId} - {change.description}</option>)}
				</select>
				<div className="flex gap-1.5">
					<Button size="sm" variant="primary" disabled={!draft.bookmarkName.trim() || draft.targetChangeId === segment.changeId} onClick={() => previewMoveBookmark(draft.bookmarkName, segment.changeId, draft.targetChangeId)}>Preview move</Button>
					<Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
				</div>
			</div>
		);
	}
	if (draft.kind === "squash" && draft.sourceChangeId && draft.sourceChangeId !== segment.changeId) {
		return (
			<div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-0 p-2 text-xs text-text-secondary">
				<Button size="sm" variant="primary" onClick={() => previewSquash(draft.sourceChangeId, segment.changeId)}>Preview squash here</Button>
				Source: <code>{draft.sourceChangeId}</code>
			</div>
		);
	}
	if (draft.kind === "absorb" && draft.paths.length > 0) {
		return (
			<div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-0 p-2 text-xs text-text-secondary">
				<Button size="sm" variant="primary" disabled={currentChangeId === segment.changeId} onClick={() => previewAbsorb(segment.changeId, draft.paths)}>Preview absorb here</Button>
				Files: {draft.paths.join(", ")}
			</div>
		);
	}
	void bookmarks;
	return null;
}

function MoveTargets({
	sourceChangeId,
	targetChangeId,
	changes,
	openReorderPreview,
}: {
	sourceChangeId: string;
	targetChangeId: string;
	changes: VcsJjStateResponse["changes"];
	openReorderPreview: (sourceChangeId: string, targetChangeId: string, placement: PreviewPlacement) => void;
}): React.ReactElement {
	const beforeValidation = validateReorderPreviewRequest(changes, sourceChangeId, targetChangeId, "before");
	const afterValidation = validateReorderPreviewRequest(changes, sourceChangeId, targetChangeId, "after");
	const allowDrop = beforeValidation.valid || afterValidation.valid;
	return (
		<div
			className="mt-3 flex flex-wrap gap-1.5 rounded-md border border-border bg-surface-0 p-2"
			onDragOver={(event) => {
				if (allowDrop) {
					event.preventDefault();
				}
			}}
		>
			<Button
				size="sm"
				variant="primary"
				disabled={!beforeValidation.valid}
				title={beforeValidation.reason ?? undefined}
				onClick={() => openReorderPreview(sourceChangeId, targetChangeId, "before")}
				onDrop={(event) => {
					if (!beforeValidation.valid) {
						return;
					}
					event.preventDefault();
					openReorderPreview(sourceChangeId, targetChangeId, "before");
				}}
			>
				Preview before
			</Button>
			<Button
				size="sm"
				variant="primary"
				disabled={!afterValidation.valid}
				title={afterValidation.reason ?? undefined}
				onClick={() => openReorderPreview(sourceChangeId, targetChangeId, "after")}
				onDrop={(event) => {
					if (!afterValidation.valid) {
						return;
					}
					event.preventDefault();
					openReorderPreview(sourceChangeId, targetChangeId, "after");
				}}
			>
				Preview after
			</Button>
			{!allowDrop ? <div className="text-xs text-text-tertiary">{beforeValidation.reason ?? afterValidation.reason}</div> : null}
		</div>
	);
}

function DetailsPanel({
	data,
	diffState,
	draft,
	setDraft,
	previewRestore,
}: {
	data: VcsJjStateResponse;
	diffState: QueryState<VcsJjDiffResponse>;
	draft: DraftState;
	setDraft: (draft: DraftState) => void;
	previewRestore: (paths: string[]) => void;
}): React.ReactElement {
	return (
		<Panel title="Details">
			<div className="grid gap-3">
				<section>
					<div className="mb-2 flex items-center justify-between">
						<StatusChip label="Current diff" tone="purple" />
						<span className="text-xs text-text-tertiary">{diffState.status === "ready" ? diffState.data.changeId ?? "none" : "loading"}</span>
					</div>
					{diffState.status === "ready" ? (
						<div className="rounded-md border border-border bg-surface-0 p-2">
							<div className="mb-2 font-mono text-xs text-text-tertiary">{diffState.data.changeId ?? "No current change selected."}</div>
							{diffState.data.summary ? (
								<pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-surface-1 p-2 font-mono text-xs text-text-secondary">{diffState.data.summary}</pre>
							) : (
								<p className="text-sm text-text-secondary">No diff summary available.</p>
							)}
						</div>
					) : diffState.status === "error" ? (
						<p className="text-sm text-status-orange">{diffState.message}</p>
					) : (
						<p className="text-sm text-text-secondary">Loading diff.</p>
					)}
				</section>
				<section>
					<div className="mb-2 flex items-center justify-between">
						<StatusChip label="Working copy" tone="cyan" />
						<span className="text-xs text-text-tertiary">{data.unassignedChanges.length} files</span>
					</div>
					{data.unassignedChanges.length === 0 ? (
						<EmptyState title="Clean working copy">No unassigned file changes are pending in the current JJ working copy.</EmptyState>
					) : (
						<div className="grid gap-2">
							{data.unassignedChanges.map((change) => (
								<div className="rounded-md border border-border bg-surface-0 p-2" key={`${change.status}-${change.path}`}>
									<div className="flex min-w-0 items-center justify-between gap-2">
										<div className="min-w-0 truncate font-mono text-xs text-text-primary">{change.path}</div>
										<FileStatusGlyph status={change.status} />
									</div>
									<div className="mt-2 flex flex-wrap gap-1.5">
										<Button size="sm" variant="ghost" onClick={() => setDraft(draft?.kind === "absorb" && draft.paths[0] === change.path ? null : { kind: "absorb", paths: [change.path] })}>
											{draft?.kind === "absorb" && draft.paths[0] === change.path ? "Cancel absorb" : "Absorb into..."}
										</Button>
										<Button size="sm" variant="ghost" onClick={() => previewRestore([change.path])}>
											Restore
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</section>
			</div>
		</Panel>
	);
}
