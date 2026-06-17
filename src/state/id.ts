import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export type TaskIdMatch = {
  id: string;
  filePath?: string;
};

export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "change";
}

export function allocateId(changesRoot: string, prefix: string): string {
  let max = 0;
  if (existsSync(changesRoot)) {
    for (const file of readdirSync(changesRoot)) {
      const match = new RegExp(`^${prefix}-(\\d{4,})`).exec(file);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

function idFromFilename(file: string): string {
  const stem = file.replace(/\.md$/, "");
  const match = /^(.+?-\d{4,})(?:-|$)/.exec(stem);
  return match?.[1] ?? stem;
}

function idNumber(id: string): { prefix: string; value: number } | null {
  const match = /^(.+)-(\d+)$/.exec(id);
  if (!match) return null;
  return { prefix: match[1], value: Number(match[2]) };
}

export function taskIdMatches(id: string, input: string): boolean {
  if (id === input) return true;
  if (id.startsWith(input)) return true;

  const task = idNumber(id);
  if (!task) return false;
  if (/^\d+$/.test(input)) return task.value === Number(input);

  const inputTask = idNumber(input);
  return Boolean(inputTask && inputTask.prefix === task.prefix && inputTask.value === task.value);
}

function ambiguousTaskIdMessage(input: string, matches: TaskIdMatch[]): string {
  return [
    `Ambiguous task id "${input}" matched multiple tasks:`,
    ...matches.map((match) => `  - ${match.id}${match.filePath ? ` (${path.basename(match.filePath)})` : ""}`),
    "Use the full task id.",
  ].join("\n");
}

export function findChangeMatches(changesRoot: string, input: string): TaskIdMatch[] {
  if (!existsSync(changesRoot)) return [];
  return readdirSync(changesRoot)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const filePath = path.join(changesRoot, file);
      return { id: idFromFilename(file), filePath };
    })
    .filter((match) => taskIdMatches(match.id, input) || path.basename(match.filePath!).replace(/\.md$/, "").startsWith(`${input}-`))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function resolveChangeId(changesRoot: string, input: string): string | undefined {
  const matches = findChangeMatches(changesRoot, input);
  if (matches.length > 1) throw new Error(ambiguousTaskIdMessage(input, matches));
  return matches[0]?.id;
}

export function findChangeFile(changesRoot: string, id: string): string | undefined {
  const matches = findChangeMatches(changesRoot, id);
  if (matches.length > 1) throw new Error(ambiguousTaskIdMessage(id, matches));
  return matches[0]?.filePath;
}

export function findWorkspaceId(workspacesRoot: string, input: string): string | undefined {
  if (!existsSync(workspacesRoot)) return undefined;
  const matches = readdirSync(workspacesRoot)
    .filter((entry) => existsSync(path.join(workspacesRoot, entry, "metadata.json")))
    .map((entry) => ({ id: entry }))
    .filter((match) => taskIdMatches(match.id, input))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (matches.length > 1) throw new Error(ambiguousTaskIdMessage(input, matches));
  return matches[0]?.id;
}
