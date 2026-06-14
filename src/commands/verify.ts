import { readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { changesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import { readWorkspaceMetadata, resolveWorkspaceChangePath } from "../workspace/marker.js";

export function runVerify(id: string, cwd = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const metadata = readWorkspaceMetadata(id, cwd);
  const config = loadConfig(metadata.repoRoot);
  const changePath = metadata.engine === "jj" ? resolveWorkspaceChangePath(metadata) : findChangeFile(changesRoot(metadata.repoRoot, config), id) ?? metadata.changePath;
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  if (parsed.frontmatter.status !== "in_progress") {
    throw new Error(`Change ${id} is not in progress: ${String(parsed.frontmatter.status ?? "unknown")}`);
  }

  const engine = createWorkspaceEngine(metadata.engine);
  const result = engine.verify({ cwd, metadata });
  if (!result.valid) throw new Error(result.errors.join("\n"));
  return [
    `Verified ${id} in ${path.relative(metadata.repoRoot, cwd) || "."}`,
    `Next: implement, update Completion Notes, then cy complete ${id} --no-pr`,
  ].join("\n");
}
