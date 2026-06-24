import { ExternalLink, GitPullRequest, Pencil, RefreshCw, Save, X } from "lucide-react";
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

function branchValue(value: string | null | undefined): string {
	return value?.trim() || "Unknown";
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
	return (
		<Button
			variant="default"
			size="sm"
			icon={<ExternalLink size={13} />}
			disabled={!hasUrl}
			title={hasUrl ? `Open PR #${number ?? ""}`.trim() : "PR link unavailable"}
			className={className}
			onClick={(event) => {
				event.stopPropagation();
				if (url) {
					window.open(url, "_blank", "noopener,noreferrer");
				}
			}}
		>
			View PR
		</Button>
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
	onDraftBodyChange,
	onEditorModeChange,
	onStartEdit,
	onCancelEdit,
	onSave,
	onClose,
	onRefreshChecks,
	className,
	actions,
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
	onDraftBodyChange: (body: string) => void;
	onEditorModeChange?: (mode: MarkdownMessageEditorMode) => void;
	onStartEdit: () => void;
	onCancelEdit: () => void;
	onSave: () => void;
	onClose?: () => void;
	onRefreshChecks?: () => void;
	className?: string;
	actions?: ReactNode;
}): ReactElement {
	const pr = details ?? summary ?? null;
	const title = pr?.title?.trim() || (pr?.number ? `PR #${pr.number}` : "Pull request");
	const body = details?.body ?? draftBody;
	const provider = details?.provider ?? checks?.provider ?? "Provider";
	const updatedAt = formatUpdatedAt(details?.updatedAt);
	const rollup = checks ?? details?.checks ?? summary?.checks ?? null;
	const hasBody = body.trim().length > 0;

	return (
		<section className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-surface-1", className)}>
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
						{details?.author ? (
							<>
								<span aria-hidden>·</span>
								<span className="truncate">{details.author}</span>
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
				{onRefreshChecks ? (
					<Button
						variant="ghost"
						size="sm"
						icon={<RefreshCw size={14} />}
						aria-label="Refresh PR checks"
						title="Refresh PR checks"
						onClick={onRefreshChecks}
					/>
				) : null}
				<Button
					variant={isEditing ? "default" : "ghost"}
					size="sm"
					icon={<Pencil size={14} />}
					aria-label="Edit PR description"
					title="Edit PR description"
					disabled={isSaving}
					onClick={onStartEdit}
				/>
				{actions}
				{onClose ? (
					<Button variant="ghost" size="sm" icon={<X size={15} />} aria-label="Close PR details" title="Close PR details" onClick={onClose} />
				) : null}
			</header>
			<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
				{isLoading ? (
					<div className="grid gap-2" role="status" aria-label="Loading pull request details">
						<div className="kb-skeleton h-4 w-1/2 rounded" />
						<div className="kb-skeleton h-16 rounded" />
					</div>
				) : null}
				<div className="grid gap-2 rounded-md border border-divider bg-surface-0 px-3 py-2 text-xs text-text-secondary">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<span className="shrink-0 text-text-tertiary">Head</span>
						<span className="min-w-0 truncate font-mono text-text-primary">{branchValue(pr?.headBranch)}</span>
						<span className="text-text-tertiary">→</span>
						<span className="shrink-0 text-text-tertiary">Base</span>
						<span className="min-w-0 truncate font-mono text-text-primary">{branchValue(pr?.baseBranch)}</span>
					</div>
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<PullRequestCheckBadge rollup={rollup} />
						{pr?.state ? <span className="capitalize text-text-tertiary">{pr.state}</span> : null}
						{details?.draft ? <span className="text-text-tertiary">Draft</span> : null}
					</div>
				</div>
				<div className="min-h-0 flex-1">
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
							className="rounded-md border border-divider bg-surface-0 px-4 py-3 text-sm text-text-primary"
						/>
					) : (
						<div className="rounded-md border border-dashed border-divider bg-surface-0 px-4 py-6 text-center text-sm text-text-secondary">
							This PR description is empty.
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
