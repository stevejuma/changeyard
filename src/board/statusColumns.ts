import type { ChangeStatus } from "../types.js";
import type { ChangeyardColumnId } from "./boardTypes.js";

export const COLUMN_STATUS_MAP: Record<ChangeyardColumnId, ChangeStatus[]> = {
  backlog: ["draft"],
  ready: ["ready", "synced"],
  in_progress: ["in_progress", "changes_requested"],
  blocked: ["blocked"],
  review: ["ready_for_pr", "pr_open", "in_review"],
  done: ["approved", "merged"],
  abandoned: ["abandoned"],
};

export const COLUMN_TITLES: Record<ChangeyardColumnId, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  blocked: "Blocked",
  review: "Review / PR",
  done: "Done",
  abandoned: "Abandoned",
};

export function columnForStatus(status: string): ChangeyardColumnId {
  for (const [column, statuses] of Object.entries(COLUMN_STATUS_MAP)) {
    if ((statuses as string[]).includes(status)) return column as ChangeyardColumnId;
  }
  return "backlog";
}
