export type WorkspaceVerification = {
  valid: boolean;
  errors: string[];
};

export type WorkspaceInfo = {
  engine?: string;
  name?: string;
  path?: string;
  branch?: string;
  verification?: WorkspaceVerification;
};

export type ProviderInfo = {
  type?: string;
  issueUrl?: string;
  pullRequestUrl?: string;
};

export type Card = {
  id: string;
  title: string;
  type: string;
  status: string;
  column: string;
  path: string;
  priority?: string;
  labels: string[];
  workspace?: WorkspaceInfo;
  provider?: ProviderInfo;
  sections?: Record<string, string>;
};

export type CardDetail = Card & {
  body: string;
  frontmatter: Record<string, unknown>;
  sections: Record<string, string>;
};

export type BoardColumn = {
  id: string;
  title: string;
  statuses: string[];
  cards: Card[];
};

export type Board = {
  repoRoot: string;
  generatedAt: string;
  workspaceEngine: string;
  columns: BoardColumn[];
};

export type WorkspaceView = {
  engine: string;
  path: string;
  commands: string[];
  statusOutput: string;
  diffOutput: string;
  checkLog?: string;
};
