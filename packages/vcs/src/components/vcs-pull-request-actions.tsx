import {
	PullRequestCheckBadge,
	PullRequestDetailsPanel,
	PullRequestViewButton,
	pullRequestCheckBadgeMeta,
	type MarkdownMessageEditorMode,
} from "@changeyard/web-ui";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
	useGetPullRequestDetailsQuery,
	useUpdatePullRequestMutation,
} from "@/runtime/vcs-api";

type PullRequestSelectorInput = Omit<RuntimeVcsPullRequestSelector, "workspacePath">;

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
		{ skip: !workspaceId, pollingInterval: 60_000 },
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
				icon={result.isFetching ? <Spinner size={12} /> : <RefreshCw size={12} />}
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
	onUpdated,
	onClose,
	className,
}: {
	workspaceId: string | null;
	workspacePath?: string | null;
	pr: RuntimeVcsPullRequestSummary | null | undefined;
	editRequestKey?: number | null;
	onUpdated?: () => void | Promise<void>;
	onClose: () => void;
	className?: string;
}): React.ReactElement | null {
	const selector = useMemo(() => (pr ? selectorForPullRequest(pr) : null), [pr]);
	const detailsResult = useGetPullRequestDetailsQuery(
		{ workspaceId: workspaceId ?? "", workspacePath, input: selector ?? { number: 0 } },
		{ skip: !workspaceId || !selector || !pr },
	);
	const checksResult = useGetPullRequestChecksQuery(
		{ workspaceId: workspaceId ?? "", workspacePath, input: selector ?? { number: 0 } },
		{ skip: !workspaceId || !selector || !pr, pollingInterval: 30_000 },
	);
	const [updatePullRequest, updateState] = useUpdatePullRequestMutation();
	const [draftBody, setDraftBody] = useState("");
	const [isEditing, setEditing] = useState(false);
	const [editorMode, setEditorMode] = useState<MarkdownMessageEditorMode>("preview");
	const [saveError, setSaveError] = useState<string | null>(null);
	const lastEditRequestKey = useRef<number | null>(null);
	const [pendingEditRequestKey, setPendingEditRequestKey] = useState<number | null>(null);
	const details = detailsResult.data ?? null;
	const rollup = checksResult.data ?? details?.checks ?? pr?.checks ?? null;

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
			className={className}
		/>
	);
}
