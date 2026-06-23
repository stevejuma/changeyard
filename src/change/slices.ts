import { parseSections, replaceSection } from "../documents/sections.js";

export type SliceReviewStatus = "pending" | "reviewed" | "changes_requested";

export type ChangeSliceRecord = {
  title: string;
  vcs: "jj" | "git";
  id: string;
  commitId: string | null;
  validation: string[];
  manualReviewStatus: SliceReviewStatus;
  notes: string;
  createdAt: string;
};

const SECTION_NAME = "Change Slices";
const EMPTY_SECTION = "No slices committed yet.";

function normalizeBody(body: string): string {
  return body.replace(/\r\n/g, "\n");
}

export function ensureChangeSlicesSection(body: string): string {
  const normalized = normalizeBody(body);
  if (parseSections(normalized).has(SECTION_NAME)) return normalized;
  return `${normalized.replace(/\s*$/u, "")}\n\n# ${SECTION_NAME}\n\n${EMPTY_SECTION}\n`;
}

function recordLine(label: string, value: string): string {
  return `  - ${label}: ${value}`;
}

export function formatSliceRecord(record: ChangeSliceRecord): string {
  return [
    `- ${record.title}`,
    recordLine("VCS", record.vcs),
    recordLine("Commit", record.commitId ? `${record.id} (${record.commitId})` : record.id),
    recordLine("Validation", record.validation.length ? record.validation.join("; ") : "not recorded"),
    recordLine("Manual review", record.manualReviewStatus),
    recordLine("Notes", record.notes || "None."),
    recordLine("Created", record.createdAt),
  ].join("\n");
}

export function appendSliceRecord(body: string, record: ChangeSliceRecord): string {
  const withSection = ensureChangeSlicesSection(body);
  const current = parseSections(withSection).get(SECTION_NAME)?.trim() ?? "";
  const nextSection = [
    ...(current && current !== EMPTY_SECTION ? [current] : []),
    formatSliceRecord(record),
  ].join("\n\n");
  return replaceSection(withSection, SECTION_NAME, nextSection);
}

export function replaceSliceRecords(body: string, records: ChangeSliceRecord[]): string {
  const withSection = ensureChangeSlicesSection(body);
  const nextSection = records.length ? records.map(formatSliceRecord).join("\n\n") : EMPTY_SECTION;
  return replaceSection(withSection, SECTION_NAME, nextSection);
}

function parseCommit(value: string): { id: string; commitId: string | null } {
  const match = /^(.*?)\s+\((.*?)\)$/.exec(value.trim());
  if (!match) return { id: value.trim(), commitId: null };
  return { id: match[1].trim(), commitId: match[2].trim() || null };
}

export function parseSliceRecords(body: string): ChangeSliceRecord[] {
  const section = parseSections(ensureChangeSlicesSection(body)).get(SECTION_NAME)?.trim() ?? "";
  if (!section || section === EMPTY_SECTION) return [];
  const records: ChangeSliceRecord[] = [];
  const chunks = section.split(/\n(?=-\s+)/u);
  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/u);
    const title = lines[0]?.replace(/^-\s+/, "").trim() ?? "";
    if (!title) continue;
    const fields = new Map<string, string>();
    for (const line of lines.slice(1)) {
      const match = /^\s*-\s+([^:]+):\s*(.*)$/.exec(line);
      if (match) fields.set(match[1].trim().toLowerCase(), match[2].trim());
    }
    const vcs = fields.get("vcs") === "git" ? "git" : "jj";
    const commit = parseCommit(fields.get("commit") ?? "");
    records.push({
      title,
      vcs,
      id: commit.id,
      commitId: commit.commitId,
      validation: (fields.get("validation") ?? "")
        .split(";")
        .map((entry) => entry.trim())
        .filter((entry) => entry && entry !== "not recorded"),
      manualReviewStatus: (fields.get("manual review") as SliceReviewStatus | undefined) ?? "pending",
      notes: fields.get("notes") ?? "",
      createdAt: fields.get("created") ?? "",
    });
  }
  return records;
}
