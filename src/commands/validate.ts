import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { changesRoot, storageRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import type { ValidationGate } from "../planning/validation.js";
import { formatValidationFailure } from "./audit.js";

export type ValidateOptions = {
  gate?: ValidationGate;
};

export function runValidate(id: string, repoRoot = process.cwd(), options: ValidateOptions = {}): string {
  const config = loadConfig(repoRoot);
  const changes = changesRoot(repoRoot, config);
  const filePath = findChangeFile(changes, id) ?? path.resolve(repoRoot, id);
  const result = validateChangeFile(filePath, storageRoot(repoRoot, config), { config, gate: options.gate });
  if (!result.valid) throw new Error(formatValidationFailure({
    id,
    repoRoot,
    gate: options.gate ?? "document",
    result,
  }));
  const lines = [`Valid change: ${path.relative(repoRoot, filePath)}`];
  if (result.warnings?.length) {
    lines.push(...result.warnings.map((warning) => `Warning: ${warning}`));
  }
  return lines.join("\n");
}
