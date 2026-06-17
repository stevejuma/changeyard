#!/usr/bin/env node
import { runCompletions } from "./commands/completions.js";
import { runComplete } from "./commands/complete.js";
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
import { runRecover } from "./commands/recover.js";
import { runReviewComplete, runReviewStart } from "./commands/review.js";
import { attachSession, runSession } from "./commands/session.js";
import { runStart } from "./commands/start.js";
import { getStatus, runStatus } from "./commands/status.js";
import { runSync } from "./commands/sync.js";
import { runTui } from "./commands/tui.js";
import { runConfig } from "./commands/config.js";
import { getHubStatus, runHubForeground, runHubOpen, runHubRestart, runHubStart, runHubStatus, runHubStop } from "./commands/hub.js";
import { runValidate } from "./commands/validate.js";
import { runVerify } from "./commands/verify.js";
import { runVersion } from "./commands/version.js";
import { deleteWorkspace, getWorkspaceStatus, listWorkspaceStatuses, runWorkspaceList, runWorkspaceStatus } from "./commands/workspace.js";
import { runInstallCli, runUninstallCli } from "./commands/install-cli.js";
import { findRepoRoot } from "./config/loadConfig.js";
import { errorCode, errorExitCode } from "./errors.js";
import { colorEnabled, createColors, parseColorChoice } from "./cli/color.js";
import { readCliHelpEntry, readCliTopic, renderCliHelp, renderCliTopic } from "./cli/docs.js";
import { renderHumanOutput } from "./cli/render.js";
import type { PlanningModel } from "./planning/types.js";
import type { ValidationGate } from "./planning/validation.js";
import type { CreateOptions } from "./commands/create.js";
import { readWorkspaceMetadata } from "./workspace/marker.js";

type CommandName = "init" | "update" | "create" | "quick" | "validate" | "sync" | "start" | "verify" | "hydrate" | "complete" | "next" | "land" | "workspace" | "review" | "doctor" | "completions" | "recover" | "list" | "status" | "plan" | "ui" | "server" | "dashboard" | "hub" | "tui" | "config" | "hooks" | "session" | "install" | "uninstall" | "version" | "help";

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
};

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
    const value = rawValue ?? (next !== undefined && !next.startsWith("--") ? rest[++i] : true);

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
  return {
    template: defaults.template ?? (quickRequested ? "quick" : stringFlag(flags, "template") ?? "agent-task"),
    title: stringFlag(flags, "title") ?? "",
    priority: stringFlag(flags, "priority") ?? defaults.priority,
    labels: labelsFlag(flags) ?? defaults.labels,
    author: stringFlag(flags, "author") ?? defaults.author,
    planFile: stringFlag(flags, "plan-file") ?? defaults.planFile,
    planning: (stringFlag(flags, "planning") as PlanningModel | undefined) ?? defaults.planning,
    strict: asBooleanFlag(flags, "strict") || defaults.strict === true,
    noPlanning: asBooleanFlag(flags, "no-planning") || defaults.noPlanning === true,
  };
}

function commandBaseName(command: string): CommandName {
  if (command === "new") return "create";
  if (command === "begin") return "start";
  if (command === "check") return "verify";
  if (command === "done") return "complete";
  return command as CommandName;
}

function removedInvocationMessage(command: string): string | null {
  if (command === "tui") return "cy tui was removed. Use `cy --tui` or `cy -i` instead.";
  if (command === "ui" || command === "kanban") return "cy ui was removed. Use `cy --kanban` instead.";
  if (command === "dashboard") return "cy dashboard was removed. Use cy --dashboard to open the dashboard or cy hub <start|status|stop|restart> to manage the runtime.";
  if (command === "server") return "cy server was removed. Use `cy hub` instead.";
  if (command === "view" || command === "menu") return `cy ${command} was removed. Use \`cy --tui\` or \`cy -i\` instead.`;
  return null;
}

function countRootLaunchFlags(flags: Record<string, string | boolean | string[]>): number {
  return ["tui", "dashboard", "kanban", "vcs"].filter((name) => asBooleanFlag(flags, name)).length;
}

