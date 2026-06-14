import type { ChangeListItem, DoctorResponse } from "../runtime-client";

export type ActivityItem = {
  id: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "error" | "success";
};

export function buildActivityItems(input: {
  changes: readonly ChangeListItem[];
  doctor: DoctorResponse | null;
}): ActivityItem[] {
  const items: ActivityItem[] = [];
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
