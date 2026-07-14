import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { validateQuickStart } from "../change/quickLifecycle.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { changesRoot, storageRoot, workspacesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import { assertTransition } from "../state/transitions.js";
import { hydrateWorkspace } from "../hydrate/hydrateWorkspace.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import { shellCommandRunner } from "../workspace/commandRunner.js";
import { describeJjWorkspaceCommit } from "../workspace/jjLandingDescriptions.js";
import { workspaceSetupWarnings } from "../workspace/setupGuidance.js";
import { materializeWorkspaceChangeDocument, writeChangeDocument } from "../state/activeChangeDocument.js";
import { ensureWorkspaceMarkerExcludes } from "../workspace/marker.js";
import type { Frontmatter, WorkspaceMetadata } from "../types.js";
import { formatValidationFailure } from "./audit.js";

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function fillPattern(pattern: string, id: string): string {
  return pattern.replaceAll("{id}", id);
}

function jjCommitId(repoRoot: string, revision: string): string {
  return shellCommandRunner("jj", ["log", "--ignore-working-copy", "--at-op=@", "-r", revision, "--no-graph", "-T", "commit_id"], repoRoot);
}

function gitCommitId(repoRoot: string): string | null {
  const result = commandResult("git", ["rev-parse", "--verify", "HEAD"], repoRoot);
  return result.ok ? result.output : null;
}

