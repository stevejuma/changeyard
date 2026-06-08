#!/usr/bin/env node
import { runCompletions } from "./commands/completions.js";
import { runComplete } from "./commands/complete.js";
import { doctorReport, runDoctor } from "./commands/doctor.js";
import { runCreate } from "./commands/create.js";
import { runHydrate } from "./commands/hydrate.js";
import { runInit } from "./commands/init.js";
import { listChanges, runList } from "./commands/list.js";
import { runRecover } from "./commands/recover.js";
import { runReviewComplete, runReviewStart } from "./commands/review.js";
import { runStart } from "./commands/start.js";
import { getStatus, runStatus } from "./commands/status.js";
import { runSync } from "./commands/sync.js";
import { runValidate } from "./commands/validate.js";
import { runVerify } from "./commands/verify.js";
import { findRepoRoot } from "./config/loadConfig.js";
import { errorCode, errorExitCode } from "./errors.js";

type CommandName = "init" | "create" | "validate" | "sync" | "start" | "verify" | "hydrate" | "complete" | "review" | "doctor" | "completions" | "recover" | "list" | "status" | "help";

type ParsedArgs = {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
};

type MutationOptions = {
  dryRun?: boolean;
  fix?: boolean;
  verbose?: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
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

  return { command, positional, flags };
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

function commandExamples(entries: string[]): string {
  return entries.map((entry) => `  $ ${entry}`).join("\n");
}

function usage(): string {
  return `Changeyard: markdown-first local change workflow manager

Usage:
  cy init [--dry-run]
  cy create --template <name> --title <title> [--priority <priority>] [--label <label>...] [--author <name>] [--plan-file <path>] [--dry-run]
  cy validate CY-0001
  cy sync CY-0001 [--dry-run]
  cy start CY-0001 [--dry-run]
  cy verify CY-0001
  cy hydrate CY-0001 [--dry-run]
  cy complete CY-0001 [--profile <name>] [--no-pr] [--no-code-change] [--dry-run]
  cy review start CY-0001
  cy review complete CY-0001 --decision approve|request-changes|reject [--dry-run]
  cy doctor [--json] [--fix] [--dry-run] [--verbose]
  cy recover CY-0001 [--dry-run]
  cy completions
  cy list [--json]
  cy status CY-0001 [--json]

Global options:
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
    init: `${"init".padEnd(12)}create .changeyard and initial template files.\n\nExamples:\n${commandExamples([
      "cy init",
      "cy init --dry-run",
    ])}`,
    create: `${"create".padEnd(12)}create a new change from a template.\n\nExamples:\n${commandExamples([
      "cy create --template agent-task --title \"Add workspace verification\"",
      "cy create --template feature --title \"Add export command\" --label api --priority high",
    ])}`,
    validate: `${"validate".padEnd(12)}validate one change against templates and schema.\n\nExample:\n${commandExamples(["cy validate CY-0001"])}`,
    sync: `${"sync".padEnd(12)}sync change metadata to remote provider.\n\nExample:\n${commandExamples(["cy sync CY-0001", "cy sync CY-0001 --dry-run"])}`,
    start: `${"start".padEnd(12)}create a workspace and set status to in_progress.\n\nExample:\n${commandExamples(["cy start CY-0001"])}`,
    verify: `${"verify".padEnd(12)}verify current directory is a writable workspace.\n\nExample:\n${commandExamples(["cy verify CY-0001"])}`,
    hydrate: `${"hydrate".padEnd(12)}sync configured hydration files into workspace.\n\nExample:\n${commandExamples(["cy hydrate CY-0001"])}`,
    complete: `${"complete".padEnd(12)}run checks and move change to ready_for_pr.\n\nExamples:\n${commandExamples([
      "cy complete CY-0001 --no-pr",
      "cy complete CY-0001 --profile full",
    ])}`,
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

function outputLine(command: string, output: unknown): void {
  if (output === undefined || output === null) return;
  if (typeof output === "string") process.stdout.write(`${output}\n`);
  else process.stdout.write(`${JSON.stringify(output)}\n`);
}

function jsonPayload(command: string, output: unknown): unknown {
  return typeof output === "string" ? { command, message: output } : { command, data: output };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = commandBaseName(args.command);
  const repoRoot = findRepoRoot();
  const json = asBooleanFlag(args.flags, "json");
  const quiet = asBooleanFlag(args.flags, "quiet");
  const verbose = asBooleanFlag(args.flags, "verbose");
  const dryRun = asBooleanFlag(args.flags, "dry-run");
  const fix = asBooleanFlag(args.flags, "fix");
  const shouldShowText = !(quiet && !json);
  const mutationOptions: MutationOptions = { dryRun, fix, verbose };

  if (asBooleanFlag(args.flags, "help") || asBooleanFlag(args.flags, "h")) {
    const output = commandUsage(command);
    if (json) console.log(JSON.stringify({ ok: true, ...jsonPayload("help", output) }, null, 2));
    else if (shouldShowText) outputLine("help", output);
    return;
  }

  let output: unknown;
  try {
    switch (command) {
      case "init":
        output = runInit(repoRoot, { dryRun });
        break;
      case "create": {
        const labels = args.flags.label;
        output = runCreate({
          template: stringFlag(args.flags, "template") ?? "agent-task",
          title: stringFlag(args.flags, "title") ?? "",
          priority: stringFlag(args.flags, "priority"),
          labels: Array.isArray(labels) ? labels : typeof labels === "string" ? [labels] : undefined,
          author: stringFlag(args.flags, "author"),
          planFile: stringFlag(args.flags, "plan-file"),
        }, repoRoot, { dryRun });
        break;
      }
      case "validate":
        output = runValidate(args.positional[0] ?? "", repoRoot);
        break;
      case "sync":
        output = runSync(args.positional[0] ?? "", repoRoot, { dryRun });
        break;
      case "start":
        output = runStart(args.positional[0] ?? "", repoRoot, { dryRun });
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
        output = json ? listChanges(repoRoot) : runList(repoRoot);
        break;
      case "status":
        output = json ? getStatus(args.positional[0] ?? "", repoRoot) : runStatus(args.positional[0] ?? "", repoRoot);
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
