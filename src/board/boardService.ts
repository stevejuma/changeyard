import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { runComplete, type CompleteOptions } from "../commands/complete.js";
import { createChange, type CreateOptions } from "../commands/create.js";
import { runReviewComplete, runReviewStart, type ReviewDecision } from "../commands/review.js";
import { runStart } from "../commands/start.js";
import { runSync } from "../commands/sync.js";
import { loadConfig } from "../config/loadConfig.js";
import { parseSections } from "../documents/sections.js";
import { changesRoot, workspacesRoot } from "../paths.js";
import { getPlanningStatusSummary } from "../planning/status.js";
import { findChangeFile } from "../state/id.js";
import { readOverlayChangeDocument } from "../state/workspaceOverlay.js";
import type { Frontmatter, WorkspaceMetadata } from "../types.js";
import { createWorkspaceEngine } from "../workspace/index.js";
import {
  updateChangeBody,
  updateChangeStatus,
  linkChanges,
  unlinkChanges,
  updateCardMetadata,
  updateCardSection,
  updatePlanningSection,
  type UpdateChangeBodyInput,
  type UpdateChangeStatusInput,
  type UpdateCardMetadataInput,
  type UpdatePlanningSectionInput,
} from "./changeMutations.js";
import { deriveChangeDependencyInfo } from "./changeDependencies.js";
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

type BoardReadOptions = {
  includeWorkspaceVerification?: boolean;
};

function shouldVerifyWorkspace(options?: BoardReadOptions): boolean {
  return options?.includeWorkspaceVerification ?? true;
}

function toCard(repoRoot: string, filePath: string, options?: BoardReadOptions): Omit<ChangeyardCardDetail, "dependencies"> {
  const rootParsed = readOverlayChangeDocument(filePath, null);
  const id = String(rootParsed.frontmatter.id ?? path.basename(filePath, ".md"));
  const metadata = readWorkspaceMetadataIfPresent(repoRoot, id);
  const parsed = readOverlayChangeDocument(filePath, metadata);
  const frontmatter = parsed.frontmatter;
  const verification = shouldVerifyWorkspace(options) ? verifyWorkspace(metadata) : undefined;
  const workspaceFrontmatter = asRecord(frontmatter.workspace);
  const branchFrontmatter = asRecord(frontmatter.branch);
  const baseFrontmatter = asRecord(frontmatter.base);
  const remoteFrontmatter = asRecord(frontmatter.remote);
  const status = String(frontmatter.status ?? "unknown");

  return {
    id,
    title: String(frontmatter.title ?? "Untitled"),
    type: String(frontmatter.type ?? "unknown"),
    status,
    column: columnForStatus(status),
    path: path.relative(repoRoot, filePath),
    base: {
      vcs: baseFrontmatter.vcs === undefined ? undefined : String(baseFrontmatter.vcs),
      revision: baseFrontmatter.revision === undefined ? undefined : String(baseFrontmatter.revision),
    },
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

  private readAllCards(options?: BoardReadOptions): ChangeyardCardDetail[] {
    const cards = this.changeFiles().map((filePath) => toCard(this.repoRoot, filePath, options));
    const dependencies = deriveChangeDependencyInfo(cards);
    return cards.map((card) => ({
      ...card,
      dependencies: dependencies.get(card.id) ?? { blockedBy: [], blocks: [] },
    }));
  }

  private canonicalId(id: string): string {
    const config = loadConfig(this.repoRoot);
    const filePath = findChangeFile(changesRoot(this.repoRoot, config), id);
    if (!filePath) return id;
    const rootParsed = readOverlayChangeDocument(filePath, null);
    return String(rootParsed.frontmatter.id ?? id);
  }

  getBoard(options?: BoardReadOptions): ChangeyardBoard {
    const config = loadConfig(this.repoRoot);
    const cards = this.readAllCards(options);
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
    const changeId = this.canonicalId(id);
    const card = this.readAllCards().find((entry) => entry.id === changeId);
    if (!card) throw new Error(`Change not found: ${id}`);
    return card;
  }

  getWorkspaceView(id: string): WorkspaceTerminalView {
    const card = this.getCard(id);
    const metadata = card.workspace?.metadata;
    if (!metadata) throw new Error(`Workspace not started for ${id}`);
    return readWorkspaceTerminalView(this.repoRoot, card.id, metadata);
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

  linkCard(id: string, blockedByChangeId: string): ChangeyardCardDetail {
    linkChanges(this.repoRoot, id, blockedByChangeId);
    return this.getCard(id);
  }

  unlinkCard(id: string, blockedByChangeId: string): ChangeyardCardDetail {
    unlinkChanges(this.repoRoot, id, blockedByChangeId);
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
