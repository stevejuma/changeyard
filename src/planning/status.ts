import type { Frontmatter } from "../types.js";
import { readPlanningMetadata } from "./model.js";
import { parseMarkedSections } from "./sections.js";
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
    const sectionSummary = summarizePlanningSections(frontmatter, markdown);
    return {
      model: metadata.model,
      strictness: metadata.strictness,
      phase: metadata.phase,
      gates: { ...metadata.gates },
      gateSummary: summarizeGates(metadata.gates),
      presentSections: sectionSummary.presentSections,
      missingSections: sectionSummary.missingSections,
      nextAction: nextActionForSummary({
        errors: [],
        missingSections: sectionSummary.missingSections,
        gates: metadata.gates,
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
