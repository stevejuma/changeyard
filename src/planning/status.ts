import type { Frontmatter } from "../types.js";
import { readPlanningMetadata } from "./model.js";
import { parseMarkedSections } from "./sections.js";
import { getDefaultPlanningSectionContent } from "./templates.js";
import {
  DEFAULT_PLANNING_SECTION_ORDER,
  type PlanningGateStatus,
  type PlanningModel,
  type PlanningPhase,
  type PlanningSectionId,
  type PlanningStrictness,
  STRICT_PLANNING_SECTION_ORDER,
} from "./types.js";

export type PlanningSectionStatusSummary = {
  enabled: boolean;
  phase: PlanningPhase;
  presentSections: PlanningSectionId[];
  missingSections: PlanningSectionId[];
};

export type PlanningGateSummary = {
  pass: number;
  pending: number;
  fail: number;
  skipped: number;
  warning: number;
};

export type PlanningStatusSummary = {
  model: PlanningModel;
  strictness: PlanningStrictness;
  phase: PlanningPhase;
  gates: Record<string, PlanningGateStatus>;
  gateSummary: PlanningGateSummary;
  presentSections: PlanningSectionId[];
  missingSections: PlanningSectionId[];
  nextAction: string | null;
  errors: string[];
};

export function summarizePlanningSections(frontmatter: Frontmatter, markdown: string): PlanningSectionStatusSummary {
  const metadata = readPlanningMetadata(frontmatter);
  if (!metadata || metadata.model === "none") {
    return {
      enabled: false,
      phase: "none",
      presentSections: [],
      missingSections: [],
    };
  }

  const sections = parseMarkedSections(markdown);
  const expected = metadata.strictness === "strict"
    ? [...DEFAULT_PLANNING_SECTION_ORDER, ...STRICT_PLANNING_SECTION_ORDER]
    : DEFAULT_PLANNING_SECTION_ORDER;
  const presentSections = expected.filter((id) => sections.has(id));
  const missingSections = expected.filter((id) => !sections.has(id));

  return {
    enabled: true,
    phase: metadata.phase,
    presentSections,
    missingSections,
  };
}

function createEmptyGateSummary(): PlanningGateSummary {
  return {
    pass: 0,
    pending: 0,
    fail: 0,
    skipped: 0,
    warning: 0,
  };
}

function summarizeGates(gates: Record<string, PlanningGateStatus>): PlanningGateSummary {
  const summary = createEmptyGateSummary();
  for (const status of Object.values(gates)) {
    summary[status] += 1;
  }
  return summary;
}

function normalizeContent(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function sectionIsPlaceholder(id: PlanningSectionId, content: string | undefined): boolean {
  if (content === undefined) return true;
  return normalizeContent(content) === normalizeContent(getDefaultPlanningSectionContent(id));
}

function extractSubsection(section: string, heading: string): string {
  const lines = section.replace(/\r\n/g, "\n").split("\n");
  const target = `## ${heading}`.toLowerCase();
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().toLowerCase() === target) {
      start = index + 1;
      break;
    }
  }
  if (start === -1) return "";
  const content: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    content.push(lines[index]);
  }
  return content.join("\n").trim();
}

function hasCheckboxTask(section: string | undefined): boolean {
  return Boolean(section && /^\s*-\s+\[[ xX]\]\s+\S/m.test(section));
}

function hasBlockingUncheckedItems(section: string | undefined, acceptedPattern: RegExp): boolean {
  if (!section) return false;
  return section.split(/\r?\n/).some((line) => /^\s*-\s+\[ \]\s+/.test(line) && !acceptedPattern.test(line));
}

function verificationResultIsComplete(section: string | undefined): boolean {
  if (!section || sectionIsPlaceholder("verification", section)) return false;
  const result = extractSubsection(section, "Result");
  return Boolean(result && !/^_?Not run yet\.?_?$/i.test(result) && !/List the commands or checks to run\./i.test(result));
}

function clarificationsAreComplete(section: string | undefined): boolean {
  if (!section || sectionIsPlaceholder("clarifications", section)) return false;
  return /no clarifications required/i.test(section) || /explicitly skipped/i.test(section) || !/Replace with clarification/i.test(section);
}

function analysisHasFinalPass(section: string | undefined): boolean {
  if (!section || sectionIsPlaceholder("analysis", section)) return false;
  const gateResult = extractSubsection(section, "Gate Result");
  return /\bpass\b/i.test(gateResult) || /\baccepted exception\b/i.test(gateResult);
}

