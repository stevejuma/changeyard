import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "../config/defaults.js";
import { configSchema } from "../config/schema.js";
import type { ChangeyardConfig } from "../types.js";

function templateSourceDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");
}

function writeJsonc(filePath: string, config: ChangeyardConfig): void {
  const content = `${JSON.stringify({ $schema: "./schema.json", ...config }, null, 2)}\n`;
  writeFileSync(filePath, content);
}

export function runInit(repoRoot = process.cwd()): string {
  const root = path.join(repoRoot, defaultConfig.storage.root);
  const templatesDir = path.join(root, "templates");
  mkdirSync(path.join(root, "changes"), { recursive: true });
  mkdirSync(path.join(root, "reviews"), { recursive: true });
  mkdirSync(templatesDir, { recursive: true });

  const configPath = path.join(root, "config.jsonc");
  if (!existsSync(configPath)) writeJsonc(configPath, defaultConfig);

  const schemaPath = path.join(root, "schema.json");
  if (!existsSync(schemaPath)) {
    writeFileSync(schemaPath, JSON.stringify(configSchema, null, 2) + "\n");
  }

  for (const name of ["agent-task", "feature", "bug", "refactor", "review"]) {
    const target = path.join(templatesDir, `${name}.md`);
    if (!existsSync(target)) copyFileSync(path.join(templateSourceDir(), `${name}.md`), target);
  }

  return `Initialized Changeyard in ${path.relative(repoRoot, root) || root}`;
}
