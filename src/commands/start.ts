import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { changesRoot, storageRoot, workspacesRoot } from "../paths.js";
import { findChangeFile } from "../state/id.js";
import { assertTransition } from "../state/transitions.js";
import { hydrateWorkspace } from "../hydrate/hydrateWorkspace.js";
import type { Frontmatter, WorkspaceMetadata } from "../types.js";
import { createWorkspaceEngine } from "../workspace/index.js";

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function fillPattern(pattern: string, id: string): string {
  return pattern.replaceAll("{id}", id);
}

export function runStart(id: string, repoRoot = process.cwd()): string {
  if (!id) throw new Error("change id is required");
  const config = loadConfig(repoRoot);
  const root = storageRoot(repoRoot, config);
  const filePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!filePath) throw new Error(`Change not found: ${id}`);

  const validation = validateChangeFile(filePath, root);
  if (!validation.valid) throw new Error(validation.errors.join("\n"));

  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  const status = String(parsed.frontmatter.status ?? "");
  assertTransition(status, "in_progress", `Start ${id}`);

  const engineName = String(asRecord(parsed.frontmatter.workspace).engine ?? config.vcs.engine);
  const engine = createWorkspaceEngine(engineName);
  const workspacePath = path.resolve(repoRoot, config.storage.root, config.storage.workspacesDir, fillPattern(config.workspace.pathPattern, id));
  const workspaceName = String(asRecord(parsed.frontmatter.workspace).name ?? config.workspace.namePattern.replace("{id}", id));
  const workspaceRelativePath = path.relative(repoRoot, workspacePath);
  const metadata: WorkspaceMetadata = {
    changeId: id,
    engine: engine.name,
    name: workspaceName,
    path: workspacePath,
    repoRoot,
    changePath: filePath,
    createdAt: new Date().toISOString(),
    branch: String(asRecord(parsed.frontmatter.branch).name ?? `cy/${id}`),
  };

  const createdMetadata = engine.create({ repoRoot, workspacePath, metadata, neverCopy: config.workspace.hydrate.neverCopy });
  const metadataPath = path.join(workspacesRoot(repoRoot, config), id, "metadata.json");
  mkdirSync(path.dirname(metadataPath), { recursive: true });
  writeFileSync(metadataPath, `${JSON.stringify(createdMetadata, null, 2)}\n`);
  writeFileSync(path.join(workspacePath, ".changeyard-workspace.json"), `${JSON.stringify({ changeId: id, metadataPath }, null, 2)}\n`);
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
  writeFileSync(filePath, writeFrontmatter(nextFrontmatter, parsed.body));

  return [
    `Started ${id} in ${workspaceRelativePath}`,
    `Next: cd ${workspaceRelativePath}`,
    `Hydration: copied ${hydrateResult.copied.length}, skipped ${hydrateResult.skipped.length}`,
    `Then: cy verify ${id}`,
  ].join("\n");
}
