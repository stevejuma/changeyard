import { readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { changesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import { readWorkspaceMetadata, resolveWorkspaceChangePath } from "../workspace/marker.js";
import type { WorkspaceMetadata } from "../types.js";

function withVerifyRecovery(message: string, id: string): string {
  return [
    message,
    "",
    "Recovery:",
    `- Run cy workspace status ${id} from the repository root to inspect the expected workspace path.`,
    `- If the workspace checkout exists but its marker is missing, run cy recover ${id}.`,
    `- Re-run cy verify ${id} from inside the workspace checkout before editing or completing work.`,
  ].join("\n");
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
  return [
    `Verified ${changeId} in ${path.relative(metadata.repoRoot, cwd) || "."}`,
    `Next: implement, update Completion Notes, then cy complete ${changeId} --no-pr`,
  ].join("\n");
}
