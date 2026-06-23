import { parseSections } from "../documents/sections.js";
import type { ChangeSliceRecord, CommitDescriptionResult, Frontmatter } from "../types.js";
import { parseSliceRecords } from "./slices.js";

export type BuildCommitDescriptionInput = {
  changeId: string;
  title: string;
  body: string;
  subjectTitle?: string;
  slices?: ChangeSliceRecord[];
  validation?: string[];
  files?: string[];
  notes?: string[];
  extraBody?: string;
};

export type FinalDescriptionValidation = {
  valid: boolean;
  errors: string[];
  summary: string;
};

const REQUIRED_FINAL_SECTIONS = ["Summary", "Slices", "Validation", "Files", "Notes / Follow-up"];

function nonEmptyLines(value: string | undefined): string[] {
  return (value ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripCheckbox(line: string): string {
  return line.replace(/^[-*]\s+\[[ xX]\]\s+/u, "").replace(/^[-*]\s+/u, "").trim();
}

function isPlaceholder(line: string): boolean {
  return [
    "Describe the change to make.",
    "Explain why this is needed and what problem it solves.",
    "Summarize changed areas, checks run or not run, and remaining risks or follow-ups.",
  ].includes(line.trim());
}

function bulletLines(lines: string[], fallback: string): string[] {
  const clean = lines.map((line) => stripCheckbox(line)).filter((line) => line && !isPlaceholder(line));
  return clean.length ? clean.map((line) => `- ${line}`) : [`- ${fallback}`];
}

function uniqueSorted(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter((value) => value && value !== ".changeyard-workspace.json" && value !== ".changeyard-hydrate.json"))].sort();
}

function summarizeSections(body: string): { summary: string[]; criteria: string[]; completionNotes: string[]; followUp: string[] } {
  const sections = parseSections(body);
  return {
    summary: nonEmptyLines(sections.get("Summary")),
    criteria: nonEmptyLines(sections.get("Acceptance Criteria")),
    completionNotes: nonEmptyLines(sections.get("Completion Notes")),
    followUp: nonEmptyLines(sections.get("Follow-up") ?? sections.get("Follow Up") ?? sections.get("Notes")),
  };
}

function section(title: string, lines: string[]): string {
  return [`${title}:`, ...lines].join("\n");
}

function sliceLines(slices: ChangeSliceRecord[]): string[] {
  if (slices.length === 0) return ["- No recorded slices."];
  return slices.map((slice) => {
    const commit = slice.commitId ? `${slice.id} (${slice.commitId})` : slice.id;
    const validation = slice.validation.length ? `; validation: ${slice.validation.join("; ")}` : "";
    return `- ${slice.title} [${slice.vcs} ${commit}; review: ${slice.manualReviewStatus}${validation}]`;
  });
}

export function buildCommitDescription(input: BuildCommitDescriptionInput): CommitDescriptionResult {
  const subjectTitle = (input.subjectTitle ?? input.title).trim() || input.changeId;
  const subject = subjectTitle.startsWith(`${input.changeId}: `) ? subjectTitle : `${input.changeId}: ${subjectTitle}`;
  const parsed = summarizeSections(input.body);
  const slices = input.slices ?? parseSliceRecords(input.body);
  const validation = input.validation?.length ? input.validation : slices.flatMap((slice) => slice.validation);
  const files = uniqueSorted(input.files);
  const notes = [
    ...parsed.completionNotes,
    ...parsed.followUp,
    ...(input.notes ?? []),
  ];
  const bodySections = [
    section("Summary", bulletLines(parsed.summary.length ? parsed.summary : parsed.criteria, "No summary recorded.")),
    section("Slices", sliceLines(slices)),
    section("Validation", bulletLines(validation ?? [], "No validation recorded.")),
    section("Files", bulletLines(files, "No changed files recorded.")),
    section("Notes / Follow-up", bulletLines(notes, "None.")),
  ];
  const extra = input.extraBody?.trim();
  if (extra) {
    bodySections.push(section("Additional Context", nonEmptyLines(extra).map((line) => `- ${line}`)));
  }
  const bodyText = bodySections.join("\n\n");
  const warnings: string[] = [];
  if (!input.validation?.length && validation.length === 0) warnings.push("No validation evidence was available for the commit description.");
  if (files.length === 0) warnings.push("No changed files were available for the commit description.");
  return {
    subject,
    body: bodyText,
    message: `${subject}\n\n${bodyText}\n`,
    sourceSections: bodySections.map((entry) => entry.split(":", 1)[0]),
    warnings,
  };
}

export function buildFinalCommitDescription(input: {
  changeId: string;
  frontmatter: Frontmatter;
  body: string;
  files: string[];
}): CommitDescriptionResult {
  const title = String(input.frontmatter.title ?? input.changeId);
  return buildCommitDescription({
    changeId: input.changeId,
    title,
    body: input.body,
    files: input.files,
  });
}

export function descriptionSummary(description: string): string {
  const lines = description.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const subject = lines[0] ?? "";
  const sections = REQUIRED_FINAL_SECTIONS.filter((sectionName) => description.includes(`${sectionName}:`));
  return [subject, sections.length ? `sections: ${sections.join(", ")}` : ""].filter(Boolean).join("; ");
}

export function validateFinalCommitDescription(changeId: string, description: string, body: string): FinalDescriptionValidation {
  const trimmed = description.trim();
  const errors: string[] = [];
  const firstLine = trimmed.split(/\r?\n/u)[0]?.trim() ?? "";
  if (!firstLine || firstLine === "(no description set)") {
    errors.push(`final landing description is empty; run cy describe final ${changeId}`);
  } else if (!firstLine.startsWith(`${changeId}:`)) {
    errors.push(`final landing description must start with "${changeId}:"; run cy describe final ${changeId}`);
  } else if (firstLine === `${changeId}: workspace`) {
    errors.push(`final landing description is still the workspace placeholder; run cy describe final ${changeId}`);
  }
  for (const sectionName of REQUIRED_FINAL_SECTIONS) {
    if (!new RegExp(`^${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`, "mu").test(trimmed)) {
      errors.push(`final landing description is missing ${sectionName}; run cy describe final ${changeId}`);
    }
  }
  const slices = parseSliceRecords(body);
  for (const slice of slices) {
    if (!trimmed.includes(slice.title)) {
      errors.push(`final landing description does not summarize slice "${slice.title}"; run cy describe final ${changeId}`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    summary: descriptionSummary(description),
  };
}
