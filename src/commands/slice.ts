import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { appendManualCheckRecord } from "../checks/runChecks.js";
import { buildCommitDescription } from "../change/commitDescriptions.js";
import { appendSliceRecord, parseSliceRecords, replaceSliceRecords, type ChangeSliceRecord } from "../change/slices.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { changesRoot, workspacesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import type { Frontmatter, ManualCheckRecord, WorkspaceMetadata } from "../types.js";
import { ensureWorkspaceMarkerExcludes, readWorkspaceMetadata, resolveWorkspaceChangePath } from "../workspace/marker.js";
import { inspectWorkspaceChanges } from "../workspace/changeInspection.js";
import { runVerify } from "./verify.js";
import { readWorkspaceMetadataFromRoot } from "./workspace.js";

export type SliceCommitOptions = {
  message?: string;
  body?: string;
  bodyFile?: string;
  checks?: string[];
  dryRun?: boolean;
};

export type SliceCommitResult = {
  id: string;
  message: string;
  vcs: "jj" | "git";
  sliceId: string;
  commitId: string | null;
  validation: string[];
  changePath: string;
};

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function run(command: string, args: string[], cwd: string): { ok: boolean; stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
    status: result.status,
  };
}

function runShell(command: string, cwd: string): { ok: boolean; output: string; status: number | null } {
  const result = spawnSync(command, { cwd, encoding: "utf8", shell: true });
  return {
    ok: result.status === 0,
    output: `${String(result.stdout ?? "")}${String(result.stderr ?? "")}`,
    status: result.status,
  };
}

function requireOk(result: ReturnType<typeof run>, message: string): string {
  if (!result.ok) throw new Error(result.stderr.trim() || result.stdout.trim() || message);
  return result.stdout.trim();
}

function normalizeMessage(changeId: string, message: string | undefined): string {
  const trimmed = message?.trim();
  if (!trimmed) throw new Error("slice commit message is required; pass -m \"<title>\"");
  const prefixMatch = /^([A-Z]+-\d+):\s+/.exec(trimmed);
  if (prefixMatch && prefixMatch[1] !== changeId) {
    throw new Error(`slice commit message must start with ${changeId}:, not ${prefixMatch[1]}:`);
  }
  return trimmed.startsWith(`${changeId}: `) ? trimmed : `${changeId}: ${trimmed}`;
}

function shortTitle(changeId: string, message: string): string {
  return message.startsWith(`${changeId}: `) ? message.slice(`${changeId}: `.length).trim() : message.trim();
}

function jjValue(cwd: string, revision: string, template: string): string {
  return requireOk(run("jj", ["--color=never", "log", "--ignore-working-copy", "--at-op=@", "-r", revision, "--no-graph", "-T", template], cwd), `Could not read JJ ${template}`);
}

function gitHead(cwd: string): string {
  return requireOk(run("git", ["rev-parse", "--verify", "HEAD"], cwd), "Could not read Git HEAD");
}

function gitShort(cwd: string, revision: string): string {
  return requireOk(run("git", ["rev-parse", "--short", revision], cwd), "Could not shorten Git commit id");
}

function changedFiles(metadata: WorkspaceMetadata): string[] {
  return inspectWorkspaceChanges(metadata, loadConfig(metadata.repoRoot)).workingFiles;
}

function workspaceDirty(metadata: WorkspaceMetadata): boolean {
  if (metadata.engine === "jj") {
    return changedFiles(metadata).length > 0;
  }
  if (metadata.engine === "git-worktree") {
    return changedFiles(metadata).length > 0;
  }
  throw new Error("cy slice commit requires a JJ or Git workspace; plain-copy workspaces do not support slice commits");
}

function activeChangePath(metadata: WorkspaceMetadata): string {
  if (metadata.engine === "jj") return resolveWorkspaceChangePath(metadata);
  const relative = path.relative(metadata.repoRoot, metadata.changePath);
  const workspacePath = path.join(metadata.path, relative);
  return existsSync(workspacePath) ? workspacePath : metadata.changePath;
}

function recordChecks(
  metadata: WorkspaceMetadata,
  commands: string[],
  dryRun: boolean | undefined,
): string[] {
  if (commands.length === 0) return [];
  const config = loadConfig(metadata.repoRoot);
  const logPath = path.join(workspacesRoot(metadata.repoRoot, config), metadata.changeId, "logs", "checks.log");
  const validation: string[] = [];
  for (const command of commands) {
    if (dryRun) {
      validation.push(`${command}: dry-run`);
      continue;
    }
    const result = runShell(command, metadata.path);
    const status = result.ok ? "passed" : "failed";
    const record: ManualCheckRecord = {
      command,
      status,
      exitCode: result.status,
      cwd: metadata.path,
      recordedAt: new Date().toISOString(),
    };
    appendManualCheckRecord(logPath, record, result.output);
    validation.push(`${command}: ${status}`);
    if (!result.ok) throw new Error(`Slice check failed: ${command}\n\nRecovery:\n- Inspect ${logPath}.\n- Fix the issue and re-run cy slice commit ${metadata.changeId} -m \"<title>\".`);
  }
  return validation;
}

