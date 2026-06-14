import { For, Show } from "solid-js";
import { useTheme } from "../context/theme";
import { badgeText, type PreviewTab } from "../context/app-state";
import type { ChangeDetail, ChangeListItem, DoctorResponse } from "../runtime-client";
import { buildActivityItems } from "../utils/activity";
import type { ActivityEvent } from "../utils/activity-events";
import type { DiagnosticRow } from "../utils/diagnostics";
import type { SetupChecklistItem } from "../utils/setup-guide";

function Spacer() {
  return <box height={1} />;
}

export function DetailPanel(props: { detail: ChangeDetail }) {
  const { theme, syntax } = useTheme();
  return (
    <box flexDirection="column">
      <text fg={theme.text}>
        {props.detail.id}: {props.detail.title}
      </text>
      <text fg={theme.textMuted}>
        type: {props.detail.type} status: {props.detail.status}
      </text>
      <text fg={theme.textMuted}>{badgeText(props.detail)}</text>
      <text fg={theme.textMuted}>path: {props.detail.path}</text>
      <Spacer />
      <markdown content={props.detail.body.slice(0, 4000)} syntaxStyle={syntax()} />
    </box>
  );
}

export function PlanningPanel(props: { detail: ChangeDetail; prompt: string | null }) {
  const { theme } = useTheme();
  return (
    <box flexDirection="column">
      <text fg={theme.text}>
        planning: {props.detail.planning ? `${props.detail.planning.model} ${props.detail.planning.strictness}` : "none"}
      </text>
      <Show when={props.detail.planning}>
        {(planning) => (
          <text fg={theme.textMuted}>
            gates pass={planning().gateSummary.pass} pending={planning().gateSummary.pending} fail=
            {planning().gateSummary.fail} warning={planning().gateSummary.warning}
          </text>
        )}
      </Show>
      {props.detail.sections.map((section) => (
        <text fg={theme.textMuted}>
          {section.title}: {section.content.trim().slice(0, 120) || "empty"}
        </text>
      ))}
      <Spacer />
      <Show
        when={props.prompt}
        fallback={<text fg={theme.textMuted}>Use /prompt to load the first planning prompt.</text>}
      >
        <text fg={theme.textMuted}>Prompt loaded. Use /prompt to view in dialog.</text>
      </Show>
    </box>
  );
}

export function WorkspacePanel(props: { detail: ChangeDetail }) {
  const { theme } = useTheme();
  return (
    <box flexDirection="column">
      <text fg={theme.text}>workspace</text>
      <text fg={theme.textMuted}>engine: {props.detail.workspace?.engine ?? "none"}</text>
      <text fg={theme.textMuted}>name: {props.detail.workspace?.name ?? "none"}</text>
      <text fg={theme.textMuted}>path: {props.detail.workspace?.path ?? "not started"}</text>
      <text fg={theme.textMuted}>next: /next</text>
      <text fg={theme.textMuted}>cleanup: /workspace-status /workspace-delete</text>
    </box>
  );
}

export function ReviewPanel(props: { detail: ChangeDetail }) {
  const { theme } = useTheme();
  return (
    <box flexDirection="column">
      <text fg={theme.text}>review</text>
      <text fg={theme.textMuted}>status: {props.detail.status}</text>
      <text fg={theme.textMuted}>remote issue: {props.detail.remote?.issueUrl ?? "none"}</text>
      <text fg={theme.textMuted}>remote PR: {props.detail.remote?.pullRequestUrl ?? "none"}</text>
      <text fg={theme.textMuted}>Run /review to start review workflow.</text>
    </box>
  );
}

export function ActivityPanel(props: { changes: ChangeListItem[]; doctor: DoctorResponse | null; events: ActivityEvent[] }) {
  const { theme } = useTheme();
  const items = () => buildActivityItems({ changes: props.changes, doctor: props.doctor, events: props.events }).slice(0, 80);
  return (
    <box flexDirection="column">
      <text fg={theme.text}>activity</text>
      <Show when={items().length > 0} fallback={<text fg={theme.textMuted}>No activity yet. Run /refresh or /doctor.</text>}>
        <For each={items()}>
          {(item) => (
            <text fg={item.severity === "warning" ? theme.warning : item.severity === "error" ? theme.error : theme.textMuted}>
              {item.title}: {item.description}
            </text>
          )}
        </For>
      </Show>
    </box>
  );
}

export function DiagnosticsPanel(props: { rows: DiagnosticRow[] }) {
  const { theme } = useTheme();
  return (
    <box flexDirection="column">
      <text fg={theme.text}>diagnostics</text>
      <text fg={theme.textMuted}>next action: /next</text>
      <Show when={props.rows.length > 0} fallback={<text fg={theme.textMuted}>Run /doctor to add doctor diagnostics.</text>}>
        <For each={props.rows}>
          {(row) => (
            <text fg={row.severity === "success" ? theme.success : row.severity === "warning" ? theme.warning : row.severity === "error" ? theme.error : theme.textMuted}>
              {row.section} {row.title}: {row.value}
            </text>
          )}
        </For>
      </Show>
    </box>
  );
}

export function SetupGuidePanel(props: { items: SetupChecklistItem[] }) {
  const { theme } = useTheme();
  return (
    <box flexDirection="column">
      <text fg={theme.text}>setup guide</text>
      <For each={props.items}>
        {(item) => (
          <text fg={item.status === "done" ? theme.success : item.status === "todo" ? theme.warning : theme.textMuted}>
            {item.status}: {item.title} - {item.detail} ({item.command})
          </text>
        )}
      </For>
    </box>
  );
}

export function PreviewPanel(props: {
  tab: PreviewTab;
  detail: ChangeDetail | null;
  prompt: string | null;
  changes: ChangeListItem[];
  doctor: DoctorResponse | null;
  activityEvents: ActivityEvent[];
  diagnosticsRows: DiagnosticRow[];
  setupItems: SetupChecklistItem[];
}) {
  const { theme } = useTheme();
  if (props.tab === "activity") {
    return <ActivityPanel changes={props.changes} doctor={props.doctor} events={props.activityEvents} />;
  }
  if (props.tab === "diagnostics") {
    return <DiagnosticsPanel rows={props.diagnosticsRows} />;
  }
  if (props.tab === "setup") {
    return <SetupGuidePanel items={props.setupItems} />;
  }
  return (
    <Show
      when={props.detail}
      fallback={<text fg={theme.textMuted}>Select a change from the sidebar, or run /create quick.</text>}
    >
      {(detail) => (
        <Show
          when={props.tab === "planning"}
          fallback={
            <Show
              when={props.tab === "workspace"}
              fallback={
                <Show when={props.tab === "review"} fallback={<DetailPanel detail={detail()} />}>
                  <ReviewPanel detail={detail()} />
                </Show>
              }
            >
              <WorkspacePanel detail={detail()} />
            </Show>
          }
        >
          <PlanningPanel detail={detail()} prompt={props.prompt} />
        </Show>
      )}
    </Show>
  );
}
