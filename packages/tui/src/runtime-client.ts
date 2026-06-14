export type PlanningSectionId =
  | "proposal"
  | "spec-deltas"
  | "design"
  | "tasks"
  | "verification"
  | "clarifications"
  | "requirements-checklist"
  | "analysis";

export type ChangeListItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  path: string;
  labels: string[];
  updatedAt?: string;
  planning: null | {
    model: "openspec-lite";
    strictness: "normal" | "strict";
    phase: string;
    gateSummary: {
      pass: number;
      pending: number;
      fail: number;
      skipped: number;
      warning: number;
    };
    nextAction: string | null;
  };
  remote?: {
    provider?: string;
    issueUrl?: string;
    pullRequestUrl?: string;
  };
  workspace?: {
    engine?: string;
    name?: string;
    path?: string;
    branch?: string;
  };
};

export type ChangeDetail = ChangeListItem & {
  body: string;
  sections: Array<{
    id: PlanningSectionId;
    title: string;
    content: string;
  }>;
};

export type ChangeActionResponse = {
  message: string;
  change: ChangeDetail;
};

export type WorkspaceStatus = {
  id: string;
  status: string;
  rootStatus: string;
  workspaceStatus: string | null;
  path: string | null;
  engine: string | null;
  name: string | null;
  exists: boolean;
  dirty: boolean;
  conflicts: boolean;
  landed: boolean;
  rootMismatch: boolean;
  errors: string[];
  nextCommand: string | null;
  targetRef: string | null;
  baseCommitId: string | null;
  currentTargetCommitId: string | null;
  targetMoved: boolean;
  workspaceChangeId: string | null;
  workspaceCommitId: string | null;
  seedDescription: string | null;
  landingDescription: string | null;
  landingDescriptionValid: boolean;
  landingDescriptionError: string | null;
  landable: boolean;
  landBlockers: string[];
};

export type NextActionResponse = {
  id: string;
  title: string;
  status: string;
  cwd: string;
  expectedCwd: string;
  nextKind: string;
  nextCommand: string;
  blockers: string[];
  ready: {
    validate: boolean;
    start: boolean;
    verify: boolean;
    complete: boolean;
    land: boolean;
    review: boolean;
    cleanup: boolean;
  };
  workspace: WorkspaceStatus | null;
  planningNextAction: string | null;
};

export type PlanningPromptResponse = {
  section: PlanningSectionId;
  path: string;
  prompt: string;
};

export type RuntimeAgentDefinition = {
  id: string;
  label: string;
  binary: string;
  command: string;
  defaultArgs: string[];
  installed: boolean;
  configured: boolean;
};

export type RuntimeConfigResponse = {
  selectedAgentId: string;
  agents: RuntimeAgentDefinition[];
};

export type RepositoryStatusResponse = {
  vcsType: "jj" | "git" | "none" | "unknown";
  workspaceName: string;
  refLabel: string | null;
  diffStats: {
    files: number;
    additions: number;
    deletions: number;
  } | null;
  changeId?: string | null;
  commitId?: string | null;
  dirty: boolean;
  type: "jj" | "git" | "none" | "unknown";
  displayRef: string;
  diffSummary: string;
};

export type WorkspaceFileSearchMatch = {
  path: string;
  name: string;
  changed: boolean;
};

export type TaskSessionSummary = {
  taskId: string;
  state: string;
  agentId: string | null;
  workspacePath: string | null;
  pid: number | null;
  startedAt: number | null;
  updatedAt: number;
  lastOutputAt: number | null;
  reviewReason: string | null;
  exitCode: number | null;
  latestHookActivity?: {
    activityText?: string | null;
    source?: string | null;
  } | null;
  warningMessage?: string | null;
  externalSession?: {
    provider: string;
    sessionId: string | null;
    transcriptPath: string | null;
    resumeCommand: string[];
    source: string | null;
  } | null;
};

export type TaskSessionResponse = {
  ok: boolean;
  summary: TaskSessionSummary | null;
  error?: string;
};

