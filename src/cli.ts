#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { getWorkflowAuditReport } from "./commands/audit.js";
import { runCompletions } from "./commands/completions.js";
import { runComplete } from "./commands/complete.js";
import { runCheckRecord } from "./commands/check.js";
import { doctorReport, runDoctor } from "./commands/doctor.js";
import {
  getPlanPrompt,
  getPlanStatus,
  runPlanExport,
  runPlanImport,
  runPlanPrompt,
  runPlanStatus,
  runPlanStrictDisable,
  runPlanStrictEnable,
} from "./commands/plan.js";
import { createChange, runCreate } from "./commands/create.js";
import { runHooks } from "./commands/hooks.js";
import { runHydrate } from "./commands/hydrate.js";
import { runInit } from "./commands/init.js";
import { runLand } from "./commands/land.js";
import { runUpdate } from "./commands/update.js";
import { listChanges, runList } from "./commands/list.js";
import { getNextAction, runNext } from "./commands/next.js";
import { runMarkInProgress, runNote } from "./commands/note.js";
import { runRepair } from "./commands/repair.js";
import { runRefresh } from "./commands/refresh.js";
import { runRecover } from "./commands/recover.js";
import { runReviewComplete, runReviewStart, type ReviewDecision } from "./commands/review.js";
import { attachSession, runSession } from "./commands/session.js";
import { runStart } from "./commands/start.js";
import { getStatus, runStatus } from "./commands/status.js";
import { runSync } from "./commands/sync.js";
import { runTui } from "./commands/tui.js";
import { runConfig } from "./commands/config.js";
import { getHubInstances, getHubStatus, runHubForeground, runHubKill, runHubList, runHubOpen, runHubRestart, runHubStart, runHubStatus, runHubStop } from "./commands/hub.js";
import { runValidate } from "./commands/validate.js";
import { runVerify } from "./commands/verify.js";
import { runVersion } from "./commands/version.js";
import { deleteWorkspace, getWorkspaceStatus, listWorkspaceStatuses, runWorkspaceList, runWorkspaceStatus } from "./commands/workspace.js";
import { runInstallCli, runUninstallCli } from "./commands/install-cli.js";
import { findRepoRoot, loadConfig } from "./config/loadConfig.js";
import { errorCode, errorExitCode } from "./errors.js";
import { colorEnabled, createColors, parseColorChoice, type CliColors } from "./cli/color.js";
import { listCliTopics, readCliHelpEntry, readCliTopic, renderCliHelp, renderCliTopic, type CliHelpEntry } from "./cli/docs.js";
import {
  appendFallbackGuidance,
  appendTip,
  formatChoiceGuidance,
  formatMissingGuidance,
  formatQuotedList,
  suggestValues,
  type GuidanceChoice,
} from "./cli/guidance.js";
import { renderHumanOutput } from "./cli/render.js";
import { pushWrapped, terminalWrapWidth } from "./cli/text.js";
import { PLANNING_MODELS, PLANNING_SECTION_IDS, type PlanningModel } from "./planning/types.js";
import { PLANNING_ADAPTER_FORMATS, type PlanningAdapterFormat } from "./planning/adapters.js";
import type { ValidationGate } from "./planning/validation.js";
import type { CreateOptions } from "./commands/create.js";
import { AGENT_TOOL_IDS } from "./scaffold/agent-tools.js";
import { readWorkspaceMetadata } from "./workspace/marker.js";
import { storageRoot } from "./paths.js";

type CommandName = "init" | "update" | "create" | "quick" | "validate" | "sync" | "start" | "verify" | "hydrate" | "complete" | "next" | "audit" | "land" | "refresh" | "workspace" | "check" | "review" | "doctor" | "completions" | "recover" | "repair" | "note" | "mark-in-progress" | "list" | "status" | "plan" | "ui" | "server" | "dashboard" | "hub" | "tui" | "config" | "hooks" | "session" | "install" | "uninstall" | "version" | "help";

type ParsedArgs = {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
  explicitCommand: boolean;
};

type MutationOptions = {
  dryRun?: boolean;
  fix?: boolean;
  verbose?: boolean;
  deleteStaleCompletedWorkspaces?: boolean;
  checkCompletedAcceptanceCriteria?: boolean;
  waiveMissingJjBookmarks?: boolean;
  waiveStaleCompletedReviews?: boolean;
  staleCompletedDays?: number;
};

const BOOLEAN_FLAGS = new Set([
  "dashboard",
  "check-completed-acceptance-criteria",
  "debug",
  "delete-stale-completed-workspaces",
  "dry-run",
  "fix",
  "force",
  "h",
  "help",
  "json",
  "kanban",
  "no-code-change",
  "no-open",
  "no-planning",
  "no-pr",
  "open",
  "quiet",
  "replace",
  "quick",
  "smoke-create-all",
  "smoke-test",
  "strict",
  "tui",
  "vcs",
  "verbose",
  "warmup",
  "workspace",
  "waive-missing-jj-bookmarks",
  "version",
  "waive-stale-completed-reviews",
]);
const VALIDATION_GATES = ["document", "sync", "start", "complete"] as const;
const REVIEW_DECISIONS = ["approve", "request-changes", "reject", "comment"] as const;
const HOOK_EVENTS = ["to_review", "to_in_progress", "activity"] as const;
const ROOT_LAUNCH_TARGETS = ["--tui", "--dashboard", "--kanban", "--vcs"] as const;

