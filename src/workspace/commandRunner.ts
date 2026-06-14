import { spawnSync } from "node:child_process";
import { ChangeyardError } from "../errors.js";
import { normalizeVcsCommandArgs, vcsNoColorEnv } from "../vcs/argv.js";

export type CommandRunner = (command: string, args: string[], cwd: string) => string;

export const shellCommandRunner: CommandRunner = (command, args, cwd) => {
  const normalizedArgs = normalizeVcsCommandArgs(command, args);
  const result = spawnSync(command, normalizedArgs, { cwd, encoding: "utf8", env: vcsNoColorEnv() });
  if (result.status !== 0) {
    throw new ChangeyardError("WORKSPACE_ENGINE_FAILED", result.stderr || `${command} ${normalizedArgs.join(" ")} failed`);
  }
  return (result.stdout ?? "").trim();
};
