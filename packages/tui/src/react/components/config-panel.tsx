import { palette, truncate } from "../palette";
import type { TuiState } from "../types";
import type React from "react";

function Row(props: { label: string; value: string; detail?: string }) {
  const text = `${props.label.padEnd(18)}${truncate(props.value, 34)}${props.detail ? `  ${truncate(props.detail, 42)}` : ""}`;
  return (
    <box paddingX={1} paddingY={0}>
      <text fg={palette.text} wrapMode="none">{text}</text>
    </box>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <box flexDirection="column" border borderStyle="rounded" borderColor={palette.border} paddingX={1} paddingY={1} marginBottom={1}>
      <box marginBottom={1}>
        <text fg={palette.accent}>
          <strong>{props.title}</strong>
        </text>
      </box>
      {props.children}
    </box>
  );
}

export function ConfigPanel(props: { state: TuiState }) {
  const project = props.state.projectConfig;
  const runtime = props.state.runtimeConfig;
  const selectedAgent = runtime?.agents.find((agent) => agent.id === runtime.selectedAgentId);
  return (
    <box flexDirection="column" paddingX={2} paddingY={1}>
      <text fg={palette.text}>
        <strong>Changeyard Config</strong>
      </text>
      <Section title="Project">
        <Row label="Provider" value={project?.providerType ?? "unknown"} />
        <Row label="Default base" value={project?.projectDefaultBase ?? "unknown"} />
        <Row label="Planning" value={project?.planningDefaultProfile ?? "none"} detail={project?.planningDefaultStrictness ?? "normal"} />
      </Section>
      <Section title="VCS / JJ">
        <Row label="Engine" value={project?.vcsEngine ?? "unknown"} detail={`fallback ${project?.vcsFallback ?? "unknown"}`} />
        <Row label="Target" value={project?.vcsTargetBranch ?? "default"} />
        <Row label="Active diff" value={props.state.repoStatus?.diffSummary ?? "unknown"} />
      </Section>
      <Section title="Agent / Runtime">
        <Row label="Launch agent" value={selectedAgent?.label ?? runtime?.selectedAgentId ?? "unknown"} />
        <Row label="Runtime" value={props.state.runtimeHealthy ? "healthy" : "offline"} />
      </Section>
      <Section title="Diagnostics">
        <Row label="Doctor" value={props.state.doctor?.warnings.length ? `${props.state.doctor.warnings.length} warnings` : "ok"} />
        <Row label="Export" value="/export-diagnostics" detail="writes a local bundle" />
      </Section>
    </box>
  );
}