export type TaskChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool" | "reasoning" | "status";
  content: string;
  createdAt: number;
  meta?: {
    toolName?: string | null;
    hookEventName?: string | null;
    displayRole?: string | null;
    reason?: string | null;
  } | null;
};

export type TaskChatMessagesResponse = {
  ok: boolean;
  messages: TaskChatMessage[];
  error?: string;
};

export type ProjectConfigResponse = {
  initialized: boolean;
  providerType: "noop" | "local-folder" | "forgejo" | "github" | "gitlab";
  vcsEngine: "plain-copy" | "jj" | "git-worktree";
  vcsFallback: "plain-copy" | "jj" | "git-worktree";
  vcsTargetBranch?: string | null;
  vcsAppliedStacks?: string[];
  projectDefaultBase: string;
  planningDefaultProfile?: "none" | "openspec-lite";
  planningDefaultStrictness?: "normal" | "strict";
  planningAllowQuickChanges?: boolean;
  planningQuickChangeCheckProfile?: string;
  checkProfiles?: string[];
  templateProfiles?: string[];
};

export type ProjectConfigUpdateInput = {
  providerType?: ProjectConfigResponse["providerType"];
  vcsEngine?: ProjectConfigResponse["vcsEngine"];
  vcsFallback?: ProjectConfigResponse["vcsFallback"];
  vcsTargetBranch?: string | null;
  vcsAppliedStacks?: string[];
  projectDefaultBase?: string;
  planningDefaultProfile?: ProjectConfigResponse["planningDefaultProfile"];
  planningDefaultStrictness?: ProjectConfigResponse["planningDefaultStrictness"];
  planningAllowQuickChanges?: boolean;
  planningQuickChangeCheckProfile?: string;
};

export type DoctorResponse = {
  ok: string[];
  warnings: string[];
  notes: string[];
};

type ProjectsResponse = {
  currentProjectId: string | null;
  projects: Array<{ id: string; path: string; name: string }>;
};

export type RuntimeEventSubscription = {
  mode: "events" | "unavailable";
  unsubscribe: () => void;
  reason?: string;
};

export class RuntimeClientError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "RuntimeClientError";
  }
}

function summarizeDiffStats(files: Array<{ additions?: number; deletions?: number; path?: string }>): RepositoryStatusResponse["diffStats"] {
  if (files.length === 0) return null;
  return {
    files: files.length,
    additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
    deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
  };
}

function formatDiffSummary(diffStats: RepositoryStatusResponse["diffStats"], cleanText = "clean"): string {
  if (!diffStats) return cleanText;
  return `${diffStats.files} file${diffStats.files === 1 ? "" : "s"} +${diffStats.additions} -${diffStats.deletions}`;
}

function normalizeRepositoryStatus(
  vcsType: RepositoryStatusResponse["vcsType"],
  workspaceName: string,
  refLabel: string | null,
  diffStats: RepositoryStatusResponse["diffStats"],
  cleanText = "clean",
): RepositoryStatusResponse {
  return {
    vcsType,
    workspaceName,
    refLabel,
    diffStats,
    dirty: diffStats !== null,
    type: vcsType,
    displayRef: refLabel ?? vcsType,
    diffSummary: formatDiffSummary(diffStats, cleanText),
  };
}

export class RuntimeClient {
  private readonly origin: string;
  private workspaceId: string | null = null;
  private selectedProject: ProjectsResponse["projects"][number] | null = null;

  constructor(runtimeUrl: string) {
    this.origin = new URL(runtimeUrl).origin;
  }

  getRuntimeUrl(): string {
    return this.origin;
  }

  getWorkspaceId(): string | null {
    return this.workspaceId;
  }

  async health(): Promise<void> {
    const response = await fetch(`${this.origin}/api/health`);
    if (!response.ok) {
      throw new RuntimeClientError(`Runtime health check failed: ${response.status}`, response.status);
    }
  }

