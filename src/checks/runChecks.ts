import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { ManualCheckRecord } from "../types.js";

export type CheckResult = {
  command: string;
  status: "passed" | "failed";
  exitCode: number | null;
};

const MANUAL_RECORD_PREFIX = "cy-check-record:";

export function readManualCheckRecords(logPath: string): ManualCheckRecord[] {
  if (!existsSync(logPath)) return [];
  const records: ManualCheckRecord[] = [];
  for (const line of readFileSync(logPath, "utf8").split(/\r?\n/u)) {
    if (!line.startsWith(MANUAL_RECORD_PREFIX)) continue;
    const raw = line.slice(MANUAL_RECORD_PREFIX.length).trim();
    try {
      const parsed = JSON.parse(raw) as ManualCheckRecord;
      if (parsed.command && (parsed.status === "passed" || parsed.status === "failed")) {
        records.push(parsed);
      }
    } catch {
      // Ignore malformed historical evidence lines; the human log remains useful.
    }
  }
  return records;
}

export function countPassedManualChecks(logPath: string): number {
  return readManualCheckRecords(logPath).filter((record) => record.status === "passed").length;
}

export function appendManualCheckRecord(logPath: string, record: ManualCheckRecord, output = ""): void {
  mkdirSync(path.dirname(logPath), { recursive: true });
  const lines = [
    `$ ${record.command}`,
    `manual-check: ${record.status}${record.exitCode === null ? "" : ` (${record.exitCode})`}`,
    `cwd: ${record.cwd}`,
    `recordedAt: ${record.recordedAt}`,
    ...(record.logFile ? [`logFile: ${record.logFile}`] : []),
    ...(output ? [output.replace(/\n*$/u, "")] : []),
    `${MANUAL_RECORD_PREFIX} ${JSON.stringify(record)}`,
    "",
  ];
  appendFileSync(logPath, `${lines.join("\n")}`);
}

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
  if (commands.length === 0) {
    if (!existsSync(logPath)) writeFileSync(logPath, "");
  } else {
    appendFileSync(logPath, `${logs.join("\n")}\n`);
  }
  return results;
}