function normalizeRootArg(arg: string): string {
  if (arg === "-i") return "--tui";
  if (arg === "-h") return "--help";
  return arg;
}

function parseArgs(argv: string[]): ParsedArgs {
  const normalizedArgv = argv.map(normalizeRootArg);
  const commandIndex = findCommandIndex(normalizedArgv);
  const explicitCommand = commandIndex !== -1;
  const command = explicitCommand ? normalizedArgv[commandIndex] : "help";
  const rest = explicitCommand
    ? [...normalizedArgv.slice(0, commandIndex), ...normalizedArgv.slice(commandIndex + 1)]
    : normalizedArgv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const next = rest[i + 1];
    const value = rawValue ?? (BOOLEAN_FLAGS.has(rawKey) ? true : next !== undefined && !next.startsWith("--") ? rest[++i] : true);

    if (rawKey === "label") {
      const existing = flags.label;
      flags.label = Array.isArray(existing) ? [...existing, String(value)] : existing ? [String(existing), String(value)] : [String(value)];
    } else {
      flags[rawKey] = value;
    }
  }

  return { command, positional, flags, explicitCommand };
}

const GLOBAL_FLAGS_WITH_VALUES = new Set(["color", "connect", "host", "port", "project"]);

function findCommandIndex(argv: string[]): number {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("-")) return i;
    if (arg.startsWith("--")) {
      const [rawKey, rawValue] = arg.slice(2).split("=", 2);
      if (rawValue === undefined && GLOBAL_FLAGS_WITH_VALUES.has(rawKey) && argv[i + 1] && !argv[i + 1].startsWith("-")) {
        i += 1;
      }
    }
  }
  return -1;
}

