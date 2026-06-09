import { existsSync } from "node:fs";
import path from "node:path";
import type { ChangeyardConfig } from "../types.js";

export type DetectedVcsEngine = ChangeyardConfig["vcs"]["engine"];

export function detectScaffoldVcsEngine(repoRoot: string): DetectedVcsEngine {
  if (existsSync(path.join(repoRoot, ".jj"))) {
    return "jj";
  }
  if (existsSync(path.join(repoRoot, ".git"))) {
    return "git-worktree";
  }
  return "plain-copy";
}

export function buildScaffoldVcsConfig(repoRoot: string): ChangeyardConfig["vcs"] {
  const engine = detectScaffoldVcsEngine(repoRoot);
  return {
    engine,
    fallback: engine,
  };
}
