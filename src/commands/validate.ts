import { realpathSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { storageRoot } from "../paths.js";
import { resolveActiveChangePaths } from "../state/activeChangeDocument.js";
import type { ValidationGate } from "../planning/validation.js";
import { formatValidationFailure } from "./audit.js";

export type ValidateOptions = {
  gate?: ValidationGate;
};

export function runValidate(id: string, repoRoot = process.cwd(), options: ValidateOptions = {}): string {
  const config = loadConfig(repoRoot);
  const paths = resolveActiveChangePaths(id, repoRoot);
  const result = validateChangeFile(paths.activePath, storageRoot(repoRoot, config), { config, gate: options.gate });
  if (!result.valid) throw new Error(formatValidationFailure({
    id: paths.changeId,
    repoRoot,
    gate: options.gate ?? "document",
    result,
  }));
  const lines = [`Valid change: ${path.relative(realpathSync(repoRoot), paths.activePath) || paths.activePath}`];
  if (result.warnings?.length) {
    lines.push(...result.warnings.map((warning) => `Warning: ${warning}`));
  }
  return lines.join("\n");
}
