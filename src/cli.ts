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
import { runCreate } from "./commands/create.js";
import { runHooks } from "./commands/hooks.js";
import { runHydrate } from "./commands/hydrate.js";
import { runInit } from "./commands/init.js";
import { runLand } from "./commands/land.js";
import { runUpdate } from "./commands/update.js";
import { listChanges, runList } from "./commands/list.js";
import { getNextAction, runNext } from "./commands/next.js";
import { runRecover } from "./commands/recover.js";
import { runReviewComplete, runReviewStart } from "./commands/review.js";
import { runServer } from "./commands/server.js";
import { runStart } from "./commands/start.js";
import { getStatus, runStatus } from "./commands/status.js";
import { runSync } from "./commands/sync.js";
import { runTui } from "./commands/tui.js";
import { runConfig } from "./commands/config.js";
import { runUi } from "./commands/ui.js";
import { runValidate } from "./commands/validate.js";
import { runVerify } from "./commands/verify.js";
import { deleteWorkspace, getWorkspaceStatus, listWorkspaceStatuses, runWorkspaceList, runWorkspaceStatus } from "./commands/workspace.js";
import { runInstallCli, runUninstallCli } from "./commands/install-cli.js";
import { findRepoRoot } from "./config/loadConfig.js";
import { errorCode, errorExitCode } from "./errors.js";
import type { PlanningModel } from "./planning/types.js";
import type { ValidationGate } from "./planning/validation.js";
import type { CreateOptions } from "./commands/create.js";
import { readWorkspaceMetadata } from "./workspace/marker.js";

type CommandName = "init" | "update" | "create" | "quick" | "validate" | "sync" | "start" | "verify" | "hydrate" | "complete" | "next" | "land" | "workspace" | "review" | "doctor" | "completions" | "recover" | "list" | "status" | "plan" | "ui" | "server" | "tui" | "config" | "hooks" | "install" | "uninstall" | "help";

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
  const startsWithFlag = normalizedArgv[0]?.startsWith("-") ?? false;
  const explicitCommand = normalizedArgv.length > 0 && !startsWithFlag;
  const [command = "help", ...rest] = startsWithFlag ? ["help", ...normalizedArgv] : normalizedArgv;
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

function commandExamples(entries: string[]): string {
  return entries.map((entry) => `  $ ${entry}`).join("\n");
}

function usage(): string {
  return `Changeyard: markdown-first local change workflow manager

Usage:
  cy [-i|--tui] [--connect <url>] [--host <host>] [--port <port|auto>] [--project <path>] [--debug]
  cy --kanban [--host <host>] [--port <port|auto>] [--open|--no-open]
  cy --vcs [--host <host>] [--port <port|auto>] [--open|--no-open]
  cy init [--dry-run] [--tools all|none|<tool-id>[,<tool-id>...]]
  cy update [--dry-run] [--tools all|none|<tool-id>[,<tool-id>...]]
  cy create --template <name> --title <title> [--priority <priority>] [--label <label>...] [--author <name>] [--plan-file <path>] [--planning <none|openspec-lite>] [--strict] [--no-planning] [--dry-run]
  cy create --quick --title <title> [--priority <priority>] [--label <label>...] [--author <name>] [--dry-run]
  cy quick --title <title> [--priority <priority>] [--label <label>...] [--author <name>] [--dry-run]
  cy validate CY-0001 [--gate document|sync|start|complete]
  cy sync CY-0001 [--dry-run]
  cy start CY-0001 [--dry-run]
  cy verify CY-0001
  cy hydrate CY-0001 [--dry-run]
  cy complete CY-0001 [--profile <name>] [--no-pr] [--no-code-change] [--dry-run]
  cy next CY-0001 [--json]
  cy land CY-0001 [--target <ref>] [--dry-run] [--keep-workspace]
  cy workspace status CY-0001 [--json]
  cy workspace list [--json]
  cy workspace delete CY-0001 [--dry-run] [--force]
  cy review start CY-0001
  cy review complete CY-0001 --decision approve|request-changes|reject [--dry-run]
  cy doctor [--json] [--fix] [--dry-run] [--verbose]
  cy recover CY-0001 [--dry-run]
  cy completions
  cy list [--json]
  cy status CY-0001 [--json]
  cy plan status CY-0001 [--json]
  cy plan prompt CY-0001 proposal [--json]
  cy plan strict enable CY-0001 [--dry-run]
  cy plan strict disable CY-0001 [--dry-run]
  cy plan export CY-0001 --format openspec [--dry-run]
  cy plan import CY-0001 --format speckit [--dry-run]
  cy server [--host <host>] [--port <port|auto>] [--project <path>] [--json]
  cy config --json [--project <path>]
  cy hooks ingest --event to_review|to_in_progress|activity
  cy install [--dir <path>] [--dry-run]
  cy uninstall [--dir <path>] [--dry-run]

Global options:
  -i, --tui     start the OpenTUI terminal interface
  --kanban      start the local Changeyard web UI
  --vcs         start the local Changeyard VCS web UI
  --json         print machine-readable output
  --dry-run      simulate mutating commands without writing
  --verbose      print additional diagnostic output
  --quiet        suppress success output (errors still reported)
  --fix          doctor: apply supported repairs

Aliases:
  cy new      -> create
  cy begin    -> start
  cy check    -> verify
  cy done     -> complete
`;
}

