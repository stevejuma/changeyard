import { Settings } from "lucide-react";

import { StatusChip } from "@/components/ui/status-chip";
import { DiagnosticsPanel, KeyValue, PageBody, Panel, QueryGate, StatCard } from "@/components/vcs-panels";
import { VcsShell } from "@/components/vcs-shell";
import type { QueryState, VcsDetectResponse } from "@/runtime/types";

export function SettingsView({ state, currentPath }: { state: QueryState<VcsDetectResponse>; currentPath: string }): React.ReactElement {
	return (
		<VcsShell currentPath={currentPath} title="VCS Settings" subtitle="Read-only runtime diagnostics" kicker={<StatusChip label="Informational" tone="neutral" />}>
			<PageBody>
				<QueryGate state={state} loading="Loading VCS settings diagnostics." errorTitle="Settings failed">
					{(data) => (
						<>
							<div className="grid gap-3 md:grid-cols-3">
								<StatCard label="Feature flag" tone="gold" value="CHANGEYARD_VCS=1" />
								<StatCard label="Provider" value={data.git.provider} />
								<StatCard label="Authenticated" tone={data.publishing.authenticated ? "green" : "orange"} value={data.publishing.authenticated ? "yes" : "no"} />
							</div>
							<div className="grid gap-3 lg:grid-cols-[1fr_320px]">
								<Panel title="Current configuration">
									<KeyValue label="Workspace cwd" value={data.cwd || "Unavailable"} />
									<KeyValue label="Repository root" value={data.repository.root ?? "Unavailable"} />
									<KeyValue label="JJ root" value={data.jj.repoRoot ?? "Unavailable"} />
									<KeyValue label="Default base" value={<code>{data.jj.defaultBase ?? data.git.defaultBranch ?? "unknown"}</code>} />
									<KeyValue label="Remote" value={<span><code>{data.git.remoteName ?? "none"}</code>{data.git.remoteUrl ? ` · ${data.git.remoteUrl}` : ""}</span>} />
								</Panel>
								<Panel title="Provider state">
									<KeyValue label="Publishing" value={data.publishing.available ? data.publishing.reason ?? "available" : data.publishing.reason ?? "unavailable"} />
									<KeyValue label="Remote name" value={data.publishing.remoteName ?? "none"} />
									<KeyValue label="Provider" value={data.publishing.provider} />
								</Panel>
							</div>
							<Panel title="Settings scope">
								<div className="flex items-start gap-2 text-[13px] text-text-secondary">
									<Settings size={15} className="mt-0.5 text-text-tertiary" />
									This pass keeps settings read-only and focused on diagnostics. Persisted VCS preferences remain a separate future change.
								</div>
							</Panel>
							<DiagnosticsPanel diagnostics={data.diagnostics} />
						</>
					)}
				</QueryGate>
			</PageBody>
		</VcsShell>
	);
}
