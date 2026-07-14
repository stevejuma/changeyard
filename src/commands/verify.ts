import { readFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { resolveActiveChangePaths } from "../state/activeChangeDocument.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import { validateJjLandingDescriptions } from "../workspace/jjLandingDescriptions.js";
import { readWorkspaceMetadata } from "../workspace/marker.js";
import { workspaceSetupWarnings } from "../workspace/setupGuidance.js";
import type { WorkspaceMetadata } from "../types.js";
import { getNextAction } from "./next.js";

function withVerifyRecovery(message: string, id: string, extraRecovery: string[] = []): string {
  return [
    message,
    "",
    "Recovery:",
    `- Run cy workspace status ${id} from the repository root to inspect the expected workspace path.`,
    `- If the workspace checkout exists but its marker is missing, run cy recover ${id}.`,
    ...extraRecovery,
    `- Re-run cy verify ${id} from inside the workspace checkout before editing or completing work.`,
  ].join("\n");
}

function validateJjWorkspaceDescriptions(metadata: WorkspaceMetadata, changeId: string): void {
  if (metadata.engine !== "jj") return;
  const validation = validateJjLandingDescriptions(changeId, metadata, metadata.workspaceChangeId ?? "@");
  if (validation.errors.length === 0) return;
  throw new Error(withVerifyRecovery([
    `JJ workspace commit descriptions must start with ${changeId}:`,
    ...validation.errors.map((entry) => `- ${entry}`),
  ].join("\n"), changeId, [
    `- Fix each invalid workspace commit with the jj describe command shown above.`,
  ]));
}

export function runVerify(id: string, cwd = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  let metadata: WorkspaceMetadata;
  try {
    metadata = readWorkspaceMetadata(id, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(withVerifyRecovery(message, id));
  }
  const changeId = metadata.changeId;
  const changePath = resolveActiveChangePaths(changeId, metadata.repoRoot).activePath;
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  const status = String(parsed.frontmatter.status ?? "unknown");
  if (!new Set(["in_progress", "ready_for_pr", "pr_open", "in_review", "changes_requested", "approved"]).has(status)) {
    throw new Error(withVerifyRecovery(`Change ${changeId} does not have a verifiable active workspace status: ${status}`, changeId));
  }

  const engine = createWorkspaceEngine(metadata.engine);
  const result = engine.verify({ cwd, metadata });
  if (!result.valid) throw new Error(withVerifyRecovery(result.errors.join("\n"), changeId));
  validateJjWorkspaceDescriptions(metadata, changeId);
  const setupWarnings = workspaceSetupWarnings(metadata.path);
  const next = getNextAction(changeId, metadata.repoRoot);
  return [
    `Verified ${changeId} in ${path.relative(metadata.repoRoot, cwd) || "."}`,
    ...(setupWarnings.length ? ["", ...setupWarnings] : []),
    `Next: ${next.nextCommand}`,
  ].join("\n");
}
