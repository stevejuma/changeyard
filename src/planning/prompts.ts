import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDefaultPlanningSectionContent } from "./templates.js";
import type { PlanningSectionId } from "./types.js";

export type PlanningPromptInput = {
  changeId: string;
  title: string;
  canonicalPath: string;
  section: PlanningSectionId;
  currentContent: string;
  targetStartMarker: string;
  targetEndMarker: string;
  extraRules?: string[];
};

function promptTemplateSourceDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "templates", "prompts");
}

function readPromptTemplate(name: string): string {
  const filePath = path.join(promptTemplateSourceDir(), name);
  if (!existsSync(filePath)) {
    throw new Error(`Prompt template not found: ${filePath}`);
  }
  return readFileSync(filePath, "utf8").trim();
}

export function buildPlanningPrompt(input: PlanningPromptInput): string {
  const template = readPromptTemplate("section.md");
  const extraRules = (input.extraRules ?? []).map((rule) => `- ${rule}`).join("\n");

  return template
    .replaceAll("{{change_id}}", input.changeId)
    .replaceAll("{{title}}", input.title)
    .replaceAll("{{canonical_path}}", input.canonicalPath)
    .replaceAll("{{section}}", input.section)
    .replaceAll("{{target_start_marker}}", input.targetStartMarker)
    .replaceAll("{{target_end_marker}}", input.targetEndMarker)
    .replaceAll("{{extra_rules}}", extraRules)
    .replaceAll("{{current_content}}", input.currentContent.trim() ? input.currentContent : "_Empty section._")
    .replaceAll("{{expected_shape}}", getDefaultPlanningSectionContent(input.section));
}
