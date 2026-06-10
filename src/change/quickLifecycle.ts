import { defaultConfig } from "../config/defaults.js";
import { hasCheckboxTask, parseSections } from "../documents/sections.js";
import type { ChangeyardConfig, Frontmatter } from "../types.js";
import { checkProfile, isQuickChange, workflowMetadata } from "./changeMetadata.js";

export type QuickLifecycleValidationResult = {
  valid: boolean;
  errors: string[];
};

function hasBlockingUncheckedItems(section: string): boolean {
  return section.split(/\r?\n/).some((line) => /^\s*- \[ \]\s+/.test(line) && !/DEFERRED:/i.test(line));
}

function completionNotesMentionChecks(notes: string): boolean {
  return /(checks?\s+ran|ran\s+checks?|tests?\s+ran|ran\s+tests?|verification|verified|not run|did not run|no checks?)/i.test(notes);
}

export function validateQuickStart(frontmatter: Frontmatter, config: ChangeyardConfig): QuickLifecycleValidationResult {
  if (!isQuickChange(frontmatter)) {
    return { valid: true, errors: [] };
  }

  const effectiveConfig = config.planning ?? defaultConfig.planning;
  const errors: string[] = [];
  if (effectiveConfig?.allowQuickChanges === false) {
    errors.push("Quick changes are disabled by config: set planning.allowQuickChanges to true or convert this change to planned mode.");
  }

  if ((effectiveConfig?.quickChangeRequiresWorkspace ?? true) && workflowMetadata(frontmatter)?.requiresWorkspace === false) {
    errors.push("Quick changes must keep workflow.requiresWorkspace enabled while planning.quickChangeRequiresWorkspace is true.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function quickCompletionProfile(frontmatter: Frontmatter, config: ChangeyardConfig): string | null {
  if (!isQuickChange(frontmatter)) return null;
  return config.planning?.quickChangeCheckProfile ?? checkProfile(frontmatter) ?? "minimal";
}

export function validateQuickCompletion(frontmatter: Frontmatter, body: string): QuickLifecycleValidationResult {
  if (!isQuickChange(frontmatter)) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];
  const sections = parseSections(body);
  const acceptanceCriteria = sections.get("Acceptance Criteria") ?? "";
  if (acceptanceCriteria.trim() === "" || !hasCheckboxTask(acceptanceCriteria)) {
    errors.push("Acceptance Criteria must include checkbox items before quick completion.");
  } else if (hasBlockingUncheckedItems(acceptanceCriteria)) {
    errors.push("Acceptance Criteria must be completed or marked `Deferred: <reason>` before quick completion.");
  }

  const completionNotes = (sections.get("Completion Notes") ?? "").trim();
  if (completionNotes && !completionNotesMentionChecks(completionNotes)) {
    errors.push("Completion Notes must mention checks run or explain why checks were not run before quick completion.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
