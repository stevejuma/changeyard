import {
  type PlanningMarkerRange,
  PLANNING_SECTION_IDS,
  type PlanningSectionId,
} from "./types.js";

const PLANNING_SECTION_ID_SET = new Set<string>(PLANNING_SECTION_IDS);
const MARKER_PATTERN = /<!--\s*cy:([a-z-]+):(start|end)\s*-->/g;

type MarkerMatch = {
  id: PlanningSectionId;
  kind: "start" | "end";
  index: number;
  length: number;
};

function detectNewline(markdown: string): string {
  return markdown.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeSectionContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trim();
}

function toPlanningSectionId(value: string): PlanningSectionId | null {
  return PLANNING_SECTION_ID_SET.has(value) ? value as PlanningSectionId : null;
}

function parseMarkerMatches(markdown: string): { matches: MarkerMatch[]; errors: string[] } {
  const matches: MarkerMatch[] = [];
  const errors: string[] = [];

  MARKER_PATTERN.lastIndex = 0;
  for (let match = MARKER_PATTERN.exec(markdown); match; match = MARKER_PATTERN.exec(markdown)) {
    const rawId = match[1];
    const id = toPlanningSectionId(rawId);
    if (!id) {
      errors.push(`Unsupported planning section marker: ${rawId}`);
      continue;
    }

    matches.push({
      id,
      kind: match[2] as "start" | "end",
      index: match.index,
      length: match[0].length,
    });
  }

  return { matches, errors };
}

function collectPlanningMarkerRanges(markdown: string): Map<PlanningSectionId, PlanningMarkerRange> {
  const { matches, errors } = parseMarkerMatches(markdown);

  for (const id of PLANNING_SECTION_IDS) {
    const sectionMatches = matches.filter((match) => match.id === id);
    const starts = sectionMatches.filter((match) => match.kind === "start");
    const ends = sectionMatches.filter((match) => match.kind === "end");

    if (starts.length > 1) errors.push(`Duplicate start marker for planning section: ${id}`);
    if (ends.length > 1) errors.push(`Duplicate end marker for planning section: ${id}`);
    if (starts.length === 1 && ends.length === 0) errors.push(`Missing end marker for planning section: ${id}`);
    if (starts.length === 0 && ends.length === 1) errors.push(`Missing start marker for planning section: ${id}`);

    if (starts.length === 1 && ends.length === 1 && starts[0].index >= ends[0].index) {
      errors.push(`End marker appears before start marker for planning section: ${id}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const ranges = new Map<PlanningSectionId, PlanningMarkerRange>();
  for (const id of PLANNING_SECTION_IDS) {
    const sectionMatches = matches.filter((match) => match.id === id);
    const start = sectionMatches.find((match) => match.kind === "start");
    const end = sectionMatches.find((match) => match.kind === "end");
    if (!start || !end) continue;

    ranges.set(id, {
      id,
      startMarkerStart: start.index,
      startMarkerEnd: start.index + start.length,
      endMarkerStart: end.index,
      endMarkerEnd: end.index + end.length,
      contentStart: start.index + start.length,
      contentEnd: end.index,
    });
  }

  return ranges;
}

export function getMarkedSectionRanges(markdown: string): Map<PlanningSectionId, PlanningMarkerRange> {
  return collectPlanningMarkerRanges(markdown);
}

export function parseMarkedSections(markdown: string): Map<PlanningSectionId, string> {
  const ranges = collectPlanningMarkerRanges(markdown);
  const sections = new Map<PlanningSectionId, string>();

  for (const [id, range] of ranges.entries()) {
    sections.set(id, normalizeSectionContent(markdown.slice(range.contentStart, range.contentEnd)));
  }

  return sections;
}

export function hasMarkedSection(markdown: string, id: PlanningSectionId): boolean {
  return collectPlanningMarkerRanges(markdown).has(id);
}

export function replaceMarkedSection(markdown: string, id: PlanningSectionId, content: string): string {
  const ranges = collectPlanningMarkerRanges(markdown);
  const range = ranges.get(id);
  if (!range) throw new Error(`Planning section not found: ${id}`);

  const newline = detectNewline(markdown);
  const normalizedContent = normalizeSectionContent(content);
  const replacement = normalizedContent ? `${newline}${normalizedContent}${newline}` : `${newline}${newline}`;

  return `${markdown.slice(0, range.contentStart)}${replacement}${markdown.slice(range.contentEnd)}`;
}
