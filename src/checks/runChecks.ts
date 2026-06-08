import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export type CheckResult = {
  command: string;
  status: "passed" | "failed";
  exitCode: number | null;
};

export function runChecks(commands: string[], cwd: string, logPath: string): CheckResult[] {
  mkdirSync(path.dirname(logPath), { recursive: true });
  const logs: string[] = [];
  const results: CheckResult[] = [];
  for (const command of commands) {
    logs.push(`$ ${command}`);
    const result = spawnSync(command, { cwd, shell: true, encoding: "utf8" });
    if (result.stdout) logs.push(result.stdout);
    if (result.stderr) logs.push(result.stderr);
    const exitCode = result.status;
    const status = exitCode === 0 ? "passed" : "failed";
    results.push({ command, status, exitCode });
    logs.push(`status: ${status}${exitCode === null ? "" : ` (${exitCode})`}`);
    if (status === "failed") break;
  }
  writeFileSync(logPath, `${logs.join("\n")}\n`);
  return results;
}
