import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { runComplete, type CompleteOptions } from "../commands/complete.js";
import { createChange, type CreateOptions } from "../commands/create.js";
import { runReviewComplete, runReviewStart, type ReviewDecision } from "../commands/review.js";
import { runStart } from "../commands/start.js";
import { runSync } from "../commands/sync.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseFrontmatter } from "../documents/frontmatter.js";
import { parseSections } from "../documents/sections.js";
import { changesRoot, workspacesRoot } from "../paths.js";
import { getPlanningStatusSummary } from "../planning/status.js";
import { findChangeFile } from "../state/id.js";
import type { Frontmatter, WorkspaceMetadata } from "../types.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import {
  updateChangeBody,
  updateChangeStatus,
  updateCardMetadata,
  updateCardSection,
  updatePlanningSection,
  type UpdateChangeBodyInput,
  type UpdateChangeStatusInput,
  type UpdateCardMetadataInput,
  type UpdatePlanningSectionInput,
} from "./changeMutations.js";
import { readWorkspaceTerminalView, type WorkspaceTerminalView } from "./workspaceView.js";
import type { ChangeyardBoard, ChangeyardBoardColumn, ChangeyardCardDetail } from "./boardTypes.js";
import { COLUMN_STATUS_MAP, COLUMN_TITLES, columnForStatus } from "./statusColumns.js";

