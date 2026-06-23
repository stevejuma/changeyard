import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { changesRoot, storageRoot, workspacesRoot } from "../paths.js";
import { createProvider } from "../providers/index.js";
import type {
  ChangeProvider,
  RemoteCheckLog,
  RemoteCheckState,
  RemotePullRequestCheck,
  RemotePullRequestChecks,
} from "../providers/ChangeProvider.js";
import { findChangeFile } from "../state/id.js";
import type { ChangeStatus, Frontmatter, ParsedMarkdown, WorkspaceMetadata } from "../types.js";
import { resolveWorkspaceChangePath } from "../workspace/marker.js";
import { readWorkspaceMetadataFromRoot } from "./workspace.js";

export type PrLogOptions = {
  jobId?: string;
  runId?: string;
  failed?: boolean;
  output?: string;
};

export type PrFixOptions = {
  jobId?: string;
  runId?: string;
  failed?: boolean;
  dryRun?: boolean;
};

export type RemoteCheckGate = {
  supported: boolean;
  provider: string;
  pullRequestNumber: number | null;
  overallState: RemoteCheckState | "unsupported" | "missing";
  blockers: string[];
  recovery: string[];
  checks: RemotePullRequestChecks | null;
};

type LoadedChange = {
  id: string;
  path: string;
  parsed: ParsedMarkdown;
  provider: ChangeProvider;
  storageRoot: string;
};

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function nowIso(): string {
  return new Date().toISOString();
}

function loadChange(id: string, repoRoot: string): LoadedChange {
  const config = loadConfig(repoRoot);
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!changePath) throw new Error(`Change not found: ${id}`);
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  return {
    id: String(parsed.frontmatter.id ?? id),
    path: changePath,
    parsed,
    provider: createProvider(config.provider.type, config),
    storageRoot: storageRoot(repoRoot, config),
  };
}

function pullRequestNumber(frontmatter: Frontmatter): number | null {
  const remote = asRecord(frontmatter.remote);
  return typeof remote.pullRequestNumber === "number" ? remote.pullRequestNumber : null;
}

function unsupportedChecks(provider: ChangeProvider, pullNumber: number | null): RemotePullRequestChecks {
  return {
    provider: provider.name,
    pullRequestNumber: pullNumber ?? 0,
    supported: false,
    overallState: "unknown",
    summary: { passed: 0, failed: 0, pending: 0, cancelled: 0, skipped: 0, unknown: 0, total: 0 },
    checks: [],
    message: `Provider ${provider.name} does not support remote pull request checks.`,
  };
}

export function getPrChecks(id: string, repoRoot = process.cwd()): RemotePullRequestChecks {
  const loaded = loadChange(id, repoRoot);
  const pullNumber = pullRequestNumber(loaded.parsed.frontmatter);
  if (pullNumber === null) {
    return {
      provider: loaded.provider.name,
      pullRequestNumber: 0,
      supported: false,
      overallState: "unknown",
      summary: { passed: 0, failed: 0, pending: 0, cancelled: 0, skipped: 0, unknown: 0, total: 0 },
      checks: [],
      message: `Change ${loaded.id} does not have remote.pullRequestNumber metadata.`,
    };
  }
  if (!loaded.provider.capabilities().pullRequestChecks || !loaded.provider.listPullRequestChecks) {
    return unsupportedChecks(loaded.provider, pullNumber);
  }
  return loaded.provider.listPullRequestChecks({
    repoRoot,
    storageRoot: loaded.storageRoot,
    pullRequestNumber: pullNumber,
    frontmatter: loaded.parsed.frontmatter,
  });
}

function checkBlocks(check: RemotePullRequestCheck): boolean {
  return check.state !== "passed" && check.state !== "skipped";
}

function formatCheck(check: RemotePullRequestCheck): string {
  const selector = check.jobId ? ` job=${check.jobId}` : check.runId ? ` run=${check.runId}` : check.checkId ? ` check=${check.checkId}` : "";
  const log = check.logAvailable ? " log=yes" : " log=no";
  const url = check.url ? ` ${check.url}` : "";
  return `${check.state}\t${check.name}${selector}${log}${url}`;
}

