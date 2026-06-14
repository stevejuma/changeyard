import { HOME_VIEW_MAX_WIDTH, palette, truncate } from "../palette";
import type { StatusControl, TuiState, UiMode } from "../types";

export function StatusBar(props: {
  state: TuiState;
  width: number;
  uiMode: UiMode;
  statusControl: StatusControl;
  selectedProfile: string | null;
  autoApproveAll: boolean;
  onCycleStatusControl?: () => void;
  variant?: "home" | "chat";
}) {
  const agent = props.state.runtimeConfig?.agents.find((item) => item.id === props.state.runtimeConfig?.selectedAgentId);
  const repo = props.state.repoStatus;
  const availableWidth = Math.max(24, (props.variant === "home" ? Math.min(props.width, HOME_VIEW_MAX_WIDTH) : props.width) - 2);
  const profileText = props.selectedProfile ?? "profile";
  const toggleWidth = Math.min(36, 22 + Math.min(12, profileText.length));
  const modelText = agent?.label ?? props.state.runtimeConfig?.selectedAgentId ?? "agent";
  const runtimeText = props.state.runtimeHealthy ? "runtime ok" : "runtime offline";
  const leftBudget = Math.max(8, availableWidth - toggleWidth - 1);
  const firstRow = truncate(`${modelText} | ${runtimeText}`, leftBudget);
  const repoRow = formatRepoRow(repo, availableWidth);
  const status = props.state.error ?? props.state.status;

  return (
    <box flexDirection="column" paddingX={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg="gray" wrapMode="none">{firstRow}</text>
        <box flexDirection="row" gap={1} flexShrink={0} onMouseDown={props.onCycleStatusControl}>
          <text fg={props.statusControl === "plan" ? palette.plan : "gray"}>{props.statusControl === "plan" ? "●" : "○"} Plan</text>
          <text fg={props.statusControl === "act" ? palette.act : "gray"}>{props.statusControl === "act" ? "●" : "○"} Act</text>
          <text fg={props.statusControl === "profile" ? palette.profile : "gray"}>{props.statusControl === "profile" ? "●" : "○"} {truncate(profileText, 12)}</text>
          <text fg="gray">(Tab)</text>
        </box>
      </box>
      <text fg={repo?.vcsType === "none" || repo?.vcsType === "unknown" ? "gray" : palette.text} wrapMode="none">
        {repoRow}
      </text>
      <text fg={props.autoApproveAll ? palette.success : "gray"} wrapMode="none">
        {props.autoApproveAll ? "▸▸ Auto-approve all enabled" : "Auto-approve all disabled"} <span fg="gray">(Shift+Tab)</span>
      </text>
      {status ? <text fg={props.state.error ? palette.red : "gray"} wrapMode="none">{truncate(status, availableWidth)}</text> : null}
    </box>
  );
}

function formatRepoRow(repo: TuiState["repoStatus"], width: number): string {
  if (!repo) return "repo loading";
  const diff = repo.diffStats
    ? ` | ${repo.diffStats.files} file${repo.diffStats.files === 1 ? "" : "s"} +${repo.diffStats.additions} -${repo.diffStats.deletions}`
    : "";
  const ref = repo.refLabel ? ` (${repo.refLabel})` : "";
  const prefix = `${repo.workspaceName}${ref}`;
  return truncate(`${prefix}${diff}`, width);
}
