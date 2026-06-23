import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { stripJsonComments } from "../config/jsonc.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { changesRoot, storageRoot, workspacesRoot } from "../paths.js";
import { createProvider } from "../providers/index.js";
import type {
  ChangeProvider,
  RemoteCheckLog,
  RemoteCheckState,
  RemotePullRequestAutoMerge,
  RemotePullRequestCheck,
  RemotePullRequestChecks,
} from "../providers/ChangeProvider.js";
import { findChangeFile } from "../state/id.js";
import { assertTransition } from "../state/transitions.js";
import type { ChangeStatus, Frontmatter, ParsedMarkdown, WorkspaceMetadata } from "../types.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import { resolveWorkspaceChangePath } from "../workspace/marker.js";
import { finalDescriptionMessage } from "./describe.js";
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

export type PrNewOptions = {
  message?: string;
  file?: string;
  draft?: boolean;
  ready?: boolean;
  target?: string;
  dryRun?: boolean;
};

export type PrLifecycleOptions = {
  dryRun?: boolean;
  off?: boolean;
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

type PrTarget = {
  label: string;
  provider: ChangeProvider;
  storageRoot: string;
  pullRequestNumber: number;
  changePath?: string;
  parsed?: ParsedMarkdown;
  id?: string;
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

function loadChangeOrNull(id: string, repoRoot: string): LoadedChange | null {
  const config = loadConfig(repoRoot);
  const changePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!changePath) return null;
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

function resolvePrTarget(selector: string, repoRoot: string): PrTarget {
  const loaded = loadChangeOrNull(selector, repoRoot);
  if (loaded) {
    const pullNumber = pullRequestNumber(loaded.parsed.frontmatter);
    if (pullNumber === null) throw new Error(`Change ${loaded.id} does not have remote.pullRequestNumber metadata.`);
    return {
      label: loaded.id,
      provider: loaded.provider,
      storageRoot: loaded.storageRoot,
      pullRequestNumber: pullNumber,
      changePath: loaded.path,
      parsed: loaded.parsed,
      id: loaded.id,
    };
  }
  if (/^\d+$/u.test(selector)) {
    const config = loadConfig(repoRoot);
    return {
      label: `PR ${selector}`,
      provider: createProvider(config.provider.type, config),
      storageRoot: storageRoot(repoRoot, config),
      pullRequestNumber: Number(selector),
    };
  }
  throw new Error(`Change or PR not found: ${selector}`);
}

function updateRemoteFrontmatter(target: PrTarget, patch: Frontmatter): void {
  if (!target.changePath || !target.parsed) return;
  writeFileSync(target.changePath, writeFrontmatter({
    ...target.parsed.frontmatter,
    updatedAt: nowIso(),
    remote: {
      ...asRecord(target.parsed.frontmatter.remote),
      ...patch,
    },
  }, target.parsed.body));
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

function activeChangeForPr(id: string, repoRoot: string): { loaded: LoadedChange; metadata: WorkspaceMetadata | null; changePath: string; parsed: ParsedMarkdown } {
  const loaded = loadChange(id, repoRoot);
  const metadata = readWorkspaceMetadataFromRoot(loaded.id, repoRoot);
  const workspacePath = metadata?.engine === "jj" ? resolveWorkspaceChangePath(metadata) : null;
  const changePath = workspacePath && existsSync(workspacePath) ? workspacePath : loaded.path;
  return {
    loaded,
    metadata,
    changePath,
    parsed: parseFrontmatter(readFileSync(changePath, "utf8")),
  };
}

function writePrBoundaryChange(rootPath: string, activePath: string, frontmatter: Frontmatter, body: string): void {
  const document = writeFrontmatter(frontmatter, body);
  writeFileSync(activePath, document);
  if (activePath !== rootPath) writeFileSync(rootPath, document);
}

function commonTemplatePaths(repoRoot: string): string[] {
  const direct = [
    ".github/pull_request_template.md",
    ".forgejo/PULL_REQUEST_TEMPLATE.md",
    ".gitea/PULL_REQUEST_TEMPLATE.md",
  ];
  const directories = [
    ".github/PULL_REQUEST_TEMPLATE",
    ".gitlab/merge_request_templates",
    ".forgejo/PULL_REQUEST_TEMPLATE",
    ".gitea/PULL_REQUEST_TEMPLATE",
  ];
  const files = direct
    .map((entry) => path.join(repoRoot, entry))
    .filter((entry) => existsSync(entry));
  for (const directory of directories.map((entry) => path.join(repoRoot, entry))) {
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory)) {
      if (entry.endsWith(".md")) files.push(path.join(directory, entry));
    }
  }
  return [...new Set(files)].sort();
}

function relativeTemplate(repoRoot: string, templatePath: string): string {
  const absolute = path.resolve(repoRoot, templatePath);
  const relative = path.relative(repoRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`PR template must be inside the repository: ${templatePath}`);
  if (!existsSync(absolute)) throw new Error(`PR template not found: ${relative}`);
  return relative;
}

function selectedTemplatePath(repoRoot: string): string | null {
  const config = loadConfig(repoRoot);
  const templatePath = config.pullRequests?.templatePath;
  if (typeof templatePath !== "string" || !templatePath.trim()) return null;
  const absolute = path.resolve(repoRoot, templatePath);
  return existsSync(absolute) ? absolute : null;
}

function writeSelectedTemplate(repoRoot: string, templatePath: string, dryRun: boolean | undefined): string {
  const relative = relativeTemplate(repoRoot, templatePath);
  const localConfigPath = path.join(repoRoot, ".changeyard", "config.local.jsonc");
  const current = existsSync(localConfigPath)
    ? JSON.parse(stripJsonComments(readFileSync(localConfigPath, "utf8"))) as Frontmatter
    : {};
  const next = {
    ...current,
    pullRequests: {
      ...asRecord(current.pullRequests),
      templatePath: relative,
    },
  };
  if (!dryRun) {
    mkdirSync(path.dirname(localConfigPath), { recursive: true });
    writeFileSync(localConfigPath, `${JSON.stringify(next, null, 2)}\n`);
  }
  return relative;
}

function parseReviewMessage(raw: string): { title: string; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  const [firstLine = "", ...rest] = normalized.split("\n");
  const title = firstLine.trim();
  if (!title) throw new Error("PR message title is empty");
  return { title, body: rest.join("\n").trim() };
}

function reviewMessageForNew(input: {
  changeId: string;
  metadata: WorkspaceMetadata;
  repoRoot: string;
  options: PrNewOptions;
  cwd: string;
}): { title: string; body: string; source: string } {
  if (input.options.message) return { ...parseReviewMessage(input.options.message), source: "-m" };
  if (input.options.file) return { ...parseReviewMessage(readFileSync(path.resolve(input.cwd, input.options.file), "utf8")), source: "-F" };
  const generated = finalDescriptionMessage(input.changeId, input.metadata, input.repoRoot, input.options.target);
  const templatePath = selectedTemplatePath(input.repoRoot);
  if (templatePath) {
    const template = readFileSync(templatePath, "utf8").trim();
    return {
      title: generated.subject,
      body: [template, generated.message.trim()].filter(Boolean).join("\n\n"),
      source: path.relative(input.repoRoot, templatePath),
    };
  }
  return { title: generated.subject, body: generated.message.trim(), source: "generated" };
}

export function runPrTemplate(templatePath: string | undefined, options: { dryRun?: boolean } = {}, repoRoot = process.cwd()): string {
  if (templatePath) {
    const selected = writeSelectedTemplate(repoRoot, templatePath, options.dryRun);
    return options.dryRun ? `Dry-run: would set PR template to ${selected}` : `Set PR template: ${selected}`;
  }
  const config = loadConfig(repoRoot);
  const selected = typeof config.pullRequests?.templatePath === "string" ? config.pullRequests.templatePath : null;
  const templates = commonTemplatePaths(repoRoot).map((entry) => path.relative(repoRoot, entry));
  if (templates.length === 0) return selected ? `selected: ${selected}\nNo PR templates found` : "No PR templates found";
  return [
    ...(selected ? [`selected: ${selected}`] : []),
    "templates:",
    ...templates.map((entry) => `- ${entry}`),
  ].join("\n");
}

export function runPrNew(id: string, options: PrNewOptions = {}, repoRoot = process.cwd(), cwd = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  if (options.draft && options.ready) throw new Error("Choose only one of --draft or --ready.");
  const config = loadConfig(repoRoot);
  const { loaded, metadata, changePath, parsed } = activeChangeForPr(id, repoRoot);
  const changeId = String(parsed.frontmatter.id ?? loaded.id);
  const currentStatus = String(parsed.frontmatter.status ?? "unknown");
  if (pullRequestNumber(parsed.frontmatter) !== null) {
    throw new Error([
      `Change ${changeId} already has PR metadata.`,
      "",
      "Recovery:",
      `- Run cy pr checks ${changeId} to inspect remote checks.`,
      `- Run cy pr set-ready ${changeId} or cy pr auto-merge ${changeId} for PR lifecycle changes.`,
    ].join("\n"));
  }
  if (currentStatus !== "ready_for_pr") throw new Error(`Change ${changeId} must be ready_for_pr before creating a PR; current status is ${currentStatus}`);
  if (!metadata) throw new Error(`Workspace metadata not found for ${changeId}; run cy workspace status ${changeId}`);
  if (!loaded.provider.createPullRequest) throw new Error(`Provider ${loaded.provider.name} does not support pull requests; use cy complete ${changeId} --no-pr`);
  assertTransition(currentStatus, "pr_open", `Create PR ${changeId}`);

  const branch = String(metadata.branch ?? asRecord(parsed.frontmatter.branch).name ?? `cy/${changeId}`);
  const base = options.target ?? String(asRecord(parsed.frontmatter.base).revision ?? config.project.defaultBase);
  const draft = options.ready ? false : options.draft ? true : config.pullRequests?.draft ?? true;
  const message = reviewMessageForNew({ changeId, metadata, repoRoot, options, cwd });

  if (options.dryRun) {
    return [
      `Dry-run: would create PR for ${changeId}`,
      `branch: ${branch}`,
      `base: ${base}`,
      `draft: ${String(draft)}`,
      `messageSource: ${message.source}`,
      `title: ${message.title}`,
    ].join("\n");
  }

  createWorkspaceEngine(metadata.engine).publish({ cwd: metadata.path, metadata, branch });
  const pr = loaded.provider.createPullRequest({
    repoRoot,
    storageRoot: loaded.storageRoot,
    changePath,
    frontmatter: parsed.frontmatter,
    body: message.body,
    title: message.title,
    branch,
    base,
    draft,
  });
  const nextFrontmatter: Frontmatter = {
    ...parsed.frontmatter,
    status: "pr_open",
    updatedAt: nowIso(),
    remote: {
      ...asRecord(parsed.frontmatter.remote),
      provider: pr.provider,
      pullRequestNumber: pr.pullRequestNumber,
      pullRequestUrl: pr.pullRequestUrl,
      draft,
      autoMerge: pr.autoMerge ?? false,
    },
  };
  writePrBoundaryChange(loaded.path, changePath, nextFrontmatter, parsed.body);
  const next = loaded.provider.capabilities().pullRequestChecks ? `Next: cy pr checks ${changeId}` : `Next: cy review start ${changeId}`;
  return [
    `Created PR for ${changeId}`,
    `PR: ${pr.pullRequestUrl ?? pr.pullRequestNumber ?? "unknown"}`,
    `draft: ${String(draft)}`,
    next,
  ].join("\n");
}

function lifecycleInput(target: PrTarget, repoRoot: string) {
  return {
    repoRoot,
    storageRoot: target.storageRoot,
    pullRequestNumber: target.pullRequestNumber,
    frontmatter: target.parsed?.frontmatter,
  };
}

function remotePatchFromPr(pr: { provider: string; pullRequestNumber: number | null; pullRequestUrl: string | null; draft?: boolean | null; autoMerge?: boolean | null }, patch: Frontmatter = {}): Frontmatter {
  return {
    provider: pr.provider,
    pullRequestNumber: pr.pullRequestNumber,
    pullRequestUrl: pr.pullRequestUrl,
    ...(typeof pr.draft === "boolean" ? { draft: pr.draft } : {}),
    ...(typeof pr.autoMerge === "boolean" ? { autoMerge: pr.autoMerge } : {}),
    ...patch,
  };
}

function unsupportedLifecycle(provider: ChangeProvider, capability: keyof ReturnType<ChangeProvider["capabilities"]>, action: string): string | null {
  if (provider.capabilities()[capability]) return null;
  return `Provider ${provider.name} does not support ${action}.`;
}

export function runPrSetDraft(selector: string, options: PrLifecycleOptions = {}, repoRoot = process.cwd()): string {
  const target = resolvePrTarget(selector, repoRoot);
  const unsupported = unsupportedLifecycle(target.provider, "pullRequestDraftState", "pull request draft state changes");
  if (unsupported || !target.provider.setPullRequestDraftState) {
    return [
      `unsupported: ${target.provider.name}`,
      unsupported ?? `Provider ${target.provider.name} does not implement pull request draft state changes.`,
    ].join("\n");
  }
  if (options.dryRun) {
    return [
      `Dry-run: would mark ${target.label} as draft`,
      `pullRequest: ${target.pullRequestNumber}`,
    ].join("\n");
  }
  const pr = target.provider.setPullRequestDraftState({
    ...lifecycleInput(target, repoRoot),
    draft: true,
  });
  updateRemoteFrontmatter(target, remotePatchFromPr(pr, { draft: true }));
  return [
    `Marked ${target.label} as draft`,
    `PR: ${pr.pullRequestUrl ?? pr.pullRequestNumber ?? target.pullRequestNumber}`,
  ].join("\n");
}

export function runPrSetReady(selector: string, options: PrLifecycleOptions = {}, repoRoot = process.cwd()): string {
  const target = resolvePrTarget(selector, repoRoot);
  const unsupported = unsupportedLifecycle(target.provider, "pullRequestDraftState", "pull request draft state changes");
  if (unsupported || !target.provider.setPullRequestDraftState) {
    return [
      `unsupported: ${target.provider.name}`,
      unsupported ?? `Provider ${target.provider.name} does not implement pull request draft state changes.`,
    ].join("\n");
  }
  if (options.dryRun) {
    return [
      `Dry-run: would mark ${target.label} ready for review`,
      `pullRequest: ${target.pullRequestNumber}`,
    ].join("\n");
  }
  const pr = target.provider.setPullRequestDraftState({
    ...lifecycleInput(target, repoRoot),
    draft: false,
  });
  updateRemoteFrontmatter(target, remotePatchFromPr(pr, { draft: false }));
  return [
    `Marked ${target.label} ready for review`,
    `PR: ${pr.pullRequestUrl ?? pr.pullRequestNumber ?? target.pullRequestNumber}`,
    target.id ? `Next: cy pr checks ${target.id}` : "Next: cy pr checks <change-id>",
  ].join("\n");
}

function formatAutoMergeResult(label: string, result: RemotePullRequestAutoMerge): string {
  return [
    result.supported ? `${result.enabled ? "Enabled" : "Disabled"} auto-merge for ${label}` : `unsupported: ${result.provider}`,
    `PR: ${result.pullRequestUrl ?? result.pullRequestNumber ?? "unknown"}`,
    ...(result.message ? [`message: ${result.message}`] : []),
  ].join("\n");
}

export function runPrAutoMerge(selector: string, options: PrLifecycleOptions = {}, repoRoot = process.cwd()): string {
  const target = resolvePrTarget(selector, repoRoot);
  const enabled = !options.off;
  const unsupported = unsupportedLifecycle(target.provider, "pullRequestAutoMerge", "pull request auto-merge changes");
  if (unsupported || !target.provider.setPullRequestAutoMerge) {
    return [
      `unsupported: ${target.provider.name}`,
      unsupported ?? `Provider ${target.provider.name} does not implement pull request auto-merge changes.`,
    ].join("\n");
  }
  if (options.dryRun) {
    return [
      `Dry-run: would ${enabled ? "enable" : "disable"} auto-merge for ${target.label}`,
      `pullRequest: ${target.pullRequestNumber}`,
    ].join("\n");
  }
  const result = target.provider.setPullRequestAutoMerge({
    ...lifecycleInput(target, repoRoot),
    enabled,
  });
  if (result.supported) updateRemoteFrontmatter(target, {
    provider: result.provider,
    pullRequestNumber: result.pullRequestNumber,
    pullRequestUrl: result.pullRequestUrl,
    autoMerge: result.enabled,
  });
  return formatAutoMergeResult(target.label, result);
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
