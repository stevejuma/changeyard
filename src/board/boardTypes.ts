import type { Frontmatter, ChangeStatus, WorkspaceMetadata } from "../types.js";
import type { ChangeSummary } from "../types.js";

export type ChangeyardColumnId =
  | "backlog"
  | "ready"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "abandoned";

export type ChangeyardProviderInfo = {
  type?: string;
  issueUrl?: string;
  issueNumber?: number | string | null;
  pullRequestUrl?: string;
  pullRequestNumber?: number | string | null;
};

export type ChangeyardWorkspaceInfo = {
  engine?: string;
  name?: string;
  path?: string;
  branch?: string;
  metadata?: WorkspaceMetadata | null;
  verification?: {
    valid: boolean;
    errors: string[];
  };
};

export type ChangeyardCard = {
  id: string;
  title: string;
  type: string;
  status: ChangeStatus | string;
  column: ChangeyardColumnId;
  path: string;
  priority?: string;
  labels: string[];
  updatedAt?: string;
  workspace?: ChangeyardWorkspaceInfo;
  provider?: ChangeyardProviderInfo;
  planning?: ChangeSummary["planning"];
};

export type ChangeyardCardDetail = ChangeyardCard & {
  body: string;
  frontmatter: Frontmatter;
  sections: Record<string, string>;
};

export type ChangeyardBoardColumn = {
  id: ChangeyardColumnId;
  title: string;
  statuses: string[];
  cards: ChangeyardCard[];
};

export type ChangeyardBoard = {
  repoRoot: string;
  generatedAt: string;
  workspaceEngine: string;
  columns: ChangeyardBoardColumn[];
};
