import type { ChangeDetail, ChangeListItem, PlanningSectionId, RuntimeClient, ProjectConfigResponse, DoctorResponse, RuntimeConfigResponse } from "../src/runtime-client";

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

export function createMockRuntimeClient(overrides: Partial<RuntimeClient> = {}): RuntimeClient {
  let changes: ChangeListItem[] = [];
  const client = {
    health: async () => {},
    selectCurrentWorkspace: async () => "mock-workspace",
    listChanges: async () => changes,
    getChange: async (id: string) => {
      const item = changes.find((change) => change.id === id);
      if (!item) return null;
      return { ...item, body: "", sections: [] };
    },
    createChange: async (input: { title: string }) => {
      const created = mockChangeDetail("chg-mock-001", input.title);
      changes = [created];
      return { ...created, body: "", sections: [] };
    },
    validate: async (id: string) => mockChangeDetail(id),
    sync: async (id: string) => mockChangeDetail(id),
    start: async (id: string) => mockChangeDetail(id),
    verify: async (id: string) => ({ message: "verified", change: mockChangeDetail(id) }),
    complete: async (id: string) => ({ message: "completed", change: mockChangeDetail(id) }),
    reviewStart: async (id: string) => ({ message: "review started", change: mockChangeDetail(id) }),
    reviewComplete: async () => ({ message: "review complete", change: mockChangeDetail("chg-mock-001") }),
    planningPrompt: async (id: string, sectionId: PlanningSectionId) => ({
      section: sectionId,
      path: "planning/prompt.md",
      prompt: `# Planning prompt for ${id}`,
    }),
    getRuntimeConfig: async () =>
      ({
        selectedAgentId: "claude",
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
      }) satisfies ProjectConfigResponse,
    initProject: async () => ({ message: "Initialized Changeyard in .changeyard" }),
    updateProject: async () => ({ message: "Updated Changeyard scaffold in .changeyard" }),
    updateProjectConfig: async (input: { providerType?: string; vcsEngine?: string; vcsFallback?: string }) =>
      ({
        initialized: true,
        providerType: input.providerType ?? "noop",
        vcsEngine: input.vcsEngine ?? "plain-copy",
        vcsFallback: input.vcsFallback ?? "plain-copy",
      }) satisfies ProjectConfigResponse,
    doctorProject: async () =>
      ({
        ok: ["config", "provider"],
        warnings: [],
        notes: [],
      }) satisfies DoctorResponse,
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
