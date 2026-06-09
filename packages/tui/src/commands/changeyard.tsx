import { createMemo, onMount } from "solid-js";
import { useCommandDialog } from "../component/dialog-command";
import { useAppState, createPresets, presetIndexFromArg, parseSlashCommand, type PreviewTab } from "../context/app-state";
import { useRoute } from "../context/route";
import { useRuntime } from "../context/runtime";
import { useDialog } from "../ui/dialog";
import { DialogHelp } from "../ui/dialog-help";
import { DialogAlert } from "../ui/dialog-alert";
import { useToast } from "../ui/toast";
import { CreateDialog } from "../dialogs/create";
import { PlanningPromptDialog } from "../dialogs/planning-prompt";
import { DialogThemeList } from "../component/dialog-theme-list";
import { useTheme } from "../context/theme";
import { firstPromptSection } from "../context/app-state";

export function useChangeyardActions() {
  const state = useAppState();
  const route = useRoute();
  const { client } = useRuntime();
  const dialog = useDialog();
  const toast = useToast();

  async function refresh(nextSelectedId = state.selected?.id) {
    state.setError(null);
    await client.health();
    await client.selectCurrentWorkspace();
    const nextChanges = await client.listChanges();
    state.setChanges(nextChanges);
    const desiredIndex = nextSelectedId ? nextChanges.findIndex((change) => change.id === nextSelectedId) : 0;
    const clampedIndex = desiredIndex >= 0 ? desiredIndex : 0;
    state.setSelectedIndex(clampedIndex);
    const nextSelected = nextChanges[clampedIndex] ?? null;
    state.setDetail(nextSelected ? await client.getChange(nextSelected.id) : null);
    state.setStatus(nextChanges.length === 0 ? "No changes yet. Run /create quick to start." : "Ready");
  }

  function goToWorkspace(changeId?: string) {
    route.workspace(changeId);
  }

  function updateSelection(nextIndex: number, nextChanges = state.changes) {
    const clampedIndex = nextChanges.length === 0 ? 0 : Math.max(0, Math.min(nextChanges.length - 1, nextIndex));
    state.setSelectedIndex(clampedIndex);
    const nextSelected = nextChanges[clampedIndex] ?? null;
    if (nextSelected) {
      void client.getChange(nextSelected.id).then(state.setDetail).catch((caught) => {
        state.setError(caught instanceof Error ? caught.message : String(caught));
      });
      goToWorkspace(nextSelected.id);
    } else {
      state.setDetail(null);
    }
  }

  async function runAction(action: "validate" | "sync" | "start" | "verify" | "complete" | "review") {
    const selected = state.selected;
    if (!selected) {
      toast.show({ variant: "warning", message: "Select a change first." });
      return;
    }
    state.setError(null);
    state.setStatus(`${action} ${selected.id}...`);
    try {
      if (action === "complete") {
        await DialogAlert.show(dialog, "Complete change", `Complete ${selected.id} without opening a PR?`);
      }
      if (action === "validate") {
        state.setDetail(await client.validate(selected.id));
        state.setStatus(`Validated ${selected.id}`);
      } else if (action === "sync") {
        state.setDetail(await client.sync(selected.id));
        state.setStatus(`Synced ${selected.id}`);
      } else if (action === "start") {
        state.setDetail(await client.start(selected.id));
        state.setStatus(`Started ${selected.id}`);
      } else if (action === "verify") {
        const result = await client.verify(selected.id);
        state.setDetail(result.change);
        state.setStatus(result.message);
      } else if (action === "complete") {
        const result = await client.complete(selected.id);
        state.setDetail(result.change);
        state.setStatus(result.message);
      } else {
        const result = await client.reviewStart(selected.id);
        state.setDetail(result.change);
        state.setStatus(result.message);
      }
      await refresh(selected.id);
      goToWorkspace(selected.id);
    } catch (caught) {
      state.setError(caught instanceof Error ? caught.message : String(caught));
      state.setStatus("Action failed");
      toast.error(caught);
    }
  }

  async function createChangeFromPreset(presetId?: string, titleOverride?: string) {
    const preset = createPresets[presetIndexFromArg(presetId)] ?? createPresets[0];
    const title = titleOverride ?? `Quick TUI change ${new Date().toISOString().slice(11, 19).replace(/:/g, "-")}`;
    state.setError(null);
    state.setStatus(`Creating ${preset.label.toLowerCase()}...`);
    try {
      const created = await client.createChange({
        template: preset.template,
        title: title.trim(),
        planning: preset.planning,
        strict: preset.strict,
      });
      state.setPreviewTab("detail");
      state.setDetail(created);
      state.setPlanningPrompt(null);
      state.setStatus(`Created ${created.id}`);
      dialog.clear();
      await refresh(created.id);
      goToWorkspace(created.id);
    } catch (caught) {
      state.setError(caught instanceof Error ? caught.message : String(caught));
      state.setStatus("Create failed");
      toast.error(caught);
    }
  }

  async function loadPrompt() {
    const selected = state.selected;
    if (!selected) {
      toast.show({ variant: "warning", message: "Select a change first." });
      return;
    }
    const sectionId = firstPromptSection(state.detail);
    if (!sectionId) {
      state.setPlanningPrompt(null);
      toast.show({ variant: "warning", message: "No planning section is available for this change." });
      return;
    }
    try {
      const result = await client.planningPrompt(selected.id, sectionId);
      state.setPlanningPrompt(result.prompt);
      state.setPreviewTab("planning");
      dialog.replace(() => <PlanningPromptDialog prompt={result.prompt} />);
      state.setStatus(`Loaded ${sectionId} prompt for ${selected.id}`);
    } catch (caught) {
      state.setError(caught instanceof Error ? caught.message : String(caught));
      state.setStatus("Could not load planning prompt");
      toast.error(caught);
    }
  }

  function setPreviewTab(tab: PreviewTab) {
    state.setPreviewTab(tab);
    if (state.selected) goToWorkspace(state.selected.id);
  }

  function executeSlash(raw: string): boolean {
    const parsed = parseSlashCommand(raw);
    if (!parsed) return false;

    const commandMap: Record<string, (args: string[]) => void | Promise<void>> = {
      help: () => dialog.replace(() => <DialogHelp />),
      refresh: () => void refresh(),
      r: () => void refresh(),
      sidebar: () => state.toggleSidebar(),
      home: () => route.home(),
      create: (args) => {
        dialog.replace(() => <CreateDialog initialPreset={args[0]} onCreate={createChangeFromPreset} />);
      },
      new: (args) => {
        dialog.replace(() => <CreateDialog initialPreset={args[0]} onCreate={createChangeFromPreset} />);
      },
      prompt: () => void loadPrompt(),
      validate: () => void runAction("validate"),
      sync: () => void runAction("sync"),
      start: () => void runAction("start"),
      verify: () => void runAction("verify"),
      complete: () => void runAction("complete"),
      review: () => void runAction("review"),
      detail: () => setPreviewTab("detail"),
      planning: () => setPreviewTab("planning"),
      workspace: () => setPreviewTab("workspace"),
      "review-view": () => setPreviewTab("review"),
      reviewview: () => setPreviewTab("review"),
      themes: () => dialog.replace(() => <DialogThemeList />),
    };

    const handler = commandMap[parsed.commandName];
    if (!handler) {
      toast.show({ variant: "warning", message: `Unknown command: /${parsed.commandName}` });
      return false;
    }
    void handler(parsed.args);
    return true;
  }

  return {
    refresh,
    updateSelection,
    runAction,
    createChangeFromPreset,
    loadPrompt,
    executeSlash,
    goToWorkspace,
    setPreviewTab,
  };
}