function isTrue(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function asBooleanFlag(flags: Record<string, string | boolean | string[]>, name: string): boolean {
  const value = flags[name];
  return isTrue(value);
}

function stringFlag(flags: Record<string, string | boolean | string[]>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

function labelsFlag(flags: Record<string, string | boolean | string[]>): string[] | undefined {
  const labels = flags.label;
  if (Array.isArray(labels)) return labels;
  if (typeof labels === "string") return [labels];
  return undefined;
}

function createOptionsFromFlags(
  flags: Record<string, string | boolean | string[]>,
  defaults: Partial<CreateOptions> = {},
): CreateOptions {
  const quickRequested = defaults.template === "quick" || asBooleanFlag(flags, "quick");
  const template = defaults.template ?? (quickRequested ? "quick" : stringFlag(flags, "template") ?? "agent-task");
  const isQuickTemplate = template === "quick";
  return {
    template,
    title: stringFlag(flags, "title") ?? "",
    priority: stringFlag(flags, "priority") ?? defaults.priority,
    labels: labelsFlag(flags) ?? defaults.labels,
    author: stringFlag(flags, "author") ?? defaults.author,
    planFile: stringFlag(flags, "plan-file") ?? defaults.planFile,
    planning: (stringFlag(flags, "planning") as PlanningModel | undefined) ?? defaults.planning,
    strict: asBooleanFlag(flags, "strict") || defaults.strict === true,
    noPlanning: isQuickTemplate || asBooleanFlag(flags, "no-planning") || defaults.noPlanning === true,
  };
}

const COMMAND_ALIASES: Record<string, CommandName> = {
  new: "create",
  begin: "start",
  check: "verify",
  done: "complete",
};

function commandBaseName(command: string): CommandName {
  return COMMAND_ALIASES[command] ?? (command as CommandName);
}

function removedInvocationMessage(command: string): string | null {
  if (command === "tui") return "cy tui was removed. Use `cy --tui` or `cy -i` instead.";
  if (command === "ui" || command === "kanban") return "cy ui was removed. Use `cy --kanban` instead.";
  if (command === "dashboard") return "cy dashboard was removed. Use cy --dashboard to open the dashboard or cy hub <start|status|stop|restart> to manage the runtime.";
  if (command === "server") return "cy server was removed. Use `cy hub` instead.";
  if (command === "view" || command === "menu") return `cy ${command} was removed. Use \`cy --tui\` or \`cy -i\` instead.`;
  return null;
}

type CommandSuggestion = {
  name: string;
  description: string;
};

function commandDescriptions(rootHelp: CliHelpEntry): Map<string, string> {
  return new Map(rootHelp.commands.map((entry) => [entry.name, entry.description]));
}

function commandSuggestionCandidates(rootHelp: CliHelpEntry): Array<GuidanceChoice & { command?: string }> {
  const descriptions = commandDescriptions(rootHelp);
  return [
    ...rootHelp.commands.map((command) => ({ value: command.name, description: command.description })),
    ...Object.entries(COMMAND_ALIASES).map(([input, command]) => ({
      value: input,
      description: descriptions.get(command) ?? "",
      command,
    })),
  ];
}

function suggestedCommands(input: string, rootHelp: CliHelpEntry): CommandSuggestion[] {
  const descriptions = commandDescriptions(rootHelp);
  const suggestions: CommandSuggestion[] = [];
  const seen = new Set<string>();
  for (const candidate of suggestValues(input, commandSuggestionCandidates(rootHelp))) {
    const command = "command" in candidate && typeof candidate.command === "string" ? candidate.command : candidate.value;
    if (seen.has(command)) continue;
    seen.add(command);
    suggestions.push({ name: command, description: descriptions.get(command) ?? candidate.description ?? "" });
  }
  return suggestions.slice(0, 3);
}

function formatUnknownCommandMessage(input: string, rootHelp: CliHelpEntry, colors: CliColors): string {
  const suggestions = suggestedCommands(input, rootHelp);
  const width = terminalWrapWidth();
  const lines = [`Unknown command: ${colors.yellow(input)}`];
  if (suggestions.length > 0) {
    lines.push("");
    pushWrapped(lines, `${colors.green("tip:")} `, `similar commands exist: ${formatQuotedList(suggestions.map((suggestion) => `cy ${suggestion.name}`), colors)}`, width);
    lines.push("");
    lines.push(`${colors.bold("Matching commands:")}`);
    for (const suggestion of suggestions) {
      pushWrapped(lines, `  ${colors.green(`cy ${suggestion.name}`)}  `, suggestion.description, width);
    }
    lines.push("");
    pushWrapped(lines, "", `Run ${colors.bold(`cy help ${suggestions[0].name}`)} for details.`, width);
  } else {
    lines.push("");
    pushWrapped(lines, `${colors.green("tip:")} `, `no similar commands were found. Run ${colors.bold("cy --help")} to list commands.`, width);
  }
  return lines.join("\n");
}

function choiceValues(values: readonly string[]): GuidanceChoice[] {
  return values.map((value) => ({ value }));
}

function validateChoice<T extends string>(value: string | undefined, label: string, values: readonly T[], colors: CliColors, helpCommand?: string): T | undefined {
  if (value === undefined || value === "") return undefined;
  if ((values as readonly string[]).includes(value)) return value as T;
  throw new Error(formatChoiceGuidance({
    label,
    value,
    choices: choiceValues(values),
    colors,
    helpCommand,
  }));
}

function requireChoice<T extends string>(value: string | undefined, label: string, values: readonly T[], colors: CliColors, helpCommand?: string): T {
  const validated = validateChoice(value, label, values, colors, helpCommand);
  if (validated) return validated;
  throw new Error(formatMissingGuidance({
    message: `Missing ${label}.`,
    tips: [`use one of: ${values.join(", ")}.`, helpCommand ? `Run ${helpCommand} for details.` : ""].filter(Boolean),
    colors,
  }));
}

function validateCommaChoices(value: string | undefined, label: string, values: readonly string[], colors: CliColors, helpCommand?: string): void {
  if (value === undefined || value.trim() === "") return;
  const aliases = ["all", "none"];
  const allowed = [...values, ...aliases];
  for (const part of value.split(",")) {
    const trimmed = part.trim().toLowerCase();
    if (!trimmed) continue;
    if (!allowed.includes(trimmed)) {
      throw new Error(formatChoiceGuidance({
        label,
        value: trimmed,
        choices: choiceValues(allowed),
        colors,
        helpCommand,
      }));
    }
  }
}

function validateSubcommand(input: {
  commandPath: string;
  value: string;
  subcommands: readonly GuidanceChoice[];
  colors: CliColors;
  helpCommand: string;
}): string {
  if (input.value && input.subcommands.some((choice) => choice.value === input.value)) return input.value;
  const message = input.value ? `Unknown ${input.commandPath} command: ${input.value}` : `Missing ${input.commandPath} command.`;
  const suggestions = input.value ? suggestValues(input.value, input.subcommands) : [];
  const lines = [message, ""];
  if (suggestions.length > 0) {
    appendTip(lines, `similar commands exist: ${formatQuotedList(suggestions.map((choice) => `${input.commandPath} ${choice.value}`), input.colors)}`, input.colors);
  } else {
    appendTip(lines, `use one of: ${input.subcommands.map((choice) => choice.value).join(", ")}.`, input.colors);
  }
  lines.push("");
  lines.push(input.colors.bold("Available commands:"));
  for (const subcommand of input.subcommands) {
    pushWrapped(lines, `  ${input.colors.green(`${input.commandPath} ${subcommand.value}`)}  `, subcommand.description ?? "", terminalWrapWidth());
  }
  lines.push("");
  pushWrapped(lines, "", `Run ${input.colors.bold(input.helpCommand)} for details.`, terminalWrapWidth());
  throw new Error(lines.join("\n"));
}

function formatUnknownHelpTopic(topic: string, colors: CliColors): string {
  const topics = listCliTopics();
  return formatChoiceGuidance({
    label: "help topic",
    value: topic,
    choices: choiceValues(topics),
    colors,
    helpCommand: "cy help --help",
  });
}

function requireTaskId(commandUsage: string, id: string | undefined, colors: CliColors): string {
  const value = id?.trim() ?? "";
  if (value) return value;
  throw new Error(formatMissingGuidance({
    message: "Missing task id.",
    tips: [
      `Usage: ${commandUsage}`,
      "Run cy list to see available tasks, then retry with the full or partial task id.",
    ],
    colors,
  }));
}

function availableTemplateChoices(repoRoot: string): GuidanceChoice[] {
  try {
    const config = loadConfig(repoRoot);
    const templatesDir = path.join(storageRoot(repoRoot, config), "templates");
    if (!existsSync(templatesDir)) return [];
    return readdirSync(templatesDir)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => ({ value: path.basename(entry, ".md") }))
      .sort((left, right) => left.value.localeCompare(right.value));
  } catch {
    return [];
  }
}

function validateTemplate(value: string | undefined, repoRoot: string, colors: CliColors, helpCommand: string): void {
  if (value === undefined || value === "") return;
  const choices = availableTemplateChoices(repoRoot);
  if (choices.length === 0 || choices.some((choice) => choice.value === value)) return;
  throw new Error(formatChoiceGuidance({
    label: "--template",
    value,
    choices,
    colors,
    helpCommand,
  }));
}

function validateCreateFlags(flags: Record<string, string | boolean | string[]>, repoRoot: string, colors: CliColors, helpCommand: string): void {
  validateTemplate(stringFlag(flags, "template"), repoRoot, colors, helpCommand);
  validateChoice(stringFlag(flags, "planning"), "--planning", PLANNING_MODELS, colors, helpCommand);
}

function countRootLaunchFlags(flags: Record<string, string | boolean | string[]>): number {
  return ["tui", "dashboard", "kanban", "vcs"].filter((name) => asBooleanFlag(flags, name)).length;
}

function parsePortFlag(flags: Record<string, string | boolean | string[]>): number | "auto" | undefined {
  const rawPort = stringFlag(flags, "port");
  return rawPort === "auto" ? "auto" : rawPort ? Number(rawPort) : undefined;
}

function parseNonNegativeIntegerFlag(
  flags: Record<string, string | boolean | string[]>,
  name: string,
  colors: CliColors,
  helpCommand: string,
): number | undefined {
  const raw = flags[name];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(formatMissingGuidance({
      message: `Missing --${name} value.`,
      tips: [`Use --${name} <days> with a non-negative integer.`, `Run ${helpCommand} for details.`],
      colors,
    }));
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(formatMissingGuidance({
      message: `Invalid --${name}: ${raw}`,
      tips: [`Use --${name} <days> with a non-negative integer.`, `Run ${helpCommand} for details.`],
      colors,
    }));
  }
  return parsed;
}