function asRecord(value: unknown): Frontmatter {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Frontmatter : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function readWorkspaceMetadataIfPresent(repoRoot: string, id: string): WorkspaceMetadata | null {
  const config = loadConfig(repoRoot);
  const metadataPath = path.join(workspacesRoot(repoRoot, config), id, "metadata.json");
  if (!existsSync(metadataPath)) return null;
  return JSON.parse(readFileSync(metadataPath, "utf8")) as WorkspaceMetadata;
}

function verifyWorkspace(metadata: WorkspaceMetadata | null): { valid: boolean; errors: string[] } | undefined {
  if (!metadata) return undefined;
  try {
    return createWorkspaceEngine(metadata.engine).verify({ cwd: metadata.path, metadata });
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function toCard(repoRoot: string, filePath: string): ChangeyardCardDetail {
  const parsed = parseFrontmatter(readFileSync(filePath, "utf8"));
  const frontmatter = parsed.frontmatter;
  const id = String(frontmatter.id ?? path.basename(filePath, ".md"));
  const metadata = readWorkspaceMetadataIfPresent(repoRoot, id);
  const verification = verifyWorkspace(metadata);
  const workspaceFrontmatter = asRecord(frontmatter.workspace);
  const branchFrontmatter = asRecord(frontmatter.branch);
  const remoteFrontmatter = asRecord(frontmatter.remote);
  const status = String(frontmatter.status ?? "unknown");

  return {
    id,
    title: String(frontmatter.title ?? "Untitled"),
    type: String(frontmatter.type ?? "unknown"),
    status,
    column: columnForStatus(status),
    path: path.relative(repoRoot, filePath),
    priority: frontmatter.priority === undefined ? undefined : String(frontmatter.priority),
    labels: asStringArray(frontmatter.labels),
    updatedAt: frontmatter.updatedAt === undefined ? undefined : String(frontmatter.updatedAt),
    workspace: {
      engine: metadata?.engine ?? (workspaceFrontmatter.engine === undefined ? undefined : String(workspaceFrontmatter.engine)),
      name: metadata?.name ?? (workspaceFrontmatter.name === undefined ? undefined : String(workspaceFrontmatter.name)),
      path: metadata?.path ?? (workspaceFrontmatter.path === undefined ? undefined : String(workspaceFrontmatter.path)),
      branch: metadata?.branch ?? (branchFrontmatter.name === undefined ? undefined : String(branchFrontmatter.name)),
      metadata,
      verification,
    },
    provider: {
      type: remoteFrontmatter.provider === undefined ? undefined : String(remoteFrontmatter.provider),
      issueUrl: remoteFrontmatter.issueUrl === undefined || remoteFrontmatter.issueUrl === null ? undefined : String(remoteFrontmatter.issueUrl),
      issueNumber: remoteFrontmatter.issueNumber === undefined ? null : remoteFrontmatter.issueNumber as number | string | null,
      pullRequestUrl: remoteFrontmatter.pullRequestUrl === undefined || remoteFrontmatter.pullRequestUrl === null ? undefined : String(remoteFrontmatter.pullRequestUrl),
      pullRequestNumber: remoteFrontmatter.pullRequestNumber === undefined ? null : remoteFrontmatter.pullRequestNumber as number | string | null,
    },
    planning: getPlanningStatusSummary(frontmatter, parsed.body),
    body: parsed.body,
    frontmatter,
    sections: Object.fromEntries(parseSections(parsed.body).entries()),
  };
}

export class ChangeyardBoardService {
  constructor(readonly repoRoot = process.cwd()) {}

  private changeFiles(): string[] {
    const config = loadConfig(this.repoRoot);
    const root = changesRoot(this.repoRoot, config);
    if (!existsSync(root)) return [];
    return readdirSync(root)
      .filter((file) => file.endsWith(".md"))
      .sort()
      .map((file) => path.join(root, file));
  }

  private readAllCards(): ChangeyardCardDetail[] {
    return this.changeFiles().map((filePath) => toCard(this.repoRoot, filePath));
  }

  getBoard(): ChangeyardBoard {
    const config = loadConfig(this.repoRoot);
    const cards = this.readAllCards();
    const columns: ChangeyardBoardColumn[] = Object.entries(COLUMN_STATUS_MAP).map(([id, statuses]) => ({
      id: id as ChangeyardBoardColumn["id"],
      title: COLUMN_TITLES[id as keyof typeof COLUMN_TITLES],
      statuses,
      cards: cards.filter((card) => card.column === id),
    }));

    return {
      repoRoot: this.repoRoot,
      generatedAt: new Date().toISOString(),
      workspaceEngine: config.vcs.engine,
      columns,
    };
  }

  getCard(id: string): ChangeyardCardDetail {
    const config = loadConfig(this.repoRoot);
    const filePath = findChangeFile(changesRoot(this.repoRoot, config), id);
    if (!filePath) throw new Error(`Change not found: ${id}`);
    return toCard(this.repoRoot, filePath);
  }

  getWorkspaceView(id: string): WorkspaceTerminalView {
    const card = this.getCard(id);
    const metadata = card.workspace?.metadata;
    if (!metadata) throw new Error(`Workspace not started for ${id}`);
    return readWorkspaceTerminalView(this.repoRoot, id, metadata);
  }

  syncCard(id: string): ChangeyardCardDetail {
    runSync(id, this.repoRoot);
    return this.getCard(id);
  }

  createCard(input: CreateOptions): ChangeyardCardDetail {
    const created = createChange(input, this.repoRoot);
    return this.getCard(created.id);
  }

  updateCard(id: string, patch: UpdateCardMetadataInput): ChangeyardCardDetail {
    updateCardMetadata(this.repoRoot, id, patch);
    return this.getCard(id);
  }

  updateCardSection(id: string, sectionName: string, content: string): ChangeyardCardDetail {
    updateCardSection(this.repoRoot, id, sectionName, content);
    return this.getCard(id);
  }

  updatePlanningSection(id: string, input: UpdatePlanningSectionInput): ChangeyardCardDetail {
    updatePlanningSection(this.repoRoot, id, input);
    return this.getCard(id);
  }

  updateChangeBody(id: string, input: UpdateChangeBodyInput): ChangeyardCardDetail {
    updateChangeBody(this.repoRoot, id, input);
    return this.getCard(id);
  }

  updateChangeStatus(id: string, input: UpdateChangeStatusInput): ChangeyardCardDetail {
    updateChangeStatus(this.repoRoot, id, input);
    return this.getCard(id);
  }

  startCard(id: string): ChangeyardCardDetail {
    runStart(id, this.repoRoot);
    return this.getCard(id);
  }

  completeCard(id: string, options: CompleteOptions = { noPr: true }): ChangeyardCardDetail {
    const card = this.getCard(id);
    const workspacePath = card.workspace?.metadata?.path;
    if (!workspacePath) throw new Error(`Workspace not started for ${id}`);
    runComplete(id, options, workspacePath);
    return this.getCard(id);
  }

  startReview(id: string): ChangeyardCardDetail {
    runReviewStart(id, this.repoRoot);
    return this.getCard(id);
  }

  completeReview(id: string, decision: ReviewDecision): ChangeyardCardDetail {
    runReviewComplete(id, decision, this.repoRoot);
    return this.getCard(id);
  }
}

export function createChangeyardBoardService(repoRoot = process.cwd()): ChangeyardBoardService {
  return new ChangeyardBoardService(repoRoot);
}
