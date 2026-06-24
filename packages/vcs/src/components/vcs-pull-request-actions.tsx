import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import {
	PullRequestCheckBadge,
	PullRequestConversationTimeline,
	PullRequestDetailsPanel,
	PullRequestViewButton,
	pullRequestCheckBadgeMeta,
	type MarkdownMessageEditorMode,
	type PullRequestAuthorDisplay,
} from "@changeyard/web-ui";
import { Check, Copy, ExternalLink, Maximize2, MoreHorizontal, Pencil, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import type {
	RuntimeVcsCheckRollup,
	RuntimeVcsPullRequestSelector,
	RuntimeVcsPullRequestSummary,
} from "@/runtime/types";
import {
	useGetBaseBranchChecksQuery,
	useGetPullRequestChecksQuery,
	useGetPullRequestConversationQuery,
	useGetPullRequestDetailsQuery,
	useUpdatePullRequestMutation,
} from "@/runtime/vcs-api";
import { copyTextToClipboard } from "@/utils/clipboard";

type PullRequestSelectorInput = Omit<RuntimeVcsPullRequestSelector, "workspacePath">;

function checkBadgeToneClassName(tone: string): string {
	switch (tone) {
		case "green":
			return "border-status-green/30 bg-status-green/10 text-status-green";
		case "red":
			return "border-status-red/30 bg-status-red/10 text-status-red";
		case "gold":
			return "border-status-gold/35 bg-status-gold/10 text-status-gold";
		case "orange":
			return "border-status-orange/35 bg-status-orange/10 text-status-orange";
		default:
			return "border-border bg-surface-2 text-text-secondary";
	}
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
		return error.message;
	}
	return "PR update failed.";
}

export function selectorForPullRequest(pr: RuntimeVcsPullRequestSummary): PullRequestSelectorInput {
	if (pr.number) {
		return { number: pr.number };
	}
	return { headBranch: pr.headBranch ?? null };
}

export function VcsCheckStatusChip({
	rollup,
	loading = false,
	className,
}: {
	rollup: RuntimeVcsCheckRollup | null | undefined;
	loading?: boolean;
	className?: string;
}): React.ReactElement {
	return <PullRequestCheckBadge rollup={rollup ?? null} loading={loading} className={className} />;
}

export function VcsPullRequestViewButton({
	pr,
	className,
}: {
	pr: RuntimeVcsPullRequestSummary | null | undefined;
	className?: string;
}): React.ReactElement | null {
	if (!pr) {
		return null;
	}
	return <PullRequestViewButton url={pr.url} number={pr.number} className={className} />;
}

export function VcsPullRequestSummaryPill({
	pr,
	className,
}: {
	pr: RuntimeVcsPullRequestSummary;
	className?: string;
}): React.ReactElement {
	return (
		<div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
			<StatusChip label={`PR #${pr.number}`} tone="green" />
			{pr.title ? <span className="min-w-0 truncate text-xs text-text-secondary">{pr.title}</span> : null}
			<VcsCheckStatusChip rollup={pr.checks ?? null} />
		</div>
	);
}

export function VcsBaseBranchCheckStatus({
	workspaceId,
	workspacePath,
	className,
}: {
	workspaceId: string | null;
	workspacePath?: string | null;
	className?: string;
}): React.ReactElement | null {
	const result = useGetBaseBranchChecksQuery(
		{ workspaceId: workspaceId ?? "", workspacePath },
		{ skip: !workspaceId },
	);
	const rollup = result.data ?? null;
	const meta = pullRequestCheckBadgeMeta(rollup, result.isFetching && !rollup);
	if (!workspaceId) {
		return null;
	}
	const branch = result.data?.branch ? `${result.data.branch}: ` : "";
	return (
		<div className={cn("flex shrink-0 items-center gap-1", className)}>
			<StatusChip
				label={`${branch}${meta.label}`}
				tone={meta.tone as StatusChipTone}
				title={meta.title}
				icon={result.isFetching && !rollup ? <Spinner size={11} /> : null}
				className="max-w-[180px]"
			/>
			<Button
				variant="ghost"
				size="sm"
				icon={<RefreshCw size={12} />}
				aria-label="Refresh base branch checks"
				title="Refresh base branch checks"
				onClick={() => void result.refetch()}
			/>
		</div>
	);
}

