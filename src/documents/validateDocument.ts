import { defaultConfig } from "../config/defaults.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CHANGE_STATUSES, type Frontmatter, type TemplateDefinition } from "../types.js";
import { validatePlanningForGate, type ValidationGate } from "../planning/validation.js";
import { parseFrontmatter } from "./frontmatter.js";
import { hasCheckboxTask, hasUncheckedCheckboxTask, parseSections } from "./sections.js";
import { loadTemplate } from "./template.js";
import { validateQuickChange } from "./validateQuick.js";
import type { ChangeyardConfig } from "../types.js";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings?: string[];
};

function valueMissing(frontmatter: Frontmatter, key: string): boolean {
  const value = frontmatter[key];
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function validateParsedChange(
  frontmatter: Frontmatter,
  body: string,
  template?: TemplateDefinition,
  options: { gate?: ValidationGate; config?: ChangeyardConfig } = {},
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const required = new Set(["id", "title", "type", "status", ...(template?.requiredFrontmatter ?? [])]);

  for (const key of required) {
    if (valueMissing(frontmatter, key)) errors.push(`Missing required frontmatter: ${key}`);
  }

  if (typeof frontmatter.status === "string" && !CHANGE_STATUSES.includes(frontmatter.status as never)) {
    errors.push(`Unknown status value: ${frontmatter.status}`);
  }

  const sections = parseSections(body);
  for (const section of template?.requiredSections ?? []) {
    const content = sections.get(section);
    if (content === undefined) {
      errors.push(`Missing required section: ${section}`);
      continue;
    }
    if (template?.validation.requireNonEmptySections && content.trim() === "") {
      errors.push(`Required section is empty: ${section}`);
    }
    if ((section === "Plan" || section === "Acceptance Criteria") && content.trim() !== "" && !hasCheckboxTask(content)) {
      errors.push(`Required checkbox section has no tasks: ${section}`);
    }
  }

  const acceptanceCriteria = sections.get("Acceptance Criteria") ?? "";
  if (template?.validation.requireUncheckedAcceptanceCriteria && options.gate !== "complete" && !hasUncheckedCheckboxTask(acceptanceCriteria)) {
    errors.push("Acceptance Criteria must include at least one unchecked task");
  }

  const planningValidation = validatePlanningForGate(frontmatter, body, options.gate ?? "document");
  errors.push(...planningValidation.errors);
  warnings.push(...planningValidation.warnings);

  const quickValidation = validateQuickChange(frontmatter, body, {
    gate: options.gate ?? "document",
    config: options.config ?? defaultConfig,
  });
  errors.push(...quickValidation.errors);
  warnings.push(...quickValidation.warnings);

  return { valid: errors.length === 0, errors, warnings };
}

export function validateChangeFile(
  filePath: string,
  storageRoot: string,
  options: { gate?: ValidationGate; config?: ChangeyardConfig } = {},
): ValidationResult {
  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  let template: TemplateDefinition | undefined;
  const type = typeof parsed.frontmatter.type === "string" ? parsed.frontmatter.type : undefined;
  if (type) {
    const templatePath = path.join(storageRoot, "templates", `${type}.md`);
    if (existsSync(templatePath)) template = loadTemplate(storageRoot, type).definition;
  }
  return validateParsedChange(parsed.frontmatter, parsed.body, template, options);
}
