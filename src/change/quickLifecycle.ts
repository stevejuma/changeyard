import { defaultConfig } from "../config/defaults.js";
import type { ChangeyardConfig, Frontmatter } from "../types.js";
import { checkProfile, isQuickChange, workflowMetadata } from "./changeMetadata.js";

export type QuickLifecycleValidationResult = {
  valid: boolean;
  errors: string[];
};

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