  async selectCurrentWorkspace(): Promise<string> {
    const projects = await this.query<ProjectsResponse>("projects.list");
    if (!projects.currentProjectId) {
      throw new RuntimeClientError("Runtime has no active Changeyard project.");
    }
    this.workspaceId = projects.currentProjectId;
    this.selectedProject = projects.projects.find((project) => project.id === projects.currentProjectId) ?? null;
    return projects.currentProjectId;
  }

  async listChanges(): Promise<ChangeListItem[]> {
    await this.ensureWorkspace();
    return (await this.query<{ changes: ChangeListItem[] }>("changes.list")).changes;
  }

  async getChange(id: string): Promise<ChangeDetail | null> {
    await this.ensureWorkspace();
    return await this.query<ChangeDetail | null>("changes.get", { id });
  }

  async createChange(input: {
    template: string;
    title: string;
    planning?: "none" | "openspec-lite";
    strict?: boolean;
  }): Promise<ChangeDetail> {
    await this.ensureWorkspace();
    return await this.mutation<ChangeDetail>("changes.create", input);
  }

  async validate(id: string): Promise<ChangeDetail> {
    await this.ensureWorkspace();
    return await this.mutation<ChangeDetail>("changes.validate", { id });
  }

  async sync(id: string): Promise<ChangeDetail> {
    await this.ensureWorkspace();
    return await this.mutation<ChangeDetail>("changes.sync", { id });
  }

  async start(id: string): Promise<ChangeDetail> {
    await this.ensureWorkspace();
    return await this.mutation<ChangeDetail>("changes.start", { id });
  }

  async verify(id: string): Promise<ChangeActionResponse> {
    await this.ensureWorkspace();
    return await this.mutation<ChangeActionResponse>("changes.verify", { id });
  }

  async complete(id: string): Promise<ChangeActionResponse> {
    await this.ensureWorkspace();
    return await this.mutation<ChangeActionResponse>("changes.complete", { id, noPr: true });
  }

  async nextAction(id: string): Promise<NextActionResponse> {
    await this.ensureWorkspace();
    return await this.query<NextActionResponse>("changes.next", { id });
  }

  async land(id: string, input: { target?: string; keepWorkspace?: boolean } = {}): Promise<ChangeActionResponse> {
    await this.ensureWorkspace();
    return await this.mutation<ChangeActionResponse>("changes.land", { id, ...input });
  }

  async workspaceStatus(id: string): Promise<WorkspaceStatus> {
    await this.ensureWorkspace();
    return await this.query<WorkspaceStatus>("changes.workspaceStatus", { id });
  }

  async workspaceList(): Promise<WorkspaceStatus[]> {
    await this.ensureWorkspace();
    return await this.query<WorkspaceStatus[]>("changes.workspaceList");
  }

  async workspaceDelete(id: string, input: { force?: boolean } = {}): Promise<ChangeActionResponse> {
    await this.ensureWorkspace();
    return await this.mutation<ChangeActionResponse>("changes.workspaceDelete", { id, ...input });
  }

  async reviewStart(id: string): Promise<ChangeActionResponse> {
    await this.ensureWorkspace();
    return await this.mutation<ChangeActionResponse>("changes.reviewStart", { id });
  }

  async reviewComplete(id: string, decision: "approve" | "request-changes" | "reject"): Promise<ChangeActionResponse> {
    await this.ensureWorkspace();
    return await this.mutation<ChangeActionResponse>("changes.reviewComplete", { id, decision });
  }

  async planningPrompt(id: string, sectionId: PlanningSectionId): Promise<PlanningPromptResponse> {
    await this.ensureWorkspace();
    return await this.query<PlanningPromptResponse>("changes.planningPrompt", { id, sectionId });
  }

  async getRuntimeConfig(): Promise<RuntimeConfigResponse> {
    await this.ensureWorkspace();
    const config = await this.query<RuntimeConfigResponse>("runtime.getConfig");
    return {
      selectedAgentId: config.selectedAgentId,
      agents: config.agents,
    };
  }

