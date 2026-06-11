import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ClineMarkdownContent } from "@/components/detail-panels/cline-markdown-content";
import { PlanningBadge } from "@/components/changeyard/planning-badge";
import { PlanningGateList } from "@/components/changeyard/planning-gate-list";
import { Button } from "@/components/ui/button";
import { PathDisplay } from "@/components/ui/path-display";
import { ChangeStatusChip, StatusChip } from "@/components/ui/status-chip";
import type { RuntimeChangeyardChangeDetail, RuntimeChangeyardPlanningSectionId } from "@/runtime/types";

export function ChangeDetailPlanningPanel({
	change,
	onClose,
	isActionPending = false,
	actionError = null,
	onValidate,
	onSync,
	onStart,
	onSaveSection,
	savingSectionId = null,
}: {
	change: RuntimeChangeyardChangeDetail | null;
	onClose: () => void;
	isActionPending?: boolean;
	actionError?: string | null;
	onValidate?: (changeId: string) => void;
	onSync?: (changeId: string) => void;
	onStart?: (changeId: string) => void;
	onSaveSection?: (input: {
		changeId: string;
		sectionId: RuntimeChangeyardPlanningSectionId;
		content: string;
		expectedUpdatedAt?: string | null;
	}) => void;
	savingSectionId?: RuntimeChangeyardPlanningSectionId | null;
}): ReactElement | null {
	const [drafts, setDrafts] = useState<Partial<Record<RuntimeChangeyardPlanningSectionId, string>>>({});

	useEffect(() => {
		if (!change) {
			setDrafts({});
			return;
		}
		setDrafts(
			Object.fromEntries(change.sections.map((section) => [section.id, section.content])) as Partial<
				Record<RuntimeChangeyardPlanningSectionId, string>
			>,
		);
	}, [change]);

	if (!change) {
		return null;
	}

	return (
		<section className="max-h-[38svh] shrink-0 overflow-y-auto border-b border-divider bg-surface-0 px-4 py-3">
			<div className="mb-3 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-xs uppercase tracking-wide text-text-tertiary">{change.id}</p>
					<h2 className="truncate text-base font-semibold text-text-primary">{change.title}</h2>
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						<ChangeStatusChip status={change.status} />
						<StatusChip label={change.type} />
						<PathDisplay path={change.path} className="min-w-0 truncate text-xs text-text-secondary" />
					</div>
				</div>
				<Button
					variant="ghost"
					size="sm"
					icon={<X size={14} />}
					onClick={onClose}
					className="h-7 shrink-0"
					aria-label="Close change detail"
				/>
			</div>

			<div className="mb-4 flex flex-wrap items-center gap-2">
				<PlanningBadge planning={change.planning} />
				{change.workspace?.path ? (
					<PathDisplay path={change.workspace.path} className="text-xs text-text-secondary" />
				) : null}
			</div>

			<div className="mb-4 flex flex-wrap gap-2">
				{onValidate ? (
					<Button variant="default" onClick={() => onValidate(change.id)} disabled={isActionPending}>
						Validate
					</Button>
				) : null}
				{onSync ? (
					<Button variant="default" onClick={() => onSync(change.id)} disabled={isActionPending}>
						Sync
					</Button>
				) : null}
				{onStart ? (
					<Button variant="primary" onClick={() => onStart(change.id)} disabled={isActionPending}>
						Start
					</Button>
				) : null}
			</div>

			{actionError ? (
				<div className="mb-4 rounded-md border border-[color:var(--color-status-red)]/25 bg-[color:var(--color-status-red)]/8 px-3 py-2">
					<p className="text-sm text-[color:var(--color-status-red)]">{actionError}</p>
				</div>
			) : null}

			<div className="mb-4">
				<h3 className="mb-2 text-sm font-semibold text-text-primary">Planning Gates</h3>
				<PlanningGateList planning={change.planning} />
			</div>

			{change.planning?.nextAction ? (
				<div className="mb-4 rounded-md border border-divider bg-surface-1 px-3 py-2">
					<h3 className="mb-1 text-sm font-semibold text-text-primary">Next Action</h3>
					<p className="text-sm text-text-secondary">{change.planning.nextAction}</p>
				</div>
			) : null}

			{change.planning?.errors?.length ? (
				<div className="mb-4 rounded-md border border-[color:var(--color-status-red)]/25 bg-[color:var(--color-status-red)]/8 px-3 py-2">
					<h3 className="mb-1 text-sm font-semibold text-text-primary">Planning Errors</h3>
					<ul className="list-disc pl-5 text-sm text-text-secondary">
						{change.planning.errors.map((error) => (
							<li key={error}>{error}</li>
						))}
					</ul>
				</div>
			) : null}

			{change.sections.length > 0 ? (
				<div className="grid gap-4 pb-1">
					{change.sections.map((section) => (
						<div key={section.id} className="rounded-lg border border-divider bg-surface-1 px-3 py-3">
							<div className="mb-2 flex items-start justify-between gap-3">
								<h3 className="text-sm font-semibold text-text-primary">{section.title}</h3>
								{onSaveSection ? (
									<div className="flex items-center gap-2">
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												setDrafts((current) => ({
													...current,
													[section.id]: section.content,
												}))
											}
											disabled={(drafts[section.id] ?? section.content) === section.content || isActionPending}
										>
											Reset
										</Button>
										<Button
											variant="primary"
											size="sm"
											onClick={() =>
												onSaveSection({
													changeId: change.id,
													sectionId: section.id,
													content: drafts[section.id] ?? section.content,
													expectedUpdatedAt: change.updatedAt ?? null,
												})
											}
											disabled={(drafts[section.id] ?? section.content) === section.content || isActionPending}
										>
											{savingSectionId === section.id ? "Saving..." : "Save"}
										</Button>
									</div>
								) : null}
							</div>
							{onSaveSection ? (
								<div className="grid gap-3">
									<textarea
										rows={Math.max(6, (drafts[section.id] ?? section.content).split("\n").length + 1)}
										value={drafts[section.id] ?? section.content}
										onChange={(event) =>
											setDrafts((current) => ({
												...current,
												[section.id]: event.target.value,
											}))
										}
										disabled={isActionPending}
										className="w-full resize-y rounded-md border border-border bg-surface-2 p-3 text-[13px] text-text-primary font-mono placeholder:text-text-tertiary focus:border-border-focus focus:outline-none disabled:opacity-40"
									/>
									<div className="rounded-md border border-divider bg-surface-0 px-3 py-3">
										<h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">Preview</h4>
										{(drafts[section.id] ?? section.content).trim() ? (
											<ClineMarkdownContent content={drafts[section.id] ?? section.content} />
										) : (
											<p className="text-sm text-text-secondary">This section is currently empty.</p>
										)}
									</div>
								</div>
							) : section.content.trim() ? (
								<ClineMarkdownContent content={section.content} />
							) : (
								<p className="text-sm text-text-secondary">This section is currently empty.</p>
							)}
						</div>
					))}
				</div>
			) : (
				<div className="rounded-lg border border-divider bg-surface-1 px-3 py-3">
					<h3 className="mb-2 text-sm font-semibold text-text-primary">Planning</h3>
					<p className="text-sm text-text-secondary">No planning is enabled for this change.</p>
				</div>
			)}
		</section>
	);
}
