import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { isQuickChange, planningModel, workflowMetadata, workflowMode } from "../change/changeMetadata.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { validateChangeFile, type ValidationResult } from "../documents/validateDocument.js";
import { storageRoot } from "../paths.js";
import { readPlanningMetadata } from "../planning/model.js";
import { resolveActiveChangePaths } from "../state/activeChangeDocument.js";
import type { Frontmatter } from "../types.js";
import type { ValidationGate } from "../planning/validation.js";
import { getNextAction } from "./next.js";
import { remoteCheckGate } from "./pr.js";
import { getStatus } from "./status.js";
import { getWorkspaceStatus, type WorkspaceStatus } from "./workspace.js";

export type AuditCheckStatus = "pass" | "fail" | "warning";

export type WorkflowAuditCheck = {
  name: string;
  gate?: ValidationGate;
  status: AuditCheckStatus;
  command: string;
  errors: string[];
  warnings: string[];
  recovery: string[];
};

export type WorkflowAuditReport = {
  id: string;
  title: string;
  type: string;
  status: string;
  workflow: {
    mode: "planned" | "quick" | "lite-no-planning";
    planningModel: string;
    strictness: string | null;
    risk: string | null;
  };
  canonicalPath: string;
  expectedCwd: string;
  nextCommand: string;
  blockers: string[];
  warnings: string[];
  checks: WorkflowAuditCheck[];
  recovery: string[];
  workspace: WorkspaceStatus | null;
};

const ALL_VALIDATION_GATES: Array<{ gate: ValidationGate; name: string }> = [
  { gate: "document", name: "Document Validation" },
  { gate: "sync", name: "Sync Gate" },
  { gate: "start", name: "Start Gate" },
  { gate: "complete", name: "Complete Gate" },
];

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function relativeOrAbsolute(repoRoot: string, targetPath: string): string {
  const relative = path.relative(realpathSync(repoRoot), realpathSync(targetPath));
  return relative && !relative.startsWith("..") ? relative : targetPath;
}

function classifyWorkflow(frontmatter: Frontmatter): WorkflowAuditReport["workflow"] {
  const planning = readPlanningMetadata(frontmatter);
  const workflow = workflowMetadata(frontmatter);
  const mode = isQuickChange(frontmatter) ? "quick" : planning?.model === "openspec-lite" ? "planned" : "lite-no-planning";
  return {
    mode,
    planningModel: planningModel(frontmatter),
    strictness: planning?.model === "openspec-lite" ? planning.strictness : null,
    risk: workflow?.risk ?? null,
  };
}

function selectedGates(status: string): Array<{ gate: ValidationGate; name: string }> {
  if (["ready", "draft"].includes(status)) return ALL_VALIDATION_GATES.filter((entry) => entry.gate !== "complete");
  if (status === "synced") return ALL_VALIDATION_GATES.filter((entry) => entry.gate === "start");
  if (["in_progress", "blocked"].includes(status)) return ALL_VALIDATION_GATES.filter((entry) => entry.gate === "complete");
  if (["ready_for_pr", "pr_open", "in_review", "changes_requested", "approved", "merged"].includes(status)) {
    return ALL_VALIDATION_GATES.filter((entry) => entry.gate === "complete");
  }
  return ALL_VALIDATION_GATES.filter((entry) => entry.gate === "document");
}

function sectionFromPlanningError(error: string): string | null {
  const match = /<!--\s*cy:([a-z0-9-]+):start\s*-->/.exec(error);
  return match?.[1] ?? null;
}

function recoveryForValidationError(error: string, input: {
  id: string;
  gate: ValidationGate;
  canonicalPath: string;
}): string[] {
  const section = sectionFromPlanningError(error);
  if (section) {
    return [
      `Run cy plan prompt ${input.id} ${section} to draft the required section.`,
      `Edit ${input.canonicalPath} between <!-- cy:${section}:start --> and <!-- cy:${section}:end -->.`,
      `Re-run cy validate ${input.id} --gate ${input.gate}.`,
    ];
  }
  if (/Acceptance Criteria/i.test(error)) {
    return [
      `Update # Acceptance Criteria in ${input.canonicalPath}; complete items or mark deferred work as Deferred: <reason>.`,
      `Re-run cy validate ${input.id} --gate ${input.gate}.`,
    ];
  }
  if (/Completion Notes/i.test(error)) {
    return [
      `Update # Completion Notes in ${input.canonicalPath} with changed areas, remaining risks, and evidence such as "Checks run: pnpm test.", "Tests passed: focused suite.", or an explicit no-check explanation.`,
      `Re-run cy validate ${input.id} --gate ${input.gate}.`,
    ];
  }
  if (/Quick scope risk review/i.test(error) || /quick changes/i.test(error)) {
    return [
      `Update # Scope in ${input.canonicalPath} so the lite risk checklist is accurate, or create a planned change if the work is not low-risk.`,
      `Re-run cy validate ${input.id} --gate ${input.gate}.`,
    ];
  }
  if (/Missing required section|Required section is empty|frontmatter/i.test(error)) {
    return [
      `Edit ${input.canonicalPath} to restore the required metadata or section content.`,
      `Re-run cy validate ${input.id} --gate ${input.gate}.`,
    ];
  }
  return [`Fix the reported issue in ${input.canonicalPath}, then re-run cy validate ${input.id} --gate ${input.gate}.`];
}

