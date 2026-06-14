import type {
  ChangeDetail,
  ChangeListItem,
  DoctorResponse,
  PlanningSectionId,
  ProjectConfigResponse,
  RuntimeClient,
  RuntimeConfigResponse,
  TaskChatMessagesResponse,
  TaskSessionResponse,
} from "../src/runtime-client";

function mockChangeDetail(id: string, title = "Mock"): ChangeDetail {
  return {
    id,
    title,
    type: "quick",
    status: "draft",
    path: `changes/${id}.md`,
    labels: [],
    planning: null,
    body: "",
    sections: [],
  };
}

const mockSessionResponse: TaskSessionResponse = {
  ok: true,
  summary: {
    taskId: "CY-MOCK-001",
    state: "running",
    agentId: "codex",
    workspacePath: "/tmp/changeyard-test",
    pid: 123,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    lastOutputAt: Date.now(),
    reviewReason: null,
    exitCode: null,
    latestHookActivity: { activityText: "Running Changeyard workflow", source: "mock" },
    warningMessage: null,
  },
};

const mockMessages: TaskChatMessagesResponse = {
  ok: true,
  messages: [
    {
      id: "msg-1",
      role: "assistant",
      content: "Starting Changeyard workflow.",
      createdAt: Date.now(),
    },
  ],
};

