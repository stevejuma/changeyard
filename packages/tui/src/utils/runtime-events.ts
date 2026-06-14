export type RuntimeStateEvent = {
  type?: unknown;
  workspaceId?: unknown;
  kind?: unknown;
};

export function isRefreshRelevantRuntimeEvent(value: unknown, workspaceId: string | null): boolean {
  if (!value || typeof value !== "object") return false;
  const event = value as RuntimeStateEvent;
  if (workspaceId && typeof event.workspaceId === "string" && event.workspaceId !== workspaceId) {
    return false;
  }
  return (
    event.type === "vcs_project_event" ||
    event.type === "workspace_metadata_updated" ||
    event.type === "projects_updated" ||
    event.type === "workspace_state_updated" ||
    event.type === "task_ready_for_review"
  );
}

export function runtimeEventLabel(value: unknown): string {
  if (!value || typeof value !== "object") return "runtime event";
  const event = value as RuntimeStateEvent;
  const type = typeof event.type === "string" ? event.type : "runtime event";
  const kind = typeof event.kind === "string" ? ` ${event.kind}` : "";
  return `${type}${kind}`;
}
