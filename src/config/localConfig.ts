import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ChangeyardConfig } from "../types.js";
import { defaultConfig } from "./defaults.js";
import { stripJsonComments } from "./jsonc.js";
import { loadConfig } from "./loadConfig.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function updateLocalConfig(
  repoRoot: string,
  patch: Partial<Pick<ChangeyardConfig, "provider" | "vcs">>,
): ChangeyardConfig {
  const localPath = path.join(repoRoot, defaultConfig.storage.root, "config.local.jsonc");
  let local: Record<string, unknown> = {};
  if (existsSync(localPath)) {
    local = JSON.parse(stripJsonComments(readFileSync(localPath, "utf8"))) as Record<string, unknown>;
  }
  if (patch.provider) {
    local.provider = { ...(isObject(local.provider) ? local.provider : {}), ...patch.provider };
  }
  if (patch.vcs) {
    local.vcs = { ...(isObject(local.vcs) ? local.vcs : {}), ...patch.vcs };
  }
  mkdirSync(path.dirname(localPath), { recursive: true });
  writeFileSync(localPath, `${JSON.stringify(local, null, 2)}\n`);
  return loadConfig(repoRoot);
}

export function isChangeyardInitialized(repoRoot: string): boolean {
  return existsSync(path.join(repoRoot, defaultConfig.storage.root, "config.jsonc"));
}
