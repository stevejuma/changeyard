import type { PlanningModel, PlanningStrictness } from "./planning/types.js";
import type { PlanningPhase, PlanningSectionId, PlanningGateStatus } from "./planning/types.js";

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

export type ChangePlanningModel = "none" | "openspec-lite" | "speckit-strict" | string;

export type ChangeWorkflowMode = "quick" | "planned" | string;

export type ChangePlanningMetadata = {
  model: ChangePlanningModel;
  storage?: "inline" | "external" | string;
  schema?: string;
  strict?: boolean;
  strictness?: PlanningStrictness | string;
  phase?: PlanningPhase | string;
  gates?: Record<string, FrontmatterValue>;
};

export type ChangeWorkflowMetadata = {
  mode: ChangeWorkflowMode;
  risk?: "low" | "medium" | "high" | string;
  requiresWorkspace?: boolean;
  completionPath?: "workspace" | "local" | string;
};

export type ChangeChecksMetadata = {
  profile?: string;
  lastRun?: string | null;
  lastStatus?: string | null;
};

export type ManualCheckRecord = {
  command: string;
  status: "passed" | "failed";
  exitCode: number | null;
  cwd: string;
  recordedAt: string;
  logFile?: string;
};

export type ChangeSliceRecord = {
  title: string;
  vcs: "jj" | "git";
  id: string;
  commitId: string | null;
  validation: string[];
  manualReviewStatus: "pending" | "reviewed" | "changes_requested";
  notes: string;
  descriptionSummary?: string;
  createdAt: string;
};

export type CommitDescriptionResult = {
  subject: string;
  body: string;
  message: string;
  sourceSections: string[];
  warnings: string[];
};

export type QuickChangeEscalation = "off" | "warn" | "block";

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
    targetBranch?: string;
    appliedStacks?: string[];
    remoteBookmarks?: {
      mode?: "local" | "tracked" | "all";
      prefixes?: string[];
      remotes?: string[];
    };
  };
  workspace: {
    pathPattern: string;
    namePattern: string;
    branchPattern: string;
    hydrate: {
      installCommand: string;
      warmupCommand?: string;
      copy: string[];
      link: string[];
      neverCopy: string[];
    };
  };
  checks: Record<string, string[]>;
  scaffold?: {
    trackGeneratedFiles?: boolean;
  };
  doctor?: {
    staleCompletedDays?: number;
  };
  pullRequests?: {
    enabled?: boolean;
    draft?: boolean;
    requireApprovedReview?: boolean;
    allowLocalFolder?: boolean;
    titlePattern?: string;
    bodyFromChange?: boolean;
    labels?: string[];
  };
  review?: {
    requireBeforePr?: boolean;
    requireFilledRequiredChanges?: boolean;
    requireInlineCommentDisposition?: boolean;
  };
  ui?: {
    host?: string;
    port?: number | "auto";
    open?: boolean;
    requirePasscode?: boolean;
    theme?: "light" | "dark" | "system" | string;
  };
  planning?: {
    defaultProfile?: PlanningModel;
    defaultStrictness?: PlanningStrictness;
    allowQuickChanges?: boolean;
    quickChangeCheckProfile?: string;
    quickChangeRequiresWorkspace?: boolean;
    quickChangeEscalation?: QuickChangeEscalation;
    requireBeforeStart?: boolean;
    requireBeforeComplete?: boolean;
    syncSummaryToProvider?: boolean;
    adapterCacheDir?: string;
    ui?: {
      enabled?: boolean;
      showBadges?: boolean;
      allowInlineEditing?: boolean;
    };
  };
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
  planning?: {
    model: PlanningModel;
    strictness: PlanningStrictness;
    phase: PlanningPhase;
    gates: Record<string, PlanningGateStatus>;
    gateSummary: {
      pass: number;
      pending: number;
      fail: number;
      skipped: number;
      warning: number;
    };
    presentSections: PlanningSectionId[];
    missingSections: PlanningSectionId[];
    nextAction: string | null;
    errors: string[];
  } | null;
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
  workspaceChangePath?: string;
  createdAt: string;
  branch?: string;
  targetRef?: string;
  baseCommitId?: string;
  workspaceChangeId?: string;
  workspaceCommitId?: string;
  seedDescription?: string;
  refreshedAt?: string;
  lastSliceId?: string;
  lastSliceCommitId?: string | null;
  lastSliceTitle?: string;
  lastSliceCommittedAt?: string;
  finalDescriptionUpdatedAt?: string;
};