export function createMockRuntimeClient(overrides: Partial<RuntimeClient> = {}): RuntimeClient {
  let changes: ChangeListItem[] = [];
  let workspaceId: string | null = null;
  const client = {
    getRuntimeUrl: () => "http://127.0.0.1:0",
    getWorkspaceId: () => workspaceId,
    health: async () => {},
    selectCurrentWorkspace: async () => {
      workspaceId = "mock-workspace";
      return workspaceId;
    },
    listChanges: async () => changes,
    getChange: async (id: string) => {
      const item = changes.find((change) => change.id === id);
      if (!item) return null;
      return { ...item, body: "", sections: [] };
    },
    createChange: async (input: { title: string }) => {
      const created = mockChangeDetail("CY-MOCK-001", input.title);
      changes = [created];
      return { ...created, body: "", sections: [] };
    },
    validate: async (id: string) => mockChangeDetail(id),
    sync: async (id: string) => mockChangeDetail(id),
    start: async (id: string) => mockChangeDetail(id),
    verify: async (id: string) => ({ message: "verified", change: mockChangeDetail(id) }),
    complete: async (id: string) => ({ message: "completed", change: mockChangeDetail(id) }),
    nextAction: async (id: string) => ({
      id,
      title: "Mock",
      status: "ready",
      cwd: "/repo",
      expectedCwd: "/repo",
      nextKind: "validate",
      nextCommand: `cy validate ${id}`,
      blockers: [],
      ready: { validate: true, start: false, verify: false, complete: false, land: false, review: false, cleanup: false },
      workspace: null,
      planningNextAction: null,
    }),
    land: async (id: string) => ({ message: "landed", change: mockChangeDetail(id) }),
    workspaceStatus: async (id: string) => ({
      id,
      status: "ready",
      rootStatus: "ready",
      workspaceStatus: null,
      path: null,
      engine: null,
      name: null,
      exists: false,
      dirty: false,
      conflicts: false,
      landed: false,
      rootMismatch: false,
      errors: [],
      nextCommand: `cy start ${id}`,
      targetRef: null,
      baseCommitId: null,
      currentTargetCommitId: null,
      targetMoved: false,
      workspaceChangeId: null,
      workspaceCommitId: null,
      seedDescription: null,
      landingDescription: null,
      landingDescriptionValid: false,
      landingDescriptionError: null,
      landable: false,
      landBlockers: [],
    }),
    workspaceList: async () => [],
    workspaceDelete: async (id: string) => ({ message: "deleted", change: mockChangeDetail(id) }),
    reviewStart: async (id: string) => ({ message: "review started", change: mockChangeDetail(id) }),
    reviewComplete: async () => ({ message: "review complete", change: mockChangeDetail("chg-mock-001") }),
    planningPrompt: async (id: string, sectionId: PlanningSectionId) => ({
      section: sectionId,
      path: "planning/prompt.md",
      prompt: `# Planning prompt for ${id}`,
    }),
    getRuntimeConfig: async () =>
      ({
        selectedAgentId: "codex",
        agents: [
          {
            id: "claude",
            label: "Claude",
            binary: "claude",
            command: "claude",
            defaultArgs: [],
            installed: true,
            configured: true,
          },
          {
            id: "codex",
            label: "Codex",
            binary: "codex",
            command: "codex",
            defaultArgs: [],
            installed: true,
            configured: true,
          },
        ],
      }) satisfies RuntimeConfigResponse,
    saveRuntimeConfig: async (input: { selectedAgentId: string }) =>
      ({
        selectedAgentId: input.selectedAgentId,
        agents: [
          {
            id: "claude",
            label: "Claude",
            binary: "claude",
            command: "claude",
            defaultArgs: [],
            installed: true,
            configured: true,
          },
          {
            id: "codex",
            label: "Codex",
            binary: "codex",
            command: "codex",
            defaultArgs: [],
            installed: true,
            configured: true,
          },
        ],
      }) satisfies RuntimeConfigResponse,
    getProjectConfig: async () =>
      ({
        initialized: true,
        providerType: "noop",
        vcsEngine: "plain-copy",
        vcsFallback: "plain-copy",
        projectDefaultBase: "main",
        planningDefaultProfile: "none",
        planningDefaultStrictness: "normal",
        planningAllowQuickChanges: true,
        planningQuickChangeCheckProfile: "minimal",
        checkProfiles: ["minimal", "standard", "full"],
        templateProfiles: ["quick", "feature", "bug"],
      }) satisfies ProjectConfigResponse,
    initProject: async () => ({ message: "Initialized Changeyard in .changeyard" }),
    updateProject: async () => ({ message: "Updated Changeyard scaffold in .changeyard" }),
    updateProjectConfig: async (input: {
      providerType?: string;
      vcsEngine?: string;
      vcsFallback?: string;
      vcsTargetBranch?: string | null;
      projectDefaultBase?: string;
      planningDefaultProfile?: "none" | "openspec-lite";
      planningDefaultStrictness?: "normal" | "strict";
      planningAllowQuickChanges?: boolean;
      planningQuickChangeCheckProfile?: string;
    }) =>
      ({
        initialized: true,
        providerType: (input.providerType ?? "noop") as ProjectConfigResponse["providerType"],
        vcsEngine: (input.vcsEngine ?? "plain-copy") as ProjectConfigResponse["vcsEngine"],
        vcsFallback: (input.vcsFallback ?? "plain-copy") as ProjectConfigResponse["vcsFallback"],
        vcsTargetBranch: input.vcsTargetBranch ?? null,
        projectDefaultBase: input.projectDefaultBase ?? "main",
        planningDefaultProfile: input.planningDefaultProfile ?? "none",
        planningDefaultStrictness: input.planningDefaultStrictness ?? "normal",
        planningAllowQuickChanges: input.planningAllowQuickChanges ?? true,
        planningQuickChangeCheckProfile: input.planningQuickChangeCheckProfile ?? "minimal",
        checkProfiles: ["minimal", "standard", "full"],
        templateProfiles: ["quick", "feature", "bug"],
      }) satisfies ProjectConfigResponse,
    doctorProject: async () =>
      ({
        ok: ["config", "provider"],
        warnings: [],
        notes: [],
      }) satisfies DoctorResponse,
    subscribeToRuntimeEvents: () => ({
      mode: "unavailable",
      reason: "mock runtime",
      unsubscribe: () => {},
    }),
    getRepositoryStatus: async () => ({
      vcsType: "jj",
      workspaceName: "changeyard-test",
      refLabel: "jj @",
      diffStats: { files: 1, additions: 2, deletions: 1 },
      dirty: true,
      type: "jj",
      displayRef: "jj @",
      changeId: "mockchange",
      commitId: "mockcommit",
      diffSummary: "1 files +2 -1",
    }),
    searchFiles: async () => [
      { path: "src/cli.ts", name: "cli.ts", changed: true },
      { path: "packages/tui/src/react/app.tsx", name: "app.tsx", changed: false },
    ],
    startTaskSession: async (input: { taskId: string }) => ({
      ...mockSessionResponse,
      summary: mockSessionResponse.summary ? { ...mockSessionResponse.summary, taskId: input.taskId } : null,
    }),
    stopTaskSession: async (taskId: string) => ({
      ok: true,
      summary: mockSessionResponse.summary ? { ...mockSessionResponse.summary, taskId, state: "stopped" } : null,
    }),
    sendTaskSessionInput: async () => mockSessionResponse,
    getTaskChatMessages: async () => mockMessages,
    sendTaskChatMessage: async () => mockSessionResponse,
    ...overrides,
  };

  return client as RuntimeClient;
}

export function createMockRuntimeClientWithChanges(changes: ChangeListItem[]): RuntimeClient {
  return createMockRuntimeClient({
    listChanges: async () => changes,
    getChange: async (id) => {
      const item = changes.find((change) => change.id === id);
      if (!item) return null;
      return { ...item, body: "", sections: [] };
    },
  });
}
