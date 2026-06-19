import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { changesRoot } from "../paths.js";
import { findChangeFile } from "./id.js";
import type { ChangeStatus, Frontmatter, ParsedMarkdown, WorkspaceMetadata } from "../types.js";
import { resolveWorkspaceChangePath } from "../workspace/marker.js";

export type ChangeDocument = ParsedMarkdown & {
  path: string;
};

export type MaterializeWorkspaceChangeResult = {
  path: string;
  fixes: string[];
};

const recoverableActiveStatuses = new Set(["ready", "synced"]);

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function nowIso(): string {
  return new Date().toISOString();
}

function readChangeDocument(filePath: string): ChangeDocument {
  return {
    ...parseFrontmatter(readFileSync(filePath, "utf8")),
    path: filePath,
  };
}

export function writeChangeDocument(filePath: string, frontmatter: Frontmatter, body: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, writeFrontmatter(frontmatter, body));
}

export function findRootChangePathForMetadata(metadata: WorkspaceMetadata): string {
  const config = loadConfig(metadata.repoRoot);
  return findChangeFile(changesRoot(metadata.repoRoot, config), metadata.changeId) ?? metadata.changePath;
}

export function workspaceChangePathForMetadata(metadata: WorkspaceMetadata, rootChangePath = findRootChangePathForMetadata(metadata)): string {
  return metadata.workspaceChangePath ?? path.join(metadata.path, path.relative(metadata.repoRoot, rootChangePath));
}

export function materializeWorkspaceChangeDocument(
  metadata: WorkspaceMetadata,
  options: { dryRun?: boolean; status?: ChangeStatus } = {},
): MaterializeWorkspaceChangeResult {
  const fixes: string[] = [];
  const rootPath = findRootChangePathForMetadata(metadata);
  if (!existsSync(rootPath)) throw new Error(`Root change file not found: ${rootPath}`);

  const workspacePath = workspaceChangePathForMetadata(metadata, rootPath);
  const workspaceDir = path.dirname(workspacePath);
  if (!existsSync(workspaceDir)) {
    fixes.push(`created ${path.relative(metadata.path, workspaceDir) || workspaceDir}`);
    if (!options.dryRun) mkdirSync(workspaceDir, { recursive: true });
  }

  const requestedStatus = options.status ?? "in_progress";
  if (!existsSync(workspacePath)) {
    const root = readChangeDocument(rootPath);
    fixes.push(`materialized ${path.relative(metadata.path, workspacePath) || workspacePath}`);
    if (!options.dryRun) {
      writeChangeDocument(workspacePath, {
        ...root.frontmatter,
        status: requestedStatus,
        updatedAt: nowIso(),
        workspace: {
          ...asRecord(root.frontmatter.workspace),
          engine: metadata.engine,
          name: metadata.name,
          path: path.relative(metadata.repoRoot, metadata.path) || metadata.path,
        },
      }, root.body);
    }
    return { path: workspacePath, fixes };
  }

  const current = readChangeDocument(workspacePath);
  const currentStatus = String(current.frontmatter.status ?? "");
  if (recoverableActiveStatuses.has(currentStatus) || currentStatus === requestedStatus) {
    if (currentStatus !== requestedStatus) {
      fixes.push(`set ${path.relative(metadata.path, workspacePath) || workspacePath} status to ${requestedStatus}`);
      if (!options.dryRun) {
        writeChangeDocument(workspacePath, {
          ...current.frontmatter,
          status: requestedStatus,
          updatedAt: nowIso(),
        }, current.body);
      }
    }
  }

  return { path: workspacePath, fixes };
}