export function VcsPullRequestDetailsPanelContainer({
	workspaceId,
	workspacePath,
	pr,
	editRequestKey = null,
	author = null,
	belowContent,
	headerViewModeControl,
	isFloating = false,
	showHeaderControls = true,
	showDescriptionContent = true,
	onUpdated,
	onClose,
	onFloatingChange,
	className,
}: {
	workspaceId: string | null;
	workspacePath?: string | null;
	pr: RuntimeVcsPullRequestSummary | null | undefined;
	editRequestKey?: number | null;
	author?: PullRequestAuthorDisplay | null;
	belowContent?: ReactNode;
	headerViewModeControl?: ReactNode;
	isFloating?: boolean;
	showHeaderControls?: boolean;
	showDescriptionContent?: boolean;
	onUpdated?: () => void | Promise<void>;
	onClose: () => void;
	onFloatingChange?: (floating: boolean) => void;
	className?: string;
}): React.ReactElement | null {
	const selector = useMemo(() => (pr ? selectorForPullRequest(pr) : null), [pr]);
	const [updatePullRequest, updateState] = useUpdatePullRequestMutation();
	const [draftBody, setDraftBody] = useState("");
	const [isEditing, setEditing] = useState(false);
	const [editorMode, setEditorMode] = useState<MarkdownMessageEditorMode>("preview");
	const [saveError, setSaveError] = useState<string | null>(null);
	const lastEditRequestKey = useRef<number | null>(null);
	const [pendingEditRequestKey, setPendingEditRequestKey] = useState<number | null>(null);
	const detailsResult = useGetPullRequestDetailsQuery(
		{ workspaceId: workspaceId ?? "", workspacePath, input: selector ?? { number: 0 } },
		{ skip: !workspaceId || !selector || !pr },
	);
	const checksResult = useGetPullRequestChecksQuery(
		{ workspaceId: workspaceId ?? "", workspacePath, input: selector ?? { number: 0 } },
		{ skip: !workspaceId || !selector || !pr },
	);
	const conversationResult = useGetPullRequestConversationQuery(
		{ workspaceId: workspaceId ?? "", workspacePath, input: selector ?? { number: 0 } },
		{ skip: !workspaceId || !selector || !pr || !showDescriptionContent || isEditing },
	);
	const details = detailsResult.data ?? null;
	const rollup = checksResult.data ?? details?.checks ?? pr?.checks ?? null;
	const conversationContent = showDescriptionContent && !isEditing ? (
		<PullRequestConversationTimeline
			conversation={conversationResult.data ?? null}
			isLoading={conversationResult.isFetching && !conversationResult.data}
		/>
	) : null;

	useEffect(() => {
		if (!isEditing) {
			setDraftBody(details?.body ?? "");
		}
	}, [details?.body, isEditing]);

	useEffect(() => {
		setSaveError(null);
		setEditorMode("preview");
		setEditing(false);
		lastEditRequestKey.current = null;
		setPendingEditRequestKey(null);
	}, [pr?.number, pr?.headBranch]);

	useEffect(() => {
		if (!editRequestKey || editRequestKey === lastEditRequestKey.current) {
			return;
		}
		lastEditRequestKey.current = editRequestKey;
		setSaveError(null);
		setEditorMode("source");
		setEditing(true);
		setPendingEditRequestKey(editRequestKey);
	}, [editRequestKey]);

	useEffect(() => {
		if (!pendingEditRequestKey || detailsResult.isFetching) {
			return;
		}
		setDraftBody(details?.body ?? "");
		setPendingEditRequestKey(null);
	}, [details?.body, detailsResult.isFetching, pendingEditRequestKey]);

	if (!pr || !selector) {
		return null;
	}

	function startEdit(): void {
		setSaveError(null);
		setDraftBody(details?.body ?? "");
		setEditorMode("source");
		setEditing(true);
	}

	function cancelEdit(): void {
		setSaveError(null);
		setDraftBody(details?.body ?? "");
		setEditorMode("preview");
		setEditing(false);
	}

	async function save(): Promise<void> {
		if (!workspaceId || !selector) {
			return;
		}
		setSaveError(null);
		try {
			const response = await updatePullRequest({
				workspaceId,
				workspacePath,
				input: {
					...selector,
					body: draftBody,
				},
			}).unwrap();
			setDraftBody(response.body ?? draftBody);
			setEditorMode("preview");
			setEditing(false);
			await detailsResult.refetch();
			void checksResult.refetch();
			void conversationResult.refetch();
			await onUpdated?.();
		} catch (error) {
			setSaveError(errorMessage(error));
		}
	}

	return (
		<PullRequestDetailsPanel
			summary={pr}
			details={details}
			checks={rollup}
			isLoading={detailsResult.isFetching && !details}
			isSaving={updateState.isLoading}
			isEditing={isEditing}
			areChecksRefreshing={checksResult.isFetching}
			author={author}
			isFloating={isFloating}
			showHeaderControls={showHeaderControls}
			showDescriptionContent={showDescriptionContent}
			draftBody={draftBody}
			editorMode={editorMode}
			saveError={saveError}
			onDraftBodyChange={setDraftBody}
			onEditorModeChange={setEditorMode}
			onStartEdit={startEdit}
			onCancelEdit={cancelEdit}
			onSave={() => void save()}
			onClose={onClose}
			onRefreshChecks={() => void checksResult.refetch()}
			onFloatingChange={onFloatingChange}
			belowContent={belowContent ?? conversationContent}
			actions={
				<>
					{headerViewModeControl}
					<VcsPullRequestPanelMenu
						pr={details ?? pr}
						isSaving={updateState.isLoading}
						onRefreshChecks={() => void checksResult.refetch()}
						onEditDescription={startEdit}
					/>
				</>
			}
			className={className}
		/>
	);
}

