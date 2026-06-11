import type { ReactElement } from "react";
import { useEffect, useState } from "react";

import { PlanningBadge } from "@/components/changeyard/planning-badge";
import { PlanningGateList } from "@/components/changeyard/planning-gate-list";
import { ClineMarkdownContent } from "@/components/detail-panels/cline-markdown-content";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { cn } from "@/components/ui/cn";
import type { RuntimeChangeyardChangeDetail } from "@/runtime/types";

export type ChangeDetailAction =
	| "validate"
	| "sync"
	| "start"
	| "verify"
	| "complete"
	| "reviewStart"
	| "approve"
	| "requestChanges";

function actionsForStatus(status: string): ChangeDetailAction[] {
	switch (status) {
		case "draft":
			return ["validate"];
		case "ready":
			return ["sync", "start"];
		case "synced":
		case "changes_requested":
			return ["start"];
		case "in_progress":
			return ["verify", "complete"];
		case "ready_for_pr":
		case "pr_open":
			return ["reviewStart"];
		case "in_review":
			return ["approve", "requestChanges"];
		default:
			return [];
	}
}

function actionLabel(action: ChangeDetailAction): string {
	switch (action) {
		case "validate":
			return "Validate";
		case "sync":
			return "Sync";
		case "start":
			return "Start";
		case "verify":
			return "Verify";
		case "complete":
			return "Complete";
		case "reviewStart":
			return "Start Review";
		case "approve":
			return "Approve";
		case "requestChanges":
			return "Request Changes";
	}
}

export function ChangeDetailDialog({
	change,
	open,
	isActionPending = false,
	actionError = null,
	onOpenChange,
	onRunAction,
	onSaveBody,
}: {
	change: RuntimeChangeyardChangeDetail | null;
	open: boolean;
	isActionPending?: boolean;
	actionError?: string | null;
	onOpenChange: (open: boolean) => void;
	onRunAction: (action: ChangeDetailAction, changeId: string) => void;
	onSaveBody: (input: { changeId: string; body: string; expectedUpdatedAt?: string | null }) => void;
}): ReactElement | null {
	const [mode, setMode] = useState<"preview" | "edit">("preview");
	const [draftBody, setDraftBody] = useState("");

	useEffect(() => {
		if (!change) {
			setMode("preview");
			setDraftBody("");
			return;
		}
		setDraftBody(change.body);
		setMode("preview");
	}, [change]);

	if (!change) {
		return null;
	}

	const availableActions = actionsForStatus(change.status);
	const isDirty = draftBody !== change.body;

	return (
		<Dialog open={open} onOpenChange={onOpenChange} contentClassName="!max-w-[980px] h-[85vh]">
			<DialogHeader title={change.title} />
			<DialogBody className="flex min-h-0 flex-col gap-4">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-xs uppercase tracking-wide text-text-tertiary">{change.id}</span>
					<span className="text-sm text-text-secondary">
						{change.status} · {change.type}
					</span>
					<PlanningBadge planning={change.planning} />
					{change.workspace?.path ? <span className="text-xs text-text-secondary">{change.workspace.path}</span> : null}
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{availableActions.map((action) => (
						<Button
							key={action}
							variant={action === "start" || action === "complete" || action === "approve" ? "primary" : "default"}
							onClick={() => onRunAction(action, change.id)}
							disabled={isActionPending}
						>
							{actionLabel(action)}
						</Button>
					))}
				</div>

				{actionError ? (
					<div className="rounded-md border border-[color:var(--color-status-red)]/25 bg-[color:var(--color-status-red)]/8 px-3 py-2">
						<p className="text-sm text-[color:var(--color-status-red)]">{actionError}</p>
					</div>
				) : null}

				<div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
					<div className="space-y-4">
						<div className="rounded-md border border-divider bg-surface-0 px-3 py-3">
							<h3 className="mb-2 text-sm font-semibold text-text-primary">Planning Gates</h3>
							<PlanningGateList planning={change.planning} />
						</div>
						{change.planning?.nextAction ? (
							<div className="rounded-md border border-divider bg-surface-0 px-3 py-3">
								<h3 className="mb-1 text-sm font-semibold text-text-primary">Next Action</h3>
								<p className="text-sm text-text-secondary">{change.planning.nextAction}</p>
							</div>
						) : null}
						{change.planning?.errors?.length ? (
							<div className="rounded-md border border-[color:var(--color-status-red)]/25 bg-[color:var(--color-status-red)]/8 px-3 py-3">
								<h3 className="mb-1 text-sm font-semibold text-text-primary">Planning Errors</h3>
								<ul className="list-disc pl-5 text-sm text-text-secondary">
									{change.planning.errors.map((error) => (
										<li key={error}>{error}</li>
									))}
								</ul>
							</div>
						) : null}
					</div>

					<div className="flex min-h-0 flex-col rounded-md border border-divider bg-surface-0">
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
						<div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
							{mode === "edit" ? (
								<textarea
									value={draftBody}
									onChange={(event) => setDraftBody(event.target.value)}
									disabled={isActionPending}
									className={cn(
										"min-h-full w-full resize-none rounded-md border border-border bg-surface-1 p-3 font-mono text-[13px] text-text-primary",
										"focus:border-border-focus focus:outline-none disabled:opacity-40",
									)}
								/>
							) : draftBody.trim() ? (
								<ClineMarkdownContent content={draftBody} />
							) : (
								<p className="text-sm text-text-secondary">This change body is currently empty.</p>
							)}
						</div>
					</div>
				</div>
			</DialogBody>
			<DialogFooter>
				<Button variant="default" onClick={() => onOpenChange(false)} disabled={isActionPending}>
					Close
				</Button>
				<Button
					variant="ghost"
					onClick={() => setDraftBody(change.body)}
					disabled={!isDirty || isActionPending}
				>
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
