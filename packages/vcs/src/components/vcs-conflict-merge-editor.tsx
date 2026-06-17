import { ThreePaneMergeEditor, type MergeEditorOptionPatch, type MergeResolvedChange } from "@changeyard/merge/react";
import { AlertTriangle, Check, GitMerge, Maximize2, Save } from "lucide-react";
import { useCallback, useMemo, useState, type ReactElement } from "react";

import { showAppToast } from "@/components/app-toaster";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/vcs-panels";
import { useGetVcsConflictFileQuery, useResolveVcsConflictFileMutation } from "@/runtime/vcs-api";
import type { VcsMergeEditorPreferences } from "@/utils/vcs-ui-preferences";

export type VcsConflictMergeSource = "workspace" | "commit";

function languageFromPath(path: string): string | undefined {
	const extension = path.split(".").pop()?.toLowerCase();
	if (!extension || extension === path) {
		return undefined;
	}
	return extension;
}

export function VcsConflictMergeEditor({
	workspaceId,
	workspacePath,
	path,
	source = "workspace",
	revision,
	readOnlyReason,
	className,
	editorClassName,
	mergeEditorPreferences,
	onMergeEditorPreferencesChange,
	onResolved,
}: {
	workspaceId: string;
	workspacePath: string | null;
	path: string;
	source?: VcsConflictMergeSource;
	revision?: string | null;
	readOnlyReason?: string;
	className?: string;
	editorClassName?: string;
	mergeEditorPreferences?: VcsMergeEditorPreferences;
	onMergeEditorPreferencesChange?: (patch: MergeEditorOptionPatch) => void;
	onResolved?: () => Promise<void> | void;
}): ReactElement {
	const query = useGetVcsConflictFileQuery(
		{
			workspaceId,
			workspacePath,
			input: {
				path,
				source,
				revision,
			},
		},
		{ skip: !workspaceId || !path },
	);
	const [resolveConflictFile, resolveState] = useResolveVcsConflictFileMutation();
	const [resolvedState, setResolvedState] = useState<MergeResolvedChange | null>(null);
	const [resolvedContent, setResolvedContent] = useState<string | null>(null);
	const conflictFile = query.data;
	const readOnly = Boolean(conflictFile?.readOnly || source !== "workspace");
	const canSave = Boolean(conflictFile?.ok && !readOnly && resolvedState?.resolved && resolvedContent !== null && !resolveState.isLoading);
	const diagnostics = useMemo(
		() => conflictFile?.diagnostics.filter((diagnostic) => diagnostic.level !== "info") ?? [],
		[conflictFile?.diagnostics],
	);
	const handleResolvedChange = useCallback((state: MergeResolvedChange) => {
		setResolvedState(state);
		setResolvedContent(state.content);
	}, []);

	async function saveResolvedContent(): Promise<void> {
		if (!conflictFile || !canSave || resolvedContent === null) {
			return;
		}
		try {
			const result = await resolveConflictFile({
				workspaceId,
				workspacePath,
				input: {
					path,
					resolvedContent,
				},
			}).unwrap();
			if (!result.ok) {
				throw new Error(result.summary || "Could not save resolved conflict.");
			}
			showAppToast({ intent: "success", message: result.summary || `Resolved ${path}.`, timeout: 3000 }, `resolved:${path}`);
			await onResolved?.();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not save resolved conflict.";
			showAppToast({ intent: "danger", message, timeout: 7000 }, `resolve-error:${path}`);
		}
	}

	if (query.isLoading || query.isFetching) {
		return (
			<div className="flex min-h-[240px] items-center justify-center rounded-md border border-border bg-surface-0 text-text-secondary">
				<Spinner size={18} />
				<span className="ml-2 text-xs">Loading conflict</span>
			</div>
		);
	}

	if (!conflictFile) {
		return <EmptyState title="Conflict unavailable">No conflict content was returned for this file.</EmptyState>;
	}

	if (!conflictFile.ok) {
		return (
			<div className="rounded-md border border-status-red/40 bg-status-red/10 p-3 text-sm text-text-primary">
				<div className="mb-2 flex items-center gap-2 font-semibold text-status-red">
					<AlertTriangle size={16} />
					<span>Could not load conflict</span>
				</div>
				<div className="text-xs text-text-secondary">
					{diagnostics[0]?.message ?? `No conflict content is available for ${path}.`}
				</div>
			</div>
		);
	}

	return (
		<div className={cn("flex min-h-0 flex-col gap-2", className)}>
			<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-0 px-3 py-2">
				<div className="flex min-w-0 items-center gap-2 text-xs text-text-secondary">
					<GitMerge size={15} className="shrink-0 text-status-orange" />
					<span className="truncate">
						{readOnly ? readOnlyReason ?? "This conflict is read-only." : "Resolve every conflict block before saving."}
					</span>
				</div>
				{readOnly ? null : (
					<Button
						variant="primary"
						size="sm"
						icon={<Save size={14} />}
						disabled={!canSave}
						onClick={() => void saveResolvedContent()}
					>
						{resolveState.isLoading ? "Saving" : "Save"}
					</Button>
				)}
			</div>
			{diagnostics.length > 0 ? (
				<div className="grid gap-1 rounded-md border border-status-orange/35 bg-status-orange/10 p-2 text-xs text-text-secondary">
					{diagnostics.map((diagnostic) => (
						<div key={`${diagnostic.code}:${diagnostic.message}`} className="flex items-start gap-2">
							<AlertTriangle size={13} className="mt-0.5 shrink-0 text-status-orange" />
							<span>{diagnostic.message}</span>
						</div>
					))}
				</div>
			) : null}
			<ThreePaneMergeEditor
				left={conflictFile.left}
				base={conflictFile.base}
				right={conflictFile.right}
				leftLabel={conflictFile.labels.left}
				baseLabel={conflictFile.labels.base}
				rightLabel={conflictFile.labels.right}
				path={path}
				language={languageFromPath(path)}
				readOnly={readOnly}
				ignoreWhitespace={mergeEditorPreferences?.ignoreWhitespace}
				ignoreCase={mergeEditorPreferences?.ignoreCase}
				lineDiffAlgorithm={mergeEditorPreferences?.lineDiffAlgorithm}
				syncHorizontalScroll={mergeEditorPreferences?.syncHorizontalScroll}
				editableSideControls={mergeEditorPreferences?.editableSideControls}
				onBaseChange={setResolvedContent}
				onResolvedChange={handleResolvedChange}
				onOptionsChange={onMergeEditorPreferencesChange}
				className={editorClassName}
			/>
			{!readOnly && resolvedState?.resolved ? (
				<div className="flex items-center gap-2 text-xs text-status-green">
					<Check size={14} />
					<span>All conflict blocks are marked resolved.</span>
				</div>
			) : null}
		</div>
	);
}

