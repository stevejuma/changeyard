import { For, Show } from "solid-js";
import { useTheme } from "../context/theme";
import { badgeText, type PreviewTab } from "../context/app-state";
import type { ChangeDetail, ChangeListItem, DoctorResponse } from "../runtime-client";
import { buildActivityItems } from "../utils/activity";

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
      <text fg={theme.textMuted}>Run /start, /verify, /complete from composer.</text>
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

export function ActivityPanel(props: { changes: ChangeListItem[]; doctor: DoctorResponse | null }) {
  const { theme } = useTheme();
  const items = () => buildActivityItems({ changes: props.changes, doctor: props.doctor }).slice(0, 80);
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

export function DiagnosticsPanel(props: { doctor: DoctorResponse | null }) {
  const { theme } = useTheme();
  return (
    <box flexDirection="column">
      <text fg={theme.text}>diagnostics</text>
      <Show when={props.doctor} fallback={<text fg={theme.textMuted}>Run /doctor to load diagnostics.</text>}>
        {(doctor) => (
          <>
            <text fg={theme.textMuted}>ok: {doctor().ok.length}</text>
            <For each={doctor().ok}>
              {(line) => <text fg={theme.success}>ok: {line}</text>}
            </For>
            <For each={doctor().warnings}>
              {(line) => <text fg={theme.warning}>warning: {line}</text>}
            </For>
            <For each={doctor().notes}>
              {(line) => <text fg={theme.textMuted}>note: {line}</text>}
            </For>
          </>
        )}
      </Show>
    </box>
  );
}

export function PreviewPanel(props: {
  tab: PreviewTab;
  detail: ChangeDetail | null;
  prompt: string | null;
  changes: ChangeListItem[];
  doctor: DoctorResponse | null;
}) {
  const { theme } = useTheme();
  if (props.tab === "activity") {
    return <ActivityPanel changes={props.changes} doctor={props.doctor} />;
  }
  if (props.tab === "diagnostics") {
    return <DiagnosticsPanel doctor={props.doctor} />;
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
