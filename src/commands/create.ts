import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { loadTemplate } from "../documents/template.js";
import { validateParsedChange } from "../documents/validateDocument.js";
import { changesRoot, storageRoot } from "../paths.js";
import { allocateId, slugifyTitle } from "../state/id.js";
import type { Frontmatter } from "../types.js";

export type CreateOptions = {
  template: string;
  title: string;
  priority?: string;
  labels?: string[];
  author?: string;
  planFile?: string;
};

type MutationOptions = {
  dryRun?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

export function runCreate(options: CreateOptions, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  if (!options.title) throw new Error("--title is required");
  const config = loadConfig(repoRoot);
  const root = storageRoot(repoRoot, config);
  const changes = changesRoot(repoRoot, config);
  mkdirSync(changes, { recursive: true });

  const template = loadTemplate(root, options.template);
  const parsedTemplate = parseFrontmatter(readFileSync(template.path, "utf8"));
  const id = allocateId(changes, config.project.idPrefix);
  const slug = slugifyTitle(options.title);
  const createdAt = nowIso();
  const labels = options.labels?.length ? options.labels : ["agent-ready"];
  const body = options.planFile
    ? parsedTemplate.body.replace(/# Agent Plan\n\n[^#]*/m, `# Agent Plan\n\n${readFileSync(options.planFile, "utf8").trim()}\n\n`)
    : parsedTemplate.body;

  const frontmatter: Frontmatter = {
    id,
    title: options.title,
    type: template.definition.type,
    status: "ready",
    priority: options.priority ?? "medium",
    labels,
    author: options.author ?? process.env.USER ?? "unknown",
    createdAt,
    updatedAt: createdAt,
    base: {
      vcs: "unknown",
      revision: config.project.defaultBase,
    },
    workspace: {
      engine: config.vcs.engine,
      name: config.workspace.namePattern.replace("{id}", id),
      path: path.posix.join(config.storage.root, config.storage.workspacesDir, config.workspace.pathPattern.replace("{id}", id)),
    },
    branch: {
      name: config.workspace.branchPattern.replace("{id}", id).replace("{slug}", slug),
    },
    remote: {
      provider: config.provider.type,
      issueNumber: null,
      issueUrl: null,
      pullRequestNumber: null,
      pullRequestUrl: null,
    },
    checks: {
      profile: "standard",
      lastRun: null,
      lastStatus: null,
    },
  };

  const validation = validateParsedChange(frontmatter, body, template.definition);
  if (!validation.valid) throw new Error(`Generated change failed validation:\n${validation.errors.join("\n")}`);

  const filePath = path.join(changes, `${id}-${slug}.md`);
  if (mutationOptions.dryRun) {
    return `Dry-run: would create ${id}: ${path.relative(repoRoot, filePath)}`;
  }

  writeFileSync(filePath, writeFrontmatter(frontmatter, body));
  return `Created ${id}: ${path.relative(repoRoot, filePath)}`;
}