export function RegisterChangeyardCommands() {
  const command = useCommandDialog();
  const state = useAppState();
  const route = useRoute();
  const dialog = useDialog();
  const theme = useTheme();
  const actions = useChangeyardActions();

  onMount(() => {
    void actions.refresh().then(() => {
      if (state.changes.length === 1 && route.data.type === "home") {
        actions.updateSelection(0);
      }
    }).catch((caught) => {
      state.setError(caught instanceof Error ? caught.message : String(caught));
      state.setStatus("Runtime connection failed");
    });
  });

  command.register(() => [
    {
      title: "Help",
      value: "help",
      category: "System",
      suggested: true,
      slash: { name: "help" },
      onSelect: () => dialog.replace(() => <DialogHelp />),
    },
    {
      title: "Go home",
      value: "home",
      category: "Navigation",
      suggested: true,
      slash: { name: "home" },
      onSelect: () => route.home(),
    },
    {
      title: "Switch theme",
      value: "theme.switch",
      category: "System",
      slash: { name: "themes" },
      onSelect: () => dialog.replace(() => <DialogThemeList />),
    },
    {
      title: "Toggle appearance",
      value: "theme.switch_mode",
      category: "System",
      onSelect: () => {
        theme.setMode(theme.mode() === "dark" ? "light" : "dark");
      },
    },
    {
      title: "Refresh changes",
      value: "refresh",
      category: "Change",
      slash: { name: "refresh", aliases: ["r"] },
      onSelect: () => void actions.refresh(),
    },
    {
      title: "Toggle sidebar",
      value: "sidebar",
      category: "Navigation",
      keybind: "sidebar_toggle",
      slash: { name: "sidebar" },
      onSelect: () => state.toggleSidebar(),
    },
    {
      title: "Create change",
      value: "create",
      category: "Change",
      suggested: true,
      slash: { name: "create", aliases: ["new"] },
      onSelect: () => dialog.replace(() => <CreateDialog onCreate={actions.createChangeFromPreset} />),
    },
    {
      title: "Load planning prompt",
      value: "prompt",
      category: "Planning",
      slash: { name: "prompt" },
      onSelect: () => void actions.loadPrompt(),
    },
    {
      title: "Validate change",
      value: "validate",
      category: "Lifecycle",
      slash: { name: "validate" },
      onSelect: () => void actions.runAction("validate"),
    },
    {
      title: "Sync change",
      value: "sync",
      category: "Lifecycle",
      slash: { name: "sync" },
      onSelect: () => void actions.runAction("sync"),
    },
    {
      title: "Start workspace",
      value: "start",
      category: "Lifecycle",
      slash: { name: "start" },
      onSelect: () => void actions.runAction("start"),
    },
    {
      title: "Verify change",
      value: "verify",
      category: "Lifecycle",
      slash: { name: "verify" },
      onSelect: () => void actions.runAction("verify"),
    },
    {
      title: "Complete change",
      value: "complete",
      category: "Lifecycle",
      slash: { name: "complete" },
      onSelect: () => void actions.runAction("complete"),
    },
    {
      title: "Start review",
      value: "review",
      category: "Lifecycle",
      slash: { name: "review" },
      onSelect: () => void actions.runAction("review"),
    },
    {
      title: "Show detail",
      value: "detail",
      category: "Preview",
      slash: { name: "detail" },
      onSelect: () => actions.setPreviewTab("detail"),
    },
    {
      title: "Show planning",
      value: "planning",
      category: "Preview",
      slash: { name: "planning" },
      onSelect: () => state.setPreviewTab("planning"),
    },
    {
      title: "Show workspace",
      value: "workspace-view",
      category: "Preview",
      slash: { name: "workspace" },
      onSelect: () => state.setPreviewTab("workspace"),
    },
    {
      title: "Show review",
      value: "review-view",
      category: "Preview",
      slash: { name: "review-view", aliases: ["reviewview"] },
      onSelect: () => state.setPreviewTab("review"),
    },
  ]);

  return null;
}
