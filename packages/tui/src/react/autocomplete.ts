import type { AutocompleteMode, AutocompleteOption, SlashCommand } from "./types";
import type { WorkspaceFileSearchMatch } from "../runtime-client";

export function getAutocompleteMode(input: string): AutocompleteMode {
  if (input.startsWith("/")) return "/";
  return extractMentionQuery(input) ? "@" : null;
}

export function extractMentionQuery(input: string): string | null {
  const match = /(^|\s)@([^\s]*)$/.exec(input);
  return match ? match[2] ?? "" : null;
}

export function buildSlashOptions(commands: SlashCommand[], input: string): AutocompleteOption[] {
  const query = input.startsWith("/") ? input.slice(1).trim().toLowerCase() : "";
  return commands
    .filter((command) => !query || command.name.toLowerCase().includes(query) || command.description.toLowerCase().includes(query))
    .map((command) => ({
      value: `/${command.name}`,
      display: `/${command.name}`,
      description: command.description,
      command,
    }));
}

export function buildMentionOptions(files: WorkspaceFileSearchMatch[]): AutocompleteOption[] {
  return files.map((file) => ({
    value: formatMention(file.path),
    display: file.path,
    file,
  }));
}

export function formatMention(path: string): string {
  const normalized = path.startsWith("/") || path.startsWith("~/") || path.startsWith("./") || path.startsWith("../")
    ? path
    : `./${path}`;
  return /\s/.test(normalized) ? `@"${normalized.replace(/"/g, '\\"')}"` : `@${normalized}`;
}

export function insertMention(input: string, mention: string): string {
  const match = /(^|\s)@([^\s]*)$/.exec(input);
  if (!match || match.index < 0) return `${input}${mention} `;
  const start = match.index + (match[1]?.length ?? 0);
  return `${input.slice(0, start)}${mention} `;
}