export function VcsPullRequestColumnHeaderActions({
	workspaceId,
	workspacePath,
	pr,
	isFloating = false,
	onFloatingChange,
	onEditDescription,
}: {
	workspaceId: string | null;
	workspacePath?: string | null;
	pr: RuntimeVcsPullRequestSummary | null | undefined;
	isFloating?: boolean;
	onFloatingChange?: (floating: boolean) => void;
	onEditDescription: () => void;
}): React.ReactElement | null {
	const selector = useMemo(() => (pr ? selectorForPullRequest(pr) : null), [pr]);
	const checksResult = useGetPullRequestChecksQuery(
		{ workspaceId: workspaceId ?? "", workspacePath, input: selector ?? { number: 0 } },
		{ skip: !workspaceId || !selector || !pr },
	);
	const rollup = checksResult.data ?? pr?.checks ?? null;
	const meta = pullRequestCheckBadgeMeta(rollup, checksResult.isFetching && !rollup);
	if (!pr || !selector) {
		return null;
	}
	return (
		<>
			<button
				type="button"
				className={cn(
					"inline-flex h-7 max-w-[150px] items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold leading-none",
					"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
					checkBadgeToneClassName(meta.tone),
				)}
				title={`${meta.title} Click to refresh.`}
				onClick={() => void checksResult.refetch()}
			>
				<RefreshCw size={12} className="shrink-0" />
				<span className="truncate">{meta.label}</span>
			</button>
			{pr.url ? (
				<a
					href={pr.url}
					target="_blank"
					rel="noopener noreferrer"
					className={cn(
						"inline-flex h-7 select-none items-center justify-center gap-1.5 rounded-md border border-border-bright bg-surface-2 px-2 text-xs font-medium text-text-primary hover:border-border-bright hover:bg-surface-3 active:bg-surface-4",
						"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
					)}
				>
					Open
					<ExternalLink size={13} />
				</a>
			) : (
				<Button variant="default" size="sm" iconRight={<ExternalLink size={13} />} disabled title="PR link unavailable">
					Open
				</Button>
			)}
			{onFloatingChange ? (
				<Button
					variant={isFloating ? "default" : "ghost"}
					size="sm"
					icon={<Maximize2 size={14} />}
					aria-label={isFloating ? "Exit floating mode" : "Use floating mode"}
					title={isFloating ? "Exit floating mode" : "Use floating mode"}
					onClick={() => onFloatingChange(!isFloating)}
				/>
			) : null}
			<VcsPullRequestPanelMenu
				pr={pr}
				isSaving={false}
				onRefreshChecks={() => void checksResult.refetch()}
				onEditDescription={onEditDescription}
			/>
		</>
	);
}

