import { planningMetadata, planningModel, workflowMetadata, workflowMode } from "../change/changeMetadata.js";
import { defaultConfig } from "../config/defaults.js";
import { hasCheckboxTask, hasUncheckedCheckboxTask, parseSections } from "./sections.js";
import type { ValidationGate } from "../planning/validation.js";
import type { ChangeyardConfig, Frontmatter } from "../types.js";

type QuickValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

const QUICK_REQUIRED_SECTIONS = ["Summary", "Scope", "Acceptance Criteria", "Completion Notes"] as const;
const QUICK_RISK_CHECKS = [
  "No behavior change",
  "No public API change",
  "No storage/schema change",
  "No provider/workspace lifecycle change",
  "No UI workflow change",
  "No security-sensitive change",
] as const;

function normalizeChecklistLabel(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseCheckboxItems(section: string): Map<string, boolean> {
  const items = new Map<string, boolean>();
  for (const line of section.split(/\r?\n/)) {
    const match = /^\s*- \[([ xX])\]\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    items.set(normalizeChecklistLabel(match[2]), match[1].toLowerCase() === "x");
  }
  return items;
}

function isTerminalQuickStatus(status: string): boolean {
  return ["ready_for_pr", "pr_open", "in_review", "changes_requested", "approved", "merged", "abandoned"].includes(status);
}

function hasBlockingUncheckedItems(section: string): boolean {
  return section.split(/\r?\n/).some((line) => /^\s*- \[ \]\s+/.test(line) && !/DEFERRED:/i.test(line));
}

function completionNotesMentionChecks(notes: string): boolean {
  return /(?:checks?|tests?)\s+(?:run|ran|passed|completed|succeeded)|(?:run|ran|passed)\s+(?:checks?|tests?)|verif(?:ication|ied)|(?:checks?|tests?)\s+(?:were\s+)?not\s+run|did\s+not\s+run\s+(?:checks?|tests?)|no\s+(?:checks?|tests?)(?:\s+(?:were\s+)?run)?/i.test(notes);
}

function isQuickCandidate(frontmatter: Frontmatter): boolean {
  const type = typeof frontmatter.type === "string" ? frontmatter.type : "";
  if (type === "quick") return true;

  const planning = planningMetadata(frontmatter);
  if (planning?.model === "none") return true;

  const workflow = workflowMetadata(frontmatter);
  return workflow?.mode === "quick";
}

function validateQuickMetadata(frontmatter: Frontmatter, errors: string[]): void {
  if (planningModel(frontmatter) !== "none") {
    errors.push("Quick changes must set planning.model to `none`.");
  }
  if (workflowMode(frontmatter) !== "quick") {
    errors.push("Quick changes must set workflow.mode to `quick`.");
  }
}

function validateQuickSections(frontmatter: Frontmatter, body: string, errors: string[]): Map<string, string> {
  const sections = parseSections(body);

  for (const sectionName of QUICK_REQUIRED_SECTIONS) {
    const content = sections.get(sectionName);
    if (content === undefined) {
      errors.push(`Missing required section: ${sectionName}`);
      continue;
    }
    if (content.trim() === "") {
      errors.push(`Required section is empty: ${sectionName}`);
    }
  }

  const scope = sections.get("Scope") ?? "";
  if (scope.trim() !== "" && !hasCheckboxTask(scope)) {
    errors.push("Scope must include checkbox items for quick-risk review");
  }

  const acceptanceCriteria = sections.get("Acceptance Criteria") ?? "";
  if (acceptanceCriteria.trim() !== "" && !hasCheckboxTask(acceptanceCriteria)) {
    errors.push("Acceptance Criteria must include checkbox items");
  }

  const status = typeof frontmatter.status === "string" ? frontmatter.status : "";
  if (!isTerminalQuickStatus(status) && acceptanceCriteria.trim() !== "" && !hasUncheckedCheckboxTask(acceptanceCriteria)) {
    errors.push("Acceptance Criteria must include at least one unchecked task before quick completion");
  }

  return sections;
}

function validateQuickPlanningMarkers(body: string, errors: string[]): void {
  if (/<!--\s*cy:[a-z0-9-]+:(?:start|end)\s*-->/.test(body)) {
    errors.push("Quick changes cannot include OpenSpec-lite planning markers unless converted to planned mode.");
  }
}

function validateQuickRiskChecklist(
  scope: string,
  config: ChangeyardConfig,
  errors: string[],
  warnings: string[],
): void {
  const escalation = config.planning?.quickChangeEscalation ?? defaultConfig.planning?.quickChangeEscalation ?? "warn";
  if (escalation === "off") return;

  const checklist = parseCheckboxItems(scope);
  const unresolved: string[] = [];
  for (const label of QUICK_RISK_CHECKS) {
    const key = normalizeChecklistLabel(label);
    if (!checklist.has(key)) unresolved.push(`${label} checkbox is missing`);
    else if (checklist.get(key) !== true) unresolved.push(`${label} is not checked`);
  }

  if (unresolved.length === 0) return;

  const message = `Quick scope risk review unresolved: ${unresolved.join("; ")}`;
  if (escalation === "block") errors.push(message);
  else warnings.push(message);
}

export function validateQuickChange(
  frontmatter: Frontmatter,
  body: string,
  options: { gate?: ValidationGate; config?: ChangeyardConfig } = {},
): QuickValidationResult {
  if (!isQuickCandidate(frontmatter)) {
    return { valid: true, errors: [], warnings: [] };
  }

  const config = options.config ?? defaultConfig;
  const errors: string[] = [];
  const warnings: string[] = [];

  validateQuickMetadata(frontmatter, errors);
  const sections = validateQuickSections(frontmatter, body, errors);
  if (options.gate === "complete") {
    const acceptanceCriteria = sections.get("Acceptance Criteria") ?? "";
    if (acceptanceCriteria.trim() !== "" && !hasUncheckedCheckboxTask(acceptanceCriteria)) {
      const uncheckedTaskError = "Acceptance Criteria must include at least one unchecked task before quick completion";
      const index = errors.indexOf(uncheckedTaskError);
      if (index >= 0) errors.splice(index, 1);
    }
    if (acceptanceCriteria.trim() === "" || !hasCheckboxTask(acceptanceCriteria)) {
      errors.push("Acceptance Criteria must include checkbox items before quick completion.");
    } else if (hasBlockingUncheckedItems(acceptanceCriteria)) {
      errors.push("Acceptance Criteria must be completed or marked `Deferred: <reason>` before quick completion.");
    }

    const completionNotes = (sections.get("Completion Notes") ?? "").trim();
    if (completionNotes && !completionNotesMentionChecks(completionNotes)) {
      errors.push("Completion Notes must mention checks run, tests passed, verification evidence, or explain why no checks were run before quick completion.");
    }
  }
  validateQuickPlanningMarkers(body, errors);
  validateQuickRiskChecklist(sections.get("Scope") ?? "", config, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
