import { readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { changesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import { validateJjLandingDescriptions } from "../workspace/jjLandingDescriptions.js";
import { readWorkspaceMetadata, resolveWorkspaceChangePath } from "../workspace/marker.js";
import { workspaceSetupWarnings } from "../workspace/setupGuidance.js";
import type { WorkspaceMetadata } from "../types.js";

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
  const config = loadConfig(metadata.repoRoot);
  const changePath = metadata.engine === "jj" ? resolveWorkspaceChangePath(metadata) : findChangeFile(changesRoot(metadata.repoRoot, config), changeId) ?? metadata.changePath;
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  if (parsed.frontmatter.status !== "in_progress") {
    throw new Error(withVerifyRecovery(`Change ${changeId} is not in progress: ${String(parsed.frontmatter.status ?? "unknown")}`, changeId));
  }

  const engine = createWorkspaceEngine(metadata.engine);
  const result = engine.verify({ cwd, metadata });
  if (!result.valid) throw new Error(withVerifyRecovery(result.errors.join("\n"), changeId));
  validateJjWorkspaceDescriptions(metadata, changeId);
  const setupWarnings = workspaceSetupWarnings(metadata.path);
  return [
    `Verified ${changeId} in ${path.relative(metadata.repoRoot, cwd) || "."}`,
    ...(setupWarnings.length ? ["", ...setupWarnings] : []),
    `Next: implement, update Completion Notes, then cy complete ${changeId} --no-pr`,
  ].join("\n");
}
