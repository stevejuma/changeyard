import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { changesRoot, storageRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";

export function runValidate(id: string, repoRoot = process.cwd()): string {
  const config = loadConfig(repoRoot);
  const changes = changesRoot(repoRoot, config);
  const filePath = findChangeFile(changes, id) ?? path.resolve(repoRoot, id);
  const result = validateChangeFile(filePath, storageRoot(repoRoot, config));
  if (!result.valid) throw new Error(result.errors.join("\n"));
  return `Valid change: ${path.relative(repoRoot, filePath)}`;
}
