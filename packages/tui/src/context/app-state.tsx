import { createStore } from "solid-js/store";
import { createSimpleContext } from "./helper";
import type { ChangeDetail, ChangeListItem, PlanningSectionId } from "../runtime-client";

export type PreviewTab = "detail" | "planning" | "workspace" | "review";

export type CreatePreset = {
  id: "quick" | "planned" | "strict" | "legacy";
  label: string;
  help: string;
  template: "feature" | "bug" | "refactor" | "agent-task" | "quick";
  planning?: "none" | "openspec-lite";
  strict?: boolean;
};

export const createPresets: CreatePreset[] = [
  {
    id: "quick",
    label: "Quick change",
    help: "Low-risk markdown-first quick lane.",
    template: "quick",
    planning: "none",
  },
  {
    id: "planned",
    label: "Planned feature",
    help: "OpenSpec-lite planning with normal gates.",
    template: "feature",
    planning: "openspec-lite",
  },
  {
    id: "strict",
    label: "Strict planned feature",
    help: "OpenSpec-lite planning with strict clarifications/checklist/analysis gates.",
    template: "feature",
    planning: "openspec-lite",
    strict: true,
  },
  {
    id: "legacy",
    label: "Legacy unplanned task",
    help: "Unplanned agent task for compatibility flows.",
    template: "agent-task",
    planning: "none",
  },
];

export const { use: useAppState, provider: AppStateProvider } = createSimpleContext({
  name: "AppState",
  init: () => {
    const [store, setStore] = createStore({
      changes: [] as ChangeListItem[],
      selectedIndex: 0,
      detail: null as ChangeDetail | null,
      status: "Connecting to Changeyard runtime...",
      error: null as string | null,
      prompt: null as string | null,
      previewTab: "detail" as PreviewTab,
      sidebarOpen: true,
      planningPrompt: null as string | null,
    });

    return {
      get changes() {
        return store.changes;
      },
      get selectedIndex() {
        return store.selectedIndex;
      },
      get detail() {
        return store.detail;
      },
      get status() {
        return store.status;
      },
      get error() {
        return store.error;
      },
      get prompt() {
        return store.prompt;
      },
      get previewTab() {
        return store.previewTab;
      },
      get sidebarOpen() {
        return store.sidebarOpen;
      },
      get planningPrompt() {
        return store.planningPrompt;
      },
      get selected() {
        return store.changes[store.selectedIndex] ?? null;
      },
      setChanges(changes: ChangeListItem[]) {
        setStore("changes", changes);
      },
      setSelectedIndex(index: number) {
        setStore("selectedIndex", index);
      },
      setDetail(detail: ChangeDetail | null) {
        setStore("detail", detail);
      },
      setStatus(status: string) {
        setStore("status", status);
      },
      setError(error: string | null) {
        setStore("error", error);
      },
      setPrompt(prompt: string | null) {
        setStore("prompt", prompt);
      },
      setPreviewTab(tab: PreviewTab) {
        setStore("previewTab", tab);
      },
      setSidebarOpen(open: boolean) {
        setStore("sidebarOpen", open);
      },
      toggleSidebar() {
        setStore("sidebarOpen", (open) => !open);
      },
      setPlanningPrompt(prompt: string | null) {
        setStore("planningPrompt", prompt);
      },
    };
  },
});

export function groupChanges(changes: ChangeListItem[]): Array<[string, ChangeListItem[]]> {
  const grouped = new Map<string, ChangeListItem[]>();
  for (const change of changes) {
    const current = grouped.get(change.status) ?? [];
    current.push(change);
    grouped.set(change.status, current);
  }
  return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
}

export function badgeText(change: ChangeListItem): string {
  const mode = change.type === "quick" || change.planning === null ? "quick/none" : `${change.planning.model}/${change.planning.strictness}`;
  const remote = change.remote?.issueUrl || change.remote?.pullRequestUrl ? "remote" : "local";
  const workspace = change.workspace?.path ? "workspace" : "no-workspace";
  return `${mode}  ${remote}  ${workspace}`;
}

export function firstPromptSection(detail: ChangeDetail | null): PlanningSectionId | null {
  return detail?.sections[0]?.id ?? null;
}

export function buildDefaultCreateTitle(preset: CreatePreset): string {
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "-");
  if (preset.template === "quick") return `Quick TUI change ${stamp}`;
  if (preset.strict) return `Strict planned TUI change ${stamp}`;
  if (preset.planning === "openspec-lite") return `Planned TUI change ${stamp}`;
  return `Legacy TUI task ${stamp}`;
}

export function presetIndexFromArg(arg: string | undefined): number {
  const normalized = (arg ?? "").toLowerCase();
  if (normalized === "quick") return 0;
  if (normalized === "planned" || normalized === "plan") return 1;
  if (normalized === "strict") return 2;
  if (normalized === "legacy") return 3;
  return 0;
}

export function parseSlashCommand(text: string): { commandName: string; args: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const [first, ...rest] = trimmed.slice(1).split(/\s+/);
  if (!first) return null;
  return { commandName: first.toLowerCase(), args: rest };
}
