import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isQuickChange, planningModel, workflowMetadata } from "../change/changeMetadata.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { validateChangeFile } from "../documents/validateDocument.js";
import { changesRoot, storageRoot } from "../paths.js";
import { createProvider } from "../providers/index.js";
import { renderProviderIssueBody } from "../providers/renderIssueBody.js";
import { findChangeFile } from "../state/id.js";
import { assertTransition } from "../state/transitions.js";
import { resolveWorkspaceChangePath } from "../workspace/marker.js";
import type { Frontmatter } from "../types.js";
import { formatValidationFailure } from "./audit.js";
import { readWorkspaceMetadataFromRoot } from "./workspace.js";

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

type MutationOptions = {
  dryRun?: boolean;
};

const syncedOrLaterStatuses = new Set([
  "synced",
  "in_progress",
  "blocked",
  "ready_for_pr",
  "pr_open",
  "in_review",
  "changes_requested",
  "approved",
  "merged",
  "abandoned",
]);

export function runSync(id: string, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!id) throw new Error("change id is required");
  const config = loadConfig(repoRoot);
  const root = storageRoot(repoRoot, config);
  const filePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!filePath) throw new Error(`Change not found: ${id}`);
  const rootParsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  const changeId = String(rootParsed.frontmatter.id ?? id);
  const metadata = readWorkspaceMetadataFromRoot(changeId, repoRoot);
  const workspacePath = metadata?.engine === "jj" ? resolveWorkspaceChangePath(metadata) : null;
  const activePath = workspacePath && existsSync(workspacePath) ? workspacePath : filePath;
  const parsed = activePath === filePath ? rootParsed : parseFrontmatter(readFileSync(activePath, "utf8"));

  const currentStatus = String(parsed.frontmatter.status ?? "");
  if (!syncedOrLaterStatuses.has(currentStatus)) {
    const validation = validateChangeFile(filePath, root, { gate: "sync", config });
    if (!validation.valid) throw new Error(formatValidationFailure({
      id: changeId,
      repoRoot,
      gate: "sync",
      result: validation,
    }));
  }
  if (!syncedOrLaterStatuses.has(currentStatus)) {
    assertTransition(currentStatus, "synced", `Sync ${changeId}`);
  }
  const syncFrontmatter: Frontmatter = {
    ...parsed.frontmatter,
    status: syncedOrLaterStatuses.has(currentStatus) ? currentStatus : "synced",
    updatedAt: new Date().toISOString(),
  };

  const provider = createProvider(config.provider.type, config);
  const renderedBody = renderProviderIssueBody({
    canonicalPath: path.relative(repoRoot, filePath),
    frontmatter: syncFrontmatter,
    body: parsed.body,
  });
  if (mutationOptions.dryRun) {
    const relativeChangePath = path.relative(repoRoot, activePath);
    return `Dry-run: would sync ${changeId} with ${provider.name}; updates ${relativeChangePath}`;
  }

  const remote = provider.syncIssue({
    repoRoot,
    storageRoot: root,
    changePath: filePath,
    frontmatter: syncFrontmatter,
    body: renderedBody,
  });

  const nextFrontmatter: Frontmatter = {
    ...syncFrontmatter,
    remote: {
      ...asRecord(parsed.frontmatter.remote),
      provider: remote.provider,
      issueNumber: remote.issueNumber,
      issueUrl: remote.issueUrl,
    },
  };

  writeFileSync(activePath, writeFrontmatter(nextFrontmatter, parsed.body));
  if (activePath !== filePath) {
    const rootNextFrontmatter: Frontmatter = {
      ...rootParsed.frontmatter,
      updatedAt: new Date().toISOString(),
      remote: nextFrontmatter.remote,
    };
    writeFileSync(filePath, writeFrontmatter(rootNextFrontmatter, rootParsed.body));
  }

  const relativeChangePath = path.relative(repoRoot, activePath);
  const target = remote.issueUrl ? ` -> ${remote.issueUrl}` : "";
  const lines = [`Synced ${changeId} with ${provider.name}${target}`];
  if (isQuickChange(nextFrontmatter)) {
    const workflow = workflowMetadata(nextFrontmatter);
    lines.push(`Workflow: ${workflow?.mode ?? "quick"} | Planning: ${planningModel(nextFrontmatter)} | Risk: ${workflow?.risk ?? "low"}`);
  }
  lines.push(`Updated ${relativeChangePath}`);
  return lines.join("\n");
}
