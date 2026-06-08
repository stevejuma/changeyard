import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { changesRoot, storageRoot, workspacesRoot } from "../paths.js";
import { createProvider } from "../providers/index.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import type { WorkspaceMetadata } from "../types.js";

export type DoctorReport = {
  ok: string[];
  warnings: string[];
};

function safeJson<T>(filePath: string, warnings: string[]): T | undefined {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    warnings.push(`${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function inspectWorkspaces(repoRoot: string, root: string, warnings: string[], ok: string[]): void {
  if (!existsSync(root)) {
    warnings.push(`missing workspaces root: ${path.relative(repoRoot, root)}`);
    return;
  }

  for (const id of readdirSync(root)) {
    const workspaceRoot = path.join(root, id);
    const metadataPath = path.join(workspaceRoot, "metadata.json");
    if (!existsSync(metadataPath)) {
      warnings.push(`${id}: missing workspace metadata`);
      continue;
    }
    const metadata = safeJson<WorkspaceMetadata>(metadataPath, warnings);
    if (!metadata) continue;
    if (metadata.changeId !== id) warnings.push(`${id}: metadata changeId mismatch (${metadata.changeId})`);
    if (!existsSync(metadata.changePath)) warnings.push(`${id}: change file missing: ${path.relative(repoRoot, metadata.changePath)}`);
    if (!existsSync(metadata.path)) {
      warnings.push(`${id}: workspace path missing: ${metadata.path}`);
      continue;
    }
    const markerPath = path.join(metadata.path, ".changeyard-workspace.json");
    if (!existsSync(markerPath)) {
      warnings.push(`${id}: missing workspace marker; run cy recover ${id}`);
      continue;
    }
    const marker = safeJson<{ changeId?: string; metadataPath?: string }>(markerPath, warnings);
    if (!marker) continue;
    if (marker.changeId !== id) warnings.push(`${id}: marker changeId mismatch (${marker.changeId ?? "missing"})`);
    if (path.resolve(String(marker.metadataPath ?? "")) !== path.resolve(metadataPath)) warnings.push(`${id}: marker metadataPath mismatch`);
    ok.push(`workspace: ${id}`);
  }
}

export function doctorReport(repoRoot = process.cwd()): DoctorReport {
  const config = loadConfig(repoRoot);
  const root = storageRoot(repoRoot, config);
  const warnings: string[] = [];
  const ok: string[] = [];
  if (existsSync(root)) ok.push(`storage: ${path.relative(repoRoot, root)}`);
  else warnings.push(`missing storage root: ${path.relative(repoRoot, root)}`);
  const schemaPath = path.join(root, "schema.json");
  if (existsSync(schemaPath)) ok.push(`schema: ${path.relative(repoRoot, schemaPath)}`);
  else warnings.push(`missing schema: ${path.relative(repoRoot, schemaPath)}`);

  createProvider(config.provider.type, config);
  ok.push(`provider: ${config.provider.type}`);
  createWorkspaceEngine(config.vcs.engine);
  ok.push(`workspace engine: ${config.vcs.engine}`);

  const changes = changesRoot(repoRoot, config);
  if (existsSync(changes)) {
    for (const file of readdirSync(changes).filter((entry) => entry.endsWith(".md"))) {
      const result = validateChangeFile(path.join(changes, file), root);
      if (!result.valid) warnings.push(`${file}: ${result.errors.join("; ")}`);
    }
  }
  inspectWorkspaces(repoRoot, workspacesRoot(repoRoot, config), warnings, ok);
  return { ok, warnings };
}

export function runDoctor(repoRoot = process.cwd()): string {
  const report = doctorReport(repoRoot);
  return [`Doctor ok: ${report.ok.join(", ")}`, ...report.warnings.map((warning) => `Warning: ${warning}`)].join("\n");
}
