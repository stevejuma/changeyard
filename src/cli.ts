#!/usr/bin/env node
import { runCompletions } from "./commands/completions.js";
import { runComplete } from "./commands/complete.js";
import { doctorReport, runDoctor } from "./commands/doctor.js";
import { runCreate } from "./commands/create.js";
import { runHydrate } from "./commands/hydrate.js";
import { runInit } from "./commands/init.js";
import { listChanges, runList } from "./commands/list.js";
import { runRecover } from "./commands/recover.js";
import { runReviewComplete, runReviewStart, type ReviewDecision } from "./commands/review.js";
import { runStart } from "./commands/start.js";
import { getStatus, runStatus } from "./commands/status.js";
import { runSync } from "./commands/sync.js";
import { runValidate } from "./commands/validate.js";
import { runVerify } from "./commands/verify.js";
import { findRepoRoot } from "./config/loadConfig.js";
import { errorCode } from "./errors.js";

type ParsedArgs = {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg.startsWith("--")) {
      const [rawKey, rawValue] = arg.slice(2).split("=", 2);
      const value = rawValue ?? (rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true);
      if (rawKey === "label") {
        const existing = flags.label;
        flags.label = Array.isArray(existing) ? [...existing, String(value)] : existing ? [String(existing), String(value)] : [String(value)];
      } else {
        flags[rawKey] = value;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function usage(): string {
  return `Changeyard: markdown-first local change workflow manager

Usage:
  cy init
  cy create --template agent-task --title "Add workspace verification"
  cy validate CY-0001
  cy sync CY-0001
  cy start CY-0001
  cy verify CY-0001
  cy hydrate CY-0001
  cy complete CY-0001 --no-pr
  cy review start CY-0001
  cy review complete CY-0001 --decision approve
  cy doctor
  cy recover CY-0001
  cy completions
  cy list
  cy status CY-0001

Aliases:
  cy new      -> create
  cy begin    -> start
  cy check    -> verify
  cy done     -> complete
`;
}

function commandUsage(command: string): string {
  const lines: Record<string, string> = {
    init: "Usage: cy init\n\nCreate .changeyard storage, config, schema, templates, changes, and reviews directories.",
    create: "Usage: cy create --template <name> --title <title> [--priority <priority>] [--label <label>] [--author <name>] [--plan-file <path>]",
    validate: "Usage: cy validate <change-id>",
    sync: "Usage: cy sync <change-id>",
    start: "Usage: cy start <change-id>",
    verify: "Usage: cy verify <change-id>",
    hydrate: "Usage: cy hydrate <change-id>",
    complete: "Usage: cy complete <change-id> [--profile <name>] [--no-pr] [--no-code-change]",
    review: "Usage: cy review start <change-id>\n       cy review complete <change-id> --decision <approve|request-changes|reject>",
    doctor: "Usage: cy doctor [--json]",
    recover: "Usage: cy recover <change-id>",
    completions: "Usage: cy completions",
    list: "Usage: cy list [--json]",
    status: "Usage: cy status <change-id> [--json]",
    help: usage(),
  };
  return lines[command] ?? usage();
}

function stringFlag(flags: Record<string, string | boolean | string[]>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const command = args.command === "new" ? "create" : args.command === "begin" ? "start" : args.command === "check" ? "verify" : args.command === "done" ? "complete" : args.command;
  const repoRoot = findRepoRoot();
  let output: string | unknown;
  const json = args.flags.json === true;

  if (args.flags.help === true || args.flags.h === true) {
    output = commandUsage(command);
    if (json) console.log(JSON.stringify({ ok: true, output }, null, 2));
    else console.log(output);
    return;
  }

  switch (command) {
    case "init":
      output = runInit(repoRoot);
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
      }, repoRoot);
      break;
    }
    case "validate":
      output = runValidate(args.positional[0] ?? "", repoRoot);
      break;
    case "sync":
      output = runSync(args.positional[0] ?? "", repoRoot);
      break;
    case "start":
      output = runStart(args.positional[0] ?? "", repoRoot);
      break;
    case "verify":
      output = runVerify(args.positional[0] ?? "", process.cwd());
      break;
    case "hydrate":
      output = runHydrate(args.positional[0] ?? "", process.cwd());
      break;
    case "complete":
      output = runComplete(args.positional[0] ?? "", {
        noPr: args.flags["no-pr"] === true,
        noCodeChange: args.flags["no-code-change"] === true,
        profile: stringFlag(args.flags, "profile"),
      }, process.cwd());
      break;
    case "doctor":
      output = json ? doctorReport(repoRoot) : runDoctor(repoRoot);
      break;
    case "completions":
      output = runCompletions();
      break;
    case "recover":
      output = runRecover(args.positional[0] ?? "", repoRoot);
      break;
    case "review": {
      const subcommand = args.positional[0] ?? "";
      const id = args.positional[1] ?? "";
      if (subcommand === "start") output = runReviewStart(id, repoRoot);
      else if (subcommand === "complete") output = runReviewComplete(id, stringFlag(args.flags, "decision") as ReviewDecision, repoRoot);
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
    case "--help":
    case "-h":
      output = usage();
      break;
    default:
      throw new Error(`Unknown command: ${args.command}\n\n${usage()}`);
  }

  if (json) console.log(JSON.stringify({ ok: true, output }, null, 2));
  else console.log(output);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const json = process.argv.includes("--json");
  if (json) console.error(JSON.stringify({ ok: false, error: { code: errorCode(error), message } }, null, 2));
  else console.error(`${errorCode(error)}: ${message}`);
  process.exitCode = 1;
});
