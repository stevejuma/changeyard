import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { mutateChangeFrontmatter } from "../board/changeMutations.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { changesRoot, storageRoot } from "../paths.js";
import { createDefaultPlanningMetadata, readPlanningMetadata } from "./model.js";
import { hasMarkedSection, parseMarkedSections, replaceMarkedSection } from "./sections.js";
import { getDefaultPlanningSectionContent } from "./templates.js";
import {
  DEFAULT_PLANNING_SECTION_ORDER,
  STRICT_PLANNING_SECTION_ORDER,
  type PlanningGateStatus,
  type PlanningSectionId,
} from "./types.js";
import { findChangeFile } from "../state/id.js";

export const PLANNING_ADAPTER_FORMATS = ["openspec", "speckit"] as const;
export type PlanningAdapterFormat = typeof PLANNING_ADAPTER_FORMATS[number];

const ADAPTER_CONTENT_MARKER = "<!-- changeyard-adapter-content:start -->";
const PLANNING_SECTION_ORDER: PlanningSectionId[] = [
  ...DEFAULT_PLANNING_SECTION_ORDER,
  ...STRICT_PLANNING_SECTION_ORDER,
];

const PLANNING_ADAPTERS: Record<PlanningAdapterFormat, {
  label: string;
  files: Record<PlanningSectionId, string>;
}> = {
  openspec: {
    label: "OpenSpec",
    files: {
      proposal: "proposal.md",
      "spec-deltas": "spec-deltas.md",
      design: "design.md",
      tasks: "tasks.md",
      verification: "verification.md",
      clarifications: "clarifications.md",
      "requirements-checklist": "requirements-checklist.md",
      analysis: "analysis.md",
    },
  },
  speckit: {
    label: "Spec Kit",
    files: {
      proposal: "spec.md",
      "spec-deltas": "requirements.md",
      design: "plan.md",
      tasks: "tasks.md",
      verification: "verification.md",
      clarifications: "clarifications.md",
      "requirements-checklist": "checklist.md",
      analysis: "analysis.md",
    },
  },
};

function nextStrictGateStatus(current: PlanningGateStatus | undefined, enabled: boolean): PlanningGateStatus {
  if (!enabled) return "skipped";
  if (current && current !== "skipped") return current;
  return "pending";
}

function resolveCanonicalChange(repoRoot: string, id: string): {
  id: string;
  filePath: string;
  canonicalPath: string;
  frontmatter: ReturnType<typeof parseFrontmatter>["frontmatter"];
  body: string;
} {
  const config = loadConfig(repoRoot);
  const filePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!filePath) throw new Error(`Change not found: ${id}`);
  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  const changeId = String(parsed.frontmatter.id ?? id);
  return {
    id: changeId,
    filePath,
    canonicalPath: path.relative(repoRoot, filePath),
    frontmatter: parsed.frontmatter,
    body: parsed.body,
  };
}

function requirePlannedChange(id: string, frontmatter: ReturnType<typeof parseFrontmatter>["frontmatter"]) {
  const planning = readPlanningMetadata(frontmatter);
  if (!planning || planning.model === "none") {
    throw new Error(`Planning is not enabled for ${id}`);
  }
  return planning;
}

function adapterBaseDir(repoRoot: string): string {
  const config = loadConfig(repoRoot);
  const relativeCacheDir = config.planning?.adapterCacheDir ?? "cache/planning";
  return path.join(storageRoot(repoRoot, config), relativeCacheDir);
}

function adapterDir(repoRoot: string, id: string, format: PlanningAdapterFormat): string {
  return path.join(adapterBaseDir(repoRoot), id, format);
}

function wrapAdapterContent(format: PlanningAdapterFormat, id: string, canonicalPath: string, content: string): string {
  const adapter = PLANNING_ADAPTERS[format];
  const normalized = content.replace(/\r\n/g, "\n").trim();
  return [
    `> Generated ${adapter.label} planning mirror for ${id}.`,
    `> Non-canonical. Edit \`${canonicalPath}\` or re-import intentionally.`,
    "",
    ADAPTER_CONTENT_MARKER,
    normalized,
    "",
  ].join("\n");
}

function unwrapAdapterContent(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n");
  const markerIndex = normalized.indexOf(ADAPTER_CONTENT_MARKER);
  if (markerIndex === -1) {
    return normalized.trim();
  }
  return normalized.slice(markerIndex + ADAPTER_CONTENT_MARKER.length).trim();
}

