import { palette, truncate } from "../palette";
import type { TuiState } from "../types";

export function SessionPanel(props: { state: TuiState }) {
  const summary = props.state.sessionSummary;
  const messages = props.state.sessionMessages.slice(-6);
  return (
    <box flexDirection="column" border borderStyle="rounded" borderColor={palette.border} paddingX={1} paddingY={1}>
      <text fg={palette.accent}>
        <strong>Agent Session</strong>
      </text>
      <text fg={palette.muted}>
        {summary
          ? `${summary.taskId} ${summary.state} ${summary.agentId ?? "agent"}`
          : "No active session."}
      </text>
      {summary?.latestHookActivity?.activityText ? (
        <text fg={palette.yellow}>{truncate(summary.latestHookActivity.activityText, 90)}</text>
      ) : null}
      {summary?.warningMessage ? <text fg={palette.red}>{truncate(summary.warningMessage, 90)}</text> : null}
      {messages.map((message) => (
        <text key={message.id} fg={message.role === "assistant" ? palette.text : palette.muted} wrapMode="none">
          {truncate(`${message.role}: ${message.content}`, 96)}
        </text>
      ))}
    </box>
  );
}
