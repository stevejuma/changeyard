import { palette, truncate } from "../palette";
import type { TuiState } from "../types";

export function StatusBar(props: { state: TuiState; width: number }) {
  const agent = props.state.runtimeConfig?.agents.find((item) => item.id === props.state.runtimeConfig?.selectedAgentId);
  const repo = props.state.repoStatus;
  const selected = props.state.selected;
  const pieces = [
    agent ? `agent ${agent.label}` : "agent unknown",
    repo ? `${repo.type} ${repo.displayRef}` : "repo loading",
    repo ? repo.diffSummary : "diff unknown",
    selected ? `${selected.id} ${selected.status}` : "no change",
    props.state.runtimeHealthy ? "runtime ok" : "runtime offline",
  ];
  const second = props.state.error ?? props.state.status;
  return (
    <box flexDirection="column" paddingX={2} paddingY={1} backgroundColor={palette.bg}>
      <text fg={palette.muted} wrapMode="none">{truncate(pieces.join("  |  "), props.width - 4)}</text>
      <text fg={props.state.error ? palette.red : palette.faint} wrapMode="none">{truncate(second, props.width - 4)}</text>
    </box>
  );
}