function checkFromValidation(input: {
  id: string;
  gate: ValidationGate;
  name: string;
  canonicalPath: string;
  result: ValidationResult;
}): WorkflowAuditCheck {
  const recovery = uniq(input.result.errors.flatMap((error) => recoveryForValidationError(error, input)));
  return {
    name: input.name,
    gate: input.gate,
    status: input.result.valid ? (input.result.warnings?.length ? "warning" : "pass") : "fail",
    command: input.gate === "document" ? `cy validate ${input.id}` : `cy validate ${input.id} --gate ${input.gate}`,
    errors: input.result.errors,
    warnings: input.result.warnings ?? [],
    recovery,
  };
}

export function buildValidationAuditChecks(input: {
  id: string;
  repoRoot: string;
  gates?: Array<{ gate: ValidationGate; name: string }>;
}): WorkflowAuditCheck[] {
  const config = loadConfig(input.repoRoot);
  const root = storageRoot(input.repoRoot, config);
  const paths = resolveActiveChangePaths(input.id, input.repoRoot);
  const parsed = parseFrontmatter(readFileSync(paths.activePath, "utf8"));
  const changeId = String(parsed.frontmatter.id ?? input.id);
  const canonicalPath = relativeOrAbsolute(input.repoRoot, paths.activePath);
  const gates = input.gates ?? ALL_VALIDATION_GATES;
  return gates.map(({ gate, name }) => checkFromValidation({
    id: changeId,
    gate,
    name,
    canonicalPath,
    result: validateChangeFile(paths.activePath, root, { gate, config }),
  }));
}

export function formatValidationFailure(input: {
  id: string;
  repoRoot: string;
  gate: ValidationGate;
  result: ValidationResult;
}): string {
  let canonicalPath = input.id;
  try {
    canonicalPath = relativeOrAbsolute(input.repoRoot, resolveActiveChangePaths(input.id, input.repoRoot).activePath);
  } catch {
    // Preserve the original validation failure when the path cannot be resolved again.
  }
  const check = checkFromValidation({
    id: input.id,
    gate: input.gate,
    name: input.gate === "document" ? "Document Validation" : `${input.gate[0].toUpperCase()}${input.gate.slice(1)} Gate`,
    canonicalPath,
    result: input.result,
  });
  return [
    ...input.result.errors,
    "",
    "Recovery:",
    ...check.recovery.map((item) => `- ${item}`),
  ].join("\n");
}

export function formatGateFailureMessage(checks: WorkflowAuditCheck[]): string {
  const failed = checks.filter((check) => check.status === "fail");
  if (failed.length === 0) return "";
  return failed.map((check) => [
    `${check.name}:`,
    ...check.errors.map((error) => `- ${error}`),
    "Recovery:",
    ...check.recovery.map((item) => `- ${item}`),
  ].join("\n")).join("\n\n");
}

function workspaceRecovery(id: string, repoRoot: string, workspace: WorkspaceStatus | null): string[] {
  if (!workspace) return [];
  const recovery: string[] = [];
  if (!workspace.exists || workspace.errors.some((error) => /metadata not found/i.test(error))) {
    recovery.push(`Run cy workspace status ${id} from ${repoRoot} to inspect saved workspace metadata.`);
    recovery.push(`If the checkout exists but its marker is missing, run cy recover ${id}.`);
  }
  if (workspace.path && workspace.status === "in_progress") {
    recovery.push(`Run cd ${relativeOrAbsolute(repoRoot, workspace.path)} && cy verify ${id} before editing or completing work.`);
  }
  if (workspace.conflicts) {
    recovery.push(`Resolve workspace conflicts in ${workspace.path ?? "the workspace"}, then re-run cy workspace status ${id}.`);
  }
  if (workspace.status === "ready_for_pr" && workspace.landBlockers.length > 0) {
    recovery.push(`Fix land blockers from cy workspace status ${id}, then run cy land ${id}.`);
  }
  return uniq(recovery);
}

