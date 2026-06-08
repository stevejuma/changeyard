export type ChangeStatus =
  | "draft"
  | "ready"
  | "synced"
  | "in_progress"
  | "blocked"
  | "ready_for_pr"
  | "pr_open"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "merged"
  | "abandoned";

export const CHANGE_STATUSES: ChangeStatus[] = [
  "draft",
  "ready",
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
];

export type FrontmatterValue =
  | string
  | number
  | boolean
  | null
  | FrontmatterValue[]
  | { [key: string]: FrontmatterValue };

export type Frontmatter = Record<string, FrontmatterValue>;

export type ChangeyardConfig = {
  project: {
    idPrefix: string;
    defaultBase: string;
  };
  storage: {
    root: string;
    changesDir: string;
    workspacesDir: string;
    reviewsDir: string;
  };
  provider: {
    type: "noop" | "local-folder" | "forgejo" | "github" | "gitlab" | string;
    baseUrl?: string;
    owner?: string;
    repo?: string;
    auth?: {
      tokenEnv?: string;
    };
  };
  vcs: {
    engine: "plain-copy" | "jj" | "git-worktree" | string;
    fallback: "plain-copy" | "jj" | "git-worktree" | string;
  };
  workspace: {
    pathPattern: string;
    namePattern: string;
    branchPattern: string;
    hydrate: {
      installCommand: string;
      copy: string[];
      link: string[];
      neverCopy: string[];
    };
  };
  checks: Record<string, string[]>;
};

export type TemplateDefinition = {
  name: string;
  type: string;
  requiredFrontmatter: string[];
  requiredSections: string[];
  validation: {
    requireUncheckedAcceptanceCriteria?: boolean;
    requireNonEmptySections?: boolean;
  };
};

export type ParsedMarkdown = {
  frontmatter: Frontmatter;
  body: string;
};

export type ChangeSummary = {
  id: string;
  title: string;
  status: string;
  type: string;
  path: string;
};

export type WorkspaceReference = {
  engine: string;
  name: string;
  path: string;
};

export type WorkspaceMetadata = {
  changeId: string;
  engine: string;
  name: string;
  path: string;
  repoRoot: string;
  changePath: string;
  createdAt: string;
  branch?: string;
};
