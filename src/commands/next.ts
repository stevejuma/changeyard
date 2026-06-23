import path from "node:path";
import { isQuickChange, planningModel, workflowMode } from "../change/changeMetadata.js";
import { parseSliceRecords } from "../change/slices.js";
import { readOverlayChangeDocument } from "../state/workspaceOverlay.js";
import type { Frontmatter } from "../types.js";
import { remoteCheckGate } from "./pr.js";
import { getStatus } from "./status.js";
import { getWorkspaceStatus, readWorkspaceMetadataFromRoot, type WorkspaceStatus } from "./workspace.js";

export type NextCommandKind =
  | "validate"
  | "sync"
  | "plan"
  | "start"
  | "verify"
  | "slice"
  | "complete"
  | "land"
  | "pr-checks"
  | "pr-fix"
  | "review"
  | "cleanup"
  | "done"
  | "blocked";

export type NextWorkflowMode = "planned" | "quick" | "lite-no-planning";

export type LandingConfirmation = {
  required: boolean;
  reason: string;
};

export type NextAction = {
  id: string;
  title: string;
  status: string;
  workflowMode: NextWorkflowMode;
  cwd: string;
  expectedCwd: string;
  nextKind: NextCommandKind;
  nextCommand: string;
  landingConfirmation: LandingConfirmation | null;
  blockers: string[];
  ready: {
    validate: boolean;
    start: boolean;
    verify: boolean;
    complete: boolean;
    land: boolean;
    review: boolean;
    cleanup: boolean;
  };
  workspace: WorkspaceStatus | null;
  planningNextAction: string | null;
};

const PLANNED_LANDING_CONFIRMATION =
  "Planned changes require explicit user confirmation before landing.";
const LEGACY_LANDING_CONFIRMATION =
  "Legacy unplanned changes require explicit user confirmation before landing.";
const QUICK_LANDING_CONFIRMATION =
  "Quick low-risk changes may land after checks when the user's task clearly implies completion and no hold or review was requested.";

function workspaceOrNull(id: string, repoRoot: string): WorkspaceStatus | null {
  try {
    return getWorkspaceStatus(id, repoRoot);
  } catch {
    return null;
  }
}

function relativeOrAbsolute(repoRoot: string, targetPath: string | null): string {
  if (!targetPath) return repoRoot;
  const relative = path.relative(repoRoot, targetPath);
  return relative && !relative.startsWith("..") ? relative : targetPath;
}

function classifyWorkflowMode(frontmatter: Frontmatter): NextWorkflowMode {
  if (isQuickChange(frontmatter)) return "quick";
  const model = planningModel(frontmatter);
  if (model !== "none" || workflowMode(frontmatter) === "planned") return "planned";
  return "lite-no-planning";
}

function landingConfirmationFor(mode: NextWorkflowMode): LandingConfirmation {
  if (mode === "quick") {
    return {
      required: false,
      reason: QUICK_LANDING_CONFIRMATION,
    };
  }
  if (mode === "planned") {
    return {
      required: true,
      reason: PLANNED_LANDING_CONFIRMATION,
    };
  }
  return {
    required: true,
    reason: LEGACY_LANDING_CONFIRMATION,
  };
}