  async saveRuntimeConfig(input: { selectedAgentId: string }): Promise<RuntimeConfigResponse> {
    await this.ensureWorkspace();
    const config = await this.mutation<RuntimeConfigResponse>("runtime.saveConfig", input);
    return {
      selectedAgentId: config.selectedAgentId,
      agents: config.agents,
    };
  }

  async getProjectConfig(): Promise<ProjectConfigResponse> {
    await this.ensureWorkspace();
    return await this.query<ProjectConfigResponse>("changes.getProjectConfig");
  }

  async initProject(): Promise<{ message: string }> {
    await this.ensureWorkspace();
    return await this.mutation<{ message: string }>("changes.init", {});
  }

  async updateProject(): Promise<{ message: string }> {
    await this.ensureWorkspace();
    return await this.mutation<{ message: string }>("changes.update", {});
  }

  async updateProjectConfig(input: ProjectConfigUpdateInput): Promise<ProjectConfigResponse> {
    await this.ensureWorkspace();
    return await this.mutation<ProjectConfigResponse>("changes.updateProjectConfig", input);
  }

  async doctorProject(): Promise<DoctorResponse> {
    await this.ensureWorkspace();
    return await this.query<DoctorResponse>("changes.doctor");
  }

  async getRepositoryStatus(): Promise<RepositoryStatusResponse> {
    await this.ensureWorkspace();
    const workspaceName = this.selectedProject?.name ?? "workspace";
    try {
      const detect = await this.query<{ engine?: string; type?: string; provider?: string; defaultBase?: string | null }>("vcs.detect");
      const engine = detect.engine ?? detect.type ?? detect.provider ?? "unknown";
      if (engine === "jj") {
        const [state, diff] = await Promise.all([
          this.query<{
            current?: { changeId?: string | null; commitId?: string | null; description?: string | null } | null;
            workingCopy?: { changeId?: string | null; commitId?: string | null; description?: string | null } | null;
          }>("vcs.jjState").catch(() => null),
          this.query<{ files?: Array<{ additions?: number; deletions?: number; path?: string }> }>("vcs.diff", {}).catch(() => null),
        ]);
        const current = state?.current ?? state?.workingCopy ?? null;
        const diffStats = summarizeDiffStats(diff?.files ?? []);
        const refLabel = current?.description || current?.changeId || "jj @";
        return {
          vcsType: "jj",
          workspaceName,
          refLabel,
          diffStats,
          type: "jj",
          displayRef: refLabel,
          changeId: current?.changeId ?? null,
          commitId: current?.commitId ?? null,
          diffSummary: formatDiffSummary(diffStats),
          dirty: diffStats !== null,
        };
      }
      if (engine === "git" || engine === "git-worktree") {
        const diff = await this.query<{ files?: Array<{ additions?: number; deletions?: number; path?: string }> }>("vcs.diff", {}).catch(() => null);
        const diffStats = summarizeDiffStats(diff?.files ?? []);
        const refLabel = detect.defaultBase ?? "git";
        return {
          vcsType: "git",
          workspaceName,
          refLabel,
          diffStats,
          type: "git",
          displayRef: refLabel,
          diffSummary: formatDiffSummary(diffStats),
          dirty: diffStats !== null,
        };
      }
      return normalizeRepositoryStatus("none", workspaceName, "no repo", null);
    } catch {
      return normalizeRepositoryStatus("unknown", workspaceName, "repo unknown", null, "unavailable");
    }
  }

  async searchFiles(query: string, limit = 12): Promise<WorkspaceFileSearchMatch[]> {
    await this.ensureWorkspace();
    const response = await this.query<{ files: WorkspaceFileSearchMatch[] }>("workspace.searchFiles", { query, limit });
    return response.files;
  }

  async startTaskSession(input: {
    taskId: string;
    taskTitle?: string;
    prompt: string;
    baseRef: string;
    agentId?: string;
    startInPlanMode?: boolean;
    cols?: number;
    rows?: number;
  }): Promise<TaskSessionResponse> {
    await this.ensureWorkspace();
    return await this.mutation<TaskSessionResponse>("runtime.startTaskSession", input);
  }