function writeWorkspaceMetadata(repoRoot: string, id: string, metadata: WorkspaceMetadata): void {
  const config = loadConfig(repoRoot);
  const metadataPath = path.join(workspacesRoot(repoRoot, config), id, "metadata.json");
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

function withMessageFile<T>(message: string, callback: (file: string) => T): T {
  const directory = mkdtempSync(path.join(tmpdir(), "cy-commit-"));
  const file = path.join(directory, "message.txt");
  try {
    writeFileSync(file, message);
    return callback(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function commitJj(metadata: WorkspaceMetadata, message: string, dryRun: boolean | undefined): { id: string; commitId: string } {
  const sliceChangeId = jjValue(metadata.path, "@", "change_id.short()");
  if (!dryRun) {
    requireOk(run("jj", ["commit", "-m", message], metadata.path), "Could not commit JJ slice");
    requireOk(run("jj", ["describe", "-r", "@", "-m", `${metadata.changeId}: workspace`], metadata.path), "Could not describe fresh JJ workspace change");
  }
  const commitId = dryRun ? jjValue(metadata.path, "@", "commit_id.short()") : jjValue(metadata.path, sliceChangeId, "commit_id.short()");
  return { id: sliceChangeId, commitId };
}

function commitGit(metadata: WorkspaceMetadata, message: string, dryRun: boolean | undefined, changePath: string): { id: string; commitId: string } {
  if (!dryRun) {
    ensureWorkspaceMarkerExcludes(metadata.path);
    requireOk(run("git", ["add", "-A"], metadata.path), "Could not stage Git workspace changes");
    run("git", ["reset", "-q", "--", ".changeyard-workspace.json", ".changeyard-hydrate.json"], metadata.path);
    withMessageFile(message, (messageFile) => {
      requireOk(run("git", ["-c", "commit.gpgsign=false", "commit", "--no-gpg-sign", "-F", messageFile], metadata.path), "Could not commit Git slice");
    });
    const head = gitHead(metadata.path);
    const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
    const records = parseSliceRecords(parsed.body);
    const last = records.at(-1);
    if (last && last.id === "pending") {
      last.id = gitShort(metadata.path, head);
      last.commitId = head.slice(0, 12);
      const nextBody = replaceSliceRecords(parsed.body, records);
      writeFileSync(changePath, writeFrontmatter(parsed.frontmatter, nextBody));
      requireOk(run("git", ["add", "-f", "--", path.relative(metadata.path, changePath)], metadata.path), "Could not stage Git slice metadata");
      withMessageFile(message, (messageFile) => {
        requireOk(run("git", ["-c", "commit.gpgsign=false", "commit", "--amend", "--no-gpg-sign", "-F", messageFile], metadata.path), "Could not amend Git slice metadata");
      });
    }
  }
  const head = gitHead(metadata.path);
  return { id: gitShort(metadata.path, head), commitId: head.slice(0, 12) };
}

export function runSliceCommit(id: string, options: SliceCommitOptions = {}, cwd = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const metadata = readWorkspaceMetadata(id, cwd);
  const changeId = metadata.changeId;
  const subject = normalizeMessage(changeId, options.message);
  runVerify(changeId, cwd);
  if (!workspaceDirty(metadata)) throw new Error(`No workspace changes detected for ${changeId}; finish the slice only after changing code or docs.`);

  const checks = options.checks ?? [];
  const validation = recordChecks(metadata, checks, options.dryRun);
  const vcs = metadata.engine === "jj" ? "jj" : metadata.engine === "git-worktree" ? "git" : null;
  if (!vcs) throw new Error("cy slice commit requires a JJ or Git workspace; plain-copy workspaces do not support slice commits");
  const changePath = activeChangePath(metadata);
  const parsed = parseFrontmatter(readFileSync(changePath, "utf8"));
  const title = shortTitle(changeId, subject);
  const files = changedFiles(metadata);
  const extraBody = [
    options.bodyFile ? readFileSync(path.resolve(cwd, options.bodyFile), "utf8").trim() : "",
    options.body?.trim() ?? "",
  ].filter(Boolean).join("\n");
  const description = buildCommitDescription({
    changeId,
    title: String(parsed.frontmatter.title ?? changeId),
    subjectTitle: title,
    body: parsed.body,
    slices: [],
    validation,
    files,
    notes: [`Slice: ${title}`],
    extraBody,
  });
  const pendingSliceId = vcs === "jj" ? jjValue(metadata.path, "@", "change_id.short()") : "pending";
  const record: ChangeSliceRecord = {
    title,
    vcs,
    id: pendingSliceId,
    commitId: null,
    validation,
    manualReviewStatus: "pending",
    notes: "None.",
    descriptionSummary: description.sourceSections.join(", "),
    createdAt: new Date().toISOString(),
  };

  if (!options.dryRun) {
    writeFileSync(changePath, writeFrontmatter(parsed.frontmatter, appendSliceRecord(parsed.body, record)));
  }
  const slice = vcs === "jj" ? commitJj(metadata, description.message, options.dryRun) : commitGit(metadata, description.message, options.dryRun, changePath);

  if (!options.dryRun) {
    writeWorkspaceMetadata(metadata.repoRoot, changeId, {
      ...metadata,
      lastSliceId: slice.id,
      lastSliceCommitId: slice.commitId,
      lastSliceTitle: record.title,
      lastSliceCommittedAt: record.createdAt,
      ...(vcs === "jj"
        ? {
            workspaceChangeId: jjValue(metadata.path, "@", "change_id.short()"),
            workspaceCommitId: jjValue(metadata.path, "@", "commit_id"),
          }
        : {
            workspaceCommitId: gitHead(metadata.path),
          }),
    });
  }

  return [
    options.dryRun ? `Dry-run: would commit slice for ${changeId}` : `Committed slice for ${changeId}`,
    `Message: ${description.subject}`,
    `Description: ${description.sourceSections.join(", ")}`,
    `Slice: ${slice.id}${slice.commitId ? ` (${slice.commitId})` : ""}`,
    `Validation: ${validation.length ? validation.join("; ") : "not recorded"}`,
    vcs === "jj" ? "Next: review this slice, then continue in the fresh empty @ only after the next requested change." : "Next: review this slice, then continue only after the next requested change.",
  ].join("\n");
}

export function sliceSummary(id: string, repoRoot = process.cwd()): { id: string; records: ChangeSliceRecord[]; changePath: string } {
  const metadata = readWorkspaceMetadataFromRoot(id, repoRoot);
  const config = loadConfig(repoRoot);
  const workspaceChangePath = metadata ? activeChangePath(metadata) : null;
  const changePath = workspaceChangePath && existsSync(workspaceChangePath)
    ? workspaceChangePath
    : path.join(repoRoot, config.storage.root, config.storage.changesDir, `${id}.md`);
  const resolvedChangePath = existsSync(changePath)
    ? changePath
    : (() => {
        const found = findChangeFile(changesRoot(repoRoot, config), id);
        if (!found) throw new Error(`Change not found: ${id}`);
        return found;
      })();
  const parsed = parseFrontmatter(readFileSync(resolvedChangePath, "utf8"));
  return { id: String(parsed.frontmatter.id ?? id), records: parseSliceRecords(parsed.body), changePath: resolvedChangePath };
}

export function runReviewSlices(id: string, repoRoot = process.cwd()): string {
  const summary = sliceSummary(id, repoRoot);
  if (summary.records.length === 0) return `No slices recorded for ${summary.id}`;
  return [
    `Slices for ${summary.id}: ${summary.records.length}`,
    ...summary.records.map((record, index) => `${index + 1}. ${record.title} — ${record.id}${record.commitId ? ` (${record.commitId})` : ""}; validation: ${record.validation.length ? record.validation.join("; ") : "not recorded"}; review: ${record.manualReviewStatus}`),
  ].join("\n");
}

export function runSummarizeSlices(id: string, repoRoot = process.cwd()): string {
  const summary = sliceSummary(id, repoRoot);
  if (summary.records.length === 0) return `No slices recorded for ${summary.id}`;
  return [
    `Slice summary for ${summary.id}:`,
    ...summary.records.map((record) => `- ${record.title}: ${record.id}${record.validation.length ? `; ${record.validation.join("; ")}` : ""}`),
  ].join("\n");
}

export function runDiffSlice(revision: string, repoRoot = process.cwd()): string {
  if (!revision?.trim()) throw new Error("slice commit or change id is required");
  const config = loadConfig(repoRoot);
  if (config.vcs.engine === "jj") {
    const result = run("jj", ["show", "--git", "-r", revision], repoRoot);
    if (result.ok) return result.stdout.trim();
  }
  const gitResult = run("git", ["show", "--stat", "--patch", revision], repoRoot);
  if (gitResult.ok) return gitResult.stdout.trim();
  const jjResult = run("jj", ["show", "--git", "-r", revision], repoRoot);
  if (jjResult.ok) return jjResult.stdout.trim();
  throw new Error(`Could not diff slice ${revision}`);
}
