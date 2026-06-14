import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createEffect, createMemo, onCleanup, onMount } from "solid-js";
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
import { DialogMessage } from "../ui/dialog-message";
import { configTabFromArg } from "../views/config-view";
import { useTheme } from "../context/theme";
import { useComposerSettings } from "../context/composer-settings";
import { firstPromptSection } from "../context/app-state";
import { useKV } from "../context/kv";
import {
  createActivityEvent,
  normalizeActivityEvents,
  prependActivityEvent,
  type ActivityEventDraft,
} from "../utils/activity-events";
import {
  buildDiagnosticBundle,
  diagnosticBundleFileExtension,
  diagnosticBundleFormatFromArg,
} from "../utils/diagnostic-bundle";
import { isRefreshRelevantRuntimeEvent, runtimeEventLabel } from "../utils/runtime-events";

const ACTIVITY_EVENTS_KEY = "activity_events";

export function useChangeyardActions() {
  const state = useAppState();
  const route = useRoute();
  const { client } = useRuntime();
  const dialog = useDialog();
  const toast = useToast();
  const composerSettings = useComposerSettings();
  const kv = useKV();

  function recordActivity(draft: ActivityEventDraft) {
    const next = prependActivityEvent(state.activityEvents, createActivityEvent(draft));
    state.setActivityEvents(next);
    kv.set(ACTIVITY_EVENTS_KEY, next);
  }

  async function refresh(nextSelectedId = state.selected?.id) {
    state.setError(null);
    state.setRuntimeUrl(client.getRuntimeUrl());
    try {
      await client.health();
      state.setRuntimeHealthy(true);
      const workspaceId = await client.selectCurrentWorkspace();
      state.setActiveWorkspaceId(workspaceId);
      const nextChanges = await client.listChanges();
      state.setChanges(nextChanges);
      const desiredIndex = nextSelectedId ? nextChanges.findIndex((change) => change.id === nextSelectedId) : 0;
      const clampedIndex = desiredIndex >= 0 ? desiredIndex : 0;
      state.setSelectedIndex(clampedIndex);
      const nextSelected = nextChanges[clampedIndex] ?? null;
      state.setDetail(nextSelected ? await client.getChange(nextSelected.id) : null);
      state.setLastRefreshAt(new Date().toISOString());
      state.setLastRefreshError(null);
      state.setStatus(nextChanges.length === 0 ? "No changes yet. Run /create quick to start." : "Ready");
    } catch (caught) {
      state.setRuntimeHealthy(false);
      state.setLastRefreshError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    }
  }

  async function refreshWithActivity(source: "manual" | "runtime-event", description = "Reloaded change list and selected detail") {
    try {
      await refresh();
      recordActivity({
        kind: source === "manual" ? "refresh" : "runtime-event",
        status: "success",
        title: source === "manual" ? "Refresh" : "Runtime event",
        description,
      });
    } catch (caught) {
      recordActivity({
        kind: "error",
        status: "failure",
        title: "Refresh failed",
        description: caught instanceof Error ? caught.message : String(caught),
      });
      throw caught;
    }
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

  async function runAction(action: "validate" | "sync" | "start" | "verify" | "complete" | "land" | "review") {
    const selected = state.selected;
    if (!selected) {
      toast.show({ variant: "warning", message: "Select a change first." });
      return;
    }
    state.setError(null);
    state.setStatus(`${action} ${selected.id}...`);
    recordActivity({
      kind: "lifecycle",
      status: "started",
      title: `${action} started`,
      description: selected.title,
      changeId: selected.id,
    });
    try {
      if (action === "complete") {
        await DialogAlert.show(dialog, "Complete change", `Complete ${selected.id} without opening a PR?`);
      }
      if (action === "land") {
        await DialogAlert.show(dialog, "Land change", `Land ${selected.id} into the default workflow?`);
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
      } else if (action === "land") {
        const result = await client.land(selected.id);
        state.setDetail(result.change);
        state.setStatus(result.message);
      } else {
        const result = await client.reviewStart(selected.id);
        state.setDetail(result.change);
        state.setStatus(result.message);
      }
      await refresh(selected.id);
      goToWorkspace(selected.id);
      recordActivity({
        kind: "lifecycle",
        status: "success",
        title: `${action} completed`,
        description: selected.title,
        changeId: selected.id,
      });
    } catch (caught) {
      state.setError(caught instanceof Error ? caught.message : String(caught));
      state.setStatus("Action failed");
      recordActivity({
        kind: "lifecycle",
        status: "failure",
        title: `${action} failed`,
        description: caught instanceof Error ? caught.message : String(caught),
        changeId: selected.id,
      });
      toast.error(caught);
    }
  }

  async function showNextAction() {
    const selected = state.selected;
    if (!selected) {
      toast.show({ variant: "warning", message: "Select a change first." });
      return;
    }
    try {
      const result = await client.nextAction(selected.id);
      const lines = [
        `status: ${result.status}`,
        `next: ${result.nextCommand}`,
        `expected cwd: ${result.expectedCwd}`,
        ...(result.planningNextAction ? [`planning: ${result.planningNextAction}`] : []),
        ...(result.workspace ? [
          `workspace: ${result.workspace.path ?? "missing"}`,
          `workspace dirty: ${String(result.workspace.dirty)}`,
          `workspace conflicts: ${String(result.workspace.conflicts)}`,
        ] : []),
        ...result.blockers.map((blocker) => `blocker: ${blocker}`),
      ];
      state.setStatus(result.nextCommand);
      recordActivity({
        kind: "lifecycle",
        status: result.blockers.length > 0 ? "info" : "success",
        title: `Next ${selected.id}`,
        description: result.nextCommand,
        changeId: selected.id,
      });
      dialog.replace(() => <DialogMessage title="Next action" lines={lines} />);
    } catch (caught) {
      state.setError(caught instanceof Error ? caught.message : String(caught));
      recordActivity({
        kind: "lifecycle",
        status: "failure",
        title: "Next failed",
        description: caught instanceof Error ? caught.message : String(caught),
        changeId: selected.id,
      });
      toast.error(caught);
    }
  }

  async function showWorkspaceStatus() {
    const selected = state.selected;
    if (!selected) {
      toast.show({ variant: "warning", message: "Select a change first." });
      return;
    }
    try {
      const result = await client.workspaceStatus(selected.id);
      const lines = [
        `status: ${result.status}`,
        `workspace: ${result.path ?? "missing"}`,
        `engine: ${result.engine ?? "unknown"}`,
        `dirty: ${String(result.dirty)}`,
        `conflicts: ${String(result.conflicts)}`,
        `landed: ${String(result.landed)}`,
        ...(result.nextCommand ? [`next: ${result.nextCommand}`] : []),
        ...result.errors.map((error) => `error: ${error}`),
      ];
      state.setStatus(result.nextCommand ?? `Workspace status loaded for ${selected.id}`);
      dialog.replace(() => <DialogMessage title="Workspace status" lines={lines} />);
    } catch (caught) {
      state.setError(caught instanceof Error ? caught.message : String(caught));
      toast.error(caught);
    }
  }

  async function deleteSelectedWorkspace() {
    const selected = state.selected;
    if (!selected) {
      toast.show({ variant: "warning", message: "Select a change first." });
      return;
    }
    try {
      await DialogAlert.show(dialog, "Delete workspace", `Delete workspace for ${selected.id}?`);
      const result = await client.workspaceDelete(selected.id);
      state.setDetail(result.change);
      state.setStatus(result.message);
      await refresh(selected.id);
      recordActivity({
        kind: "lifecycle",
        status: "success",
        title: `Deleted workspace ${selected.id}`,
        description: result.message,
        changeId: selected.id,
      });
    } catch (caught) {
      state.setError(caught instanceof Error ? caught.message : String(caught));
      recordActivity({
        kind: "lifecycle",
        status: "failure",
        title: "Workspace delete failed",
        description: caught instanceof Error ? caught.message : String(caught),
        changeId: selected.id,
      });
      toast.error(caught);
    }
  }

  function exportDiagnostics(formatArg?: string) {
    const format = diagnosticBundleFormatFromArg(formatArg);
    const generatedAt = new Date().toISOString();
    const extension = diagnosticBundleFileExtension(format);
    const outputDir = path.join(homedir(), ".changeyard", "tui-diagnostics");
    const outputPath = path.join(
      outputDir,
      `changeyard-tui-diagnostics-${generatedAt.replace(/[:.]/g, "-")}.${extension}`,
    );
    const content = buildDiagnosticBundle({
      generatedAt,
      runtimeUrl: state.runtimeUrl,
      workspaceId: state.activeWorkspaceId,
      runtimeHealthy: state.runtimeHealthy,
      eventRefreshMode: state.eventRefreshMode,
      lastRefreshAt: state.lastRefreshAt,
      lastRefreshError: state.lastRefreshError,
      status: state.status,
      error: state.error,
      selected: state.selected,
      detail: state.detail,
      changes: state.changes,
      doctor: state.doctor,
      projectConfig: composerSettings.project.config,
      runtimeConfig: {
        selectedAgentId: composerSettings.runtime.selectedAgentId,
        agents: composerSettings.runtime.agents,
      },
      selectedAgent: composerSettings.selectedAgent(),
      activityEvents: state.activityEvents,
    }, format);

    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, content, "utf8");
    state.setStatus(`Exported diagnostics to ${outputPath}`);
    recordActivity({
      kind: "export",
      status: "success",
      title: "Diagnostics exported",
      description: outputPath,
      changeId: state.selected?.id,
    });
    dialog.replace(() => <DialogMessage title="Diagnostics exported" lines={[outputPath, `format: ${format}`]} />);
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
      recordActivity({
        kind: "create",
        status: "success",
        title: `Created ${created.id}`,
        description: created.title,
        changeId: created.id,
      });
    } catch (caught) {
      state.setError(caught instanceof Error ? caught.message : String(caught));
      state.setStatus("Create failed");
      recordActivity({
        kind: "create",
        status: "failure",
        title: "Create failed",
        description: caught instanceof Error ? caught.message : String(caught),
      });
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
      refresh: () => void refreshWithActivity("manual"),
      r: () => void refreshWithActivity("manual"),
      sidebar: () => state.toggleSidebar(),
      home: () => route.home(),
      create: (args) => {
        dialog.replace(() => <CreateDialog initialPreset={args[0]} onCreate={createChangeFromPreset} />);
      },
      new: (args) => {
        dialog.replace(() => <CreateDialog initialPreset={args[0]} onCreate={createChangeFromPreset} />);
      },
      prompt: () => void loadPrompt(),
      next: () => void showNextAction(),
      validate: () => void runAction("validate"),
      sync: () => void runAction("sync"),
      start: () => void runAction("start"),
      verify: () => void runAction("verify"),
      complete: () => void runAction("complete"),
      land: () => void runAction("land"),
      review: () => void runAction("review"),
      "workspace-status": () => void showWorkspaceStatus(),
      "workspace-delete": () => void deleteSelectedWorkspace(),
      detail: () => setPreviewTab("detail"),
      planning: () => setPreviewTab("planning"),
      workspace: () => setPreviewTab("workspace"),
      "review-view": () => setPreviewTab("review"),
      reviewview: () => setPreviewTab("review"),
      activity: () => setPreviewTab("activity"),
      history: () => setPreviewTab("activity"),
      diagnostics: () => setPreviewTab("diagnostics"),
      "export-diagnostics": (args) => exportDiagnostics(args[0]),
      export: (args) => exportDiagnostics(args[0]),
      setup: () => setPreviewTab("setup"),
      themes: () => route.config("appearance"),
      config: (args) => route.config(configTabFromArg(args)),
      agents: () => route.config("agent"),
      provider: () => route.config("project"),
      vcs: () => route.config("project"),
      init: () => {
        void composerSettings.initProject().then((result) => {
          void composerSettings.refreshProjectConfig();
          state.setStatus(result.message);
          recordActivity({
            kind: "setup",
            status: "success",
            title: "Init completed",
            description: result.message.split("\n")[0] ?? "Project initialized",
          });
          dialog.replace(() => <DialogMessage title="Init" lines={result.message.split("\n")} />);
        }).catch((caught) => {
          recordActivity({
            kind: "setup",
            status: "failure",
            title: "Init failed",
            description: caught instanceof Error ? caught.message : String(caught),
          });
          toast.error(caught);
        });
      },
      update: () => {
        void composerSettings.updateProject().then((result) => {
          void composerSettings.refreshProjectConfig();
          state.setStatus(result.message);
          recordActivity({
            kind: "setup",
            status: "success",
            title: "Update completed",
            description: result.message.split("\n")[0] ?? "Project scaffold updated",
          });
          dialog.replace(() => <DialogMessage title="Update" lines={result.message.split("\n")} />);
        }).catch((caught) => {
          recordActivity({
            kind: "setup",
            status: "failure",
            title: "Update failed",
            description: caught instanceof Error ? caught.message : String(caught),
          });
          toast.error(caught);
        });
      },
      doctor: () => {
        void composerSettings.doctorProject().then((report) => {
          state.setDoctor(report);
          state.setPreviewTab("diagnostics");
          const lines = [
            ...(report.ok.length > 0 ? [`ok: ${report.ok.join(", ")}`] : []),
            ...report.warnings.map((warning) => `warning: ${warning}`),
            ...report.notes.map((note) => `note: ${note}`),
          ];
          recordActivity({
            kind: "doctor",
            status: report.warnings.length > 0 ? "info" : "success",
            title: "Doctor completed",
            description: `${report.ok.length} ok, ${report.warnings.length} warning, ${report.notes.length} note`,
          });
          dialog.replace(() => <DialogMessage title="Doctor" lines={lines.length > 0 ? lines : ["No issues found."]} />);
        }).catch((caught) => {
          recordActivity({
            kind: "doctor",
            status: "failure",
            title: "Doctor failed",
            description: caught instanceof Error ? caught.message : String(caught),
          });
          toast.error(caught);
        });
      },
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
    showNextAction,
    showWorkspaceStatus,
    deleteSelectedWorkspace,
    refreshWithActivity,
    exportDiagnostics,
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
  const composerSettings = useComposerSettings();
  const actions = useChangeyardActions();
  const kv = useKV();
  const { client } = useRuntime();

  createEffect(() => {
    if (!kv.ready) return;
    state.setActivityEvents(normalizeActivityEvents(kv.get(ACTIVITY_EVENTS_KEY)));
  });

  onMount(() => {
    let unsubscribeRuntimeEvents = () => {};
    void actions.refresh().then(() => {
      if (state.changes.length === 1 && route.data.type === "home") {
        actions.updateSelection(0);
      }
      const subscription = client.subscribeToRuntimeEvents((event) => {
        if (!isRefreshRelevantRuntimeEvent(event, state.activeWorkspaceId)) return;
        void actions.refreshWithActivity("runtime-event", runtimeEventLabel(event)).catch(() => {});
      });
      unsubscribeRuntimeEvents = subscription.unsubscribe;
      state.setEventRefreshMode(subscription.mode === "events" ? "events" : "polling");
    }).catch((caught) => {
      state.setRuntimeHealthy(false);
      state.setError(caught instanceof Error ? caught.message : String(caught));
      state.setStatus("Runtime connection failed");
      state.setEventRefreshMode("polling");
    });
    const interval = setInterval(() => {
      if (route.data.type !== "workspace") return;
      void actions.refresh().catch(() => {
        state.setStatus("Runtime refresh failed");
      });
    }, 5000);
    onCleanup(() => {
      clearInterval(interval);
      unsubscribeRuntimeEvents();
    });
  });

  command.register(() => [
    {
      title: "Help",
      value: "help",
      category: "System",
      description: "Show shortcuts and slash commands",
      keywords: ["shortcuts", "commands"],
      suggested: true,
      slash: { name: "help" },
      onSelect: () => dialog.replace(() => <DialogHelp />),
    },
    {
      title: "Go home",
      value: "home",
      category: "Navigation",
      description: "Return to the TUI home screen",
      suggested: true,
      slash: { name: "home" },
      onSelect: () => route.home(),
    },
    {
      title: "Configure Changeyard",
      value: "project.config",
      category: "Setup",
      description: "Open project, planning, agent, and appearance settings",
      suggested: true,
      slash: { name: "config" },
      onSelect: () => route.config(),
    },
    {
      title: "Switch theme",
      value: "theme.switch",
      category: "System",
      description: "Open appearance settings",
      slash: { name: "themes" },
      onSelect: () => route.config("appearance"),
    },
    {
      title: "Select agent",
      value: "agents.select",
      category: "System",
      description: "Choose the default launch agent",
      slash: { name: "agents" },
      onSelect: () => route.config("agent"),
    },
    {
      title: "Initialize Changeyard",
      value: "project.init",
      category: "Setup",
      description: "Scaffold .changeyard in this repository",
      slash: { name: "init" },
      onSelect: () => actions.executeSlash("/init"),
    },
    {
      title: "Update Changeyard scaffold",
      value: "project.update",
      category: "Setup",
      description: "Refresh bundled templates, skills, and commands",
      slash: { name: "update" },
      onSelect: () => actions.executeSlash("/update"),
    },
    {
      title: "Configure provider",
      value: "project.provider",
      category: "Setup",
      description: "Set remote sync provider",
      slash: { name: "provider" },
      onSelect: () => route.config("project"),
    },
    {
      title: "Configure VCS",
      value: "project.vcs",
      category: "Setup",
      description: "Set workspace isolation engine",
      slash: { name: "vcs" },
      onSelect: () => route.config("project"),
    },
    {
      title: "Run doctor",
      value: "project.doctor",
      category: "Setup",
      description: "Inspect local Changeyard health and diagnostics",
      slash: { name: "doctor" },
      onSelect: () => actions.executeSlash("/doctor"),
    },
    {
      title: "Cycle profile",
      value: "profile.cycle",
      category: "Change",
      keybind: "profile_cycle",
      hidden: true,
      onSelect: () => composerSettings.cyclePreset(1),
    },
    {
      title: "Cycle profile reverse",
      value: "profile.cycle.reverse",
      category: "Change",
      keybind: "profile_cycle_reverse",
      hidden: true,
      onSelect: () => composerSettings.cyclePreset(-1),
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
      description: "Reload change list and selected detail",
      slash: { name: "refresh", aliases: ["r"] },
      onSelect: () => void actions.refreshWithActivity("manual"),
    },
    {
      title: "Toggle sidebar",
      value: "sidebar",
      category: "Navigation",
      description: "Show or hide the change list",
      keybind: "sidebar_toggle",
      slash: { name: "sidebar" },
      onSelect: () => state.toggleSidebar(),
    },
    {
      title: "Create change",
      value: "create",
      category: "Change",
      description: "Create a quick, planned, strict, or legacy change",
      suggested: true,
      slash: { name: "create", aliases: ["new"] },
      onSelect: () => dialog.replace(() => <CreateDialog onCreate={actions.createChangeFromPreset} />),
    },
    {
      title: "Load planning prompt",
      value: "prompt",
      category: "Planning",
      description: "Load the first planning prompt for the selected change",
      slash: { name: "prompt" },
      onSelect: () => void actions.loadPrompt(),
    },
    {
      title: "Next action",
      value: "next",
      category: "Lifecycle",
      description: "Show the recommended next Changeyard command",
      suggested: true,
      slash: { name: "next" },
      onSelect: () => void actions.showNextAction(),
    },
    {
      title: "Validate change",
      value: "validate",
      category: "Lifecycle",
      description: "Run document and lifecycle validation",
      slash: { name: "validate" },
      onSelect: () => void actions.runAction("validate"),
    },
    {
      title: "Sync change",
      value: "sync",
      category: "Lifecycle",
      description: "Sync selected change with configured provider",
      slash: { name: "sync" },
      onSelect: () => void actions.runAction("sync"),
    },
    {
      title: "Start workspace",
      value: "start",
      category: "Lifecycle",
      description: "Create or enter the isolated change workspace",
      slash: { name: "start" },
      onSelect: () => void actions.runAction("start"),
    },
    {
      title: "Verify change",
      value: "verify",
      category: "Lifecycle",
      description: "Verify current workspace context",
      slash: { name: "verify" },
      onSelect: () => void actions.runAction("verify"),
    },
    {
      title: "Complete change",
      value: "complete",
      category: "Lifecycle",
      description: "Complete selected change locally",
      slash: { name: "complete" },
      onSelect: () => void actions.runAction("complete"),
    },
    {
      title: "Land change",
      value: "land",
      category: "Lifecycle",
      description: "Move completed workspace work into the default workflow",
      slash: { name: "land" },
      onSelect: () => void actions.runAction("land"),
    },
    {
      title: "Workspace status",
      value: "workspace.status",
      category: "Lifecycle",
      description: "Inspect selected Changeyard workspace state",
      slash: { name: "workspace-status" },
      onSelect: () => void actions.showWorkspaceStatus(),
    },
    {
      title: "Delete workspace",
      value: "workspace.delete",
      category: "Lifecycle",
      description: "Delete the selected Changeyard workspace",
      slash: { name: "workspace-delete" },
      onSelect: () => void actions.deleteSelectedWorkspace(),
    },
    {
      title: "Start review",
      value: "review",
      category: "Lifecycle",
      description: "Start a local review workflow",
      slash: { name: "review" },
      onSelect: () => void actions.runAction("review"),
    },
    {
      title: "Show detail",
      value: "detail",
      category: "Preview",
      description: "Show markdown detail for the selected change",
      slash: { name: "detail" },
      onSelect: () => actions.setPreviewTab("detail"),
    },
    {
      title: "Show planning",
      value: "planning",
      category: "Preview",
      description: "Show planning gates and sections",
      slash: { name: "planning" },
      onSelect: () => state.setPreviewTab("planning"),
    },
    {
      title: "Show workspace",
      value: "workspace-view",
      category: "Preview",
      description: "Show workspace state for the selected change",
      slash: { name: "workspace" },
      onSelect: () => state.setPreviewTab("workspace"),
    },
    {
      title: "Show review",
      value: "review-view",
      category: "Preview",
      description: "Show review and remote links",
      slash: { name: "review-view", aliases: ["reviewview"] },
      onSelect: () => state.setPreviewTab("review"),
    },
    {
      title: "Show activity",
      value: "activity",
      category: "Diagnostics",
      description: "Show recent change and doctor activity",
      slash: { name: "activity", aliases: ["history"] },
      onSelect: () => actions.setPreviewTab("activity"),
    },
    {
      title: "Show diagnostics",
      value: "diagnostics",
      category: "Diagnostics",
      description: "Show the latest doctor result",
      slash: { name: "diagnostics" },
      onSelect: () => actions.setPreviewTab("diagnostics"),
    },
    {
      title: "Export diagnostics",
      value: "diagnostics.export",
      category: "Diagnostics",
      description: "Write a markdown diagnostic bundle to local TUI state",
      slash: { name: "export-diagnostics", aliases: ["export"] },
      keywords: ["bundle", "markdown", "json", "activity"],
      onSelect: () => actions.exportDiagnostics(),
    },
    {
      title: "Show setup guide",
      value: "setup",
      category: "Setup",
      description: "Show project setup checklist and commands",
      slash: { name: "setup" },
      onSelect: () => actions.setPreviewTab("setup"),
    },
  ]);

  return null;
}