  async stopTaskSession(taskId: string): Promise<TaskSessionResponse> {
    await this.ensureWorkspace();
    return await this.mutation<TaskSessionResponse>("runtime.stopTaskSession", { taskId });
  }

  async sendTaskSessionInput(taskId: string, text: string, appendNewline = true): Promise<TaskSessionResponse> {
    await this.ensureWorkspace();
    return await this.mutation<TaskSessionResponse>("runtime.sendTaskSessionInput", { taskId, text, appendNewline });
  }

  async getTaskChatMessages(taskId: string): Promise<TaskChatMessagesResponse> {
    await this.ensureWorkspace();
    return await this.query<TaskChatMessagesResponse>("runtime.getTaskChatMessages", { taskId });
  }

  async sendTaskChatMessage(taskId: string, text: string): Promise<TaskSessionResponse> {
    await this.ensureWorkspace();
    return await this.mutation<TaskSessionResponse>("runtime.sendTaskChatMessage", { taskId, text });
  }

  subscribeToRuntimeEvents(onEvent: (event: unknown) => void): RuntimeEventSubscription {
    if (!this.workspaceId) {
      return { mode: "unavailable", reason: "workspace not selected", unsubscribe: () => {} };
    }
    if (typeof WebSocket === "undefined") {
      return { mode: "unavailable", reason: "websocket unavailable", unsubscribe: () => {} };
    }

    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;
    let reconnectAttempt = 0;
    const workspaceId = this.workspaceId;

    const openSocket = () => {
      if (closed) return;
      const url = new URL(this.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = "/api/runtime/ws";
      url.search = "";
      url.searchParams.set("workspaceId", workspaceId);
      url.searchParams.set("stream", "vcs");

      socket = new WebSocket(url.toString());
      socket.addEventListener("open", () => {
        reconnectAttempt = 0;
      });
      socket.addEventListener("message", (message) => {
        try {
          onEvent(JSON.parse(String(message.data)));
        } catch {
          // Ignore malformed stream messages.
        }
      });
      socket.addEventListener("close", () => {
        socket = null;
        if (closed) return;
        const delay = Math.min(5000, 250 * 2 ** reconnectAttempt);
        reconnectAttempt += 1;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          openSocket();
        }, delay);
      });
      socket.addEventListener("error", () => {
        socket?.close();
      });
    };

    openSocket();

    return {
      mode: "events",
      unsubscribe: () => {
        closed = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
          socket.close();
        }
      },
    };
  }

  private async ensureWorkspace(): Promise<void> {
    if (!this.workspaceId) {
      await this.selectCurrentWorkspace();
    }
  }

  private headers(): HeadersInit {
    return {
      ...(this.workspaceId ? { "x-kanban-workspace-id": this.workspaceId } : {}),
    };
  }

  private async query<T>(procedurePath: string, input?: unknown): Promise<T> {
    const searchParams = new URLSearchParams();
    if (input === undefined) {
      searchParams.set("batch", "1");
      searchParams.set("input", "{}");
    } else {
      searchParams.set("input", JSON.stringify(input));
    }
    const response = await fetch(`${this.origin}/api/trpc/${procedurePath}?${searchParams.toString()}`, {
      headers: this.headers(),
    });
    return await readTrpcPayload<T>(response);
  }

  private async mutation<T>(procedurePath: string, input: unknown): Promise<T> {
    const response = await fetch(`${this.origin}/api/trpc/${procedurePath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.headers(),
      },
      body: JSON.stringify(input),
    });
    return await readTrpcPayload<T>(response);
  }
}

async function readTrpcPayload<T>(response: Response): Promise<T> {
  const payload = await response.json() as
    | { result?: { data?: T }; error?: { message?: string } }
    | Array<{ result?: { data?: T }; error?: { message?: string } }>;
  const item = Array.isArray(payload) ? payload[0] : payload;
  if (!response.ok || item?.error) {
    throw new RuntimeClientError(item?.error?.message ?? `Runtime request failed: ${response.status}`, response.status);
  }
  return item?.result?.data as T;
}
