import { readFileSync } from "node:fs";
import path from "node:path";
import { mutateChangeFrontmatter } from "../board/changeMutations.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { changesRoot } from "../paths.js";
import { createDefaultPlanningMetadata, readPlanningMetadata } from "../planning/model.js";
import { buildPlanningPrompt } from "../planning/prompts.js";
import { exportPlanningMirror, importPlanningMirror, type PlanningAdapterFormat } from "../planning/adapters.js";
import { hasMarkedSection, parseMarkedSections } from "../planning/sections.js";
import { getDefaultPlanningSectionContent } from "../planning/templates.js";
import { STRICT_PLANNING_SECTION_ORDER, type PlanningGateStatus, type PlanningSectionId } from "../planning/types.js";
import { findChangeFile } from "../state/id.js";
import type { Frontmatter } from "../types.js";
import { getStatus } from "./status.js";

type PlanMutationOptions = {
  dryRun?: boolean;
};

function requirePlannedChange(id: string, frontmatter: Frontmatter) {
  const planning = readPlanningMetadata(frontmatter);
  if (!planning || planning.model === "none") {
    throw new Error(`Planning is not enabled for ${id}`);
  }
  return planning;
}

function buildPlanningSectionBlock(sectionIds: PlanningSectionId[]): string {
  const lines: string[] = [];
  for (const sectionId of sectionIds) {
    if (lines.length > 0) lines.push("");
    lines.push(`<!-- cy:${sectionId}:start -->`);
    lines.push(getDefaultPlanningSectionContent(sectionId));
    lines.push(`<!-- cy:${sectionId}:end -->`);
  }
  return lines.join("\n");
}

function appendMissingStrictSections(body: string): string {
  const missingSections = STRICT_PLANNING_SECTION_ORDER.filter((sectionId) => !hasMarkedSection(body, sectionId));
  if (missingSections.length === 0) {
    return body;
  }
  return `${body.trimEnd()}\n\n${buildPlanningSectionBlock(missingSections)}\n`;
}

function nextStrictGateStatus(current: PlanningGateStatus | undefined, enabled: boolean): PlanningGateStatus {
  if (!enabled) {
    return "skipped";
  }
  if (current && current !== "skipped") {
    return current;
  }
  return "pending";
}

export function getPlanStatus(id: string, repoRoot = process.cwd()) {
  return getStatus(id, repoRoot);
}

export function getPlanPrompt(id: string, section: PlanningSectionId, repoRoot = process.cwd()): {
  section: PlanningSectionId;
  path: string;
  prompt: string;
} {
  const config = loadConfig(repoRoot);
  const filePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!filePath) throw new Error(`Change not found: ${id}`);

  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  const status = getStatus(id, repoRoot);
  if (!status.planning) throw new Error(`Planning is not enabled for ${id}`);

  const sections = parseMarkedSections(parsed.body);
  const currentContent = sections.get(section);
  if (currentContent === undefined) {
    throw new Error(`Planning section not found: ${section}`);
  }

  return {
    section,
    path: path.relative(repoRoot, filePath),
    prompt: buildPlanningPrompt({
      changeId: status.id,
      title: status.title,
      canonicalPath: path.relative(repoRoot, filePath),
      section,
      currentContent,
      targetStartMarker: `<!-- cy:${section}:start -->`,
      targetEndMarker: `<!-- cy:${section}:end -->`,
    }),
  };
}