function commandUsage(command: string): string {
  const lines: Record<string, string> = {
    init: `${"init".padEnd(12)}create .changeyard, templates, and agent skills/commands for detected tools.\n\nExamples:\n${commandExamples([
      "cy init",
      "cy init --tools cursor,claude",
      "cy init --tools all --dry-run",
    ])}`,
    update: `${"update".padEnd(12)}refresh bundled templates, skills, and agent slash commands.\n\nExamples:\n${commandExamples([
      "cy update",
      "cy update --tools cursor",
      "cy update --dry-run",
    ])}`,
    create: `${"create".padEnd(12)}create a new change from a template.\n\nExamples:\n${commandExamples([
      "cy create --template agent-task --title \"Add workspace verification\"",
      "cy create --template feature --title \"Add export command\" --label api --priority high",
      "cy create --template feature --title \"Add plugin permissions UI\" --planning openspec-lite --strict",
      "cy create --quick --title \"Fix broken link\"",
    ])}`,
    quick: `${"quick".padEnd(12)}create a low-risk quick change.\n\nExamples:\n${commandExamples([
      "cy quick --title \"Fix typo in README\"",
      "cy quick --title \"Update docs wording\" --label docs",
      "cy quick --dry-run --title \"Tighten release note copy\"",
    ])}`,
    validate: `${"validate".padEnd(12)}validate one change against templates and schema.\n\nExamples:\n${commandExamples(["cy validate CY-0001", "cy validate CY-0001 --gate complete"])}`,
    sync: `${"sync".padEnd(12)}sync change metadata to remote provider.\n\nExample:\n${commandExamples(["cy sync CY-0001", "cy sync CY-0001 --dry-run"])}`,
    start: `${"start".padEnd(12)}create a workspace and set status to in_progress.\n\nExample:\n${commandExamples(["cy start CY-0001"])}`,
    verify: `${"verify".padEnd(12)}verify current directory is a writable workspace.\n\nExample:\n${commandExamples(["cy verify CY-0001"])}`,
    hydrate: `${"hydrate".padEnd(12)}sync configured hydration files into workspace.\n\nExample:\n${commandExamples(["cy hydrate CY-0001"])}`,
    complete: `${"complete".padEnd(12)}run checks and move change to ready_for_pr.\n\nExamples:\n${commandExamples([
      "cy complete CY-0001 --no-pr",
      "cy complete CY-0001 --profile full",
    ])}`,
    next: `${"next".padEnd(12)}show the next actionable Changeyard command for a change.\n\nExamples:\n${commandExamples(["cy next CY-0001", "cy next CY-0001 --json"])}`,
    land: `${"land".padEnd(12)}land ready workspace work into the default local workflow.\n\nExamples:\n${commandExamples(["cy land CY-0001", "cy land CY-0001 --target main --dry-run", "cy land CY-0001 --keep-workspace"])}`,
    workspace: `${"workspace".padEnd(12)}inspect or clean Changeyard workspaces.\n\nExamples:\n${commandExamples(["cy workspace status CY-0001", "cy workspace list --json", "cy workspace delete CY-0001 --dry-run"])}`,
    review: `${"review".padEnd(12)}manage markdown + provider review artifacts.\n\nExamples:\n${commandExamples([
      "cy review start CY-0001",
      "cy review start CY-0001 --dry-run",
      "cy review complete CY-0001 --decision request-changes",
    ])}`,
    doctor: `${"doctor".padEnd(12)}check changeyard state, stale markers, and drift.\n\nExamples:\n${commandExamples([
      "cy doctor",
      "cy doctor --fix",
      "cy doctor --json",
    ])}`,
    recover: `${"recover".padEnd(12)}recreate missing workspace markers.\n\nExamples:\n${commandExamples(["cy recover CY-0001", "cy recover all --dry-run"])}`,
    completions: `${"completions".padEnd(12)}install shell completion helper.\n\nExample:\n${commandExamples(["cy completions"])}`,
    list: `${"list".padEnd(12)}list all local changes.\n\nExample:\n${commandExamples(["cy list"])}`,
    status: `${"status".padEnd(12)}print one change summary.\n\nExample:\n${commandExamples(["cy status CY-0001"])}`,
    plan: `${"plan".padEnd(12)}inspect planning status, generate planning prompts, toggle strict mode, or manage adapter mirrors.\n\nExamples:\n${commandExamples(["cy plan status CY-0001", "cy plan status CY-0001 --json", "cy plan prompt CY-0001 proposal", "cy plan strict enable CY-0001", "cy plan export CY-0001 --format openspec", "cy plan import CY-0001 --format speckit --dry-run"])}`,
    ui: `${"ui".padEnd(12)}removed. Use cy --kanban instead.\n\nExamples:\n${commandExamples(["cy --kanban --no-open", "cy --kanban --host 127.0.0.1 --port 4310"])}`,
    server: `${"server".padEnd(12)}start the local Changeyard runtime API without opening the browser UI.\n\nExamples:\n${commandExamples(["cy server", "cy server --host 127.0.0.1 --port auto", "cy server --project /path/to/repo --json"])}`,
    tui: `${"tui".padEnd(12)}removed. Use cy --tui or cy -i instead.\n\nExamples:\n${commandExamples(["cy --tui", "cy --tui --connect http://127.0.0.1:4310", "cy --tui --project /path/to/repo --debug"])}`,
    config: `${"config".padEnd(12)}print config as JSON. Interactive config lives inside the TUI at /config.\n\nExamples:\n${commandExamples([
      "cy config --json",
      "cy config --json --project /path/to/repo",
    ])}`,
    hooks: `${"hooks".padEnd(12)}forward terminal-agent hook events to the local Changeyard runtime.\n\nExamples:\n${commandExamples(["cy hooks ingest --event to_review", "cy hooks notify --event activity --activity-text \"Waiting for input\""])}`,
    install: `${"install".padEnd(12)}symlink cy and changeyard into a local bin directory (default: ~/.local/bin).\n\nExamples:\n${commandExamples([
      "cy install",
      "cy install --dir ~/.local/bin --dry-run",
    ])}`,
    uninstall: `${"uninstall".padEnd(12)}remove Changeyard symlinks installed by cy install.\n\nExamples:\n${commandExamples([
      "cy uninstall",
      "cy uninstall --dir ~/.local/bin",
    ])}`,
    help: usage(),
  };
  return lines[command] ?? usage();
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
  if (command === "view" || command === "menu") return `cy ${command} was removed. Use \`cy --tui\` or \`cy -i\` instead.`;
  return null;
}

