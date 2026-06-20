import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfig } from "../config/defaults.js";
import { stripJsonComments } from "../config/jsonc.js";
import { configSchema } from "../config/schema.js";
import type { ChangeyardConfig } from "../types.js";
import { parseAgentToolsValue, type AgentToolId } from "./agent-tools.js";
import { resolveSelectedAgentTools, shouldInstallAgentTool } from "./available-tools.js";
import { generateCommandsForTool } from "./command-generation/generator.js";
import { getCommandAdapter } from "./command-generation/registry.js";
import { buildScaffoldVcsConfig, detectScaffoldVcsEngine } from "./detect-vcs.js";
import { generateHooksForTool } from "./hook-generation.js";
import {
  CANONICAL_SKILL_RELATIVE_PATH,
  generateChangeyardSkillContent,
  resolveSkillPath,
} from "./skill-generation.js";

const TEMPLATE_NAMES = ["agent-task", "feature", "bug", "refactor", "review", "quick"] as const;
const PACKAGE_VERSION = "0.1.0";
const MANAGED_EXCLUDE_START = "# BEGIN Changeyard generated artifacts";
const MANAGED_EXCLUDE_END = "# END Changeyard generated artifacts";
const WORKTREE_EXCLUDE_LABEL = ".git/info/exclude (Changeyard generated artifact ignore rules)";
const WORKTREE_EXCLUDE_TRACKING_LABEL = ".git/info/exclude (removed Changeyard generated artifact ignore rules)";

export type ScaffoldMode = "init" | "update";

export type ScaffoldOptions = {
  mode: ScaffoldMode;
  dryRun?: boolean;
  tools?: string;
};

export type ScaffoldResult = {
  message: string;
  installed: string[];
  skipped: string[];
};

function templateSourceDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");
}

function writeJsonc(filePath: string, config: ChangeyardConfig): void {
  const content = `${JSON.stringify({ $schema: "./schema.json", ...config }, null, 2)}\n`;
  writeFileSync(filePath, content);
}

function readJsonc(filePath: string): unknown {
  return JSON.parse(stripJsonComments(readFileSync(filePath, "utf8")));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(base: T, override: unknown): T {
  if (!isObject(base) || !isObject(override)) {
    return (override ?? base) as T;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isObject(current) && isObject(value) ? mergeDeep(current, value) : value;
  }
  return result as T;
}

function buildInitialConfig(repoRoot: string): ChangeyardConfig {
  return {
    ...defaultConfig,
    vcs: buildScaffoldVcsConfig(repoRoot),
  };
}

function readStoredConfig(configPath: string): ChangeyardConfig {
  if (!existsSync(configPath)) {
    return defaultConfig;
  }
  return mergeDeep(defaultConfig, readJsonc(configPath));
}

function applyDetectedVcsToConfig(config: ChangeyardConfig, repoRoot: string): ChangeyardConfig {
  return {
    ...config,
    vcs: buildScaffoldVcsConfig(repoRoot),
  };
}

function relativePath(repoRoot: string, targetPath: string): string {
  return path.relative(repoRoot, targetPath) || targetPath;
}

function writeScaffoldFile(
  repoRoot: string,
  targetPath: string,
  content: string,
  mode: ScaffoldMode,
  dryRun: boolean,
  result: ScaffoldResult,
  displayPath?: string,
): boolean {
  const label = displayPath ?? relativePath(repoRoot, targetPath);
  if (existsSync(targetPath) && mode === "init") {
    result.skipped.push(label);
    return false;
  }
  if (dryRun) {
    result.installed.push(label);
    return true;
  }
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content);
  result.installed.push(label);
  return true;
}

function writeScaffoldFileWithMode(
  repoRoot: string,
  targetPath: string,
  content: string,
  mode: ScaffoldMode,
  dryRun: boolean,
  result: ScaffoldResult,
  executable: boolean,
  displayPath?: string,
): void {
  const installed = writeScaffoldFile(repoRoot, targetPath, content, mode, dryRun, result, displayPath);
  if (installed && !dryRun && executable) {
    chmodSync(targetPath, 0o755);
  }
}

function generatedScaffoldExcludePatterns(): string[] {
  return [
    ".changeyard/",
    ".agents/skills/changeyard/",
    ".cursor/skills/changeyard/",
    ".cursor/commands/cy-*.md",
    ".cursor/hooks.json",
    ".cursor/hooks/kanban-*",
    ".claude/skills/changeyard/",
    ".claude/commands/cy/",
    ".cline/skills/changeyard/",
    ".clinerules/workflows/cy-*.md",
    ".codex/skills/changeyard/",
    ".github/skills/changeyard/",
    ".github/prompts/cy-*.prompt.md",
    ".github/hooks/kanban.json",
    ".opencode/skills/changeyard/",
    ".opencode/commands/cy-*.md",
    ".gemini/skills/changeyard/",
    ".gemini/commands/cy/",
    ".kiro/skills/changeyard/",
    ".kiro/prompts/cy-*.prompt.md",
    ".factory/skills/changeyard/",
    ".factory/commands/cy-*.md",
  ];
}

