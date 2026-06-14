import type { ChangeDetail, ChangeListItem, ProjectConfigResponse } from "../runtime-client";

export type StatusContext = {
  selected: ChangeListItem | null;
  detail: ChangeDetail | null;
  status: string;
  error: string | null;
  projectConfig: ProjectConfigResponse | null;
  runtimeHealthy: boolean;
  width: number;
};

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, Math.max(0, max));
  return `${value.slice(0, max - 3)}...`;
}

function gateText(detail: ChangeDetail | null): string {
  const gates = detail?.planning?.gateSummary;
  if (!gates) return "plan none";
  return `gates ${gates.pass}/${gates.pending}/${gates.fail}/${gates.warning}`;
}

function workspaceText(detail: ChangeDetail | null): string {
  const workspace = detail?.workspace;
  if (!workspace?.path) return "workspace not-started";
  const branch = workspace.branch ? ` ${workspace.branch}` : "";
  return `${workspace.engine ?? "workspace"}${branch}`;
}

export function formatStatusRows(input: StatusContext): [string, string] {
  const width = Math.max(40, input.width);
  const selected = input.selected;
  const config = input.projectConfig;
  const health = input.runtimeHealthy ? "runtime ok" : "runtime offline";
  const primary = input.error
    ? `error ${input.error}`
    : `${selected?.id ?? "none"} ${selected?.status ?? "no-change"} ${gateText(input.detail)} ${health}`;
  const secondary = [
    config?.providerType ?? "provider?",
    config?.vcsEngine ?? "vcs?",
    workspaceText(input.detail),
    input.status,
  ].join(" | ");
  return [truncate(primary, width - 2), truncate(secondary, width - 2)];
}
