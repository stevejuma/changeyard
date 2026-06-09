import type { Frontmatter } from "../types.js";
import { readPlanningMetadata } from "./model.js";
import { getMarkedSectionRanges, parseMarkedSections } from "./sections.js";
import { getDefaultPlanningSectionContent } from "./templates.js";
import type { PlanningSectionId } from "./types.js";

export type PlanningValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type ValidationGate = "document" | "sync" | "start" | "complete";

function toErrorList(error: unknown): string[] {
  if (error instanceof Error) {
    return error.message.split("\n").map((entry) => entry.trim()).filter(Boolean);
  }
  return [String(error)];
}

export function validatePlanningMarkers(markdown: string): PlanningValidationResult {
  try {
    getMarkedSectionRanges(markdown);
    return { valid: true, errors: [], warnings: [] };
  } catch (error) {
    return { valid: false, errors: toErrorList(error), warnings: [] };
  }
}

export function validatePlanningMetadata(frontmatter: Frontmatter): PlanningValidationResult {
  const planning = readPlanningMetadata(frontmatter);
  if (!planning) {
    return { valid: true, errors: [], warnings: [] };
  }

  if (planning.model === "none") {
    return { valid: true, errors: [], warnings: [] };
  }

  return { valid: true, errors: [], warnings: [] };
}

function normalizeContent(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function isPlaceholderSection(id: PlanningSectionId, content: string): boolean {
  return normalizeContent(content) === normalizeContent(getDefaultPlanningSectionContent(id));
}

function sectionError(id: PlanningSectionId, message: string): string {
  return `Update <!-- cy:${id}:start --> section: ${message}`;
}

function extractSubsection(section: string, heading: string): string {
  const lines = section.replace(/\r\n/g, "\n").split("\n");
  const normalizedHeading = `## ${heading}`.toLowerCase();
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().toLowerCase() === normalizedHeading) {
      start = index + 1;
      break;
    }
  }

  if (start === -1) return "";

  const content: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    content.push(lines[index]);
  }
  return content.join("\n").trim();
}

function hasAnyCheckboxTask(section: string): boolean {
  return /^\s*- \[[ xX]\]\s+\S/m.test(section);
}

function hasAllowedClarifications(section: string): boolean {
  if (/no clarifications required/i.test(section)) return true;
  if (/explicitly skipped/i.test(section)) return true;
  return !/Replace with clarification/i.test(section);
}

function checklistHasBlockingUncheckedItems(section: string): boolean {
  const lines = section.split(/\r?\n/);
  return lines.some((line) => /^\s*- \[ \]\s+/.test(line) && !/ACCEPTED EXCEPTION:/i.test(line));
}

function unresolvedHighOrCriticalFindings(section: string): boolean {
  const lines = section.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const columns = line.split("|").map((entry) => entry.trim()).filter(Boolean);
    if (columns.length < 5) continue;
    const severity = columns[1]?.toUpperCase();
    const status = columns[4]?.toUpperCase();
    if ((severity === "HIGH" || severity === "CRITICAL") && !/(RESOLVED|ACCEPTED|PASS|DONE|CLOSED)/.test(status ?? "")) {
      return true;
    }
  }
  return false;
}

function tasksHaveOpenOrCompletedEntries(section: string): boolean {
  return hasAnyCheckboxTask(section);
}

function hasIncompleteTasks(section: string): boolean {
  const lines = section.split(/\r?\n/);
  return lines.some((line) => /^\s*- \[ \]\s+/.test(line) && !/DEFERRED:/i.test(line));
}

function verificationResultIsComplete(section: string): boolean {
  const result = extractSubsection(section, "Result");
  if (!result) return false;
  return !/^_?Not run yet\.?_?$/i.test(result) && !/List the commands or checks to run\./i.test(result);
}

function specSectionReady(section: string): boolean {
  if (/no behavior change/i.test(section)) return true;
  return !isPlaceholderSection("spec-deltas", section);
}

function analysisHasFinalPass(section: string): boolean {
  const gateResult = extractSubsection(section, "Gate Result");
  return /\bpass\b/i.test(gateResult) || /\baccepted exception\b/i.test(gateResult);
}

export function validatePlanningForGate(frontmatter: Frontmatter, body: string, gate: ValidationGate): PlanningValidationResult {
  const metadataValidation = validatePlanningMetadata(frontmatter);
  if (!metadataValidation.valid) return metadataValidation;

  const planning = readPlanningMetadata(frontmatter);
  if (!planning || planning.model === "none") {
    return { valid: true, errors: [], warnings: [] };
  }

  const markerValidation = validatePlanningMarkers(body);
  if (!markerValidation.valid) return markerValidation;

  const sections = parseMarkedSections(body);
  const errors: string[] = [];

  if (gate === "document") {
    return { valid: true, errors: [], warnings: [] };
  }

  const proposal = sections.get("proposal");
  const specDeltas = sections.get("spec-deltas");
  const design = sections.get("design");
  const tasks = sections.get("tasks");
  const verification = sections.get("verification");
  const clarifications = sections.get("clarifications");
  const checklist = sections.get("requirements-checklist");
  const analysis = sections.get("analysis");
  const type = typeof frontmatter.type === "string" ? frontmatter.type : "";

  if (gate === "sync" || gate === "start" || gate === "complete") {
    if (!proposal || isPlaceholderSection("proposal", proposal)) {
      errors.push(sectionError("proposal", "proposal must be filled before sync/start/complete."));
    }
  }

  if (gate === "start" || gate === "complete") {
    if (!specDeltas || !specSectionReady(specDeltas)) {
      errors.push(sectionError("spec-deltas", "specification deltas must be filled, or explicitly state `No behavior change`, before start/complete."));
    }

    if ((type === "feature" || type === "refactor" || type === "agent-task") && (!design || isPlaceholderSection("design", design))) {
      errors.push(sectionError("design", "design must be filled before start/complete."));
    }

    if (!tasks || !tasksHaveOpenOrCompletedEntries(tasks)) {
      errors.push(sectionError("tasks", "tasks must include at least one checkbox item before start/complete."));
    }
  }

  if (gate === "complete") {
    if (!tasks || hasIncompleteTasks(tasks)) {
      errors.push(sectionError("tasks", "all tasks must be completed or marked `Deferred: <reason>` before complete."));
    }
    if (!verification || !verificationResultIsComplete(verification)) {
      errors.push(sectionError("verification", "verification result must be filled before complete."));
    }
  }

  if (planning.strictness === "strict" && (gate === "start" || gate === "complete")) {
    if (!clarifications || !hasAllowedClarifications(clarifications)) {
      errors.push(sectionError("clarifications", "clarifications must be completed or explicitly state `No clarifications required` before start/complete."));
    }
    if (!checklist || checklistHasBlockingUncheckedItems(checklist)) {
      errors.push(sectionError("requirements-checklist", "requirements checklist cannot contain unchecked items unless marked `ACCEPTED EXCEPTION:` before start/complete."));
    }
    if (analysis && unresolvedHighOrCriticalFindings(analysis)) {
      errors.push(sectionError("analysis", "consistency analysis has unresolved HIGH or CRITICAL findings."));
    }
    if (gate === "complete" && (!analysis || !analysisHasFinalPass(analysis))) {
      errors.push(sectionError("analysis", "consistency analysis gate result must be `Pass` or document accepted exceptions before complete."));
    }
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}
