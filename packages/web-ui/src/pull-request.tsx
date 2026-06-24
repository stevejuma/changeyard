import { ExternalLink, Eye, GitPullRequest, Maximize2, MessageSquare, RefreshCw, Save, X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { Button } from "./button";
import { cn } from "./cn";
import { MarkdownMessageEditor, MarkdownMessagePreview, type MarkdownMessageEditorMode } from "./markdown-message-editor";
import { Spinner } from "./spinner";

export type PullRequestCheckState = "passed" | "failed" | "pending" | "cancelled" | "skipped" | "unknown";

export type PullRequestCheckSummary = Partial<Record<PullRequestCheckState, number>> & {
	total: number;
};

export type PullRequestCheckRollup = {
	provider?: string | null;
	supported: boolean;
	overallState: PullRequestCheckState;
	summary: PullRequestCheckSummary;
	message?: string | null;
};

export type PullRequestSummary = {
	number?: number | null;
	url?: string | null;
	baseBranch?: string | null;
	headBranch?: string | null;
	title?: string | null;
	state?: "open" | "closed" | "merged" | "unknown" | string | null;
	checks?: PullRequestCheckRollup | null;
};

export type PullRequestDetails = PullRequestSummary & {
	provider?: string | null;
	body?: string | null;
	draft?: boolean | null;
	autoMerge?: boolean | null;
	author?: string | null;
	updatedAt?: string | null;
};

export type PullRequestConversationEvent = {
	provider?: string | null;
	id: string;
	kind: "comment" | "review" | "review_comment";
	author?: string | null;
	authorAvatarUrl?: string | null;
	authorAssociation?: string | null;
	body: string;
	createdAt?: string | null;
	updatedAt?: string | null;
	url?: string | null;
	reviewState?: string | null;
	path?: string | null;
	line?: number | null;
	startLine?: number | null;
	side?: string | null;
	diffHunk?: string | null;
	commitId?: string | null;
};

export type PullRequestConversation = {
	provider?: string | null;
	pullRequestNumber: number;
	supported: boolean;
	events: PullRequestConversationEvent[];
	message?: string | null;
};

export type PullRequestAuthorDisplay = {
	name?: string | null;
	email?: string | null;
	avatar?: ReactNode;
};

export type PullRequestCheckBadgeTone = "neutral" | "green" | "red" | "gold" | "orange";

export type PullRequestCheckBadgeMeta = {
	label: string;
	tone: PullRequestCheckBadgeTone;
	title: string;
};

const badgeToneStyles: Record<PullRequestCheckBadgeTone, string> = {
	neutral: "border-border bg-surface-2 text-text-secondary",
	green: "border-status-green/30 bg-status-green/10 text-status-green",
	red: "border-status-red/30 bg-status-red/10 text-status-red",
	gold: "border-status-gold/35 bg-status-gold/10 text-status-gold",
	orange: "border-status-orange/35 bg-status-orange/10 text-status-orange",
};

function formatUpdatedAt(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleString();
}

function formatConversationDate(value: string | null | undefined): string | null {
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

function branchValue(value: string | null | undefined): string {
	return value?.trim() || "Unknown";
}

function authorInitials(value: string | null | undefined): string {
	const name = value?.trim();
	if (!name) {
		return "?";
	}
	const parts = name.split(/[\s._-]+/).filter(Boolean);
	return (parts[0]?.[0] ?? "?").toUpperCase();
}

function reviewStateLabel(value: string | null | undefined): string {
	switch (value?.toLowerCase()) {
		case "approved":
			return "approved";
		case "changes_requested":
			return "requested changes";
		case "commented":
			return "reviewed";
		case "dismissed":
			return "dismissed review";
		default:
			return "reviewed";
	}
}

function conversationActionLabel(event: PullRequestConversationEvent): string {
	if (event.kind === "review") {
		return reviewStateLabel(event.reviewState);
	}
	if (event.kind === "review_comment") {
		return "commented on";
	}
	return "commented";
}

function diffHunkPreview(value: string | null | undefined): string[] {
	if (!value) {
		return [];
	}
	return value
		.split("\n")
		.filter((line) => !line.startsWith("@@"))
		.slice(-8);
}

function PullRequestConversationAvatar({
	name,
	avatarUrl,
}: {
	name?: string | null;
	avatarUrl?: string | null;
}): ReactElement {
	if (avatarUrl) {
		return (
			<img
				src={avatarUrl}
				alt={name ? `${name} avatar` : "Comment author avatar"}
				className="h-8 w-8 rounded-full border border-border bg-surface-2 object-cover"
			/>
		);
	}
	return (
		<div className="grid h-8 w-8 place-items-center rounded-full border border-border bg-surface-2 text-xs font-semibold text-text-secondary">
			{authorInitials(name)}
		</div>
	);
}

function PullRequestConversationInlineReference({ event }: { event: PullRequestConversationEvent }): ReactElement | null {
	const path = event.path?.trim();
	const line = event.line ?? event.startLine ?? null;
	if (!path && !line && !event.diffHunk) {
		return null;
	}
	const label = path ? `${path}${line ? `:${line}` : ""}` : line ? `Line ${line}` : "Code comment";
	const preview = diffHunkPreview(event.diffHunk);
	return (
		<div className="overflow-hidden rounded-md border border-divider bg-surface-0">
			<div className="flex min-w-0 items-center justify-between gap-2 border-b border-divider bg-surface-2 px-2.5 py-1.5">
				<span className="min-w-0 truncate font-mono text-[11px] font-medium text-text-primary" title={label}>
					{label}
				</span>
				{event.side ? <span className="shrink-0 text-[10px] uppercase text-text-tertiary">{event.side}</span> : null}
			</div>
			{preview.length > 0 ? (
				<pre className="max-h-48 overflow-auto px-2.5 py-2 text-[11px] leading-5 text-text-secondary">
					{preview.map((lineText, index) => (
						<code
							key={`${event.id}-hunk-${index}`}
							className={cn(
								"block min-w-max whitespace-pre font-mono",
								lineText.startsWith("+") && "text-status-green",
								lineText.startsWith("-") && "text-status-red",
							)}
						>
							{lineText}
						</code>
					))}
				</pre>
			) : (
				<div className="px-2.5 py-2 text-[11px] text-text-tertiary">Line snippet unavailable.</div>
			)}
		</div>
	);
}

function PullRequestConversationCard({ event }: { event: PullRequestConversationEvent }): ReactElement {
	const author = event.author?.trim() || "Someone";
	const date = formatConversationDate(event.createdAt);
	const action = conversationActionLabel(event);
	const isReview = event.kind === "review";
	const hasBody = event.body.trim().length > 0;
	return (
		<div className="flex gap-2">
			<div className="shrink-0 pt-1">
				<PullRequestConversationAvatar name={event.author} avatarUrl={event.authorAvatarUrl} />
			</div>
			<div className="min-w-0 flex-1 overflow-hidden rounded-md border border-divider bg-surface-0">
				<div className="flex min-w-0 items-center gap-2 border-b border-divider bg-surface-2 px-3 py-2 text-sm">
					{isReview ? <Eye size={14} className="shrink-0 text-text-tertiary" /> : <MessageSquare size={14} className="shrink-0 text-text-tertiary" />}
					<div className="min-w-0 flex-1 truncate">
						<span className="font-semibold text-text-primary">{author}</span>{" "}
						<span className="text-text-secondary">{action}</span>
						{event.path ? <span className="text-text-secondary"> {event.path}</span> : null}
					</div>
					{event.authorAssociation ? (
						<span className="shrink-0 rounded-full border border-border bg-surface-1 px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">
							{event.authorAssociation}
						</span>
					) : null}
					{date ? <span className="shrink-0 text-[11px] text-text-tertiary">{date}</span> : null}
				</div>
				<div className="grid gap-3 p-3 text-sm text-text-primary">
					<PullRequestConversationInlineReference event={event} />
					{hasBody ? (
						<MarkdownMessagePreview value={event.body} emptyLabel="" className="cy-markdown-preview--plain text-sm" />
					) : isReview ? (
						<div className="text-sm text-text-secondary">Review submitted.</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

export function PullRequestConversationTimeline({
	conversation,
	isLoading = false,
	className,
}: {
	conversation?: PullRequestConversation | null;
	isLoading?: boolean;
	className?: string;
}): ReactElement {
	if (isLoading && !conversation) {
		return (
			<div className={cn("grid gap-3 border-t border-divider pt-3", className)} role="status" aria-label="Loading pull request conversation">
				<div className="kb-skeleton h-20 rounded-md" />
				<div className="kb-skeleton h-28 rounded-md" />
			</div>
		);
	}
	if (!conversation) {
		return (
			<div className={cn("border-t border-divider pt-3 text-sm text-text-tertiary", className)}>
				Conversation has not been loaded.
			</div>
		);
	}
	if (!conversation.supported) {
		return (
			<div className={cn("rounded-md border border-divider bg-surface-0 px-3 py-3 text-sm text-text-secondary", className)}>
				{conversation.message ?? "Pull request conversation is not available for this provider."}
			</div>
		);
	}
	if (conversation.events.length === 0) {
		return (
			<div className={cn("rounded-md border border-dashed border-divider px-3 py-3 text-sm text-text-tertiary", className)}>
				{conversation.message ?? "No PR comments yet."}
			</div>
		);
	}
	return (
		<div className={cn("grid gap-3 border-t border-divider pt-3", className)}>
			{conversation.events.map((event) => (
				<PullRequestConversationCard key={`${event.kind}:${event.id}`} event={event} />
			))}
		</div>
	);
}

export function pullRequestCheckBadgeMeta(
	rollup: PullRequestCheckRollup | null | undefined,
	loading = false,
): PullRequestCheckBadgeMeta {
	if (loading && !rollup) {
		return { label: "Checks loading", tone: "neutral", title: "Check status is loading." };
	}
	if (!rollup) {
		return { label: "Checks unknown", tone: "neutral", title: "Check status has not been loaded yet." };
	}
	if (!rollup.supported) {
		return { label: "Checks unsupported", tone: "neutral", title: rollup.message ?? "This provider does not expose check status." };
	}
	if (rollup.summary.total === 0) {
		return { label: "No checks", tone: "neutral", title: rollup.message ?? "No provider checks were found." };
	}
	const stateMeta: Record<PullRequestCheckState, Pick<PullRequestCheckBadgeMeta, "label" | "tone">> = {
		passed: { label: "Checks passed", tone: "green" },
		failed: { label: "Checks failed", tone: "red" },
		pending: { label: "Checks running", tone: "gold" },
		cancelled: { label: "Checks cancelled", tone: "orange" },
		skipped: { label: "Checks skipped", tone: "neutral" },
		unknown: { label: "Checks unknown", tone: "neutral" },
	};
	const selected = stateMeta[rollup.overallState] ?? stateMeta.unknown;
	const summary = rollup.summary;
	const parts = [
		`${summary.total} total`,
		summary.passed ? `${summary.passed} passed` : null,
		summary.failed ? `${summary.failed} failed` : null,
		summary.pending ? `${summary.pending} running` : null,
		summary.cancelled ? `${summary.cancelled} cancelled` : null,
		summary.skipped ? `${summary.skipped} skipped` : null,
		summary.unknown ? `${summary.unknown} unknown` : null,
	].filter(Boolean);
	return { ...selected, title: parts.join(", ") };
}

export function PullRequestCheckBadge({
	rollup,
	loading = false,
	className,
}: {
	rollup: PullRequestCheckRollup | null | undefined;
	loading?: boolean;
	className?: string;
}): ReactElement {
	const meta = pullRequestCheckBadgeMeta(rollup, loading);
	return (
		<span
			className={cn(
				"inline-flex h-6 max-w-full shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold leading-none",
				badgeToneStyles[meta.tone],
				className,
			)}
			title={meta.title}
		>
			{loading ? <Spinner size={11} /> : null}
			<span className="truncate">{meta.label}</span>
		</span>
	);
}

export function PullRequestViewButton({
	url,
	number,
	className,
}: {
	url?: string | null;
	number?: number | null;
	className?: string;
}): ReactElement {
	const hasUrl = Boolean(url);
	if (!hasUrl) {
		return (
			<Button variant="default" size="sm" icon={<ExternalLink size={13} />} disabled title="PR link unavailable" className={className}>
				View PR
			</Button>
		);
	}
	return (
		<a
			href={url ?? undefined}
			target="_blank"
			rel="noopener noreferrer"
			title={`Open PR #${number ?? ""}`.trim()}
			className={cn(
				"inline-flex h-7 select-none items-center justify-center gap-1.5 rounded-md border border-border-bright bg-surface-2 px-2 text-xs font-medium text-text-primary hover:border-border-bright hover:bg-surface-3 active:bg-surface-4",
				"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
				className,
			)}
			onClick={(event) => event.stopPropagation()}
		>
			<ExternalLink size={13} />
			View PR
		</a>
	);
}

export function PullRequestDetailsPanel({
	summary,
	details,
	checks,
	isLoading = false,
	isSaving = false,
	isEditing = false,
	draftBody,
	editorMode = "preview",
	saveError = null,
	areChecksRefreshing = false,
	author,
	isFloating = false,
	showHeaderControls = true,
	showDescriptionContent = true,
	onDraftBodyChange,
	onEditorModeChange,
	onStartEdit,
	onCancelEdit,
	onSave,
	onClose,
	onRefreshChecks,
	onFloatingChange,
	className,
	actions,
	belowContent,
}: {
	summary?: PullRequestSummary | null;
	details?: PullRequestDetails | null;
	checks?: PullRequestCheckRollup | null;
	isLoading?: boolean;
	isSaving?: boolean;
	isEditing?: boolean;
	draftBody: string;
	editorMode?: MarkdownMessageEditorMode;
	saveError?: string | null;
	areChecksRefreshing?: boolean;
	author?: PullRequestAuthorDisplay | null;
	isFloating?: boolean;
	showHeaderControls?: boolean;
	showDescriptionContent?: boolean;
	onDraftBodyChange: (body: string) => void;
	onEditorModeChange?: (mode: MarkdownMessageEditorMode) => void;
	onStartEdit: () => void;
	onCancelEdit: () => void;
	onSave: () => void;
	onClose?: () => void;
	onRefreshChecks?: () => void;
	onFloatingChange?: (floating: boolean) => void;
	className?: string;
	actions?: ReactNode;
	belowContent?: ReactNode;
}): ReactElement {
	const pr = details ?? summary ?? null;
	const title = pr?.title?.trim() || (pr?.number ? `PR #${pr.number}` : "Pull request");
	const body = details?.body ?? draftBody;
	const provider = details?.provider ?? checks?.provider ?? "Provider";
	const updatedAt = formatUpdatedAt(details?.updatedAt);
	const rollup = checks ?? details?.checks ?? summary?.checks ?? null;
	const checkMeta = pullRequestCheckBadgeMeta(rollup, areChecksRefreshing && !rollup);
	const authorName = details?.author?.trim() || author?.name?.trim() || null;
	const hasBody = body.trim().length > 0;
	const prUrl = pr?.url?.trim() || null;

	return (
		<section className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
			<header className="flex min-h-11 items-center gap-2 border-b border-divider px-3 py-2">
				<div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg">
					<GitPullRequest size={14} />
				</div>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-semibold text-text-primary">{title}</div>
					<div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">
						{pr?.number ? <span>PR #{pr.number}</span> : null}
						{pr?.number ? <span aria-hidden>·</span> : null}
						<span className="truncate">{provider}</span>
						{authorName ? (
							<>
								<span aria-hidden>·</span>
								{author?.avatar ? <span className="shrink-0">{author.avatar}</span> : null}
								<span className="truncate">{authorName}</span>
							</>
						) : null}
						{updatedAt ? (
							<>
								<span aria-hidden>·</span>
								<span className="truncate">{updatedAt}</span>
							</>
						) : null}
					</div>
				</div>
				{showHeaderControls ? (
					<div className="ml-auto flex shrink-0 items-center gap-1.5">
						{onRefreshChecks ? (
							<button
								type="button"
								className={cn(
									"inline-flex h-7 max-w-[150px] items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold leading-none",
									"focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
									badgeToneStyles[checkMeta.tone],
							)}
							title={`${checkMeta.title} Click to refresh.`}
							onClick={onRefreshChecks}
						>
							<RefreshCw size={12} className="shrink-0" />
							<span className="truncate">{checkMeta.label}</span>
						</button>
						) : (
							<PullRequestCheckBadge rollup={rollup} loading={areChecksRefreshing && !rollup} />
						)}
						{prUrl ? (
							<a
								href={prUrl}
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
						{actions}
						{onClose ? (
							<Button
								variant="ghost"
								size="sm"
								icon={<X size={15} />}
								aria-label="Close PR details"
								title="Close PR details"
								onClick={onClose}
							/>
						) : null}
					</div>
				) : null}
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
				{isLoading ? (
					<div className="grid gap-2" role="status" aria-label="Loading pull request details">
						<div className="kb-skeleton h-4 w-1/2 rounded" />
						<div className="kb-skeleton h-16 rounded" />
					</div>
				) : null}
				<div className="grid gap-2 border-b border-divider pb-3 text-xs text-text-secondary">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<span className="shrink-0 text-text-tertiary">Head</span>
						<span className="min-w-0 truncate font-mono text-text-primary">{branchValue(pr?.headBranch)}</span>
						<span className="text-text-tertiary">→</span>
						<span className="shrink-0 text-text-tertiary">Base</span>
						<span className="min-w-0 truncate font-mono text-text-primary">{branchValue(pr?.baseBranch)}</span>
					</div>
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						{pr?.state ? <span className="capitalize text-text-tertiary">{pr.state}</span> : null}
						{details?.draft ? <span className="text-text-tertiary">Draft</span> : null}
					</div>
				</div>
				{showDescriptionContent || isEditing ? (
					<div className="min-h-0">
						{isEditing ? (
							<div className="grid gap-3">
								<MarkdownMessageEditor
									value={draftBody}
									onChange={onDraftBodyChange}
									mode={editorMode}
									onModeChange={onEditorModeChange}
									height="min(48vh, 360px)"
									placeholder="PR description"
									disabled={isSaving}
									autoFocus
									previewEmptyLabel="_This PR description is empty._"
								/>
								{saveError ? <div className="text-xs text-status-red">{saveError}</div> : null}
								<div className="flex gap-2">
									<Button variant="default" fill disabled={isSaving} onClick={onCancelEdit}>
										Cancel
									</Button>
									<Button
										variant="primary"
										fill
										icon={isSaving ? <Spinner size={14} /> : <Save size={14} />}
										disabled={isSaving}
										onClick={onSave}
									>
										Save description
									</Button>
								</div>
							</div>
						) : hasBody ? (
							<MarkdownMessagePreview
								value={body}
								emptyLabel="_This PR description is empty._"
								className="cy-markdown-preview--plain text-sm text-text-primary"
							/>
						) : (
							<div className="px-4 py-6 text-center text-sm text-text-secondary">
								This PR description is empty.
							</div>
						)}
					</div>
				) : null}
				{belowContent}
			</div>
		</section>
	);
}
