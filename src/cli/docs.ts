import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../documents/frontmatter.js";
import type { CliColors } from "./color.js";
import { pushWrapped, stripAnsi, terminalWrapWidth } from "./text.js";

export type CliHelpEntry = {
  name: string;
  command: string;
  summary: string;
  usage: string[];
  aliases: string[];
  commands: Array<{ name: string; description: string }>;
  options: Array<{ flags: string; description: string; possibleValues: string[] }>;
  examples: string[];
  body: string;
};

const SECTION_RE = /^##\s+(.+?)\s*$/gm;

function cliDocsRoots(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.join(here, "docs", "cli"),
    path.resolve(here, "..", "docs", "cli"),
    path.resolve(process.cwd(), "docs", "cli"),
  ];
}

function resolveCliDocsRoot(): string {
  const root = cliDocsRoots().find((candidate) => existsSync(candidate));
  if (!root) throw new Error("CLI docs not found. Expected docs/cli to be present.");
  return root;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function section(body: string, name: string): string {
  const matches = [...body.matchAll(SECTION_RE)];
  const target = name.trim().toLowerCase();
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    if (match.index === undefined || match[1].trim().toLowerCase() !== target) continue;
    const next = matches[i + 1]?.index ?? body.length;
    return body.slice(match.index + match[0].length, next).trim();
  }
  return "";
}

function firstCodeBlock(value: string): string[] {
  const match = /```(?:\w+)?\n([\s\S]*?)```/m.exec(value);
  if (!match) return [];
  return match[1].split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
}

function bulletLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("- "));
}

function parseNamedBullets(value: string): Array<{ name: string; description: string }> {
  return bulletLines(value).map((line) => {
    const match = /^-\s+`?([^`:]+)`?:\s*(.+)$/.exec(line);
    return match ? { name: match[1].trim(), description: match[2].trim() } : { name: line.slice(2), description: "" };
  });
}

function parseOptions(value: string): CliHelpEntry["options"] {
  return bulletLines(value).map((line) => {
    const match = /^-\s+`([^`]+)`:\s*(.+)$/.exec(line);
    const flags = match?.[1].trim() ?? line.slice(2);
    const rawDescription = match?.[2].trim() ?? "";
    const possibleValuesMatch = /\[possible values:\s*([^\]]+)\]/i.exec(rawDescription);
    const possibleValues = possibleValuesMatch
      ? possibleValuesMatch[1].split(",").map((part) => part.trim()).filter(Boolean)
      : [];
    const description = rawDescription.replace(/\s*\[possible values:[^\]]+\]/i, "").trim();
    return { flags, description, possibleValues };
  });
}

export function readCliHelpEntry(commandPath: string[]): CliHelpEntry | null {
  const root = resolveCliDocsRoot();
  const requested = commandPath.length === 0 ? "root" : commandPath.join("-");
  const filePath = path.join(root, `${requested}.md`);
  if (!existsSync(filePath)) return null;
  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  const frontmatter = parsed.frontmatter;
  const body = parsed.body.trim();
  return {
    name: String(frontmatter.name ?? requested),
    command: String(frontmatter.command ?? (requested === "root" ? "cy" : `cy ${commandPath.join(" ")}`)),
    summary: String(frontmatter.summary ?? ""),
    usage: firstCodeBlock(section(body, "Usage")),
    aliases: asStringArray(frontmatter.aliases),
    commands: parseNamedBullets(section(body, "Commands")),
    options: parseOptions(section(body, "Options")),
    examples: firstCodeBlock(section(body, "Examples")),
    body,
  };
}

export function readCliTopic(topic: string): { name: string; body: string } | null {
  const root = resolveCliDocsRoot();
  const filePath = path.join(root, "topics", `${topic}.md`);
  if (!existsSync(filePath)) return null;
  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  return { name: String(parsed.frontmatter.name ?? topic), body: parsed.body.trim() };
}

export function listCliTopics(): string[] {
  const root = resolveCliDocsRoot();
  const topicsRoot = path.join(root, "topics");
  if (!existsSync(topicsRoot)) return [];
  return readdirSync(topicsRoot).filter((entry) => entry.endsWith(".md")).map((entry) => path.basename(entry, ".md")).sort();
}

function heading(colors: CliColors, value: string): string {
  return colors.bold(colors.yellow(value));
}

function commandName(colors: CliColors, value: string): string {
  return colors.bold(colors.green(value));
}

function optionName(colors: CliColors, value: string): string {
  return colors.green(value);
}

function renderRows(rows: Array<[string, string]>): string[] {
  const terminalWidth = terminalWrapWidth();
  const leftWidth = Math.max(0, ...rows.map(([left]) => stripAnsi(left).length));
  const rendered: string[] = [];
  for (const [left, right] of rows) {
    const prefix = `  ${left}${" ".repeat(Math.max(2, leftWidth - stripAnsi(left).length + 2))}`;
    pushWrapped(rendered, prefix, right, terminalWidth);
  }
  return rendered;
}

export function renderCliHelp(entry: CliHelpEntry, colors: CliColors): string {
  const width = terminalWrapWidth();
  const lines: string[] = [];
  pushWrapped(lines, "", entry.summary || "Changeyard command help", width);
  lines.push("");
  if (entry.usage.length > 0) {
    lines.push(heading(colors, "Usage:"));
    lines.push(...entry.usage.map((line) => `  ${line}`));
    lines.push("");
  }
  if (entry.commands.length > 0) {
    lines.push(heading(colors, "Commands:"));
    lines.push(...renderRows(entry.commands.map((command) => [commandName(colors, command.name), command.description])));
    lines.push("");
  }
  if (entry.options.length > 0) {
    lines.push(heading(colors, "Options:"));
    for (const option of entry.options) {
      lines.push(`  ${optionName(colors, option.flags)}`);
      if (option.description) pushWrapped(lines, "          ", option.description, width);
      if (option.possibleValues.length > 0) pushWrapped(lines, "          ", `[possible values: ${option.possibleValues.map((value) => colors.cyan(value)).join(", ")}]`, width);
      lines.push("");
    }
  }
  if (entry.aliases.length > 0) {
    lines.push(heading(colors, "Aliases:"));
    lines.push(...entry.aliases.map((alias) => `  ${alias}`), "");
  }
  if (entry.examples.length > 0) {
    lines.push(heading(colors, "Examples:"));
    lines.push(...entry.examples.map((example) => `  ${colors.dim("$")} ${example}`), "");
  }
  const topics = listCliTopics();
  if (topics.length > 0) pushWrapped(lines, "", `${colors.bold("cy help --help")} lists help options. Use ${colors.bold("cy help -k <topic>")} for: ${topics.join(", ")}.`, width);
  return lines.join("\n").replace(/\n+$/u, "");
}

export function renderCliTopic(topic: { name: string; body: string }, colors: CliColors): string {
  const width = terminalWrapWidth();
  const lines: string[] = [];
  let inFence = false;
  for (const line of topic.body.split(/\r?\n/)) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      lines.push(line);
    } else if (inFence || line.trim() === "") {
      lines.push(line);
    } else if (line.startsWith("# ")) {
      lines.push(heading(colors, line.slice(2)));
    } else if (line.startsWith("## ")) {
      lines.push(heading(colors, line.slice(3)));
    } else if (line.startsWith("- ")) {
      pushWrapped(lines, "- ", line.slice(2), width);
    } else {
      pushWrapped(lines, "", line, width);
    }
  }
  return lines.join("\n");
}