function remotePrCheckAudit(id: string, repoRoot: string, frontmatter: Frontmatter, status: string): WorkflowAuditCheck | null {
  if (!["ready_for_pr", "pr_open", "in_review", "changes_requested", "approved"].includes(status)) return null;
  const gate = remoteCheckGate(id, repoRoot, frontmatter);
  if (gate.pullRequestNumber === null) return null;
  if (!gate.supported) {
    return {
      name: "Remote PR Checks",
      status: "warning",
      command: `cy pr checks ${id}`,
      errors: [],
      warnings: gate.recovery,
      recovery: [],
    };
  }
  return {
    name: "Remote PR Checks",
    status: gate.blockers.length > 0 ? "fail" : "pass",
    command: `cy pr checks ${id}`,
    errors: gate.blockers,
    warnings: [],
    recovery: gate.recovery,
  };
}

export function getWorkflowAuditReport(id: string, repoRoot = process.cwd()): WorkflowAuditReport {
  if (!id) throw new Error("change id is required");
  const paths = resolveActiveChangePaths(id, repoRoot);
  const parsed = parseFrontmatter(readFileSync(paths.activePath, "utf8"));
  const changeId = String(parsed.frontmatter.id ?? id);
  const status = getStatus(changeId, repoRoot);
  const next = getNextAction(changeId, repoRoot);
  let workspace: WorkspaceStatus | null = null;
  try {
    const inspected = getWorkspaceStatus(changeId, repoRoot);
    workspace = inspected.exists || ["in_progress", "ready_for_pr", "merged"].includes(status.status) ? inspected : null;
  } catch {
    workspace = null;
  }
  const checks = buildValidationAuditChecks({
    id: changeId,
    repoRoot,
    gates: selectedGates(status.status),
  });
  const remoteCheck = remotePrCheckAudit(changeId, repoRoot, parsed.frontmatter, status.status);
  if (remoteCheck) checks.push(remoteCheck);
  const blockers = [
    ...checks.filter((check) => check.status === "fail").flatMap((check) => check.errors),
    ...(workspace?.errors ?? []),
    ...(workspace?.conflicts ? [`Workspace ${changeId} has conflicts`] : []),
    ...next.blockers,
  ];
  const warnings = checks.flatMap((check) => check.warnings);
  const recovery = uniq([
    ...checks.flatMap((check) => check.recovery),
    ...workspaceRecovery(changeId, repoRoot, workspace),
    ...(blockers.length > 0 ? [`Run cy next ${changeId} after fixing blockers to confirm the next valid workflow command.`] : []),
  ]);

  return {
    id: changeId,
    title: status.title,
    type: status.type,
    status: status.status,
    workflow: classifyWorkflow(parsed.frontmatter),
    canonicalPath: relativeOrAbsolute(repoRoot, paths.activePath),
    expectedCwd: relativeOrAbsolute(repoRoot, next.expectedCwd),
    nextCommand: next.nextCommand,
    blockers: uniq(blockers),
    warnings: uniq(warnings),
    checks,
    recovery,
    workspace,
  };
}

export function formatWorkflowAuditReport(report: WorkflowAuditReport): string {
  const lines = [
    `Workflow audit: ${report.id}`,
    `title: ${report.title}`,
    `status: ${report.status}`,
    `workflow: ${report.workflow.mode}`,
    `planning: ${report.workflow.planningModel}${report.workflow.strictness ? ` ${report.workflow.strictness}` : ""}`,
    `canonicalPath: ${report.canonicalPath}`,
    `expectedCwd: ${report.expectedCwd}`,
    `Next: ${report.nextCommand}`,
    "",
    "Checks:",
  ];

  for (const check of report.checks) {
    lines.push(`- ${check.status.toUpperCase()} ${check.name} (${check.command})`);
    for (const error of check.errors) lines.push(`  - ${error}`);
    for (const warning of check.warnings) lines.push(`  - Warning: ${warning}`);
    for (const recovery of check.recovery) lines.push(`  - Recovery: ${recovery}`);
  }

  if (report.workspace) {
    lines.push(
      "",
      "Workspace:",
      `- path: ${report.workspace.path ?? "missing"}`,
      `- exists: ${String(report.workspace.exists)}`,
      `- dirty: ${String(report.workspace.dirty)}`,
      `- conflicts: ${String(report.workspace.conflicts)}`,
    );
    for (const error of report.workspace.errors) lines.push(`- error: ${error}`);
    if (report.workspace.nextCommand) lines.push(`- Next: ${report.workspace.nextCommand}`);
  }

  if (report.blockers.length > 0) {
    lines.push("", "Blockers:");
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  }
  if (report.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  if (report.recovery.length > 0) {
    lines.push("", "Recovery:");
    for (const item of report.recovery) lines.push(`- ${item}`);
  }
  return lines.join("\n");
}
