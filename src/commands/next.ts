import path from "node:path";
import { getStatus } from "./status.js";
import { getWorkspaceStatus, type WorkspaceStatus } from "./workspace.js";

export type NextCommandKind =
  | "validate"
  | "plan"
  | "start"
  | "verify"
  | "complete"
  | "land"
  | "review"
  | "cleanup"
  | "done"
  | "blocked";

export type NextAction = {
  id: string;
  title: string;
  status: string;
  cwd: string;
  expectedCwd: string;
  nextKind: NextCommandKind;
  nextCommand: string;
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

export function getNextAction(id: string, repoRoot = process.cwd()): NextAction {
  if (!id) throw new Error("change id is required");
  const status = getStatus(id, repoRoot);
  const changeId = status.id;
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
        nextKind = "validate";
        nextCommand = `cy validate ${changeId}`;
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
      } else {
        nextKind = "complete";
        nextCommand = `cd ${relativeOrAbsolute(repoRoot, workspace.path)} && cy complete ${changeId} --no-pr`;
        ready.verify = true;
        ready.complete = true;
      }
      break;
    case "ready_for_pr":
      nextKind = "land";
      nextCommand = `cy land ${changeId}`;
      ready.land = true;
      if (workspace?.errors.length) blockers.push(...workspace.errors);
      break;
    case "pr_open":
    case "in_review":
    case "changes_requested":
    case "approved":
      nextKind = "review";
      nextCommand = `cy review start ${changeId}`;
      ready.review = true;
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
    cwd: repoRoot,
    expectedCwd,
    nextKind,
    nextCommand,
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
    `expectedCwd: ${relativeOrAbsolute(repoRoot, action.expectedCwd)}`,
    `nextKind: ${action.nextKind}`,
    `Next: ${action.nextCommand}`,
  ];
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
