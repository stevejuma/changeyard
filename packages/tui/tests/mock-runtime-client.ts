import type { ChangeDetail, ChangeListItem, PlanningSectionId, RuntimeClient } from "../src/runtime-client";

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
  const client = {
    health: async () => {},
    selectCurrentWorkspace: async () => "mock-workspace",
    listChanges: async () => [] as ChangeListItem[],
    getChange: async () => null,
    createChange: async (input: { title: string }) => mockChangeDetail("chg-mock-001", input.title),
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
