import { Copy, ExternalLink, Pencil, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { StatusChip, type StatusChipTone } from "@/components/ui/status-chip";
import type {
	RuntimeVcsCheckRollup,
	RuntimeVcsCheckState,
	RuntimeVcsPullRequestDetails,
	RuntimeVcsPullRequestSelector,
	RuntimeVcsPullRequestSummary,
} from "@/runtime/types";
import {
	useGetBaseBranchChecksQuery,
	useGetPullRequestChecksQuery,
	useGetPullRequestDetailsQuery,
	useUpdatePullRequestMutation,
} from "@/runtime/vcs-api";
import { copyTextToClipboard } from "@/utils/clipboard";

type PullRequestSelectorInput = Omit<RuntimeVcsPullRequestSelector, "workspacePath">;

function checkStateMeta(
	rollup: RuntimeVcsCheckRollup | null | undefined,
	loading = false,
): { label: string; tone: StatusChipTone; title: string } {
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
	const meta: Record<RuntimeVcsCheckState, { label: string; tone: StatusChipTone }> = {
		passed: { label: "Checks passed", tone: "green" },
		failed: { label: "Checks failed", tone: "red" },
		pending: { label: "Checks running", tone: "gold" },
		cancelled: { label: "Checks cancelled", tone: "orange" },
		skipped: { label: "Checks skipped", tone: "neutral" },
		unknown: { label: "Checks unknown", tone: "neutral" },
	};
	const selected = meta[rollup.overallState] ?? meta.unknown;
	const summary = rollup.summary;
	const parts = [
		`${summary.total} total`,
		summary.passed > 0 ? `${summary.passed} passed` : null,
		summary.failed > 0 ? `${summary.failed} failed` : null,
		summary.pending > 0 ? `${summary.pending} running` : null,
		summary.cancelled > 0 ? `${summary.cancelled} cancelled` : null,
		summary.skipped > 0 ? `${summary.skipped} skipped` : null,
	].filter(Boolean);
	return { label: selected.label, tone: selected.tone, title: parts.join(", ") };
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

function selectorForPullRequest(pr: RuntimeVcsPullRequestSummary): PullRequestSelectorInput {
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
	const meta = checkStateMeta(rollup, loading);
	return (
		<StatusChip
			label={meta.label}
			tone={meta.tone}
			title={meta.title}
			icon={loading ? <Spinner size={11} /> : null}
			className={className}
		/>
	);
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
		{ skip: !workspaceId, pollingInterval: 60_000 },
	);
	const rollup = result.data ?? null;
	const meta = checkStateMeta(rollup, result.isFetching && !rollup);
	if (!workspaceId) {
		return null;
	}
	const branch = result.data?.branch ? `${result.data.branch}: ` : "";
	return (
		<div className={cn("flex shrink-0 items-center gap-1", className)}>
			<StatusChip
				label={`${branch}${meta.label}`}
				tone={meta.tone}
				title={meta.title}
				icon={result.isFetching && !rollup ? <Spinner size={11} /> : null}
				className="max-w-[180px]"
			/>
			<Button
				variant="ghost"
				size="sm"
				icon={result.isFetching ? <Spinner size={12} /> : <RefreshCw size={12} />}
				aria-label="Refresh base branch checks"
				title="Refresh base branch checks"
				onClick={() => void result.refetch()}
			/>
		</div>
	);
}

export function VcsPullRequestActions({
	workspaceId,
	workspacePath,
	pr,
	onUpdated,
	className,
}: {
	workspaceId: string | null;
	workspacePath?: string | null;
	pr: RuntimeVcsPullRequestSummary | null | undefined;
	onUpdated?: () => void | Promise<void>;
	className?: string;
}): React.ReactElement | null {
	const [editOpen, setEditOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const selector = useMemo(() => (pr ? selectorForPullRequest(pr) : null), [pr]);
	const checksResult = useGetPullRequestChecksQuery(
		{ workspaceId: workspaceId ?? "", workspacePath, input: selector ?? { number: 0 } },
		{ skip: !workspaceId || !selector || !pr, pollingInterval: 30_000 },
	);
	if (!pr || !selector) {
		return null;
	}
	const rollup = checksResult.data ?? pr.checks ?? null;
	const hasUrl = Boolean(pr.url);

	async function copyLink(): Promise<void> {
		if (!pr?.url) {
			return;
		}
		const ok = await copyTextToClipboard(pr.url);
		if (!ok) {
			return;
		}
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1200);
	}

	return (
		<div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
			<Button
				variant="default"
				size="sm"
				icon={<ExternalLink size={13} />}
				disabled={!hasUrl}
				title={hasUrl ? `Open PR #${pr.number}` : "PR link unavailable"}
				onClick={() => {
					if (pr.url) {
						window.open(pr.url, "_blank", "noopener,noreferrer");
					}
				}}
			>
				View PR
			</Button>
			<VcsCheckStatusChip rollup={rollup} loading={checksResult.isFetching && !rollup} />
			<Button
				variant="ghost"
				size="sm"
				icon={checksResult.isFetching ? <Spinner size={12} /> : <RefreshCw size={12} />}
				aria-label={`Refresh checks for PR #${pr.number}`}
				title={`Refresh checks for PR #${pr.number}`}
				onClick={() => void checksResult.refetch()}
			/>
			<Button
				variant="ghost"
				size="sm"
				icon={<Copy size={12} />}
				disabled={!hasUrl}
				aria-label={`Copy link for PR #${pr.number}`}
				title={copied ? "Copied PR link" : "Copy PR link"}
				onClick={() => void copyLink()}
			/>
			<Button
				variant="ghost"
				size="sm"
				icon={<Pencil size={12} />}
				disabled={!workspaceId}
				aria-label={`Edit PR #${pr.number}`}
				title={`Edit PR #${pr.number}`}
				onClick={() => setEditOpen(true)}
			/>
			<VcsPullRequestEditDialog
				open={editOpen}
				workspaceId={workspaceId}
				workspacePath={workspacePath}
				pr={pr}
				selector={selector}
				onOpenChange={setEditOpen}
				onSaved={async () => {
					void checksResult.refetch();
					await onUpdated?.();
				}}
			/>
		</div>
	);
}

function VcsPullRequestEditDialog({
	open,
	workspaceId,
	workspacePath,
	pr,
	selector,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	workspaceId: string | null;
	workspacePath?: string | null;
	pr: RuntimeVcsPullRequestSummary;
	selector: PullRequestSelectorInput;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void | Promise<void>;
}): React.ReactElement {
	const detailsResult = useGetPullRequestDetailsQuery(
		{ workspaceId: workspaceId ?? "", workspacePath, input: selector },
		{ skip: !workspaceId || !open },
	);
	const [updatePullRequest, updateState] = useUpdatePullRequestMutation();
	const details: RuntimeVcsPullRequestDetails | null = detailsResult.data ?? null;
	const [title, setTitle] = useState(pr.title ?? "");
	const [body, setBody] = useState("");
	const [saveError, setSaveError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) {
			return;
		}
		setTitle(details?.title ?? pr.title ?? "");
		setBody(details?.body ?? "");
		setSaveError(null);
	}, [details?.body, details?.title, open, pr.title]);

	async function save(): Promise<void> {
		if (!workspaceId) {
			return;
		}
		setSaveError(null);
		try {
			await updatePullRequest({
				workspaceId,
				workspacePath,
				input: {
					...selector,
					title: title.trim(),
					body,
				},
			}).unwrap();
			await detailsResult.refetch();
			await onSaved();
			onOpenChange(false);
		} catch (error) {
			setSaveError(errorMessage(error));
		}
	}

	const baseBranch = details?.baseBranch ?? pr.baseBranch ?? "unknown";
	const headBranch = details?.headBranch ?? pr.headBranch ?? "unknown";
	const provider = details?.provider ?? "provider";
	const disabled = updateState.isLoading || title.trim().length === 0 || !workspaceId;

	return (
		<Dialog open={open} onOpenChange={onOpenChange} contentAriaDescribedBy="vcs-pr-edit-description">
			<DialogHeader title={`Edit PR #${pr.number}`} />
			<DialogBody>
				<div id="vcs-pr-edit-description" className="sr-only">
					Edit pull request title and description.
				</div>
				<div className="mb-3 grid gap-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-text-secondary">
					<div className="flex min-w-0 gap-2">
						<span className="shrink-0 text-text-tertiary">Head</span>
						<span className="min-w-0 truncate font-mono text-text-primary">{headBranch}</span>
					</div>
					<div className="flex min-w-0 gap-2">
						<span className="shrink-0 text-text-tertiary">Base</span>
						<span className="min-w-0 truncate font-mono text-text-primary">{baseBranch}</span>
					</div>
					<div className="flex min-w-0 gap-2">
						<span className="shrink-0 text-text-tertiary">Source</span>
						<span className="min-w-0 truncate text-text-primary">{provider}</span>
					</div>
				</div>
				{detailsResult.isError ? (
					<div className="mb-3 rounded-md border border-status-orange/35 bg-status-orange/10 px-3 py-2 text-xs text-status-orange">
						Live PR details are unavailable. Saving may be unsupported by this provider.
					</div>
				) : null}
				<label className="grid gap-1 text-sm">
					<span className="font-medium text-text-primary">Title</span>
					<input
						className="h-9 rounded-md border border-border bg-surface-0 px-3 text-sm text-text-primary outline-none focus:border-accent"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						disabled={updateState.isLoading}
					/>
				</label>
				<label className="mt-3 grid gap-1 text-sm">
					<span className="font-medium text-text-primary">Description</span>
					<textarea
						className="min-h-44 resize-y rounded-md border border-border bg-surface-0 px-3 py-2 font-mono text-[13px] text-text-primary outline-none focus:border-accent"
						value={body}
						onChange={(event) => setBody(event.target.value)}
						disabled={updateState.isLoading || detailsResult.isFetching}
					/>
				</label>
				{detailsResult.isFetching ? (
					<div className="mt-2 flex items-center gap-2 text-xs text-text-tertiary">
						<Spinner size={12} />
						Loading PR details.
					</div>
				) : null}
				{saveError ? <div className="mt-2 text-xs text-status-red">{saveError}</div> : null}
			</DialogBody>
			<DialogFooter>
				<Button variant="ghost" onClick={() => onOpenChange(false)} disabled={updateState.isLoading}>
					Cancel
				</Button>
				<Button variant="primary" icon={updateState.isLoading ? <Spinner size={14} /> : <Save size={14} />} disabled={disabled} onClick={() => void save()}>
					Save
				</Button>
			</DialogFooter>
		</Dialog>
	);
}
