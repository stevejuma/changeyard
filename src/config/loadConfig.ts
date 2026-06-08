import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ChangeyardConfig } from "../types.js";
import { defaultConfig } from "./defaults.js";
import { stripJsonComments } from "./jsonc.js";
import { validateConfig } from "./validateConfig.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, override: unknown): T {
  if (!isObject(base) || !isObject(override)) return (override ?? base) as T;

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isObject(current) && isObject(value) ? mergeDeep(current, value) : value;
  }
  return result as T;
}

function readJsonc(filePath: string): unknown {
  return JSON.parse(stripJsonComments(readFileSync(filePath, "utf8")));
}

export function findRepoRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(current, ".git")) || existsSync(path.join(current, ".jj")) || existsSync(path.join(current, ".changeyard"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startDir);
    current = parent;
  }
}

export function loadConfig(repoRoot = findRepoRoot()): ChangeyardConfig {
  const rootConfig = path.join(repoRoot, defaultConfig.storage.root, "config.jsonc");
  const localConfig = path.join(repoRoot, defaultConfig.storage.root, "config.local.jsonc");

  let config = defaultConfig;
  if (existsSync(rootConfig)) config = mergeDeep(config, readJsonc(rootConfig));
  if (existsSync(localConfig)) config = mergeDeep(config, readJsonc(localConfig));

  if (process.env.CHANGEYARD_STORAGE_ROOT) {
    config = mergeDeep(config, { storage: { root: process.env.CHANGEYARD_STORAGE_ROOT } });
  }
  if (process.env.CHANGEYARD_PROVIDER) {
    config = mergeDeep(config, { provider: { type: process.env.CHANGEYARD_PROVIDER } });
  }

  validateConfig(config);
  return config;
}
