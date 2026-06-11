import { ChangeyardError } from "../errors.js";
import type { ChangeStatus } from "../types.js";

const transitions: Record<string, string[]> = {
  ready: ["synced", "in_progress", "approved", "changes_requested", "abandoned"],
  synced: ["in_progress"],
  in_progress: ["ready_for_pr", "blocked", "abandoned"],
  blocked: ["in_progress", "abandoned"],
  ready_for_pr: ["pr_open", "in_review", "approved", "changes_requested", "abandoned"],
  pr_open: ["in_review", "merged", "abandoned"],
  in_review: ["approved", "changes_requested", "abandoned"],
  changes_requested: ["in_progress", "abandoned"],
  approved: ["merged", "abandoned"],
};

export function assertTransition(from: string, to: ChangeStatus, context: string): void {
  if (from === to) return;
  const allowed = transitions[from] ?? [];
  if (!allowed.includes(to)) {
    throw new ChangeyardError("INVALID_TRANSITION", `${context}: cannot transition from ${from || "unknown"} to ${to}`);
  }
}