function appendMissingStrictSections(body: string): string {
  const missingStrictSections = STRICT_PLANNING_SECTION_ORDER.filter((sectionId) => !hasMarkedSection(body, sectionId));
  if (missingStrictSections.length === 0) {
    return body;
  }

  const lines: string[] = [];
  for (const sectionId of missingStrictSections) {
    if (lines.length > 0) lines.push("");
    lines.push(`<!-- cy:${sectionId}:start -->`);
    lines.push(getDefaultPlanningSectionContent(sectionId));
    lines.push(`<!-- cy:${sectionId}:end -->`);
  }

  return `${body.trimEnd()}\n\n${lines.join("\n")}\n`;
}

export function exportPlanningMirror(id: string, format: PlanningAdapterFormat, repoRoot = process.cwd(), options: { dryRun?: boolean } = {}) {
  const change = resolveCanonicalChange(repoRoot, id);
  const planning = requirePlannedChange(change.id, change.frontmatter);
  const directory = adapterDir(repoRoot, change.id, format);
  const sections = parseMarkedSections(change.body);
  const adapter = PLANNING_ADAPTERS[format];
  const exportedSections = PLANNING_SECTION_ORDER.filter((sectionId) => sections.has(sectionId));

  if (options.dryRun) {
    return {
      directory,
      exportedSections,
    };
  }

  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "README.md"),
    [
      `# ${adapter.label} Planning Mirror`,
      "",
      `Generated for ${change.id}.`,
      "",
      `Canonical source: \`${change.canonicalPath}\``,
      "",
      "These files are non-canonical mirrors. Update the canonical change markdown or re-import intentionally.",
      "",
    ].join("\n"),
  );

  writeFileSync(
    path.join(directory, "manifest.json"),
    JSON.stringify({
      sourceChange: change.id,
      canonicalPath: change.canonicalPath,
      format,
      strictness: planning.strictness,
      exportedAt: new Date().toISOString(),
      files: Object.fromEntries(exportedSections.map((sectionId) => [sectionId, adapter.files[sectionId]])),
    }, null, 2) + "\n",
  );

  for (const sectionId of exportedSections) {
    writeFileSync(
      path.join(directory, adapter.files[sectionId]),
      wrapAdapterContent(format, change.id, change.canonicalPath, sections.get(sectionId) ?? ""),
    );
  }

  return {
    directory,
    exportedSections,
  };
}

export function importPlanningMirror(id: string, format: PlanningAdapterFormat, repoRoot = process.cwd(), options: { dryRun?: boolean } = {}) {
  const change = resolveCanonicalChange(repoRoot, id);
  const planning = requirePlannedChange(change.id, change.frontmatter);
  const directory = adapterDir(repoRoot, change.id, format);
  const adapter = PLANNING_ADAPTERS[format];
  const importedSections = PLANNING_SECTION_ORDER.filter((sectionId) => existsSync(path.join(directory, adapter.files[sectionId])));

  if (importedSections.length === 0) {
    throw new Error(`No ${adapter.label} planning mirror files found for ${change.id} in ${path.relative(repoRoot, directory)}`);
  }

  const enablingStrict = importedSections.some((sectionId) => STRICT_PLANNING_SECTION_ORDER.includes(sectionId));
  if (options.dryRun) {
    return {
      directory,
      importedSections,
      strictness: enablingStrict ? "strict" : planning.strictness,
    };
  }

  mutateChangeFrontmatter(repoRoot, change.id, ({ frontmatter, body }) => {
    const currentPlanning = requirePlannedChange(change.id, frontmatter);
    let nextBody = enablingStrict ? appendMissingStrictSections(body) : body;

    for (const sectionId of importedSections) {
      const importedContent = unwrapAdapterContent(readFileSync(path.join(directory, adapter.files[sectionId]), "utf8"));
      nextBody = replaceMarkedSection(nextBody, sectionId, importedContent);
    }

    const nextStrictness = enablingStrict ? "strict" : currentPlanning.strictness;
    return {
      frontmatter: {
        ...frontmatter,
        planning: createDefaultPlanningMetadata({
          model: "openspec-lite",
          strictness: nextStrictness,
          phase: currentPlanning.phase === "none" ? "draft" : currentPlanning.phase,
          gates: {
            ...currentPlanning.gates,
            strictClarifications: nextStrictGateStatus(currentPlanning.gates.strictClarifications, nextStrictness === "strict"),
            strictChecklist: nextStrictGateStatus(currentPlanning.gates.strictChecklist, nextStrictness === "strict"),
            strictAnalysis: nextStrictGateStatus(currentPlanning.gates.strictAnalysis, nextStrictness === "strict"),
          },
        }),
      },
      body: nextBody,
    };
  });

  return {
    directory,
    importedSections,
    strictness: enablingStrict ? "strict" : planning.strictness,
  };
}