function legacyGeneratedExcludePatterns(): Set<string> {
  return new Set([
    ".github/hooks/kanban.json",
    ".cursor/hooks/kanban-*",
    ".cursor/hooks/kanban-stop",
    ".cursor/hooks/kanban-before-submit-prompt",
    ".cursor/hooks/kanban-pre-tool-use",
    ".cursor/hooks/kanban-post-tool-use",
    ".cursor/hooks/kanban-subagent-stop",
  ]);
}

function resolveWorktreeVcsExcludePath(repoRoot: string): string | null {
  try {
    const result = spawnSync("git", ["rev-parse", "--git-path", "info/exclude"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      return null;
    }
    const rawPath = result.stdout.trim();
    if (!rawPath) {
      return null;
    }
    return path.isAbsolute(rawPath) ? rawPath : path.join(repoRoot, rawPath);
  } catch {
    return null;
  }
}

function stripManagedExcludeBlock(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const next: string[] = [];
  let insideBlock = false;
  for (const line of lines) {
    if (line.trim() === MANAGED_EXCLUDE_START) {
      insideBlock = true;
      continue;
    }
    if (line.trim() === MANAGED_EXCLUDE_END) {
      insideBlock = false;
      continue;
    }
    if (!insideBlock) {
      next.push(line);
    }
  }
  return next.join("\n").replace(/\n*$/u, "\n");
}

function appendManagedExcludeBlock(content: string, patterns: string[]): string {
  const base = stripManagedExcludeBlock(content).replace(/\n*$/u, "\n");
  const block = [
    MANAGED_EXCLUDE_START,
    "# Local-only ignore rules for files written by cy init and cy update.",
    ...patterns,
    MANAGED_EXCLUDE_END,
    "",
  ].join("\n");
  return `${base}${base.trim().length > 0 ? "\n" : ""}${block}`;
}

function removeLegacyGeneratedExcludeLines(content: string): string {
  const legacyPatterns = legacyGeneratedExcludePatterns();
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !legacyPatterns.has(line.trim()))
    .join("\n")
    .replace(/\n*$/u, "\n");
}

function updateWorktreeGeneratedArtifactExcludes(
  repoRoot: string,
  trackGeneratedFiles: boolean,
  dryRun: boolean,
  result: ScaffoldResult,
): void {
  const excludePath = resolveWorktreeVcsExcludePath(repoRoot);
  if (!excludePath) {
    return;
  }
  const current = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
  const withoutManagedBlock = stripManagedExcludeBlock(current);
  const next = trackGeneratedFiles
    ? removeLegacyGeneratedExcludeLines(withoutManagedBlock)
    : appendManagedExcludeBlock(withoutManagedBlock, generatedScaffoldExcludePatterns());

  if (next === current) {
    return;
  }
  result.installed.push(trackGeneratedFiles ? WORKTREE_EXCLUDE_TRACKING_LABEL : WORKTREE_EXCLUDE_LABEL);
  if (dryRun) {
    return;
  }
  mkdirSync(path.dirname(excludePath), { recursive: true });
  writeFileSync(excludePath, next);
}

function generatedFilesAreTracked(config: ChangeyardConfig): boolean {
  return config.scaffold?.trackGeneratedFiles === true;
}

function scaffoldChangeyardStorage(
  repoRoot: string,
  mode: ScaffoldMode,
  dryRun: boolean,
  result: ScaffoldResult,
): ChangeyardConfig {
  const root = path.join(repoRoot, defaultConfig.storage.root);
  const configPath = path.join(root, "config.jsonc");
  let config = existsSync(configPath) ? readStoredConfig(configPath) : buildInitialConfig(repoRoot);

  if (mode === "update") {
    config = applyDetectedVcsToConfig(config, repoRoot);
  }

  const templatesDir = path.join(root, "templates");

  if (!dryRun) {
    mkdirSync(path.join(root, "changes"), { recursive: true });
    mkdirSync(path.join(root, "reviews"), { recursive: true });
    mkdirSync(templatesDir, { recursive: true });
  }

  const detectedEngine = detectScaffoldVcsEngine(repoRoot);
  const configLabel = `${relativePath(repoRoot, configPath)} (vcs.engine=${detectedEngine})`;

  if (mode === "init" && existsSync(configPath)) {
    result.skipped.push(relativePath(repoRoot, configPath));
  } else if (dryRun) {
    result.installed.push(configLabel);
  } else {
    writeJsonc(configPath, config);
    result.installed.push(configLabel);
  }

  const schemaPath = path.join(root, "schema.json");
  if (mode === "update" || !existsSync(schemaPath)) {
    const schemaContent = `${JSON.stringify(configSchema, null, 2)}\n`;
    writeScaffoldFile(repoRoot, schemaPath, schemaContent, mode === "update" ? "update" : "init", dryRun, result);
  }

  for (const name of TEMPLATE_NAMES) {
    const target = path.join(templatesDir, `${name}.md`);
    if (mode === "update") {
      const source = path.join(templateSourceDir(), `${name}.md`);
      if (dryRun) {
        result.installed.push(relativePath(repoRoot, target));
      } else {
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(source, target);
        result.installed.push(relativePath(repoRoot, target));
      }
      continue;
    }
    if (existsSync(target)) {
      result.skipped.push(relativePath(repoRoot, target));
      continue;
    }
    if (dryRun) {
      result.installed.push(relativePath(repoRoot, target));
      continue;
    }
    copyFileSync(path.join(templateSourceDir(), `${name}.md`), target);
    result.installed.push(relativePath(repoRoot, target));
  }
  return config;
}

