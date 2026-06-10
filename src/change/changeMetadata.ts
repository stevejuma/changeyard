import type {
  ChangeChecksMetadata,
  ChangePlanningMetadata,
  ChangeWorkflowMetadata,
  Frontmatter,
  FrontmatterValue,
} from "../types.js";

function asRecord(value: FrontmatterValue | undefined): Record<string, FrontmatterValue> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, FrontmatterValue> : null;
}

function asString(value: FrontmatterValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: FrontmatterValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function planningMetadata(frontmatter: Frontmatter): ChangePlanningMetadata | null {
  const planning = asRecord(frontmatter.planning);
  if (!planning) return null;

  const gates = asRecord(planning.gates) ?? undefined;
  return {
    model: asString(planning.model) ?? "none",
    storage: asString(planning.storage),
    schema: asString(planning.schema),
    strict: asBoolean(planning.strict),
    strictness: asString(planning.strictness),
    phase: asString(planning.phase),
    gates,
  };
}

export function workflowMetadata(frontmatter: Frontmatter): ChangeWorkflowMetadata | null {
  const workflow = asRecord(frontmatter.workflow);
  if (!workflow) return null;

  return {
    mode: asString(workflow.mode) ?? "",
    risk: asString(workflow.risk),
    requiresWorkspace: asBoolean(workflow.requiresWorkspace),
    completionPath: asString(workflow.completionPath),
  };
}

export function checksMetadata(frontmatter: Frontmatter): ChangeChecksMetadata | null {
  const checks = asRecord(frontmatter.checks);
  if (!checks) return null;

  return {
    profile: asString(checks.profile),
    lastRun: asString(checks.lastRun) ?? (checks.lastRun === null ? null : undefined),
    lastStatus: asString(checks.lastStatus) ?? (checks.lastStatus === null ? null : undefined),
  };
}

export function planningModel(frontmatter: Frontmatter): string {
  return planningMetadata(frontmatter)?.model ?? "none";
}

export function workflowMode(frontmatter: Frontmatter): string {
  return workflowMetadata(frontmatter)?.mode ?? "";
}

export function checkProfile(frontmatter: Frontmatter): string {
  return checksMetadata(frontmatter)?.profile ?? "standard";
}

export function isQuickChange(frontmatter: Frontmatter): boolean {
  return planningModel(frontmatter) === "none" && workflowMode(frontmatter) === "quick";
}