function parsePortFlag(flags: Record<string, string | boolean | string[]>): number | "auto" | undefined {
  const rawPort = stringFlag(flags, "port");
  return rawPort === "auto" ? "auto" : rawPort ? Number(rawPort) : undefined;
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
  const colorChoice = parseColorChoice(stringFlag(args.flags, "color"));
  const colors = createColors(!json && colorEnabled({ choice: colorChoice, stream: process.stdout }));
  const errorColors = createColors(!json && colorEnabled({ choice: colorChoice, stream: process.stderr }));
  const shouldShowText = !(quiet && !json);
  const mutationOptions: MutationOptions = { dryRun, fix, verbose };
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
      throw new Error("Choose only one launch target: --tui, --dashboard, --kanban, or --vcs.");
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
        output = runInit(repoRoot, { dryRun, tools: stringFlag(args.flags, "tools") });
        break;
      case "update":
        output = runUpdate(repoRoot, { dryRun, tools: stringFlag(args.flags, "tools") });
        break;
      case "create": {
        output = json ? createChange(createOptionsFromFlags(args.flags), repoRoot, { dryRun }) : runCreate(createOptionsFromFlags(args.flags), repoRoot, { dryRun });
        break;
      }
      case "quick": {
        output = json ? createChange(createOptionsFromFlags(args.flags, { template: "quick" }), repoRoot, { dryRun }) : runCreate(createOptionsFromFlags(args.flags, { template: "quick" }), repoRoot, { dryRun });
        break;
      }
      case "validate":
        output = runValidate(args.positional[0] ?? "", rootForChange(args.positional[0] ?? ""), { gate: stringFlag(args.flags, "gate") as ValidationGate | undefined });
        break;
      case "sync":
        output = runSync(args.positional[0] ?? "", rootForChange(args.positional[0] ?? ""), { dryRun });
        break;
      case "start":
        output = runStart(args.positional[0] ?? "", rootForChange(args.positional[0] ?? ""), { dryRun });
        break;
      case "verify":
        output = runVerify(args.positional[0] ?? "", process.cwd());
        break;
      case "hydrate":
        output = runHydrate(args.positional[0] ?? "", process.cwd(), { dryRun });
        break;
      case "complete":
        output = runComplete(args.positional[0] ?? "", {
          noPr: args.flags["no-pr"] === true || args.flags["no-pr"] === "true",
          noCodeChange: args.flags["no-code-change"] === true || args.flags["no-code-change"] === "true",
          profile: stringFlag(args.flags, "profile"),
          dryRun,
        }, process.cwd());
        break;
      case "next":
        output = json || colors.enabled ? getNextAction(args.positional[0] ?? "", rootForChange(args.positional[0] ?? "")) : runNext(args.positional[0] ?? "", rootForChange(args.positional[0] ?? ""));
        break;
      case "land":
        output = runLand(args.positional[0] ?? "", {
          target: stringFlag(args.flags, "target"),
          dryRun,
          keepWorkspace: asBooleanFlag(args.flags, "keep-workspace"),
        }, rootForChange(args.positional[0] ?? ""));
        break;
      case "workspace": {
        const subcommand = args.positional[0] ?? "";
        const id = args.positional[1] ?? "";
        const workspaceRepoRoot = id ? rootForChange(id) : repoRoot;
        if (subcommand === "status") output = json || colors.enabled ? getWorkspaceStatus(id, workspaceRepoRoot) : runWorkspaceStatus(id, workspaceRepoRoot);
        else if (subcommand === "list") output = json ? listWorkspaceStatuses(repoRoot) : runWorkspaceList(repoRoot);
        else if (subcommand === "delete") output = deleteWorkspace(id, { dryRun, force: asBooleanFlag(args.flags, "force") }, workspaceRepoRoot);
        else throw new Error("Unknown workspace command. Expected: cy workspace status <id>, cy workspace list, or cy workspace delete <id>");
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
      case "recover":
        output = runRecover(args.positional[0] ?? "", repoRoot, { dryRun });
        break;
      case "review": {
        const subcommand = args.positional[0] ?? "";
        const id = args.positional[1] ?? "";
        if (subcommand === "start") output = runReviewStart(id, repoRoot, { dryRun });
        else if (subcommand === "complete") output = runReviewComplete(id, stringFlag(args.flags, "decision") as "approve" | "request-changes" | "reject", repoRoot, { dryRun });
        else throw new Error("Unknown review command. Expected: cy review start <id> or cy review complete <id> --decision <approve|request-changes|reject>");
        break;
      }
      case "list":
        output = json ? listChanges(repoRoot) : runList(repoRoot, { planning: asBooleanFlag(args.flags, "planning") });
        break;
      case "status":
        output = json || colors.enabled ? getStatus(args.positional[0] ?? "", rootForChange(args.positional[0] ?? "")) : runStatus(args.positional[0] ?? "", rootForChange(args.positional[0] ?? ""));
        break;
      case "plan": {
        const subcommand = args.positional[0] ?? "";
        const id = args.positional[1] ?? "";
        if (subcommand === "status") output = json || colors.enabled ? getPlanStatus(id, rootForChange(id)) : runPlanStatus(id, rootForChange(id));
        else if (subcommand === "prompt") {
          const section = args.positional[2] as import("./planning/types.js").PlanningSectionId | undefined;
          if (!section) throw new Error("Missing planning section. Expected: cy plan prompt <id> <section>");
          output = json ? getPlanPrompt(id, section, rootForChange(id)) : runPlanPrompt(id, section, rootForChange(id));
        }
        else if (subcommand === "export") {
          const format = stringFlag(args.flags, "format") as import("./planning/adapters.js").PlanningAdapterFormat | undefined;
          if (!format) throw new Error("Missing adapter format. Expected: cy plan export <id> --format <openspec|speckit>");
          output = runPlanExport(id, format, rootForChange(id), { dryRun });
        }
        else if (subcommand === "import") {
          const format = stringFlag(args.flags, "format") as import("./planning/adapters.js").PlanningAdapterFormat | undefined;
          if (!format) throw new Error("Missing adapter format. Expected: cy plan import <id> --format <openspec|speckit>");
          output = runPlanImport(id, format, rootForChange(id), { dryRun });
        }
        else if (subcommand === "strict") {
          const strictAction = args.positional[1] ?? "";
          const strictId = args.positional[2] ?? "";
          if (strictAction === "enable") output = runPlanStrictEnable(strictId, rootForChange(strictId), { dryRun });
          else if (strictAction === "disable") output = runPlanStrictDisable(strictId, rootForChange(strictId), { dryRun });
          else throw new Error("Unknown strict plan command. Expected: cy plan strict <enable|disable> <id>");
        }
        else throw new Error("Unknown plan command. Expected: cy plan status <id>, cy plan prompt <id> <section>, cy plan strict <enable|disable> <id>, cy plan export <id> --format <openspec|speckit>, or cy plan import <id> --format <openspec|speckit>");
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
        };
        if (hubAction === "start") {
          output = await runHubStart(repoRoot, hubOptions);
        } else if (hubAction === "stop") {
          output = await runHubStop(repoRoot);
        } else if (hubAction === "status") {
          output = json ? getHubStatus(repoRoot) : runHubStatus(repoRoot);
        } else if (hubAction === "restart") {
          output = await runHubRestart(repoRoot, hubOptions);
        } else if (hubAction === "run") {
          output = await runHubForeground(repoRoot, hubOptions);
        } else if (hubAction) {
          throw new Error("Unknown hub command. Expected: cy hub start, cy hub stop, cy hub status, or cy hub restart.");
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
      case "hooks":
        output = await runHooks(args.positional, args.flags);
        break;
      case "session":
        output = json ? await attachSession(args.positional, args.flags) : await runSession(args.positional, args.flags);
        break;
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
            if (!topic) throw new Error("Missing help topic. Expected: cy help -k <topic>");
            const helpTopic = readCliTopic(topic);
            if (!helpTopic) throw new Error(`Unknown help topic: ${topic}`);
            output = renderCliTopic(helpTopic, colors);
          } else {
            const entry = readCliHelpEntry(helpCommandPath(command, args.positional)) ?? readCliHelpEntry([])!;
            output = renderCliHelp(entry, colors);
          }
        }
        else throw new Error(`Unknown command: ${args.command}\n\n${renderCliHelp(readCliHelpEntry([])!, createColors(false))}`);
    }

    if (json) {
      console.log(JSON.stringify({ ok: true, ...jsonPayload(command, output) }, null, 2));
    } else if (shouldShowText) {
      outputLine(command, renderHumanOutput({ command, positional: args.positional, colors }, output));
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const code = errorCode(error);
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