export function runPrChecks(id: string, repoRoot = process.cwd()): string {
  const checks = getPrChecks(id, repoRoot);
  const lines = [
    `provider: ${checks.provider}`,
    `pullRequest: ${checks.pullRequestNumber || "unknown"}`,
    `supported: ${String(checks.supported)}`,
    `overall: ${checks.overallState}`,
    `summary: passed=${checks.summary.passed} failed=${checks.summary.failed} pending=${checks.summary.pending} cancelled=${checks.summary.cancelled} skipped=${checks.summary.skipped} unknown=${checks.summary.unknown}`,
  ];
  if (checks.message) lines.push(`message: ${checks.message}`);
  if (checks.checks.length > 0) {
    lines.push("checks:");
    for (const check of checks.checks) lines.push(`- ${formatCheck(check)}`);
  }
  const failed = checks.checks.filter((check) => checkBlocks(check));
  if (failed.some((check) => check.state === "failed" && check.logAvailable)) lines.push(`Next: cy pr fix ${id} --failed`);
  else if (failed.length > 0) lines.push(`Next: cy pr checks ${id}`);
  return lines.join("\n");
}

function selectLoggableCheck(id: string, checks: RemotePullRequestChecks, options: PrLogOptions): RemotePullRequestCheck | null {
  if (!options.failed) return null;
  const failed = checks.checks.filter((check) => check.state === "failed" && check.logAvailable);
  if (failed.length === 1) return failed[0];
  if (failed.length === 0) throw new Error(`No failed loggable remote checks found for ${id}. Run cy pr checks ${id} for details.`);
  throw new Error([
    `Multiple failed loggable checks found for ${id}; choose one:`,
    ...failed.map((check) => `- ${check.name}: ${check.jobId ? `--job ${check.jobId}` : check.runId ? `--run ${check.runId}` : check.id}`),
  ].join("\n"));
}

function getLog(id: string, options: PrLogOptions, repoRoot: string): { checks: RemotePullRequestChecks; log: RemoteCheckLog; selected: RemotePullRequestCheck | null } {
  const loaded = loadChange(id, repoRoot);
  const pullNumber = pullRequestNumber(loaded.parsed.frontmatter);
  if (pullNumber === null) throw new Error(`Change ${loaded.id} does not have remote.pullRequestNumber metadata.`);
  if (!loaded.provider.capabilities().pullRequestCheckLogs || !loaded.provider.getPullRequestCheckLog) {
    throw new Error(`Provider ${loaded.provider.name} does not support remote pull request check logs.`);
  }
  const checks = getPrChecks(loaded.id, repoRoot);
  const selected = selectLoggableCheck(loaded.id, checks, options);
  const jobId = options.jobId ?? selected?.jobId ?? undefined;
  const runId = options.runId ?? selected?.runId ?? undefined;
  if (!jobId && !runId) throw new Error("Pass --job <job-id>, --run <run-id>, or --failed.");
  return {
    checks,
    selected,
    log: loaded.provider.getPullRequestCheckLog({
      repoRoot,
      storageRoot: loaded.storageRoot,
      pullRequestNumber: pullNumber,
      frontmatter: loaded.parsed.frontmatter,
      jobId,
      runId,
    }),
  };
}

export function runPrLogs(id: string, options: PrLogOptions = {}, repoRoot = process.cwd(), cwd = process.cwd()): string {
  const { log } = getLog(id, options, repoRoot);
  if (options.output) {
    const outputPath = path.resolve(cwd, options.output);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, log.content);
    return `Wrote remote check log: ${outputPath}`;
  }
  if (log.contentType === "archive") {
    throw new Error(`Remote check log ${log.selector} is an archive; pass --output <path> to save it.`);
  }
  return log.content.trimEnd();
}