function commandResult(command: string, args: string[], cwd: string): { ok: true; output: string } | { ok: false; error: string } {
  try {
    return { ok: true, output: shellCommandRunner(command, args, cwd) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function jjPathHasConflicts(repoRoot: string, relativePath: string): boolean {
  const result = commandResult("jj", ["resolve", "--list", "--", relativePath], repoRoot);
  if (result.ok) return result.output.trim().length > 0;
  if (result.error.includes("No conflicts found")) return false;
  throw new Error(`Could not inspect jj conflicts for ${relativePath}: ${result.error}`);
}

function jjPathIsDirty(repoRoot: string, relativePath: string): boolean {
  return shellCommandRunner("jj", ["diff", "--name-only", "--", relativePath], repoRoot).trim().length > 0;
}

function seedJjChangeMetadata(repoRoot: string, id: string, targetRef: string, changePath: string): string | null {
  const relativePath = path.relative(repoRoot, changePath);
  if (jjPathHasConflicts(repoRoot, relativePath)) {
    throw new Error(`Change metadata has conflicts: ${relativePath}. Resolve them before running cy start ${id}.`);
  }
  if (!jjPathIsDirty(repoRoot, relativePath)) return null;

  shellCommandRunner("jj", ["commit", "-m", `${id}: Add change metadata`, "--", relativePath], repoRoot);
  shellCommandRunner("jj", ["bookmark", "set", targetRef, "-r", "@-"], repoRoot);

  if (jjPathIsDirty(repoRoot, relativePath)) {
    throw new Error(`Change metadata is still dirty after seeding ${id}; aborting before workspace creation.`);
  }
  return `Metadata seed: committed ${id} to ${targetRef}`;
}

function describeStartedJjWorkspace(workspacePath: string, id: string, description: string): void {
  try {
    describeJjWorkspaceCommit(workspacePath, "@", description);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error([
      `Could not describe JJ workspace commit for ${id}: ${message}`,
      "",
      "Recovery:",
      `- Run cd ${workspacePath} && jj describe -r @ -m "${description}".`,
      `- Re-run cy verify ${id} from inside the workspace checkout before editing or completing work.`,
    ].join("\n"));
  }
}

type MutationOptions = {
  dryRun?: boolean;
  warmup?: boolean;
};

export function runStart(id: string, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!id) throw new Error("change id is required");
  const config = loadConfig(repoRoot);
  const root = storageRoot(repoRoot, config);
  const filePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!filePath) throw new Error(`Change not found: ${id}`);
  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  const changeId = String(parsed.frontmatter.id ?? id);

  const validation = validateChangeFile(filePath, root, { gate: "start", config });
  if (!validation.valid) throw new Error(formatValidationFailure({
    id: changeId,
    repoRoot,
    gate: "start",
    result: validation,
  }));

  const quickValidation = validateQuickStart(parsed.frontmatter, config);
  if (!quickValidation.valid) throw new Error([
    ...quickValidation.errors,
    "",
    "Recovery:",
    `- Update ${path.relative(repoRoot, filePath)} so quick workflow metadata matches the configured lite workflow policy, or create a planned change for non-low-risk work.`,
    `- Re-run cy start ${changeId}.`,
  ].join("\n"));
  const status = String(parsed.frontmatter.status ?? "");
  const noopSyncSatisfied = status === "ready" && config.provider.type === "noop";
  if (status === "ready" && config.provider.type !== "noop") {
    throw new Error([
      `Change ${changeId} must be synced before start when provider ${config.provider.type} is configured.`,
      "",
      "Recovery:",
      `- Run cy sync ${changeId}.`,
      `- Re-run cy start ${changeId}.`,
    ].join("\n"));
  }
  assertTransition(status, "in_progress", `Start ${changeId}`);
  const startFrontmatter: Frontmatter = noopSyncSatisfied
    ? {
        ...parsed.frontmatter,
        remote: {
          ...asRecord(parsed.frontmatter.remote),
          provider: "noop",
          issueNumber: null,
          issueUrl: null,
          pullRequestNumber: null,
          pullRequestUrl: null,
        },
      }
    : parsed.frontmatter;
  if (noopSyncSatisfied && !mutationOptions.dryRun) {
    writeFileSync(filePath, writeFrontmatter(startFrontmatter, parsed.body));
  }

  const engineName = String(asRecord(startFrontmatter.workspace).engine ?? config.vcs.engine);
  const targetRef = String(asRecord(startFrontmatter.base).revision ?? config.project.defaultBase);
  const seedDescription = `${changeId}: ${String(startFrontmatter.title ?? changeId)}`;
  const workspacePath = path.resolve(repoRoot, config.storage.root, config.storage.workspacesDir, fillPattern(config.workspace.pathPattern, changeId));
  const workspaceRootPath = path.join(workspacesRoot(repoRoot, config), changeId);
  const workspaceRootExisted = existsSync(workspaceRootPath);
  const workspaceName = String(asRecord(parsed.frontmatter.workspace).name ?? config.workspace.namePattern.replace("{id}", changeId));
  const workspaceRelativePath = path.relative(repoRoot, workspacePath);
  const workspaceChangePath = path.join(workspacePath, path.relative(repoRoot, filePath));
  const metadataSeedMessage = engineName === "jj" && !mutationOptions.dryRun ? seedJjChangeMetadata(repoRoot, changeId, targetRef, filePath) : null;
  const gitBaseCommitId = engineName === "git-worktree" ? gitCommitId(repoRoot) : null;
  const metadata: WorkspaceMetadata = {
    changeId,
    engine: engineName,
    name: workspaceName,
    path: workspacePath,
    repoRoot,
    changePath: filePath,
    workspaceChangePath,
    createdAt: new Date().toISOString(),
    branch: String(asRecord(startFrontmatter.branch).name ?? `cy/${changeId}`),
    ...(engineName === "jj"
      ? {
          targetRef,
          baseCommitId: jjCommitId(repoRoot, targetRef),
          seedDescription,
        }
      : engineName === "git-worktree"
        ? {
            targetRef,
            ...(gitBaseCommitId ? { baseCommitId: gitBaseCommitId } : {}),
          }
        : {}),
  };

  if (mutationOptions.dryRun) {
    return `Dry-run: would start ${changeId} in ${workspaceRelativePath}`;
  }

  const engine = createWorkspaceEngine(engineName);
  let createdMetadata: WorkspaceMetadata | null = null;
  let hydrateResult: ReturnType<typeof hydrateWorkspace> | null = null;
  try {
    createdMetadata = engine.create({ repoRoot, workspacePath, metadata, neverCopy: config.workspace.hydrate.neverCopy });
    if (engineName === "jj" || engineName === "git-worktree") ensureWorkspaceMarkerExcludes(createdMetadata.path);
    const metadataPath = path.join(workspacesRoot(repoRoot, config), changeId, "metadata.json");
    mkdirSync(path.dirname(metadataPath), { recursive: true });
    writeFileSync(metadataPath, `${JSON.stringify(createdMetadata, null, 2)}\n`);
    writeFileSync(path.join(workspacePath, ".changeyard-workspace.json"), `${JSON.stringify({ changeId, metadataPath }, null, 2)}\n`);
    hydrateResult = hydrateWorkspace(config, createdMetadata, { warmup: mutationOptions.warmup });

    const nextFrontmatter: Frontmatter = {
      ...parsed.frontmatter,
      ...startFrontmatter,
      status: "in_progress",
      updatedAt: new Date().toISOString(),
      workspace: {
        ...asRecord(startFrontmatter.workspace),
        engine: engine.name,
        name: workspaceName,
        path: workspaceRelativePath,
      },
    };
    materializeWorkspaceChangeDocument(createdMetadata, { status: "in_progress" });
    if (engineName !== "jj") writeChangeDocument(filePath, nextFrontmatter, parsed.body);
    if (engineName === "jj") describeStartedJjWorkspace(workspacePath, changeId, seedDescription);
  } catch (error) {
    if (!workspaceRootExisted) rmSync(workspaceRootPath, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    throw new Error([
      `Failed to start ${changeId}: ${message}`,
      "",
      "Recovery:",
      workspaceRootExisted
        ? `- Run cy repair ${changeId} --workspace to inspect and repair the existing workspace state.`
        : `- Partial workspace state was removed from ${workspaceRootPath}.`,
      `- Re-run cy start ${changeId}.`,
    ].join("\n"));
  }

  const setupWarnings = workspaceSetupWarnings(workspacePath);
  return [
    `Started ${changeId} in ${workspaceRelativePath}`,
    ...(noopSyncSatisfied ? ["Sync: noop provider satisfied locally"] : []),
    ...(metadataSeedMessage ? [metadataSeedMessage] : []),
    ...(createdMetadata?.targetRef ? [`Base: ${createdMetadata.targetRef} ${createdMetadata.baseCommitId ?? ""}`.trim()] : []),
    ...(createdMetadata?.workspaceChangeId ? [`Workspace change: ${createdMetadata.workspaceChangeId}`] : []),
    ...(engineName === "jj" ? [`Workspace description: ${seedDescription}`] : []),
    `Next: cd ${workspaceRelativePath}`,
    `Hydration: copied ${hydrateResult?.copied.length ?? 0}, skipped ${hydrateResult?.skipped.length ?? 0}`,
    ...(hydrateResult?.warmup.status !== "skipped" ? [`Warmup: ${hydrateResult?.warmup.status}${hydrateResult?.warmup.logPath ? ` (${hydrateResult.warmup.logPath})` : ""}`] : []),
    ...(setupWarnings.length ? ["", ...setupWarnings] : []),
    `Then: cy verify ${changeId}`,
  ].join("\n");
}