export function getNextAction(id: string, repoRoot = process.cwd()): NextAction {
  if (!id) throw new Error("change id is required");
  const status = getStatus(id, repoRoot);
  const changeId = status.id;
  const parsed = readOverlayChangeDocument(status.path, readWorkspaceMetadataFromRoot(changeId, repoRoot));
  const nextWorkflowMode = classifyWorkflowMode(parsed.frontmatter);
  const workspace = workspaceOrNull(changeId, repoRoot);
  const effectiveStatus = workspace?.status ?? status.status;
  const blockers: string[] = [];
  const planningNextAction = status.planning?.nextAction ?? null;
  const ready = {
    validate: false,
    start: false,
    verify: false,
    complete: false,
    land: false,
    review: false,
    cleanup: false,
  };

  let nextKind: NextCommandKind = "blocked";
  let nextCommand = `cy status ${changeId}`;
  let expectedCwd = repoRoot;
  let landingConfirmation: LandingConfirmation | null = null;

  if (status.planning?.errors.length) {
    blockers.push(...status.planning.errors);
  }

  switch (effectiveStatus) {
    case "draft":
      nextKind = "validate";
      nextCommand = `cy validate ${changeId}`;
      ready.validate = true;
      break;
    case "ready":
      if (planningNextAction) {
        nextKind = "plan";
        nextCommand = `cy plan status ${changeId}`;
      } else {
        nextKind = "sync";
        nextCommand = `cy sync ${changeId}`;
        ready.validate = true;
      }
      break;
    case "synced":
      nextKind = "start";
      nextCommand = `cy start ${changeId}`;
      ready.start = true;
      break;
    case "in_progress":
      if (!workspace?.exists) {
        nextKind = "start";
        nextCommand = `cy start ${changeId}`;
        ready.start = true;
        if (workspace?.errors.length) blockers.push(...workspace.errors);
        break;
      }
      expectedCwd = workspace.path ?? repoRoot;
      if (planningNextAction) {
        nextKind = "plan";
        nextCommand = `cy plan status ${changeId}`;
        blockers.push(planningNextAction);
      } else if (workspace.errors.length > 0 || workspace.conflicts) {
        nextKind = "verify";
        nextCommand = `cd ${relativeOrAbsolute(repoRoot, workspace.path)} && cy verify ${changeId}`;
        ready.verify = true;
        blockers.push(...workspace.errors);
      } else if (workspace.dirty) {
        nextKind = "slice";
        nextCommand = `cd ${relativeOrAbsolute(repoRoot, workspace.path)} && cy slice commit ${changeId} -m "<slice title>"`;
        ready.verify = true;
        blockers.push("Workspace has uncommitted slice work; commit the current slice or explicitly keep working uncommitted.");
      } else {
        const slices = parseSliceRecords(parsed.body);
        if (slices.length > 0) {
          nextKind = "review";
          nextCommand = `cy review slices ${changeId}`;
          blockers.push("Review the committed slice summary, then wait for the next requested implementation slice or explicit completion wording.");
        } else {
          nextKind = "slice";
          nextCommand = `cd ${relativeOrAbsolute(repoRoot, workspace.path)} && cy slice commit ${changeId} -m "<slice title>"`;
          blockers.push("No slice commits are recorded yet; implement a requested slice before completing.");
        }
        ready.verify = true;
      }
      break;
    case "ready_for_pr":
      {
        const gate = remoteCheckGate(changeId, repoRoot, parsed.frontmatter);
        if (gate.supported && gate.blockers.length > 0) {
          const failedLoggable = gate.checks?.checks.some((check) => check.state === "failed" && check.logAvailable) ?? false;
          nextKind = failedLoggable ? "pr-fix" : "pr-checks";
          nextCommand = failedLoggable ? `cy pr fix ${changeId} --failed` : `cy pr checks ${changeId}`;
          blockers.push(...gate.blockers);
        } else {
          nextKind = "land";
          nextCommand = `cy land ${changeId}`;
          landingConfirmation = landingConfirmationFor(nextWorkflowMode);
          ready.land = true;
        }
      }
      if (workspace?.errors.length) blockers.push(...workspace.errors);
      break;
    case "pr_open":
    case "in_review":
    case "changes_requested":
    case "approved":
      {
        const gate = remoteCheckGate(changeId, repoRoot, parsed.frontmatter);
        if (gate.supported && gate.blockers.length > 0) {
          const failedLoggable = gate.checks?.checks.some((check) => check.state === "failed" && check.logAvailable) ?? false;
          nextKind = failedLoggable ? "pr-fix" : "pr-checks";
          nextCommand = failedLoggable ? `cy pr fix ${changeId} --failed` : `cy pr checks ${changeId}`;
          blockers.push(...gate.blockers);
        } else if (effectiveStatus === "approved") {
          nextKind = "land";
          nextCommand = `cy land ${changeId}`;
          ready.land = true;
        } else {
          nextKind = "review";
          nextCommand = `cy review start ${changeId}`;
          ready.review = true;
        }
      }
      break;
    case "merged":
      nextKind = workspace?.exists ? "cleanup" : "done";
      nextCommand = workspace?.exists ? `cy workspace delete ${changeId}` : `cy status ${changeId}`;
      ready.cleanup = workspace?.exists ?? false;
      break;
    case "blocked":
      blockers.push("Change is blocked; resolve the blocker and move it back to in_progress before continuing.");
      break;
    case "abandoned":
      nextKind = "done";
      nextCommand = `cy status ${changeId}`;
      break;
    default:
      blockers.push(`No workflow recommendation for status ${effectiveStatus}`);
      break;
  }

  return {
    id: status.id,
    title: status.title,
    status: effectiveStatus,
    workflowMode: nextWorkflowMode,
    cwd: repoRoot,
    expectedCwd,
    nextKind,
    nextCommand,
    landingConfirmation,
    blockers,
    ready,
    workspace,
    planningNextAction,
  };
}

export function runNext(id: string, repoRoot = process.cwd()): string {
  const action = getNextAction(id, repoRoot);
  const lines = [
    `id: ${action.id}`,
    `title: ${action.title}`,
    `status: ${action.status}`,
    `workflowMode: ${action.workflowMode}`,
    `expectedCwd: ${relativeOrAbsolute(repoRoot, action.expectedCwd)}`,
    `nextKind: ${action.nextKind}`,
    `Next: ${action.nextCommand}`,
  ];
  if (action.landingConfirmation) {
    lines.push(
      `landingConfirmationRequired: ${String(action.landingConfirmation.required)}`,
      `landingConfirmation: ${action.landingConfirmation.reason}`,
    );
  }
  if (action.planningNextAction) lines.push(`planningNextAction: ${action.planningNextAction}`);
  if (action.workspace) {
    lines.push(
      `workspacePath: ${action.workspace.path ? relativeOrAbsolute(repoRoot, action.workspace.path) : "missing"}`,
      `workspaceDirty: ${String(action.workspace.dirty)}`,
      `workspaceConflicts: ${String(action.workspace.conflicts)}`,
    );
  }
  if (action.blockers.length > 0) lines.push(`blockers: ${action.blockers.join("; ")}`);
  return lines.join("\n");
}