function installCanonicalSkill(
  repoRoot: string,
  mode: ScaffoldMode,
  dryRun: boolean,
  result: ScaffoldResult,
): void {
  const skillPath = path.join(repoRoot, CANONICAL_SKILL_RELATIVE_PATH);
  writeScaffoldFile(repoRoot, skillPath, generateChangeyardSkillContent(PACKAGE_VERSION), mode, dryRun, result);
}

function installAgentArtifacts(
  repoRoot: string,
  mode: ScaffoldMode,
  dryRun: boolean,
  tools: AgentToolId[] | "all" | "none" | "detect",
  result: ScaffoldResult,
): void {
  if (tools === "none") {
    return;
  }

  const explicitSelection = tools !== "detect";
  const selectedTools = resolveSelectedAgentTools(repoRoot, tools);
  const skillContent = generateChangeyardSkillContent(PACKAGE_VERSION);

  for (const tool of selectedTools) {
    if (!shouldInstallAgentTool(repoRoot, tool, explicitSelection)) {
      continue;
    }

    const adapter = getCommandAdapter(tool.value);
    const skillRelative = resolveSkillPath(tool.skillsDir);
    const skillPath = path.join(repoRoot, skillRelative);
    writeScaffoldFile(repoRoot, skillPath, skillContent, mode, dryRun, result);

    if (!adapter || !tool.hasCommandAdapter) {
      continue;
    }

    for (const command of generateCommandsForTool(adapter)) {
      const commandPath = command.global ? command.path : path.join(repoRoot, command.path);
      writeScaffoldFile(repoRoot, commandPath, command.fileContent, mode, dryRun, result, command.displayPath);
    }

    const generatedHooks = generateHooksForTool(tool.value);
    for (const hook of generatedHooks) {
      writeScaffoldFileWithMode(
        repoRoot,
        path.join(repoRoot, hook.path),
        hook.fileContent,
        mode,
        dryRun,
        result,
        hook.executable === true,
      );
    }
  }
}

function formatScaffoldMessage(repoRoot: string, mode: ScaffoldMode, result: ScaffoldResult, tools: string | undefined): string {
  const storageRoot = path.join(repoRoot, defaultConfig.storage.root);
  const storageLabel = path.relative(repoRoot, storageRoot) || storageRoot;
  const lines = [
    mode === "init"
      ? `Initialized Changeyard in ${storageLabel}`
      : `Updated Changeyard scaffold in ${storageLabel}`,
  ];

  if (result.installed.length > 0) {
    lines.push("", "Installed:");
    for (const entry of result.installed) {
      lines.push(`  + ${entry}`);
    }
  }

  if (result.skipped.length > 0) {
    lines.push("", "Skipped existing:");
    for (const entry of result.skipped) {
      lines.push(`  - ${entry}`);
    }
  }

  if (tools === "none") {
    lines.push("", "Agent tool delivery skipped (--tools none).");
  }

  return lines.join("\n");
}

export function scaffoldChangeyard(repoRoot = process.cwd(), options: ScaffoldOptions = { mode: "init" }): ScaffoldResult {
  const mode = options.mode;
  const dryRun = options.dryRun === true;
  const parsedTools = parseAgentToolsValue(options.tools);
  const result: ScaffoldResult = {
    message: "",
    installed: [],
    skipped: [],
  };

  const config = scaffoldChangeyardStorage(repoRoot, mode, dryRun, result);
  installCanonicalSkill(repoRoot, mode, dryRun, result);
  installAgentArtifacts(repoRoot, mode, dryRun, parsedTools, result);
  updateWorktreeGeneratedArtifactExcludes(repoRoot, generatedFilesAreTracked(config), dryRun, result);
  result.message = formatScaffoldMessage(repoRoot, mode, result, options.tools);
  if (dryRun) {
    const prefix = mode === "init" ? "Dry-run: would initialize" : "Dry-run: would update";
    result.message = result.message.replace(mode === "init" ? /^Initialized/ : /^Updated/, prefix);
  }
  return result;
}
