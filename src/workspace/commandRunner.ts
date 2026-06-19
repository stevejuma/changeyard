import { spawnSync } from "node:child_process";
import { ChangeyardError } from "../errors.js";
import { normalizeVcsCommandArgs, vcsNoColorEnv } from "../vcs/argv.js";

export type CommandRunner = (command: string, args: string[], cwd: string) => string;

export function jjInspectionArgs(args: string[]): string[] {
  if (args.some((arg) => arg === "--ignore-working-copy" || arg === "--at-op" || arg === "--at-operation" || arg.startsWith("--at-op=") || arg.startsWith("--at-operation="))) {
    return args;
  }
  return ["--ignore-working-copy", ...args];
}

export const shellCommandRunner: CommandRunner = (command, args, cwd) => {
  const normalizedArgs = normalizeVcsCommandArgs(command, args);
  const result = spawnSync(command, normalizedArgs, { cwd, encoding: "utf8", env: vcsNoColorEnv() });
  if (result.status !== 0) {
    throw new ChangeyardError("WORKSPACE_ENGINE_FAILED", result.stderr || `${command} ${normalizedArgs.join(" ")} failed`);
  }
  return (result.stdout ?? "").trim();
};

export const shellInspectionCommandRunner: CommandRunner = (command, args, cwd) => {
  return shellCommandRunner(command, command === "jj" ? jjInspectionArgs(args) : args, cwd);
};
