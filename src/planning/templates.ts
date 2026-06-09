import type { PlanningSectionId, PlanningStrictness } from "./types.js";

const SECTION_CONTENT: Record<PlanningSectionId, string> = {
  "proposal": [
    "# Proposal",
    "",
    "## Intent",
    "",
    "Describe the change intent.",
    "",
    "## Scope",
    "",
    "### In Scope",
    "",
    "- [ ] Replace with scoped work items",
    "",
    "### Out of Scope",
    "",
    "- [ ] Replace with explicit exclusions",
    "",
    "## Approach",
    "",
    "Describe the proposed approach.",
  ].join("\n"),
  "spec-deltas": [
    "# Specification Deltas",
    "",
    "## ADDED Requirements",
    "",
    "Document new behavior, or state `No behavior change`.",
    "",
    "## MODIFIED Requirements",
    "",
    "Document modified behavior, or leave `None.`",
    "",
    "## REMOVED Requirements",
    "",
    "Document removed behavior, or leave `None.`",
  ].join("\n"),
  "design": [
    "# Design",
    "",
    "## Technical Approach",
    "",
    "Describe the implementation shape.",
    "",
    "## Architecture Decisions",
    "",
    "Record important decisions and tradeoffs.",
    "",
    "## Data / State Impact",
    "",
    "Describe any state or schema impact.",
    "",
    "## Workspace / Provider Impact",
    "",
    "Document workspace, provider, or tooling impact.",
    "",
    "## Risks",
    "",
    "List key risks and mitigations.",
  ].join("\n"),
  "tasks": [
    "# Tasks",
    "",
    "## 1. Planning",
    "",
    "- [ ] Confirm behavior and constraints",
    "",
    "## 2. Implementation",
    "",
    "- [ ] Implement the smallest vertical slice",
    "",
    "## 3. Verification",
    "",
    "- [ ] Run checks and record results",
  ].join("\n"),
  "verification": [
    "# Verification",
    "",
    "## Expected Checks",
    "",
    "List the commands or checks to run.",
    "",
    "## Manual Scenarios",
    "",
    "Describe manual validation scenarios.",
    "",
    "## Result",
    "",
    "_Not run yet._",
  ].join("\n"),
  "clarifications": [
    "# Clarifications",
    "",
    "## Session YYYY-MM-DD",
    "",
    "- Q: Replace with clarification question",
    "  A: Replace with clarification answer",
  ].join("\n"),
  "requirements-checklist": [
    "# Requirements Checklist",
    "",
    "- [ ] Requirements are testable.",
    "- [ ] Success criteria are measurable.",
    "- [ ] Edge cases are documented.",
    "- [ ] Scope boundaries are explicit.",
    "- [ ] Implementation details are not mixed into behavior requirements.",
  ].join("\n"),
  "analysis": [
    "# Consistency Analysis",
    "",
    "## Findings",
    "",
    "| ID | Severity | Summary | Recommendation | Status |",
    "|----|----------|---------|----------------|--------|",
    "",
    "## Gate Result",
    "",
    "Pending.",
  ].join("\n"),
};

const NORMAL_SECTION_ORDER: PlanningSectionId[] = [
  "proposal",
  "spec-deltas",
  "design",
  "tasks",
  "verification",
];

const STRICT_SECTION_ORDER: PlanningSectionId[] = [
  "clarifications",
  "requirements-checklist",
  "analysis",
];

function markerFor(id: PlanningSectionId, kind: "start" | "end"): string {
  return `<!-- cy:${id}:${kind} -->`;
}

export function getDefaultPlanningSectionContent(id: PlanningSectionId): string {
  return SECTION_CONTENT[id];
}

export function buildPlanningSectionsBlock(strictness: PlanningStrictness): string {
  const orderedSections = strictness === "strict"
    ? [...NORMAL_SECTION_ORDER, ...STRICT_SECTION_ORDER]
    : NORMAL_SECTION_ORDER;

  const lines: string[] = [];
  for (const id of orderedSections) {
    if (lines.length > 0) lines.push("");
    lines.push(markerFor(id, "start"));
    lines.push(SECTION_CONTENT[id]);
    lines.push(markerFor(id, "end"));
  }

  return `${lines.join("\n")}\n`;
}
