import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter, writeFrontmatter } from "../documents/frontmatter.js";
import { loadTemplate } from "../documents/template.js";
import { validateParsedChange } from "../documents/validateDocument.js";
import { changesRoot, storageRoot } from "../paths.js";
import { createDefaultPlanningMetadata } from "../planning/model.js";
import { buildPlanningSectionsBlock } from "../planning/templates.js";
import { allocateId, slugifyTitle } from "../state/id.js";
import type { PlanningModel, PlanningStrictness } from "../planning/types.js";
import type { Frontmatter, ChangeSummary } from "../types.js";

export type CreateOptions = {
  template: string;
  title: string;
  priority?: string;
  labels?: string[];
  author?: string;
  planFile?: string;
  planning?: PlanningModel;
  strict?: boolean;
  noPlanning?: boolean;
};

type MutationOptions = {
  dryRun?: boolean;
};

export type CreateChangeResult = ChangeSummary & {
  message: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function resolvePlanningModel(options: CreateOptions, defaultProfile: PlanningModel | undefined): PlanningModel {
  if (options.noPlanning) return "none";
  if (options.planning) return options.planning;
  if (options.strict) return defaultProfile === "none" || defaultProfile === undefined ? "openspec-lite" : defaultProfile;
  return defaultProfile ?? "none";
}

function resolvePlanningStrictness(options: CreateOptions, defaultStrictness: PlanningStrictness | undefined): PlanningStrictness {
  if (options.strict) return "strict";
  return defaultStrictness ?? "normal";
}

function injectPlanningSections(body: string, strictness: PlanningStrictness): string {
  const planningBlock = buildPlanningSectionsBlock(strictness);
  if (/^# Acceptance Criteria\s*$/m.test(body)) {
    return body.replace(/^# Acceptance Criteria\s*$/m, `${planningBlock}\n# Acceptance Criteria`);
  }
  return `${body.trimEnd()}\n\n${planningBlock}`;
}

export function createChange(options: CreateOptions, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): CreateChangeResult {
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
  const requestedPlanning = resolvePlanningModel(options, config.planning?.defaultProfile);
  if (requestedPlanning !== "none" && requestedPlanning !== "openspec-lite") {
    throw new Error(`Unsupported planning model: ${requestedPlanning}`);
  }
  const planningStrictness = resolvePlanningStrictness(options, config.planning?.defaultStrictness);
  const templateBody = options.planFile
    ? parsedTemplate.body.replace(/# Agent Plan\n\n[^#]*/m, `# Agent Plan\n\n${readFileSync(options.planFile, "utf8").trim()}\n\n`)
    : parsedTemplate.body;
  const body = requestedPlanning === "openspec-lite" ? injectPlanningSections(templateBody, planningStrictness) : templateBody;

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

  if (requestedPlanning === "openspec-lite") {
    frontmatter.planning = createDefaultPlanningMetadata({
      model: "openspec-lite",
      strictness: planningStrictness,
      phase: "draft",
      gates: {
        proposal: "pending",
        specDeltas: "pending",
        design: "pending",
        tasks: "pending",
        verification: "pending",
        strictClarifications: planningStrictness === "strict" ? "pending" : "skipped",
        strictChecklist: planningStrictness === "strict" ? "pending" : "skipped",
        strictAnalysis: planningStrictness === "strict" ? "pending" : "skipped",
      },
    });
  }

  const validation = validateParsedChange(frontmatter, body, template.definition);
  if (!validation.valid) throw new Error(`Generated change failed validation:\n${validation.errors.join("\n")}`);

  const filePath = path.join(changes, `${id}-${slug}.md`);
  const planningMessage = requestedPlanning === "openspec-lite"
    ? ` with ${requestedPlanning}${planningStrictness === "strict" ? " strict" : ""} planning`
    : "";
  if (mutationOptions.dryRun) {
    return {
      id,
      title: options.title,
      status: "ready",
      type: template.definition.type,
      path: path.relative(repoRoot, filePath),
      message: `Dry-run: would create ${id}: ${path.relative(repoRoot, filePath)}${planningMessage}`,
    };
  }

  writeFileSync(filePath, writeFrontmatter(frontmatter, body));
  return {
    id,
    title: options.title,
    status: "ready",
    type: template.definition.type,
    path: path.relative(repoRoot, filePath),
    message: `Created ${id}: ${path.relative(repoRoot, filePath)}${planningMessage}`,
  };
}

export function runCreate(options: CreateOptions, repoRoot = process.cwd(), mutationOptions: MutationOptions = {}): string {
  return createChange(options, repoRoot, mutationOptions).message;
}