function ensureRemoteChecksSection(body: string): string {
  if (/^# Remote Checks\s*$/mu.test(body)) return body.replace(/\s*$/u, "\n");
  return `${body.replace(/\s*$/u, "")}\n\n# Remote Checks\n`;
}

function appendRemoteCheckEvidence(body: string, input: {
  provider: string;
  checkName: string;
  selector: string;
  logPath: string;
  repoRoot: string;
}): string {
  const relative = path.relative(input.repoRoot, input.logPath);
  return `${ensureRemoteChecksSection(body)}- ${nowIso()}: ${input.provider} ${input.checkName} failed (${input.selector}); log: ${relative}\n`;
}

function writeChangeEverywhere(changePath: string, metadata: WorkspaceMetadata | null, frontmatter: Frontmatter, body: string): void {
  const document = writeFrontmatter(frontmatter, body);
  writeFileSync(changePath, document);
  if (!metadata) return;
  const workspacePath = resolveWorkspaceChangePath(metadata);
  if (existsSync(workspacePath)) writeFileSync(workspacePath, document);
}

export function runPrFix(id: string, options: PrFixOptions = {}, repoRoot = process.cwd()): string {
  const loaded = loadChange(id, repoRoot);
  const metadata = readWorkspaceMetadataFromRoot(loaded.id, repoRoot);
  const { log, selected } = getLog(loaded.id, { ...options, failed: options.failed }, repoRoot);
  const config = loadConfig(repoRoot);
  const remoteLogRoot = path.join(workspacesRoot(repoRoot, config), loaded.id, "logs", "remote");
  const outputPath = path.join(remoteLogRoot, log.fileName);
  const workspaceUsable = Boolean(metadata && existsSync(metadata.path));
  const nextStatus: ChangeStatus = workspaceUsable ? "in_progress" : "changes_requested";
  const nextFrontmatter = {
    ...loaded.parsed.frontmatter,
    status: nextStatus,
    updatedAt: nowIso(),
  };
  const nextBody = appendRemoteCheckEvidence(loaded.parsed.body, {
    provider: log.provider,
    checkName: selected?.name ?? log.selector,
    selector: log.selector,
    logPath: outputPath,
    repoRoot,
  });

  if (!options.dryRun) {
    mkdirSync(remoteLogRoot, { recursive: true });
    writeFileSync(outputPath, log.content);
    writeChangeEverywhere(loaded.path, metadata, nextFrontmatter, nextBody);
  }

  const lines = [
    options.dryRun ? `Dry-run: would reopen ${loaded.id} for remote check repair` : `Reopened ${loaded.id} for remote check repair`,
    `status: ${nextStatus}`,
    `log: ${outputPath}`,
  ];
  if (workspaceUsable && metadata) {
    lines.push(`workspace: ${metadata.path}`, `Next: cd ${path.relative(repoRoot, metadata.path) || metadata.path} && cy slice commit ${loaded.id} -m "<fix check failure>"`);
  } else {
    lines.push(`Next: cy recover ${loaded.id}`, `Or: cy start ${loaded.id}`);
  }
  return lines.join("\n");
}

export function remoteCheckGate(id: string, repoRoot = process.cwd(), frontmatter?: Frontmatter): RemoteCheckGate {
  const loaded = frontmatter ? null : loadChange(id, repoRoot);
  const provider = loaded?.provider ?? createProvider(loadConfig(repoRoot).provider.type, loadConfig(repoRoot));
  const config = loadConfig(repoRoot);
  const effectiveFrontmatter = frontmatter ?? loaded!.parsed.frontmatter;
  const pullNumber = pullRequestNumber(effectiveFrontmatter);
  if (pullNumber === null) {
    return {
      supported: false,
      provider: provider.name,
      pullRequestNumber: null,
      overallState: "missing",
      blockers: [],
      recovery: [],
      checks: null,
    };
  }
  if (!provider.capabilities().pullRequestChecks || !provider.listPullRequestChecks) {
    return {
      supported: false,
      provider: provider.name,
      pullRequestNumber: pullNumber,
      overallState: "unsupported",
      blockers: [],
      recovery: [`Provider ${provider.name} does not support remote PR checks; check gate is skipped.`],
      checks: unsupportedChecks(provider, pullNumber),
    };
  }
  let checks: RemotePullRequestChecks;
  try {
    checks = provider.listPullRequestChecks({
      repoRoot,
      storageRoot: storageRoot(repoRoot, config),
      pullRequestNumber: pullNumber,
      frontmatter: effectiveFrontmatter,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      supported: true,
      provider: provider.name,
      pullRequestNumber: pullNumber,
      overallState: "unknown",
      blockers: [`Could not inspect remote PR checks: ${message}`],
      recovery: [`Run cy pr checks ${id} after fixing provider credentials or network access.`],
      checks: null,
    };
  }
  const blockers = checks.checks
    .filter(checkBlocks)
    .map((check) => `${check.name} is ${check.state}${check.logAvailable && check.state === "failed" ? `; run cy pr fix ${id} --failed` : ""}`);
  if (checks.checks.length === 0) blockers.push(`No remote PR checks are available yet for ${id}; run cy pr checks ${id} again after the provider starts CI.`);
  const recovery = blockers.length === 0 ? [] : [
    `Run cy pr checks ${id} to inspect provider check status.`,
    checks.checks.some((check) => check.state === "failed" && check.logAvailable) ? `Run cy pr fix ${id} --failed to save logs and reopen work.` : "",
  ].filter(Boolean);
  return {
    supported: true,
    provider: provider.name,
    pullRequestNumber: pullNumber,
    overallState: checks.overallState,
    blockers,
    recovery,
    checks,
  };
}

export function assertRemoteChecksPass(id: string, repoRoot = process.cwd(), frontmatter?: Frontmatter): void {
  const gate = remoteCheckGate(id, repoRoot, frontmatter);
  if (!gate.supported || gate.blockers.length === 0) return;
  throw new Error([
    `Remote PR checks are not passing for ${id}.`,
    ...gate.blockers.map((blocker) => `- ${blocker}`),
    "",
    "Recovery:",
    ...gate.recovery.map((item) => `- ${item}`),
  ].join("\n"));
}
