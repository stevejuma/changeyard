import { readFileSync, writeFileSync } from "node:fs";
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
import type { Frontmatter } from "../types.js";

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

type MutationOptions = {
  dryRun?: boolean;
};

export function runSync(id: string, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!id) throw new Error("change id is required");
  const config = loadConfig(repoRoot);
  const root = storageRoot(repoRoot, config);
  const filePath = findChangeFile(changesRoot(repoRoot, config), id);
  if (!filePath) throw new Error(`Change not found: ${id}`);

  const validation = validateChangeFile(filePath, root, { gate: "sync", config });
  if (!validation.valid) throw new Error(validation.errors.join("\n"));

  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  assertTransition(String(parsed.frontmatter.status ?? ""), "synced", `Sync ${id}`);
  const syncFrontmatter: Frontmatter = {
    ...parsed.frontmatter,
    status: "synced",
    updatedAt: new Date().toISOString(),
  };

  const provider = createProvider(config.provider.type, config);
  const renderedBody = renderProviderIssueBody({
    canonicalPath: path.relative(repoRoot, filePath),
    frontmatter: syncFrontmatter,
    body: parsed.body,
  });
  if (mutationOptions.dryRun) {
    const relativeChangePath = path.relative(repoRoot, filePath);
    return `Dry-run: would sync ${String(parsed.frontmatter.id ?? id)} with ${provider.name}; updates ${relativeChangePath}`;
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

  writeFileSync(filePath, writeFrontmatter(nextFrontmatter, parsed.body));

  const relativeChangePath = path.relative(repoRoot, filePath);
  const target = remote.issueUrl ? ` -> ${remote.issueUrl}` : "";
  const lines = [`Synced ${String(parsed.frontmatter.id ?? id)} with ${provider.name}${target}`];
  if (isQuickChange(nextFrontmatter)) {
    const workflow = workflowMetadata(nextFrontmatter);
    lines.push(`Workflow: ${workflow?.mode ?? "quick"} | Planning: ${planningModel(nextFrontmatter)} | Risk: ${workflow?.risk ?? "low"}`);
  }
  lines.push(`Updated ${relativeChangePath}`);
  return lines.join("\n");
}