function outputLine(command: string, output: unknown): void {
  if (output === undefined || output === null) return;
  if (typeof output === "string") process.stdout.write(`${output}\n`);
  else process.stdout.write(`${JSON.stringify(output)}\n`);
}

function jsonPayload(command: string, output: unknown): { command: string; message?: string; data?: unknown } {
  if (typeof output === "string") return { command, message: output };
  const message = output && typeof output === "object" && "message" in output && typeof output.message === "string"
    ? output.message
    : undefined;
  return message ? { command, message, data: output } : { command, data: output };
}

function helpCommandPath(command: CommandName, positional: string[]): string[] {
  if (command === "help") {
    if (positional[0] === "-k") return [];
    return positional.filter((entry) => !entry.startsWith("-"));
  }
  return [command, ...positional.filter((entry) => !entry.startsWith("-"))];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = commandBaseName(args.command);
  const json = asBooleanFlag(args.flags, "json");
  const quiet = asBooleanFlag(args.flags, "quiet");
  const verbose = asBooleanFlag(args.flags, "verbose");
  const dryRun = asBooleanFlag(args.flags, "dry-run");
  const fix = asBooleanFlag(args.flags, "fix");
  const rawColorChoice = stringFlag(args.flags, "color");
  let colorChoice: ReturnType<typeof parseColorChoice>;
  try {
    colorChoice = parseColorChoice(rawColorChoice);
  } catch {
    const colors = createColors(false);
    const message = formatChoiceGuidance({
      label: "--color",
      value: rawColorChoice ?? "",
      choices: choiceValues(["always", "never", "auto"]),
      colors,
      helpCommand: "cy --help",
    });
    if (json) console.error(JSON.stringify({ ok: false, error: { code: "CHANGEYARD_ERROR", message } }, null, 2));
    else if (!quiet) console.error(`CHANGEYARD_ERROR: ${message}`);
    process.exitCode = 1;
    return;
  }
  const colors = createColors(!json && colorEnabled({ choice: colorChoice, stream: process.stdout }));
  const errorColors = createColors(!json && colorEnabled({ choice: colorChoice, stream: process.stderr }));
  const guidanceColors = json ? createColors(false) : errorColors;
  const shouldShowText = !(quiet && !json);
  const mutationOptions: MutationOptions = {
    dryRun,
    fix,
    verbose,
    deleteStaleCompletedWorkspaces: asBooleanFlag(args.flags, "delete-stale-completed-workspaces"),
    checkCompletedAcceptanceCriteria: asBooleanFlag(args.flags, "check-completed-acceptance-criteria"),
    waiveMissingJjBookmarks: asBooleanFlag(args.flags, "waive-missing-jj-bookmarks"),
    waiveStaleCompletedReviews: asBooleanFlag(args.flags, "waive-stale-completed-reviews"),
    staleCompletedDays: parseNonNegativeIntegerFlag(args.flags, "stale-completed-days", guidanceColors, "cy doctor --help"),
  };
  const projectRoot = stringFlag(args.flags, "project");
  const repoRoot = command === "help" || command === "version" ? process.cwd() : findRepoRoot(projectRoot ?? process.cwd());
  const rootForChange = (id: string): string => {
    try {
      return readWorkspaceMetadata(id, process.cwd()).repoRoot;
    } catch {
      return repoRoot;
    }
  };

  const rootLaunchFlags = countRootLaunchFlags(args.flags);

  if (asBooleanFlag(args.flags, "version")) {
    const versionOutput = runVersion();
    if (json) console.log(JSON.stringify({ ok: true, ...jsonPayload("version", versionOutput) }, null, 2));
    else if (shouldShowText) outputLine("version", versionOutput);
    return;
  }

  if (asBooleanFlag(args.flags, "help") || asBooleanFlag(args.flags, "h")) {
    const output = renderCliHelp(
      readCliHelpEntry(helpCommandPath(command, args.positional)) ?? readCliHelpEntry([command]) ?? readCliHelpEntry([])!,
      colors,
    );
    if (json) console.log(JSON.stringify({ ok: true, ...jsonPayload("help", output) }, null, 2));
    else if (shouldShowText) outputLine("help", output);
    return;
  }

  let output: unknown;
  try {
    const removedMessage = args.explicitCommand ? removedInvocationMessage(args.command) : null;
    if (removedMessage) {
      throw new Error(removedMessage);
    }
    if (rootLaunchFlags > 1) {
      throw new Error(formatMissingGuidance({
        message: "Choose only one launch target.",
        tips: [`Use one of: ${ROOT_LAUNCH_TARGETS.join(", ")}.`],
        colors: guidanceColors,
      }));
    }
    if (args.explicitCommand && rootLaunchFlags > 0) {
      throw new Error("Launch flags must be used without a subcommand. Use `cy --tui`, `cy --dashboard`, `cy --kanban`, or `cy --vcs`.");
    }

    if (asBooleanFlag(args.flags, "dashboard") || asBooleanFlag(args.flags, "kanban") || asBooleanFlag(args.flags, "vcs")) {
      const launchCommand = asBooleanFlag(args.flags, "dashboard") ? "dashboard" : asBooleanFlag(args.flags, "vcs") ? "vcs" : "kanban";
      output = await runHubOpen(repoRoot, {
        open: args.flags["no-open"] === true ? false : args.flags.open === true ? true : undefined,
        host: stringFlag(args.flags, "host"),
        port: parsePortFlag(args.flags),
        project: projectRoot,
        startedBy: launchCommand,
      }, asBooleanFlag(args.flags, "dashboard") ? "/" : asBooleanFlag(args.flags, "vcs") ? "/vcs" : "/kanban");
      if (json) {
        console.log(JSON.stringify({ ok: true, ...jsonPayload(launchCommand, output) }, null, 2));
      } else if (shouldShowText) {
        outputLine(launchCommand, output);
      }
      return;
    }

    if (!args.explicitCommand || asBooleanFlag(args.flags, "tui")) {
      output = await runTui({
        connect: stringFlag(args.flags, "connect"),
        debug: asBooleanFlag(args.flags, "debug"),
        host: stringFlag(args.flags, "host"),
        port: parsePortFlag(args.flags),
        project: projectRoot,
        smokeTest: asBooleanFlag(args.flags, "smoke-test"),
        smokeCreateAll: asBooleanFlag(args.flags, "smoke-create-all"),
      }, process.cwd());
      if (json) {
        console.log(JSON.stringify({ ok: true, ...jsonPayload("tui", output) }, null, 2));
      } else if (shouldShowText) {
        outputLine("tui", output);
      }
      return;
    }

    switch (command) {
      case "init":
        validateCommaChoices(stringFlag(args.flags, "tools"), "--tools", AGENT_TOOL_IDS, guidanceColors, "cy init --help");
        output = runInit(repoRoot, { dryRun, tools: stringFlag(args.flags, "tools") });
        break;
      case "update":
        validateCommaChoices(stringFlag(args.flags, "tools"), "--tools", AGENT_TOOL_IDS, guidanceColors, "cy update --help");
        output = runUpdate(repoRoot, { dryRun, tools: stringFlag(args.flags, "tools") });
        break;
      case "create": {
        validateCreateFlags(args.flags, repoRoot, guidanceColors, "cy create --help");
        output = json ? createChange(createOptionsFromFlags(args.flags), repoRoot, { dryRun }) : runCreate(createOptionsFromFlags(args.flags), repoRoot, { dryRun });
        break;
      }
      case "quick": {
        validateCreateFlags(args.flags, repoRoot, guidanceColors, "cy quick --help");
        output = json ? createChange(createOptionsFromFlags(args.flags, { template: "quick" }), repoRoot, { dryRun }) : runCreate(createOptionsFromFlags(args.flags, { template: "quick" }), repoRoot, { dryRun });
        break;
      }
      case "validate": {
        const id = requireTaskId("cy validate <id> [--gate <document|sync|start|complete>]", args.positional[0], guidanceColors);
        const gate = validateChoice(stringFlag(args.flags, "gate"), "--gate", VALIDATION_GATES, guidanceColors, "cy validate --help") as ValidationGate | undefined;
        output = runValidate(id, rootForChange(id), { gate });
        break;
      }
      case "sync": {
        const id = requireTaskId("cy sync <id>", args.positional[0], guidanceColors);
        output = runSync(id, rootForChange(id), { dryRun });
        break;
      }
      case "start": {
        const id = requireTaskId("cy start <id>", args.positional[0], guidanceColors);
        output = runStart(id, rootForChange(id), { dryRun, warmup: asBooleanFlag(args.flags, "warmup") });
        break;
      }
      case "verify": {
        const id = requireTaskId("cy verify <id>", args.positional[0], guidanceColors);
        output = runVerify(id, process.cwd());
        break;
      }
      case "hydrate": {
        const id = requireTaskId("cy hydrate <id>", args.positional[0], guidanceColors);
        output = runHydrate(id, process.cwd(), { dryRun, warmup: asBooleanFlag(args.flags, "warmup") });
        break;
      }
      case "complete": {
        const id = requireTaskId("cy complete <id>", args.positional[0], guidanceColors);
        output = runComplete(id, {
          noPr: args.flags["no-pr"] === true || args.flags["no-pr"] === "true",
          noCodeChange: args.flags["no-code-change"] === true || args.flags["no-code-change"] === "true",
          profile: stringFlag(args.flags, "profile"),
          dryRun,
        }, process.cwd());
        break;
      }
      case "next": {
        const id = requireTaskId("cy next <id>", args.positional[0], guidanceColors);
        output = json || colors.enabled ? getNextAction(id, rootForChange(id)) : runNext(id, rootForChange(id));
        break;
      }
      case "audit": {
        const id = requireTaskId("cy audit <id>", args.positional[0], guidanceColors);
        output = getWorkflowAuditReport(id, rootForChange(id));
        break;
      }
      case "land": {
        const id = requireTaskId("cy land <id>", args.positional[0], guidanceColors);
        output = runLand(id, {
          target: stringFlag(args.flags, "target"),
          dryRun,
          keepWorkspace: asBooleanFlag(args.flags, "keep-workspace"),
        }, rootForChange(id));
        break;
      }
      case "refresh": {
        const id = requireTaskId("cy refresh <id>", args.positional[0], guidanceColors);
        output = runRefresh(id, {
          target: stringFlag(args.flags, "target"),
          dryRun,
        }, rootForChange(id));
        break;
      }
      case "workspace": {
        const subcommand = validateSubcommand({
          commandPath: "cy workspace",
          value: args.positional[0] ?? "",
          subcommands: [
            { value: "status", description: "Show one workspace status." },
            { value: "list", description: "List workspace statuses." },
            { value: "delete", description: "Delete a workspace." },
          ],
          colors: guidanceColors,
          helpCommand: "cy workspace --help",
        });
        const id = subcommand === "list" ? "" : requireTaskId(`cy workspace ${subcommand} <id>`, args.positional[1], guidanceColors);
        const workspaceRepoRoot = id ? rootForChange(id) : repoRoot;
        if (subcommand === "status") output = json || colors.enabled ? getWorkspaceStatus(id, workspaceRepoRoot) : runWorkspaceStatus(id, workspaceRepoRoot);
        else if (subcommand === "list") output = json ? listWorkspaceStatuses(repoRoot) : runWorkspaceList(repoRoot);
        else if (subcommand === "delete") output = deleteWorkspace(id, { dryRun, force: asBooleanFlag(args.flags, "force") }, workspaceRepoRoot);
        break;
      }
      case "check": {
        const subcommand = validateSubcommand({
          commandPath: "cy check",
          value: args.positional[0] ?? "",
          subcommands: [
            { value: "record", description: "Record manual validation evidence." },
          ],
          colors: guidanceColors,
          helpCommand: "cy check --help",
        });
        const id = requireTaskId(`cy check ${subcommand} <id>`, args.positional[1], guidanceColors);
        output = runCheckRecord(id, {
          command: stringFlag(args.flags, "command"),
          status: stringFlag(args.flags, "status"),
          exitCode: parseNonNegativeIntegerFlag(args.flags, "exit-code", guidanceColors, "cy check record --help") ?? null,
          cwd: stringFlag(args.flags, "cwd"),
          logFile: stringFlag(args.flags, "log-file"),
          dryRun,
        }, rootForChange(id), process.cwd());
        break;
      }
      case "doctor": {
        const includeJson = asBooleanFlag(args.flags, "json");
        if (includeJson || colors.enabled) {
          const report = doctorReport(repoRoot, mutationOptions);
          output = verbose || report.fixes.length > 0 ? report : { ...report, notes: [] };
        } else {
          output = runDoctor(repoRoot, mutationOptions);
        }
        break;
      }
      case "completions":
        output = runCompletions();
        break;
      case "recover": {
        const id = requireTaskId("cy recover <id|all>", args.positional[0], guidanceColors);
        output = runRecover(id, repoRoot, { dryRun }, process.cwd());
        break;
      }
      case "repair": {
        const id = requireTaskId("cy repair <id> --workspace", args.positional[0], guidanceColors);
        output = runRepair(id, { dryRun, workspace: asBooleanFlag(args.flags, "workspace") }, rootForChange(id));
        break;
      }
      case "note": {
        const id = requireTaskId("cy note <id> --message <text>", args.positional[0], guidanceColors);
        output = runNote(id, {
          message: stringFlag(args.flags, "message"),
          replace: asBooleanFlag(args.flags, "replace"),
          dryRun,
        }, rootForChange(id));
        break;
      }
      case "mark-in-progress": {
        const id = requireTaskId("cy mark-in-progress <id>", args.positional[0], guidanceColors);
        output = runMarkInProgress(id, { dryRun }, rootForChange(id));
        break;
      }
      case "review": {
        const subcommand = validateSubcommand({
          commandPath: "cy review",
          value: args.positional[0] ?? "",
          subcommands: [
            { value: "start", description: "Open a review document for a task." },
            { value: "complete", description: "Complete the active review with a decision." },
          ],
          colors: guidanceColors,
          helpCommand: "cy review --help",
        });
        const id = requireTaskId(`cy review ${subcommand} <id>`, args.positional[1], guidanceColors);
        if (subcommand === "start") output = runReviewStart(id, repoRoot, { dryRun });
        else if (subcommand === "complete") {
          const decision = requireChoice(stringFlag(args.flags, "decision"), "--decision", REVIEW_DECISIONS, guidanceColors, "cy review complete --help") as ReviewDecision;
          output = runReviewComplete(id, decision, repoRoot, { dryRun });
        }
        break;
      }
      case "list":
        output = json ? listChanges(repoRoot) : runList(repoRoot, { planning: asBooleanFlag(args.flags, "planning") });
        break;
      case "status": {
        const id = requireTaskId("cy status <id>", args.positional[0], guidanceColors);
        output = json || colors.enabled ? getStatus(id, rootForChange(id)) : runStatus(id, rootForChange(id));
        break;
      }
      case "plan": {
        const subcommand = validateSubcommand({
          commandPath: "cy plan",
          value: args.positional[0] ?? "",
          subcommands: [
            { value: "status", description: "Show planning status for a task." },
            { value: "prompt", description: "Print a planning prompt section." },
            { value: "strict", description: "Enable or disable strict planning." },
            { value: "export", description: "Export planning mirrors." },
            { value: "import", description: "Import planning mirrors." },
          ],
          colors: guidanceColors,
          helpCommand: "cy plan --help",
        });
        const id = subcommand === "strict" ? "" : requireTaskId(`cy plan ${subcommand} <id>`, args.positional[1], guidanceColors);
        if (subcommand === "status") output = json || colors.enabled ? getPlanStatus(id, rootForChange(id)) : runPlanStatus(id, rootForChange(id));
        else if (subcommand === "prompt") {
          const section = requireChoice(args.positional[2], "planning section", PLANNING_SECTION_IDS, guidanceColors, "cy plan prompt --help");
          output = json ? getPlanPrompt(id, section, rootForChange(id)) : runPlanPrompt(id, section, rootForChange(id));
        }
        else if (subcommand === "export") {
          const format = requireChoice(stringFlag(args.flags, "format"), "--format", PLANNING_ADAPTER_FORMATS, guidanceColors, "cy plan export --help") as PlanningAdapterFormat;
          output = runPlanExport(id, format, rootForChange(id), { dryRun });
        }
        else if (subcommand === "import") {
          const format = requireChoice(stringFlag(args.flags, "format"), "--format", PLANNING_ADAPTER_FORMATS, guidanceColors, "cy plan import --help") as PlanningAdapterFormat;
          output = runPlanImport(id, format, rootForChange(id), { dryRun });
        }
        else if (subcommand === "strict") {
          const strictAction = requireChoice(args.positional[1], "strict action", ["enable", "disable"] as const, guidanceColors, "cy plan strict --help");
          const strictId = requireTaskId(`cy plan strict ${strictAction} <id>`, args.positional[2], guidanceColors);
          if (strictAction === "enable") output = runPlanStrictEnable(strictId, rootForChange(strictId), { dryRun });
          else if (strictAction === "disable") output = runPlanStrictDisable(strictId, rootForChange(strictId), { dryRun });
        }
        break;
      }
      case "ui": {
        throw new Error("cy ui was removed. Use `cy --kanban` instead.");
      }
      case "hub": {
        const hubAction = args.positional[0] ?? "";
        const hubOptions = {
          open: args.flags["no-open"] === true ? false : args.flags.open === true ? true : undefined,
          host: stringFlag(args.flags, "host"),
          port: parsePortFlag(args.flags),
          project: projectRoot,
          startedBy: hubAction ? `hub ${hubAction}` : "hub",
        };
        const validatedHubAction = hubAction ? validateSubcommand({
          commandPath: "cy hub",
          value: hubAction,
          subcommands: [
            { value: "start", description: "Start the shared UI/runtime hub." },
            { value: "stop", description: "Stop the hub." },
            { value: "status", description: "Show hub status." },
            { value: "list", description: "List known hub instances." },
            { value: "kill", description: "Kill a hub instance by id or pid." },
            { value: "restart", description: "Restart the hub." },
            { value: "run", description: "Run the hub in the foreground." },
          ],
          colors: guidanceColors,
          helpCommand: "cy hub --help",
        }) : "";
        if (validatedHubAction === "start") {
          output = await runHubStart(repoRoot, hubOptions);
        } else if (validatedHubAction === "stop") {
          output = await runHubStop(repoRoot, hubOptions);
        } else if (validatedHubAction === "status") {
          output = json ? getHubStatus(repoRoot, hubOptions) : runHubStatus(repoRoot, hubOptions);
        } else if (validatedHubAction === "list") {
          output = json ? getHubInstances(repoRoot) : runHubList(repoRoot);
        } else if (validatedHubAction === "kill") {
          const target = args.positional[1];
          if (!target) {
            throw new Error(formatMissingGuidance({
              message: "Missing hub instance id, pid, `stale`, or `all`.",
              tips: ["Usage: cy hub kill <id|pid|stale|all> [--force].", "Run cy hub --help for details."],
              colors: guidanceColors,
            }));
          }
          output = await runHubKill(repoRoot, target, { force: asBooleanFlag(args.flags, "force") });
        } else if (validatedHubAction === "restart") {
          output = await runHubRestart(repoRoot, hubOptions);
        } else if (validatedHubAction === "run") {
          output = await runHubForeground(repoRoot, hubOptions);
        } else {
          output = renderCliHelp(readCliHelpEntry(["hub"]) ?? readCliHelpEntry([])!, colors);
        }
        break;
      }
      case "server": {
        throw new Error("cy server was removed. Use `cy hub` instead.");
      }
      case "tui": {
        throw new Error("cy tui was removed. Use `cy --tui` or `cy -i` instead.");
      }
      case "config": {
        if (!json) {
          throw new Error("Interactive cy config was removed. Use `cy --tui` and open `/config`, or run `cy config --json`.");
        }
        const rawPort = stringFlag(args.flags, "port");
        output = await runConfig({
          json: json,
          connect: stringFlag(args.flags, "connect"),
          debug: asBooleanFlag(args.flags, "debug"),
          host: stringFlag(args.flags, "host"),
          port: rawPort === "auto" ? "auto" : rawPort ? Number(rawPort) : undefined,
          project: projectRoot,
        }, process.cwd());
        break;
      }
      case "hooks": {
        validateSubcommand({
          commandPath: "cy hooks",
          value: args.positional[0] ?? "",
          subcommands: [
            { value: "ingest", description: "Ingest a hook event." },
            { value: "notify", description: "Notify the hub about a hook event." },
            { value: "codex-hook", description: "Run the Codex hook adapter." },
          ],
          colors: guidanceColors,
          helpCommand: "cy hooks --help",
        });
        requireChoice(stringFlag(args.flags, "event"), "--event", HOOK_EVENTS, guidanceColors, "cy hooks --help");
        output = await runHooks(args.positional, args.flags);
        break;
      }
      case "session": {
        const sessionAction = validateSubcommand({
          commandPath: "cy session",
          value: args.positional[0] ?? "",
          subcommands: [
            { value: "attach", description: "Attach an agent session to a task." },
          ],
          colors: guidanceColors,
          helpCommand: "cy session --help",
        });
        if (sessionAction === "attach") {
          if (!stringFlag(args.flags, "task-id")) {
            throw new Error(formatMissingGuidance({
              message: "Missing required option: --task-id <id>",
              tips: [
                "Pass --task-id <id> to identify the task session.",
                "Run cy list to see available tasks.",
              ],
              colors: guidanceColors,
            }));
          }
          if (!stringFlag(args.flags, "provider")) {
            throw new Error(formatMissingGuidance({
              message: "Missing required option: --provider <name>",
              tips: ["Pass --provider codex or another provider name for the external agent session."],
              colors: guidanceColors,
            }));
          }
        }
        output = json ? await attachSession(args.positional, args.flags) : await runSession(args.positional, args.flags);
        break;
      }
      case "install":
        output = runInstallCli({
          dir: stringFlag(args.flags, "dir"),
          dryRun,
        });
        break;
      case "uninstall":
        output = runUninstallCli({
          dir: stringFlag(args.flags, "dir"),
          dryRun,
        });
        break;
      case "version":
        output = runVersion();
        break;
      case "help":
      default:
        if (command === "help") {
          if (args.positional[0] === "-k") {
            const topic = args.positional[1] ?? "";
            if (!topic) {
              throw new Error(formatMissingGuidance({
                message: "Missing help topic.",
                tips: [
                  "Use cy help -k <topic>.",
                  `Available topics: ${listCliTopics().join(", ")}.`,
                ],
                colors: guidanceColors,
              }));
            }
            const helpTopic = readCliTopic(topic);
            if (!helpTopic) throw new Error(formatUnknownHelpTopic(topic, guidanceColors));
            output = renderCliTopic(helpTopic, colors);
          } else {
            const entry = readCliHelpEntry(helpCommandPath(command, args.positional)) ?? readCliHelpEntry([])!;
            output = renderCliHelp(entry, colors);
          }
        }
        else throw new Error(formatUnknownCommandMessage(args.command, readCliHelpEntry([])!, json ? createColors(false) : errorColors));
    }

    if (json) {
      console.log(JSON.stringify({ ok: true, ...jsonPayload(command, output) }, null, 2));
    } else if (shouldShowText) {
      outputLine(command, renderHumanOutput({ command, positional: args.positional, colors }, output));
    }
    if (command === "audit" && output && typeof output === "object" && "blockers" in output && Array.isArray(output.blockers) && output.blockers.length > 0) {
      process.exitCode = 1;
    }
  } catch (error: unknown) {
    const code = errorCode(error);
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = code === "CHANGEYARD_ERROR"
      ? appendFallbackGuidance(rawMessage, { command, positional: args.positional, colors: guidanceColors })
      : rawMessage;
    const codeLine = `${code}: ${message}`;
    if (json) {
      console.error(JSON.stringify({ ok: false, error: { code, message } }, null, 2));
    } else if (!quiet) {
      console.error(errorColors.enabled ? `${errorColors.red(code)}: ${message}` : codeLine);
    }
    process.exitCode = errorExitCode(error);
  }
}

main().catch(() => {
  process.exitCode = 1;
});
