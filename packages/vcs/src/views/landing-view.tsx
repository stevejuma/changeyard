import { ArrowRight, GitBranch, Layers3, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { DiagnosticsPanel, KeyValue, PageBody, Panel, QueryGate, StatCard } from "@/components/vcs-panels";
import { NoProjectSelected, SelectProjectButton, VcsShell, type VcsShellProjectState } from "@/components/vcs-shell";
import type { QueryState, VcsDetectResponse } from "@/runtime/types";

export function LandingView({
	state,
	currentPath,
	projectState,
	workspaceId,
}: {
	state: QueryState<VcsDetectResponse>;
	currentPath: string;
	projectState: VcsShellProjectState;
	workspaceId: string | null;
}): React.ReactElement {
	return (
		<VcsShell
			projectState={projectState}
			currentPath={currentPath}
			title="VCS Overview"
			subtitle="JJ-first repository operations through the Changeyard runtime"
			kicker={<StatusChip label="Feature flagged" tone="gold" />}
			actions={
				<Button variant="primary" size="sm" icon={<Layers3 size={14} />} onClick={() => {
					window.location.href = "/vcs/jj";
				}}>
					Open JJ board
				</Button>
			}
		>
			{!workspaceId ? (
				<NoProjectSelected action={<SelectProjectButton onClick={projectState.onAddProject} />}>
					Select or add a project to show the current commit and VCS interface for that workspace.
				</NoProjectSelected>
			) : (
			<PageBody>
				<QueryGate state={state} loading="Loading repository detection." errorTitle="Repository detection failed">
					{(data) => (
						<>
							<div className="grid gap-3 md:grid-cols-3">
								<StatCard label="Repository" tone={data.repository.kind === "jj" ? "green" : "neutral"} value={data.repository.kind.toUpperCase()} />
								<StatCard label="Default base" value={<code>{data.jj.defaultBase ?? data.git.defaultBranch ?? "unknown"}</code>} />
								<StatCard label="Publishing" tone={data.publishing.available ? "green" : "orange"} value={data.publishing.available ? "Ready" : "Unavailable"} />
							</div>
							<div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
								<Panel
									title="JJ stack view"
									actions={
										<a className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-bright bg-surface-2 px-2 text-xs font-medium text-text-primary hover:bg-surface-3" href="/vcs/jj">
											Open <ArrowRight size={12} />
										</a>
									}
								>
									<div className="flex items-start gap-3">
										<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-accent">
											<Layers3 size={18} />
										</div>
										<div className="grid gap-2 text-[13px] text-text-secondary">
											<p>The VCS surface now uses copied Kanban primitives and shell styling while keeping VCS code isolated in `packages/vcs`.</p>
											<p>Use the JJ board for stack lanes, previews, confirmed operations, file restore, and stacked PR submission.</p>
										</div>
									</div>
								</Panel>
								<Panel title="Detection">
									<KeyValue label="Root" value={data.repository.root ?? "Not detected"} />
									<KeyValue label="JJ" value={data.jj.installed ? data.jj.version ?? "installed" : "not installed"} />
									<KeyValue label="Remote" value={`${data.git.remoteName ?? "none"} · ${data.git.provider}`} />
								</Panel>
							</div>
							<div className="grid gap-3 md:grid-cols-2">
								<Panel title="Feature gate">
									<div className="flex items-start gap-3 text-[13px] text-text-secondary">
										<GitBranch size={16} className="mt-0.5 text-text-tertiary" />
										Requests under `/vcs` are served only when `CHANGEYARD_VCS=1` is enabled.
									</div>
								</Panel>
								<Panel title="Mutation safety">
									<div className="flex items-start gap-3 text-[13px] text-text-secondary">
										<ShieldCheck size={16} className="mt-0.5 text-status-green" />
										JJ mutations continue to require preview and confirmation through the runtime tRPC boundary.
									</div>
								</Panel>
							</div>
							<DiagnosticsPanel diagnostics={data.diagnostics} />
						</>
					)}
				</QueryGate>
			</PageBody>
			)}
		</VcsShell>
	);
}
