export const PLANNING_MODELS = ["none", "openspec-lite"] as const;
export type PlanningModel = typeof PLANNING_MODELS[number];

export const PLANNING_STRICTNESS_LEVELS = ["normal", "strict"] as const;
export type PlanningStrictness = typeof PLANNING_STRICTNESS_LEVELS[number];

export const PLANNING_GATE_STATUSES = ["pending", "pass", "fail", "skipped", "warning"] as const;
export type PlanningGateStatus = typeof PLANNING_GATE_STATUSES[number];

export const PLANNING_PHASES = [
  "none",
  "draft",
  "proposal_ready",
  "spec_ready",
  "design_ready",
  "tasks_ready",
  "ready_to_start",
  "in_progress",
  "verified",
  "complete",
] as const;
export type PlanningPhase = typeof PLANNING_PHASES[number];

export const PLANNING_SECTION_IDS = [
  "proposal",
  "spec-deltas",
  "design",
  "tasks",
  "verification",
  "clarifications",
  "requirements-checklist",
  "analysis",
] as const;
export type PlanningSectionId = typeof PLANNING_SECTION_IDS[number];

export const DEFAULT_PLANNING_SCHEMA = "changeyard-openspec-lite@1" as const;
export type PlanningSchema = typeof DEFAULT_PLANNING_SCHEMA;

export type InlinePlanningMetadata = {
  model: PlanningModel;
  storage: "inline";
  schema: PlanningSchema;
  strictness: PlanningStrictness;
  phase: PlanningPhase;
  gates: Record<string, PlanningGateStatus>;
};

export type PlanningMarkerRange = {
  id: PlanningSectionId;
  startMarkerStart: number;
  startMarkerEnd: number;
  endMarkerStart: number;
  endMarkerEnd: number;
  contentStart: number;
  contentEnd: number;
};

export const DEFAULT_PLANNING_SECTION_ORDER: PlanningSectionId[] = [
  "proposal",
  "spec-deltas",
  "design",
  "tasks",
  "verification",
];

export const STRICT_PLANNING_SECTION_ORDER: PlanningSectionId[] = [
  "clarifications",
  "requirements-checklist",
  "analysis",
];