function countRootLaunchFlags(flags: Record<string, string | boolean | string[]>): number {
  return ["tui", "kanban", "vcs"].filter((name) => asBooleanFlag(flags, name)).length;
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
  return typeof output === "string" ? { command, message: output } : { command, data: output };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = commandBaseName(args.command);
  const json = asBooleanFlag(args.flags, "json");
  const quiet = asBooleanFlag(args.flags, "quiet");
  const verbose = asBooleanFlag(args.flags, "verbose");
  const dryRun = asBooleanFlag(args.flags, "dry-run");
  const fix = asBooleanFlag(args.flags, "fix");
  const shouldShowText = !(quiet && !json);
  const mutationOptions: MutationOptions = { dryRun, fix, verbose };
  const projectRoot = stringFlag(args.flags, "project");
  const repoRoot = command === "help" ? process.cwd() : findRepoRoot(projectRoot ?? process.cwd());
  const rootForChange = (id: string): string => {
    try {
      return readWorkspaceMetadata(id, process.cwd()).repoRoot;
    } catch {
      return repoRoot;
    }
  };

  const rootLaunchFlags = countRootLaunchFlags(args.flags);

  if (asBooleanFlag(args.flags, "help") || asBooleanFlag(args.flags, "h")) {
    const output = commandUsage(command);
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
      throw new Error("Choose only one launch target: --tui, --kanban, or --vcs.");
    }
    if (args.explicitCommand && rootLaunchFlags > 0) {
      throw new Error("Launch flags must be used without a subcommand. Use `cy --tui`, `cy --kanban`, or `cy --vcs`.");
    }

    if (asBooleanFlag(args.flags, "kanban") || asBooleanFlag(args.flags, "vcs")) {
      output = await runUi({
        open: args.flags["no-open"] === true ? false : args.flags.open === true ? true : undefined,
        host: stringFlag(args.flags, "host"),
        port: parsePortFlag(args.flags),
        openPath: asBooleanFlag(args.flags, "vcs") ? "/vcs" : "/",
      }, process.cwd());
      if (json) {
        console.log(JSON.stringify({ ok: true, ...jsonPayload(asBooleanFlag(args.flags, "vcs") ? "vcs" : "kanban", output) }, null, 2));
      } else if (shouldShowText) {
        outputLine(asBooleanFlag(args.flags, "vcs") ? "vcs" : "kanban", output);
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
        output = runCreate(createOptionsFromFlags(args.flags), repoRoot, { dryRun });
        break;
      }
      case "quick": {
        output = runCreate(createOptionsFromFlags(args.flags, { template: "quick" }), repoRoot, { dryRun });
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
        output = json ? getNextAction(args.positional[0] ?? "", rootForChange(args.positional[0] ?? "")) : runNext(args.positional[0] ?? "", rootForChange(args.positional[0] ?? ""));
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
        if (subcommand === "status") output = json ? getWorkspaceStatus(id, workspaceRepoRoot) : runWorkspaceStatus(id, workspaceRepoRoot);
        else if (subcommand === "list") output = json ? listWorkspaceStatuses(repoRoot) : runWorkspaceList(repoRoot);
        else if (subcommand === "delete") output = deleteWorkspace(id, { dryRun, force: asBooleanFlag(args.flags, "force") }, workspaceRepoRoot);
        else throw new Error("Unknown workspace command. Expected: cy workspace status <id>, cy workspace list, or cy workspace delete <id>");
        break;
      }
      case "doctor": {
        const includeJson = asBooleanFlag(args.flags, "json");
        output = includeJson ? doctorReport(repoRoot, mutationOptions) : runDoctor(repoRoot, mutationOptions);
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
        output = json ? getStatus(args.positional[0] ?? "", rootForChange(args.positional[0] ?? "")) : runStatus(args.positional[0] ?? "", rootForChange(args.positional[0] ?? ""));
        break;
      case "plan": {
        const subcommand = args.positional[0] ?? "";
        const id = args.positional[1] ?? "";
        if (subcommand === "status") output = json ? getPlanStatus(id, rootForChange(id)) : runPlanStatus(id, rootForChange(id));
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
      case "server": {
        const rawPort = stringFlag(args.flags, "port");
        output = await runServer({
          host: stringFlag(args.flags, "host"),
          port: rawPort === "auto" ? "auto" : rawPort ? Number(rawPort) : undefined,
          project: projectRoot,
        }, process.cwd());
        break;
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
      case "help":
      default:
        if (command === "help") output = usage();
        else throw new Error(`Unknown command: ${args.command}\n\n${usage()}`);
    }

    if (json) {
      console.log(JSON.stringify({ ok: true, ...jsonPayload(command, output) }, null, 2));
    } else if (shouldShowText) {
      outputLine(command, output);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const code = errorCode(error);
    const codeLine = `${code}: ${message}`;
    if (json) {
      console.error(JSON.stringify({ ok: false, error: { code, message } }, null, 2));
    } else if (!quiet) {
      console.error(codeLine);
    }
    process.exitCode = errorExitCode(error);
  }
}

main().catch(() => {
  process.exitCode = 1;
});
