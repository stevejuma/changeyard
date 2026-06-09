import type { Frontmatter } from "../types.js";
import {
  DEFAULT_PLANNING_SCHEMA,
  type InlinePlanningMetadata,
  PLANNING_GATE_STATUSES,
  PLANNING_MODELS,
  PLANNING_PHASES,
  PLANNING_STRICTNESS_LEVELS,
  type PlanningGateStatus,
  type PlanningModel,
  type PlanningPhase,
  type PlanningStrictness,
} from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isPlanningModel(value: unknown): value is PlanningModel {
  return typeof value === "string" && (PLANNING_MODELS as readonly string[]).includes(value);
}

function isPlanningStrictness(value: unknown): value is PlanningStrictness {
  return typeof value === "string" && (PLANNING_STRICTNESS_LEVELS as readonly string[]).includes(value);
}

function isPlanningPhase(value: unknown): value is PlanningPhase {
  return typeof value === "string" && (PLANNING_PHASES as readonly string[]).includes(value);
}

function isPlanningGateStatus(value: unknown): value is PlanningGateStatus {
  return typeof value === "string" && (PLANNING_GATE_STATUSES as readonly string[]).includes(value);
}

function normalizePlanningGates(value: unknown): Record<string, PlanningGateStatus> {
  const record = asRecord(value);
  if (!record) return {};

  const gates: Record<string, PlanningGateStatus> = {};
  for (const [key, gateStatus] of Object.entries(record)) {
    if (isPlanningGateStatus(gateStatus)) {
      gates[key] = gateStatus;
    }
  }
  return gates;
}

export function readPlanningMetadata(frontmatter: Frontmatter): InlinePlanningMetadata | null {
  const planning = asRecord(frontmatter.planning);
  if (!planning) return null;

  const model: PlanningModel = isPlanningModel(planning.model) ? planning.model : "none";
  const strictness: PlanningStrictness = isPlanningStrictness(planning.strictness) ? planning.strictness : "normal";
  const phase: PlanningPhase = isPlanningPhase(planning.phase) ? planning.phase : "none";
  const storage = planning.storage === "inline" ? "inline" : "inline";
  const schema = planning.schema === DEFAULT_PLANNING_SCHEMA ? DEFAULT_PLANNING_SCHEMA : DEFAULT_PLANNING_SCHEMA;

  return {
    model,
    storage,
    schema,
    strictness,
    phase,
    gates: normalizePlanningGates(planning.gates),
  };
}

export function isPlanningEnabled(frontmatter: Frontmatter): boolean {
  const planning = readPlanningMetadata(frontmatter);
  return planning?.model === "openspec-lite";
}

export function createDefaultPlanningMetadata(input: {
  model?: PlanningModel;
  strictness?: PlanningStrictness;
  phase?: PlanningPhase;
  gates?: Record<string, PlanningGateStatus>;
} = {}): InlinePlanningMetadata {
  return {
    model: input.model ?? "openspec-lite",
    storage: "inline",
    schema: DEFAULT_PLANNING_SCHEMA,
    strictness: input.strictness ?? "normal",
    phase: input.phase ?? "draft",
    gates: { ...(input.gates ?? {}) },
  };
}
