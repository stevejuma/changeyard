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

export class RuntimeClient {
  private readonly origin: string;
  private workspaceId: string | null = null;

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
    template: "feature" | "bug" | "refactor" | "agent-task" | "quick";
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

  async updateProjectConfig(input: {
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
  }): Promise<ProjectConfigResponse> {
    await this.ensureWorkspace();
    return await this.mutation<ProjectConfigResponse>("changes.updateProjectConfig", input);
  }

  async doctorProject(): Promise<DoctorResponse> {
    await this.ensureWorkspace();
    return await this.query<DoctorResponse>("changes.doctor");
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
