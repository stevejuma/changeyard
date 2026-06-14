import type { ChangeListItem, DoctorResponse } from "../runtime-client";
import type { ActivityEvent } from "./activity-events";

export type ActivityItem = {
  id: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "error" | "success";
};

export function buildActivityItems(input: {
  changes: readonly ChangeListItem[];
  doctor: DoctorResponse | null;
  events?: readonly ActivityEvent[];
}): ActivityItem[] {
  const items: ActivityItem[] = (input.events ?? []).map((event) => ({
    id: event.id,
    title: event.title,
    description: `${formatActivityTime(event.createdAt)} ${event.description}`,
    severity: event.status === "failure" ? "error" : event.status === "success" ? "success" : "info",
  }));
  for (const change of input.changes) {
    const planning = change.planning
      ? `planning ${change.planning.phase}; next ${change.planning.nextAction ?? "none"}`
      : "quick/unplanned";
    items.push({
      id: `change:${change.id}`,
      title: `${change.id} ${change.status}`,
      description: `${change.title} (${planning})`,
      severity: change.planning?.gateSummary.fail ? "error" : "info",
    });
  }
  for (const warning of input.doctor?.warnings ?? []) {
    items.push({
      id: `doctor-warning:${items.length}`,
      title: "Doctor warning",
      description: warning,
      severity: "warning",
    });
  }
  for (const note of input.doctor?.notes ?? []) {
    items.push({
      id: `doctor-note:${items.length}`,
      title: "Doctor note",
      description: note,
      severity: "info",
    });
  }
  for (const ok of input.doctor?.ok ?? []) {
    items.push({
      id: `doctor-ok:${items.length}`,
      title: "Doctor ok",
      description: ok,
      severity: "success",
    });
  }
  return items;
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString();
}
