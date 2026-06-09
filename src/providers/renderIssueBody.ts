import { checkProfile, isQuickChange, planningModel, workflowMetadata } from "../change/changeMetadata.js";
import { parseSections } from "../documents/sections.js";
import { getPlanningStatusSummary } from "../planning/status.js";
import { parseMarkedSections } from "../planning/sections.js";
import type { Frontmatter } from "../types.js";

type TaskCounts = {
  completed: number;
  incomplete: number;
  deferred: number;
};

function extractSubsection(section: string, heading: string): string {
  const lines = section.replace(/\r\n/g, "\n").split("\n");
  const normalizedHeading = `## ${heading}`.toLowerCase();
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().toLowerCase() === normalizedHeading) {
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

function summarizeTasks(section: string | undefined): TaskCounts {
  const counts: TaskCounts = { completed: 0, incomplete: 0, deferred: 0 };
  if (!section) return counts;

  for (const line of section.split(/\r?\n/)) {
    if (/^\s*- \[[xX]\]\s+/.test(line)) {
      counts.completed += 1;
      continue;
    }
    if (/^\s*- \[ \]\s+/.test(line)) {
      if (/DEFERRED:/i.test(line)) counts.deferred += 1;
      else counts.incomplete += 1;
    }
  }

  return counts;
}

function planningSections(body: string): Map<string, string> {
  try {
    return parseMarkedSections(body) as Map<string, string>;
  } catch {
    return new Map<string, string>();
  }
}

function renderQuickWorkflowSummary(input: {
  canonicalPath: string;
  frontmatter: Frontmatter;
  body: string;
}): string {
  const workflow = workflowMetadata(input.frontmatter);
  const lines = [
    input.body.trim(),
    "",
    "# Workflow Summary",
    "",
    `- Mode: ${workflow?.mode ?? "quick"}`,
    `- Planning: ${planningModel(input.frontmatter)}`,
    `- Risk: ${workflow?.risk ?? "low"}`,
    `- Checks profile: ${checkProfile(input.frontmatter)}`,
    `- Canonical local file: \`${input.canonicalPath}\``,
    "- The local markdown change remains the canonical source of truth.",
  ];
  return `${lines.join("\n").trim()}\n`;
}

export function renderProviderIssueBody(input: {
  canonicalPath: string;
  frontmatter: Frontmatter;
  body: string;
}): string {
  if (isQuickChange(input.frontmatter)) {
    return renderQuickWorkflowSummary(input);
  }

  const planning = getPlanningStatusSummary(input.frontmatter, input.body);
  if (!planning) return input.body;

  const sections = planningSections(input.body);
  const proposal = sections.get("proposal") ?? "_Missing._";
  const specDeltas = sections.get("spec-deltas") ?? "_Missing._";
  const tasks = sections.get("tasks") ?? "_Missing._";
  const lines = [
    input.body.trim(),
    "",
    "# Planning Summary",
    "",
    `- Model: ${planning.model}`,
    `- Strictness: ${planning.strictness}`,
    `- Phase: ${planning.phase}`,
    `- Canonical local file: \`${input.canonicalPath}\``,
    "- The local markdown change remains the canonical source of truth.",
  ];

  if (planning.nextAction) {
    lines.push(`- Next action: ${planning.nextAction}`);
  }

  lines.push(
    "",
    "## Proposal",
    "",
    proposal,
    "",
    "## Specification Deltas",
    "",
    specDeltas,
    "",
    "## Tasks",
    "",
    tasks,
  );

  return `${lines.join("\n").trim()}\n`;
}

export function renderPlanningContextForReview(input: {
  canonicalPath: string;
  frontmatter: Frontmatter;
  body: string;
}): string {
  if (isQuickChange(input.frontmatter)) {
    const workflow = workflowMetadata(input.frontmatter);
    return [
      "# Quick Change Context",
      "",
      `- Mode: ${workflow?.mode ?? "quick"}`,
      `- Planning: ${planningModel(input.frontmatter)}`,
      `- Risk: ${workflow?.risk ?? "low"}`,
      `- Checks profile: ${checkProfile(input.frontmatter)}`,
      `- Canonical local file: \`${input.canonicalPath}\``,
    ].join("\n") + "\n";
  }

  const planning = getPlanningStatusSummary(input.frontmatter, input.body);
  if (!planning) return "";

  const lines = [
    "# Planning Context",
    "",
    `- Model: ${planning.model}`,
    `- Strictness: ${planning.strictness}`,
    `- Phase: ${planning.phase}`,
    `- Canonical local file: \`${input.canonicalPath}\``,
  ];
  if (planning.nextAction) {
    lines.push(`- Next action: ${planning.nextAction}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderProviderReviewBody(input: {
  canonicalPath: string;
  frontmatter: Frontmatter;
  body: string;
  reviewBody: string;
}): string {
  if (isQuickChange(input.frontmatter)) {
    const workflow = workflowMetadata(input.frontmatter);
    const completionNotes = parseSections(input.body).get("Completion Notes") ?? "Not recorded.";
    const acceptanceCriteria = parseSections(input.body).get("Acceptance Criteria") ?? "Not recorded.";
    const lines = [
      input.reviewBody.trim(),
      "",
      "# Workflow Summary",
      "",
      `- Mode: ${workflow?.mode ?? "quick"}`,
      `- Planning: ${planningModel(input.frontmatter)}`,
      `- Risk: ${workflow?.risk ?? "low"}`,
      `- Checks profile: ${checkProfile(input.frontmatter)}`,
      `- Canonical local file: \`${input.canonicalPath}\``,
      "",
      "## Acceptance Criteria",
      "",
      acceptanceCriteria,
      "",
      "## Completion Notes",
      "",
      completionNotes,
    ];
    return `${lines.join("\n").trim()}\n`;
  }

  const planning = getPlanningStatusSummary(input.frontmatter, input.body);
  if (!planning) return input.reviewBody;

  const sections = planningSections(input.body);
  const taskCounts = summarizeTasks(sections.get("tasks"));
  const verificationResult = sections.get("verification")
    ? extractSubsection(sections.get("verification") ?? "", "Result") || "Not recorded."
    : "Not recorded.";
  const completionNotes = parseSections(input.body).get("Completion Notes") ?? "Not recorded.";
  const analysis = sections.get("analysis");

  const lines = [
    input.reviewBody.trim(),
    "",
    "# Planning Summary",
    "",
    `- Model: ${planning.model}`,
    `- Strictness: ${planning.strictness}`,
    `- Phase: ${planning.phase}`,
    `- Canonical local file: \`${input.canonicalPath}\``,
    `- Completed tasks: ${taskCounts.completed}`,
    `- Deferred tasks: ${taskCounts.deferred}`,
    `- Remaining tasks: ${taskCounts.incomplete}`,
    `- Verification result: ${verificationResult}`,
    "",
    "## Completion Notes",
    "",
    completionNotes,
  ];

  if (analysis) {
    lines.push("", "## Strict Analysis", "", analysis);
  }

  return `${lines.join("\n").trim()}\n`;
}
