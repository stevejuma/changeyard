import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

type MutationOptions = {
  dryRun?: boolean;
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
  assertTransition(status, "in_progress", `Start ${changeId}`);

  const engineName = String(asRecord(parsed.frontmatter.workspace).engine ?? config.vcs.engine);
  const targetRef = String(asRecord(parsed.frontmatter.base).revision ?? config.project.defaultBase);
  const seedDescription = `${changeId}: ${String(parsed.frontmatter.title ?? changeId)}`;
  const workspacePath = path.resolve(repoRoot, config.storage.root, config.storage.workspacesDir, fillPattern(config.workspace.pathPattern, changeId));
  const workspaceName = String(asRecord(parsed.frontmatter.workspace).name ?? config.workspace.namePattern.replace("{id}", changeId));
  const workspaceRelativePath = path.relative(repoRoot, workspacePath);
  const workspaceChangePath = path.join(workspacePath, path.relative(repoRoot, filePath));
  const metadataSeedMessage = engineName === "jj" && !mutationOptions.dryRun ? seedJjChangeMetadata(repoRoot, changeId, targetRef, filePath) : null;
  const metadata: WorkspaceMetadata = {
    changeId,
    engine: engineName,
    name: workspaceName,
    path: workspacePath,
    repoRoot,
    changePath: filePath,
    ...(engineName === "jj" ? { workspaceChangePath } : {}),
    createdAt: new Date().toISOString(),
    branch: String(asRecord(parsed.frontmatter.branch).name ?? `cy/${changeId}`),
    ...(engineName === "jj"
      ? {
          targetRef,
          baseCommitId: jjCommitId(repoRoot, targetRef),
          seedDescription,
        }
      : {}),
  };

  if (mutationOptions.dryRun) {
    return `Dry-run: would start ${changeId} in ${workspaceRelativePath}`;
  }

  const engine = createWorkspaceEngine(engineName);
  const createdMetadata = engine.create({ repoRoot, workspacePath, metadata, neverCopy: config.workspace.hydrate.neverCopy });
  const metadataPath = path.join(workspacesRoot(repoRoot, config), changeId, "metadata.json");
  mkdirSync(path.dirname(metadataPath), { recursive: true });
  writeFileSync(metadataPath, `${JSON.stringify(createdMetadata, null, 2)}\n`);
  writeFileSync(path.join(workspacePath, ".changeyard-workspace.json"), `${JSON.stringify({ changeId, metadataPath }, null, 2)}\n`);
  const hydrateResult = hydrateWorkspace(config, createdMetadata);

  const nextFrontmatter: Frontmatter = {
    ...parsed.frontmatter,
    status: "in_progress",
    updatedAt: new Date().toISOString(),
    workspace: {
      ...asRecord(parsed.frontmatter.workspace),
      engine: engine.name,
      name: workspaceName,
      path: workspaceRelativePath,
    },
  };
  writeFileSync(engineName === "jj" ? workspaceChangePath : filePath, writeFrontmatter(nextFrontmatter, parsed.body));

  return [
    `Started ${changeId} in ${workspaceRelativePath}`,
    ...(metadataSeedMessage ? [metadataSeedMessage] : []),
    ...(createdMetadata.targetRef ? [`Base: ${createdMetadata.targetRef} ${createdMetadata.baseCommitId ?? ""}`.trim()] : []),
    ...(createdMetadata.workspaceChangeId ? [`Workspace change: ${createdMetadata.workspaceChangeId}`] : []),
    `Next: cd ${workspaceRelativePath}`,
    `Hydration: copied ${hydrateResult.copied.length}, skipped ${hydrateResult.skipped.length}`,
    `Then: cy verify ${changeId}`,
  ].join("\n");
}
