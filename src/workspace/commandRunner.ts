import { spawnSync } from "node:child_process";
import { ChangeyardError } from "../errors.js";

export type CommandRunner = (command: string, args: string[], cwd: string) => string;

export const shellCommandRunner: CommandRunner = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new ChangeyardError("WORKSPACE_ENGINE_FAILED", result.stderr || `${command} ${args.join(" ")} failed`);
  }
  return (result.stdout ?? "").trim();
};