function sectionGateStatus(id: PlanningSectionId, content: string | undefined): PlanningGateStatus {
  if (!content || sectionIsPlaceholder(id, content)) return "pending";
  if (id === "spec-deltas") return /no behavior change/i.test(content) || !sectionIsPlaceholder(id, content) ? "pass" : "pending";
  if (id === "tasks") return hasCheckboxTask(content) && !hasBlockingUncheckedItems(content, /DEFERRED:/i) ? "pass" : "pending";
  if (id === "verification") return verificationResultIsComplete(content) ? "pass" : "pending";
  if (id === "clarifications") return clarificationsAreComplete(content) ? "pass" : "pending";
  if (id === "requirements-checklist") return !hasBlockingUncheckedItems(content, /ACCEPTED EXCEPTION:/i) ? "pass" : "pending";
  if (id === "analysis") return analysisHasFinalPass(content) ? "pass" : "pending";
  return "pass";
}

const GATE_TO_SECTION: Record<string, PlanningSectionId> = {
  proposal: "proposal",
  specDeltas: "spec-deltas",
  design: "design",
  tasks: "tasks",
  verification: "verification",
  strictClarifications: "clarifications",
  strictChecklist: "requirements-checklist",
  strictAnalysis: "analysis",
};

const SECTION_TO_GATE: Record<PlanningSectionId, string> = {
  proposal: "proposal",
  "spec-deltas": "specDeltas",
  design: "design",
  tasks: "tasks",
  verification: "verification",
  clarifications: "strictClarifications",
  "requirements-checklist": "strictChecklist",
  analysis: "strictAnalysis",
};

function derivePlanningGates(input: {
  strictness: PlanningStrictness;
  metadataGates: Record<string, PlanningGateStatus>;
  sections: Map<PlanningSectionId, string>;
}): Record<string, PlanningGateStatus> {
  const expected = input.strictness === "strict"
    ? [...DEFAULT_PLANNING_SECTION_ORDER, ...STRICT_PLANNING_SECTION_ORDER]
    : DEFAULT_PLANNING_SECTION_ORDER;
  const gates: Record<string, PlanningGateStatus> = {};

  for (const sectionId of expected) {
    const gate = SECTION_TO_GATE[sectionId];
    const explicit = input.metadataGates[gate];
    gates[gate] = explicit === "fail" || explicit === "warning" ? explicit : sectionGateStatus(sectionId, input.sections.get(sectionId));
  }

  if (input.strictness !== "strict") {
    for (const sectionId of STRICT_PLANNING_SECTION_ORDER) {
      gates[SECTION_TO_GATE[sectionId]] = "skipped";
    }
  }

  for (const [gate, value] of Object.entries(input.metadataGates)) {
    if (gates[gate] !== undefined) continue;
    const sectionId = GATE_TO_SECTION[gate];
    gates[gate] = sectionId ? sectionGateStatus(sectionId, input.sections.get(sectionId)) : value;
  }

  return gates;
}

function nextActionForSummary(input: {
  errors: string[];
  missingSections: PlanningSectionId[];
  gates: Record<string, PlanningGateStatus>;
}): string | null {
  if (input.errors.length > 0) {
    return "Fix planning markers and section structure.";
  }
  if (input.missingSections.length > 0) {
    return `Add missing planning sections: ${input.missingSections.join(", ")}`;
  }

  const failingGate = Object.entries(input.gates).find(([, status]) => status === "fail");
  if (failingGate) {
    return `Resolve failing planning gate: ${failingGate[0]}`;
  }

  const pendingGate = Object.entries(input.gates).find(([, status]) => status === "pending");
  if (pendingGate) {
    return `Complete pending planning gate: ${pendingGate[0]}`;
  }

  const warningGate = Object.entries(input.gates).find(([, status]) => status === "warning");
  if (warningGate) {
    return `Review planning warning gate: ${warningGate[0]}`;
  }

  return null;
}

export function getPlanningStatusSummary(frontmatter: Frontmatter, markdown: string): PlanningStatusSummary | null {
  const metadata = readPlanningMetadata(frontmatter);
  if (!metadata || metadata.model === "none") {
    return null;
  }

  try {
    const sections = parseMarkedSections(markdown);
    const sectionSummary = summarizePlanningSections(frontmatter, markdown);
    const gates = derivePlanningGates({
      strictness: metadata.strictness,
      metadataGates: metadata.gates,
      sections,
    });
    return {
      model: metadata.model,
      strictness: metadata.strictness,
      phase: metadata.phase,
      gates,
      gateSummary: summarizeGates(gates),
      presentSections: sectionSummary.presentSections,
      missingSections: sectionSummary.missingSections,
      nextAction: nextActionForSummary({
        errors: [],
        missingSections: sectionSummary.missingSections,
        gates,
      }),
      errors: [],
    };
  } catch (error) {
    const errors = error instanceof Error
      ? error.message.split("\n").map((entry) => entry.trim()).filter(Boolean)
      : [String(error)];
    return {
      model: metadata.model,
      strictness: metadata.strictness,
      phase: metadata.phase,
      gates: { ...metadata.gates },
      gateSummary: summarizeGates(metadata.gates),
      presentSections: [],
      missingSections: [],
      nextAction: nextActionForSummary({
        errors,
        missingSections: [],
        gates: metadata.gates,
      }),
      errors,
    };
  }
}