export function runPlanStatus(id: string, repoRoot = process.cwd()): string {
  const status = getStatus(id, repoRoot);
  if (!status.planning) {
    return [
      `id: ${status.id}`,
      `title: ${status.title}`,
      "planning: none",
      "planningNextAction: Enable planning with cy create --planning openspec-lite or a future cy plan enable flow.",
    ].join("\n");
  }

  const lines = [
    `id: ${status.id}`,
    `title: ${status.title}`,
    `type: ${status.type}`,
    `status: ${status.status}`,
    `planning: ${status.planning.model} ${status.planning.strictness}`,
    `planningPhase: ${status.planning.phase}`,
    "planningGates:",
  ];

  for (const [gate, value] of Object.entries(status.planning.gates)) {
    lines.push(`  ${gate}: ${value}`);
  }

  lines.push(`planningGateSummary: pass=${status.planning.gateSummary.pass}, pending=${status.planning.gateSummary.pending}, fail=${status.planning.gateSummary.fail}, skipped=${status.planning.gateSummary.skipped}, warning=${status.planning.gateSummary.warning}`);

  if (status.planning.presentSections.length > 0) {
    lines.push(`presentPlanningSections: ${status.planning.presentSections.join(", ")}`);
  }
  if (status.planning.missingSections.length > 0) {
    lines.push(`missingPlanningSections: ${status.planning.missingSections.join(", ")}`);
  }
  if (status.planning.errors.length > 0) {
    lines.push(`planningErrors: ${status.planning.errors.join("; ")}`);
  }
  if (status.planning.nextAction) {
    lines.push(`planningNextAction: ${status.planning.nextAction}`);
  }
  lines.push(`path: ${status.path}`);

  return lines.join("\n");
}

export function runPlanPrompt(id: string, section: PlanningSectionId, repoRoot = process.cwd()): string {
  return getPlanPrompt(id, section, repoRoot).prompt;
}

function setPlanStrictness(id: string, enabled: boolean, repoRoot = process.cwd(), options: PlanMutationOptions = {}): string {
  const currentStatus = getStatus(id, repoRoot);
  if (!currentStatus.planning) {
    throw new Error(`Planning is not enabled for ${id}`);
  }

  const nextStrictness = enabled ? "strict" : "normal";
  if (currentStatus.planning.strictness === nextStrictness) {
    return `Strict planning already ${enabled ? "enabled" : "disabled"} for ${id}`;
  }

  if (options.dryRun) {
    return `Dry-run: would ${enabled ? "enable" : "disable"} strict planning for ${id}`;
  }

  mutateChangeFrontmatter(repoRoot, id, ({ frontmatter, body }) => {
    const planning = requirePlannedChange(id, frontmatter);
    return {
      frontmatter: {
        ...frontmatter,
        planning: createDefaultPlanningMetadata({
          model: "openspec-lite",
          strictness: nextStrictness,
          phase: planning.phase === "none" ? "draft" : planning.phase,
          gates: {
            ...planning.gates,
            strictClarifications: nextStrictGateStatus(planning.gates.strictClarifications, enabled),
            strictChecklist: nextStrictGateStatus(planning.gates.strictChecklist, enabled),
            strictAnalysis: nextStrictGateStatus(planning.gates.strictAnalysis, enabled),
          },
        }),
      },
      body: enabled ? appendMissingStrictSections(body) : body,
    };
  });

  return `${enabled ? "Enabled" : "Disabled"} strict planning for ${id}`;
}

export function runPlanStrictEnable(id: string, repoRoot = process.cwd(), options: PlanMutationOptions = {}): string {
  return setPlanStrictness(id, true, repoRoot, options);
}

export function runPlanStrictDisable(id: string, repoRoot = process.cwd(), options: PlanMutationOptions = {}): string {
  return setPlanStrictness(id, false, repoRoot, options);
}

export function runPlanExport(id: string, format: PlanningAdapterFormat, repoRoot = process.cwd(), options: PlanMutationOptions = {}): string {
  const result = exportPlanningMirror(id, format, repoRoot, options);
  const relativeDirectory = path.relative(repoRoot, result.directory);
  if (options.dryRun) {
    return `Dry-run: would export ${id} ${format} planning mirror to ${relativeDirectory}`;
  }
  return `Exported ${id} ${format} planning mirror to ${relativeDirectory}`;
}

export function runPlanImport(id: string, format: PlanningAdapterFormat, repoRoot = process.cwd(), options: PlanMutationOptions = {}): string {
  const result = importPlanningMirror(id, format, repoRoot, options);
  const relativeDirectory = path.relative(repoRoot, result.directory);
  if (options.dryRun) {
    return `Dry-run: would import ${id} ${format} planning mirror from ${relativeDirectory}`;
  }
  return `Imported ${id} ${format} planning mirror from ${relativeDirectory}`;
}