export function VcsConflictMergeLauncher({
	path,
	source = "workspace",
	readOnlyReason,
	onOpen,
}: {
	path: string;
	source?: VcsConflictMergeSource;
	readOnlyReason?: string;
	onOpen: () => void;
}): ReactElement {
	const isWorkspaceConflict = source === "workspace";
	return (
		<div className="grid gap-3 rounded-md border border-status-orange/35 bg-status-orange/10 p-4 text-sm text-text-primary">
			<div className="flex min-w-0 items-start gap-3">
				<div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-status-orange/35 bg-surface-0 text-status-orange">
					<GitMerge size={17} />
				</div>
				<div className="min-w-0 flex-1">
					<div className="font-semibold text-text-primary">{isWorkspaceConflict ? "Resolve workspace conflict" : "Review commit conflict"}</div>
					<div className="mt-1 truncate font-mono text-xs text-text-secondary">{path}</div>
					<div className="mt-2 text-xs leading-5 text-text-secondary">
						{isWorkspaceConflict
							? "Open the full merge editor to resolve this file with an editable center pane."
							: readOnlyReason ?? "This historical conflict opens read-only until the commit is checked out or edited."}
					</div>
				</div>
			</div>
			<div className="flex justify-end">
				<Button variant="primary" icon={<Maximize2 size={14} />} onClick={onOpen} data-testid="vcs-conflict-edit-button">
					Open merge editor
				</Button>
			</div>
		</div>
	);
}
