import { readFileSync } from "node:fs";
import path from "node:path";
import type { TemplateDefinition } from "../types.js";
import { parseFrontmatter } from "./frontmatter.js";

export type LoadedTemplate = {
  path: string;
  definition: TemplateDefinition;
  body: string;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function loadTemplate(storageRoot: string, templateName: string): LoadedTemplate {
  const templatePath = path.join(storageRoot, "templates", `${templateName}.md`);
  const parsed = parseFrontmatter(readFileSync(templatePath, "utf8"));
  const validation = typeof parsed.frontmatter.validation === "object" && parsed.frontmatter.validation !== null && !Array.isArray(parsed.frontmatter.validation)
    ? parsed.frontmatter.validation
    : {};

  return {
    path: templatePath,
    definition: {
      name: String(parsed.frontmatter.name ?? templateName),
      type: String(parsed.frontmatter.type ?? templateName),
      requiredFrontmatter: asStringArray(parsed.frontmatter.requiredFrontmatter),
      requiredSections: asStringArray(parsed.frontmatter.requiredSections),
      validation: {
        requireUncheckedAcceptanceCriteria: validation.requireUncheckedAcceptanceCriteria === true,
        requireNonEmptySections: validation.requireNonEmptySections === true,
      },
    },
    body: parsed.body,
  };
}
