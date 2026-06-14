import type {
  DoctorResponse,
  ProjectConfigResponse,
  RuntimeAgentDefinition,
  RuntimeConfigResponse,
} from "../runtime-client";

export type DiagnosticSeverity = "info" | "success" | "warning" | "error";

export type DiagnosticRow = {
  id: string;
  section: string;
  title: string;
  value: string;
  severity: DiagnosticSeverity;
};

export type RuntimeDiagnosticsInput = {
  runtimeUrl: string | null;
  workspaceId: string | null;
  runtimeHealthy: boolean;
  eventRefreshMode: "events" | "polling" | "unavailable";
  lastRefreshAt: string | null;
  lastRefreshError: string | null;
  projectConfig: ProjectConfigResponse | null;
  runtimeConfig: Pick<RuntimeConfigResponse, "selectedAgentId" | "agents"> | null;
  selectedAgent: RuntimeAgentDefinition | null;
  doctor: DoctorResponse | null;
};

export function buildDiagnosticsRows(input: RuntimeDiagnosticsInput): DiagnosticRow[] {
  const rows: DiagnosticRow[] = [
    {
      id: "runtime:url",
      section: "runtime",
      title: "runtime url",
      value: input.runtimeUrl ?? "unknown",
      severity: input.runtimeUrl ? "info" : "warning",
    },
    {
      id: "runtime:workspace",
      section: "runtime",
      title: "workspace",
      value: input.workspaceId ?? "not selected",
      severity: input.workspaceId ? "success" : "warning",
    },
    {
      id: "runtime:health",
      section: "runtime",
      title: "health",
      value: input.runtimeHealthy ? "healthy" : "unavailable",
      severity: input.runtimeHealthy ? "success" : "error",
    },
    {
      id: "runtime:refresh",
      section: "runtime",
      title: "last refresh",
      value: input.lastRefreshAt ? formatTimestamp(input.lastRefreshAt) : "never",
      severity: input.lastRefreshAt ? "info" : "warning",
    },
    {
      id: "runtime:events",
      section: "runtime",
      title: "refresh mode",
      value: input.eventRefreshMode,
      severity: input.eventRefreshMode === "events" ? "success" : "info",
    },
  ];

  if (input.lastRefreshError) {
    rows.push({
      id: "runtime:last-error",
      section: "runtime",
      title: "last error",
      value: input.lastRefreshError,
      severity: "error",
    });
  }

  rows.push(
    {
      id: "project:initialized",
      section: "project",
      title: "initialized",
      value: input.projectConfig?.initialized === true ? "yes" : "no",
      severity: input.projectConfig?.initialized === true ? "success" : "warning",
    },
    {
      id: "project:provider",
      section: "project",
      title: "provider",
      value: input.projectConfig?.providerType ?? "unknown",
      severity: input.projectConfig ? "info" : "warning",
    },
    {
      id: "project:vcs",
      section: "project",
      title: "vcs",
      value: input.projectConfig ? `${input.projectConfig.vcsEngine} -> ${input.projectConfig.vcsFallback}` : "unknown",
      severity: input.projectConfig ? "info" : "warning",
    },
    {
      id: "project:base",
      section: "project",
      title: "base",
      value: input.projectConfig?.projectDefaultBase ?? "unknown",
      severity: input.projectConfig?.projectDefaultBase ? "info" : "warning",
    },
    {
      id: "agent:selected",
      section: "agent",
      title: "selected",
      value: input.selectedAgent?.label ?? input.runtimeConfig?.selectedAgentId ?? "unknown",
      severity: input.selectedAgent ? "success" : "warning",
    },
    {
      id: "agent:state",
      section: "agent",
      title: "state",
      value: input.selectedAgent
        ? `${input.selectedAgent.installed ? "installed" : "missing"}, ${input.selectedAgent.configured ? "configured" : "not configured"}`
        : "not loaded",
      severity: input.selectedAgent?.installed && input.selectedAgent.configured ? "success" : "warning",
    },
  );

  for (const [index, warning] of (input.doctor?.warnings ?? []).entries()) {
    rows.push({
      id: `doctor:warning:${index}`,
      section: "doctor",
      title: "warning",
      value: warning,
      severity: "warning",
    });
  }
  for (const [index, note] of (input.doctor?.notes ?? []).entries()) {
    rows.push({
      id: `doctor:note:${index}`,
      section: "doctor",
      title: "note",
      value: note,
      severity: "info",
    });
  }
  for (const [index, ok] of (input.doctor?.ok ?? []).entries()) {
    rows.push({
      id: `doctor:ok:${index}`,
      section: "doctor",
      title: "ok",
      value: ok,
      severity: "success",
    });
  }

  return rows;
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
