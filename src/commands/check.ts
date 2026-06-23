import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { appendManualCheckRecord } from "../checks/runChecks.js";
import { loadConfig } from "../config/loadConfig.js";
import { workspacesRoot } from "../paths.js";
import type { ManualCheckRecord, WorkspaceMetadata } from "../types.js";
import { readWorkspaceMetadata } from "../workspace/marker.js";
import { readWorkspaceMetadataFromRoot } from "./workspace.js";

export type CheckRecordOptions = {
  command?: string;
  status?: string;
  exitCode?: number | null;
  cwd?: string;
  logFile?: string;
  dryRun?: boolean;
};

function resolveMetadata(id: string, repoRoot: string, cwd: string): WorkspaceMetadata {
  try {
    return readWorkspaceMetadata(id, cwd);
  } catch {
    const metadata = readWorkspaceMetadataFromRoot(id, repoRoot);
    if (!metadata) throw new Error(`Workspace metadata not found for ${id}`);
    return metadata;
  }
}

export function runCheckRecord(id: string, options: CheckRecordOptions = {}, repoRoot = process.cwd(), cwd = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const command = options.command?.trim();
  if (!command) throw new Error("check command is required; pass --command <cmd>");
  if (options.status !== "passed" && options.status !== "failed") {
    throw new Error("check status must be passed or failed");
  }

  const metadata = resolveMetadata(id, repoRoot, cwd);
  const config = loadConfig(metadata.repoRoot);
  const logPath = path.join(workspacesRoot(metadata.repoRoot, config), metadata.changeId, "logs", "checks.log");
  const resolvedCwd = path.resolve(options.cwd ? path.resolve(cwd, options.cwd) : cwd);
  const resolvedLogFile = options.logFile ? path.resolve(cwd, options.logFile) : undefined;
  const record: ManualCheckRecord = {
    command,
    status: options.status,
    exitCode: options.exitCode ?? null,
    cwd: resolvedCwd,
    recordedAt: new Date().toISOString(),
    ...(resolvedLogFile ? { logFile: resolvedLogFile } : {}),
  };
  const output = resolvedLogFile && existsSync(resolvedLogFile) ? readFileSync(resolvedLogFile, "utf8") : "";
  if (!options.dryRun) appendManualCheckRecord(logPath, record, output);
  return [
    options.dryRun ? `Dry-run: would record ${options.status} check for ${metadata.changeId}` : `Recorded ${options.status} check for ${metadata.changeId}`,
    `Command: ${command}`,
    `Log: ${logPath}`,
  ].join("\n");
}
