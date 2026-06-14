import type {
  ChangeDetail,
  ChangeListItem,
  DoctorResponse,
  ProjectConfigResponse,
  RuntimeAgentDefinition,
  RuntimeConfigResponse,
} from "../runtime-client";
import { buildActivityItems } from "./activity";
import type { ActivityEvent } from "./activity-events";
import { buildDiagnosticsRows } from "./diagnostics";

export type DiagnosticBundleFormat = "markdown" | "json";

export type DiagnosticBundleInput = {
  generatedAt: string;
  runtimeUrl: string | null;
  workspaceId: string | null;
  runtimeHealthy: boolean;
  eventRefreshMode: "events" | "polling" | "unavailable";
  lastRefreshAt: string | null;
  lastRefreshError: string | null;
  status: string;
  error: string | null;
  selected: ChangeListItem | null;
  detail: ChangeDetail | null;
  changes: ChangeListItem[];
  doctor: DoctorResponse | null;
  projectConfig: ProjectConfigResponse | null;
  runtimeConfig: Pick<RuntimeConfigResponse, "selectedAgentId" | "agents"> | null;
  selectedAgent: RuntimeAgentDefinition | null;
  activityEvents: ActivityEvent[];
};

export function diagnosticBundleFileExtension(format: DiagnosticBundleFormat): "md" | "json" {
  return format === "json" ? "json" : "md";
}

export function diagnosticBundleFormatFromArg(value: string | undefined): DiagnosticBundleFormat {
  return value?.trim().toLowerCase() === "json" ? "json" : "markdown";
}

export function buildDiagnosticBundle(input: DiagnosticBundleInput, format: DiagnosticBundleFormat): string {
  if (format === "json") {
    return `${JSON.stringify(buildDiagnosticBundleObject(input), null, 2)}\n`;
  }
  return buildDiagnosticBundleMarkdown(input);
}

function buildDiagnosticBundleObject(input: DiagnosticBundleInput) {
  return {
    generatedAt: input.generatedAt,
    runtime: {
      url: input.runtimeUrl,
      workspaceId: input.workspaceId,
      healthy: input.runtimeHealthy,
      refreshMode: input.eventRefreshMode,
      lastRefreshAt: input.lastRefreshAt,
      lastRefreshError: input.lastRefreshError,
    },
    status: {
      message: input.status,
      error: input.error,
    },
    selected: input.selected,
    detail: input.detail,
    projectConfig: input.projectConfig,
    runtimeConfig: input.runtimeConfig,
    selectedAgent: input.selectedAgent,
    doctor: input.doctor,
    diagnostics: buildDiagnosticsRows({
      runtimeUrl: input.runtimeUrl,
      workspaceId: input.workspaceId,
      runtimeHealthy: input.runtimeHealthy,
      eventRefreshMode: input.eventRefreshMode,
      lastRefreshAt: input.lastRefreshAt,
      lastRefreshError: input.lastRefreshError,
      projectConfig: input.projectConfig,
      runtimeConfig: input.runtimeConfig,
      selectedAgent: input.selectedAgent,
      doctor: input.doctor,
    }),
    activity: buildActivityItems({
      changes: input.changes,
      doctor: input.doctor,
      events: input.activityEvents,
    }),
  };
}

function buildDiagnosticBundleMarkdown(input: DiagnosticBundleInput): string {
  const bundle = buildDiagnosticBundleObject(input);
  const selected = input.selected;
  const lines = [
    "# Changeyard TUI Diagnostic Bundle",
    "",
    `Generated: ${input.generatedAt}`,
    `Runtime: ${input.runtimeUrl ?? "unknown"}`,
    `Workspace: ${input.workspaceId ?? "not selected"}`,
    `Runtime health: ${input.runtimeHealthy ? "healthy" : "unavailable"}`,
    `Refresh mode: ${input.eventRefreshMode}`,
    `Last refresh: ${input.lastRefreshAt ?? "never"}`,
    ...(input.lastRefreshError ? [`Last refresh error: ${input.lastRefreshError}`] : []),
    "",
    "## Current Selection",
    "",
    selected
      ? `- ${selected.id} ${selected.status}: ${selected.title}`
      : "- No selected change.",
    input.detail?.workspace?.path ? `- Workspace: ${input.detail.workspace.path}` : "- Workspace: not started",
    input.detail?.planning
      ? `- Planning: ${input.detail.planning.model}/${input.detail.planning.strictness} phase=${input.detail.planning.phase}`
      : "- Planning: none",
    "",
    "## Project",
    "",
    `- Initialized: ${input.projectConfig?.initialized === true ? "yes" : "no"}`,
    `- Provider: ${input.projectConfig?.providerType ?? "unknown"}`,
    `- VCS: ${input.projectConfig ? `${input.projectConfig.vcsEngine} -> ${input.projectConfig.vcsFallback}` : "unknown"}`,
    `- Default base: ${input.projectConfig?.projectDefaultBase ?? "unknown"}`,
    `- Agent: ${input.selectedAgent?.label ?? input.runtimeConfig?.selectedAgentId ?? "unknown"}`,
    "",
    "## Diagnostics",
    "",
    ...bundle.diagnostics.map((row) => `- ${row.severity}: ${row.section} ${row.title}: ${row.value}`),
    "",
    "## Activity",
    "",
    ...bundle.activity.slice(0, 80).map((item) => `- ${item.severity}: ${item.title}: ${item.description}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