function VcsPullRequestPanelMenu({
	pr,
	isSaving,
	onRefreshChecks,
	onEditDescription,
}: {
	pr: RuntimeVcsPullRequestSummary | null;
	isSaving: boolean;
	onRefreshChecks: () => void;
	onEditDescription: () => void;
}): React.ReactElement {
	const [copied, setCopied] = useState(false);
	const url = pr?.url?.trim() || null;
	function copyUrl(): void {
		if (!url) {
			return;
		}
		void copyTextToClipboard(url).then((success) => {
			if (success) {
				setCopied(true);
				window.setTimeout(() => setCopied(false), 1_200);
			}
		});
	}

	return (
		<RadixDropdownMenu.Root>
			<RadixDropdownMenu.Trigger asChild>
				<Button variant="ghost" size="sm" icon={<MoreHorizontal size={14} />} aria-label="More PR actions" title="More PR actions" />
			</RadixDropdownMenu.Trigger>
			<RadixDropdownMenu.Portal>
				<RadixDropdownMenu.Content
					align="end"
					sideOffset={6}
					className="z-[90] min-w-48 overflow-hidden rounded-md border border-border bg-surface-1 p-1 text-sm text-text-primary shadow-xl"
				>
					<RadixDropdownMenu.Item
						disabled={!url}
						className="flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-surface-3"
						onSelect={() => {
							if (url) {
								window.open(url, "_blank", "noopener,noreferrer");
							}
						}}
					>
						<span className="shrink-0 text-text-tertiary"><ExternalLink size={14} /></span>
						<span className="min-w-0 flex-1">Open in browser</span>
					</RadixDropdownMenu.Item>
					<RadixDropdownMenu.Item
						disabled={!url}
						className="flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-surface-3"
						onSelect={(event) => {
							event.preventDefault();
							copyUrl();
						}}
					>
						<span className="shrink-0 text-text-tertiary">{copied ? <Check size={14} className="text-status-green" /> : <Copy size={14} />}</span>
						<span className="min-w-0 flex-1">Copy URL</span>
					</RadixDropdownMenu.Item>
					<RadixDropdownMenu.Separator className="my-1 h-px bg-divider" />
					<RadixDropdownMenu.Item
						className="flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-surface-3"
						onSelect={onRefreshChecks}
					>
						<span className="shrink-0 text-text-tertiary"><RefreshCw size={14} /></span>
						<span className="min-w-0 flex-1">Refresh checks</span>
					</RadixDropdownMenu.Item>
					<RadixDropdownMenu.Item
						disabled={isSaving}
						className="flex cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-surface-3"
						onSelect={onEditDescription}
					>
						<span className="shrink-0 text-text-tertiary"><Pencil size={14} /></span>
						<span className="min-w-0 flex-1">Edit PR description</span>
					</RadixDropdownMenu.Item>
				</RadixDropdownMenu.Content>
			</RadixDropdownMenu.Portal>
		</RadixDropdownMenu.Root>
	);
}
