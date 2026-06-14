import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildDiagnosticBundle } from "../utils/diagnostic-bundle";
import type { DiagnosticBundleFormat } from "../utils/diagnostic-bundle";
import type { RuntimeClient, ChangeListItem, TaskChatMessage } from "../runtime-client";
import {
  buildMentionOptions,
  buildSlashOptions,
  extractMentionQuery,
  getAutocompleteMode,
  insertMention,
} from "./autocomplete";
import { AutocompleteDropdown } from "./components/autocomplete-dropdown";
import { ConfigPanel } from "./components/config-panel";
import { InputBar } from "./components/input-bar";
import { SessionPanel } from "./components/session-panel";
import { StatusBar } from "./components/status-bar";
import { TrackedLogo } from "./components/tracked-logo";
import { palette, truncate } from "./palette";
import type { AutocompleteOption, SlashCommand, TuiState, ViewMode } from "./types";

export function App(props: {
  client: RuntimeClient;
  project?: string;
  debug: boolean;
  smokeTest: boolean;
  smokeCreateAll: boolean;
}) {
  const renderer = useRenderer();
  const dimensions = useTerminalDimensions();
  const [input, setInput] = useState("");
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [fileOptions, setFileOptions] = useState<AutocompleteOption[]>([]);
  const [state, setState] = useState<TuiState>({
    changes: [],
    selected: null,
    detail: null,
    projectConfig: null,
    runtimeConfig: null,
    repoStatus: null,
    doctor: null,
    runtimeHealthy: false,
    status: "Loading Changeyard runtime...",
    error: null,
    view: "home",
    sessionSummary: null,
    sessionMessages: [],
  });

  const setPatch = useCallback((patch: Partial<TuiState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const loadAll = useCallback(async () => {
    try {
      await props.client.health();
      await props.client.selectCurrentWorkspace();
      const [changes, projectConfig, runtimeConfig, repoStatus, doctor] = await Promise.all([
        props.client.listChanges(),
        props.client.getProjectConfig().catch(() => null),
        props.client.getRuntimeConfig().catch(() => null),
        props.client.getRepositoryStatus().catch(() => null),
        props.client.doctorProject().catch(() => null),
      ]);
      const selected = changes[0] ?? null;
      const detail = selected ? await props.client.getChange(selected.id) : null;
      setPatch({
        changes,
        selected,
        detail,
        projectConfig,
        runtimeConfig,
        repoStatus,
        doctor,
        runtimeHealthy: true,
        status: changes.length > 0 ? "Ready" : "No changes",
        error: null,
      });
    } catch (error) {
      setPatch({
        runtimeHealthy: false,
        status: "Runtime unavailable",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [props.client, setPatch]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const subscription = props.client.subscribeToRuntimeEvents(() => {
      void loadAll();
    });
    return () => subscription.unsubscribe();
  }, [loadAll, props.client]);

  useEffect(() => {
    if (!props.smokeTest) return;
    const timer = setTimeout(() => renderer.destroy(), 900);
    return () => clearTimeout(timer);
  }, [props.smokeTest, renderer]);

  const selectChange = useCallback(
    async (change: ChangeListItem | null) => {
      if (!change) {
        setPatch({ selected: null, detail: null });
        return;
      }
      const detail = await props.client.getChange(change.id);
      setPatch({ selected: change, detail, view: "workspace", status: `Selected ${change.id}`, error: null });
    },
    [props.client, setPatch],
  );

  const selectedAgent = state.runtimeConfig?.agents.find((agent) => agent.id === state.runtimeConfig?.selectedAgentId) ?? null;

  const startAgentSession = useCallback(async () => {
    const selected = state.selected;
    const detail = state.detail;
    if (!selected || !detail) {
      setPatch({ error: "Select a change before starting an agent session." });
      return;
    }
    const prompt = buildChangeyardPrompt(detail);
    const response = await props.client.startTaskSession({
      taskId: selected.id,
      taskTitle: selected.title,
      prompt,
      baseRef: "main",
      agentId: state.runtimeConfig?.selectedAgentId,
      startInPlanMode: true,
      cols: Math.max(80, dimensions.width),
      rows: Math.max(24, dimensions.height),
    });
    if (!response.ok) {
      setPatch({ error: response.error ?? "Agent session failed to start." });
      return;
    }
    const messages = await props.client.getTaskChatMessages(selected.id).catch(() => ({ ok: false, messages: [] as TaskChatMessage[] }));
    setPatch({
      sessionSummary: response.summary,
      sessionMessages: messages.messages,
      view: "workspace",
      status: `Started ${selectedAgent?.label ?? "agent"} session for ${selected.id}`,
      error: null,
    });
  }, [dimensions.height, dimensions.width, props.client, selectedAgent?.label, setPatch, state.detail, state.runtimeConfig?.selectedAgentId, state.selected]);

  const stopAgentSession = useCallback(async () => {
    const taskId = state.sessionSummary?.taskId ?? state.selected?.id;
    if (!taskId) return;
    const response = await props.client.stopTaskSession(taskId);
    setPatch({
      sessionSummary: response.summary,
      status: response.ok ? `Stopped session ${taskId}` : "Session stop failed",
      error: response.error ?? null,
    });
  }, [props.client, setPatch, state.selected?.id, state.sessionSummary?.taskId]);

  const sendAgentInput = useCallback(
    async (text: string) => {
      const taskId = state.sessionSummary?.taskId ?? state.selected?.id;
      if (!taskId) {
        setPatch({ error: "No active session." });
        return;
      }
      const response =
        state.sessionSummary?.agentId === "cline"
          ? await props.client.sendTaskChatMessage(taskId, text)
          : await props.client.sendTaskSessionInput(taskId, text, true);
      const messages = await props.client.getTaskChatMessages(taskId).catch(() => ({ ok: false, messages: [] as TaskChatMessage[] }));
      setPatch({
        sessionSummary: response.summary,
        sessionMessages: messages.messages,
        status: `Sent input to ${taskId}`,
        error: response.error ?? null,
      });
    },
    [props.client, setPatch, state.selected?.id, state.sessionSummary?.agentId, state.sessionSummary?.taskId],
  );

  const exportDiagnostics = useCallback(
    async (format: DiagnosticBundleFormat = "markdown") => {
      const generatedAt = new Date().toISOString();
      const selectedAgent = state.runtimeConfig?.agents.find((agent) => agent.id === state.runtimeConfig?.selectedAgentId) ?? null;
      const content = buildDiagnosticBundle(
        {
          generatedAt,
          runtimeUrl: props.client.getRuntimeUrl(),
          workspaceId: props.client.getWorkspaceId(),
          runtimeHealthy: state.runtimeHealthy,
          eventRefreshMode: "events",
          lastRefreshAt: generatedAt,
          lastRefreshError: state.error,
          status: state.status,
          error: state.error,
          selected: state.selected,
          detail: state.detail,
          changes: state.changes,
          doctor: state.doctor,
          projectConfig: state.projectConfig,
          runtimeConfig: state.runtimeConfig,
          selectedAgent,
          activityEvents: [],
        },
        format,
      );
      const dir = path.join(homedir(), ".changeyard", "tui-diagnostics");
      await mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `changeyard-tui-diagnostics-${generatedAt.replace(/[:.]/g, "-")}.${format === "json" ? "json" : "md"}`);
      await writeFile(filePath, content, "utf8");
      setPatch({ status: `Wrote ${filePath}`, error: null });
    },
    [props.client, setPatch, state],
  );

  const commands = useMemo<SlashCommand[]>(
    () => [
      { name: "help", description: "Show the command surface", run: () => setPatch({ status: "Commands: /config /workspace /refresh /start /verify /complete /land /agent /stop-agent /export-diagnostics" }) },
      { name: "config", description: "Open the control panel", run: () => setPatch({ view: "config", status: "Config" }) },
      { name: "workspace", description: "Open the workspace activity view", run: () => setPatch({ view: "workspace", status: "Workspace" }) },
      { name: "home", description: "Open the landing view", run: () => setPatch({ view: "home", status: "Home" }) },
      { name: "refresh", description: "Reload runtime state", run: loadAll },
      { name: "start", description: "Start the selected Changeyard change", run: async () => state.selected && setPatch({ detail: await props.client.start(state.selected.id), status: `Started ${state.selected.id}` }) },
      { name: "verify", description: "Verify the selected workspace", run: async () => state.selected && setPatch({ status: (await props.client.verify(state.selected.id)).message }) },
      { name: "complete", description: "Complete the selected change locally", run: async () => state.selected && setPatch({ status: (await props.client.complete(state.selected.id)).message }) },
      { name: "land", description: "Land the selected change", run: async () => state.selected && setPatch({ status: (await props.client.land(state.selected.id)).message }) },
      { name: "agent", description: "Start the configured agent for this change", run: startAgentSession },
      { name: "stop-agent", description: "Stop the active agent session", run: stopAgentSession },
      { name: "export-diagnostics", description: "Write a local diagnostic bundle", run: (arg) => exportDiagnostics(arg.trim() === "json" ? "json" : "markdown") },
    ],
    [exportDiagnostics, loadAll, props.client, setPatch, startAgentSession, state.selected, stopAgentSession],
  );

  const autocompleteMode = getAutocompleteMode(input);
  const slashOptions = useMemo(() => buildSlashOptions(commands, input), [commands, input]);
  const autocompleteOptions = autocompleteMode === "/" ? slashOptions : autocompleteMode === "@" ? fileOptions : [];

  useEffect(() => {
    const mentionQuery = extractMentionQuery(input);
    if (mentionQuery === null) {
      setFileOptions([]);
      return;
    }
    let cancelled = false;
    void props.client.searchFiles(mentionQuery, 12).then((files) => {
      if (!cancelled) setFileOptions(buildMentionOptions(files));
    }).catch(() => {
      if (!cancelled) setFileOptions([]);
    });
    return () => {
      cancelled = true;
    };
  }, [input, props.client]);

  useKeyboard((event) => {
    if (autocompleteOptions.length === 0) return;
    if (event.name === "down") {
      event.preventDefault();
      setAutocompleteIndex((current) => Math.min(autocompleteOptions.length - 1, current + 1));
    }
    if (event.name === "up") {
      event.preventDefault();
      setAutocompleteIndex((current) => Math.max(0, current - 1));
    }
    if (event.name === "tab") {
      event.preventDefault();
      applyAutocomplete(autocompleteOptions[Math.max(0, autocompleteIndex)]);
    }
  });

  const applyAutocomplete = (option: AutocompleteOption | undefined) => {
    if (!option) return;
    if (autocompleteMode === "@") {
      setInput(insertMention(input, option.value));
      return;
    }
    setInput(`${option.value} `);
  };

  const submit = async (submittedValue = input) => {
    const value = submittedValue.trim();
    if (!value) return;
    setInput("");
    try {
      if (value.startsWith("/")) {
        const [name = "", ...rest] = value.slice(1).split(/\s+/);
        const command = commands.find((candidate) => candidate.name === name);
        if (!command) {
          setPatch({ error: `Unknown command: /${name}` });
          return;
        }
        await command.run(rest.join(" "));
        return;
      }
      if (state.sessionSummary) {
        await sendAgentInput(value);
        return;
      }
      const created = await props.client.createChange({ template: "quick", title: value, planning: "none" });
      await loadAll();
      setPatch({ selected: created, detail: created, view: "workspace", status: `Created ${created.id}` });
    } catch (error) {
      setPatch({ error: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <box width={Math.max(dimensions.width, 80)} height={Math.max(dimensions.height, 24)} flexDirection="column" backgroundColor={palette.bg}>
      <box flexGrow={1} minHeight={0} flexDirection="column">
        {state.view === "config" ? (
          <ConfigPanel state={state} />
        ) : state.view === "workspace" ? (
          <WorkspaceView state={state} onSelectChange={selectChange} />
        ) : (
          <HomeView state={state} project={props.project} />
        )}
      </box>
      <box flexDirection="column" paddingX={2} paddingBottom={1}>
        <AutocompleteDropdown
          mode={autocompleteMode}
          options={autocompleteOptions}
          selected={autocompleteIndex}
          onSelect={applyAutocomplete}
        />
        <InputBar value={input} placeholder="What change should move next?" onChange={setInput} onSubmit={submit} />
      </box>
      <StatusBar state={state} width={dimensions.width} />
    </box>
  );
}

function HomeView(props: { state: TuiState; project?: string }) {
  return (
    <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center" paddingX={2}>
      <TrackedLogo />
      <box marginTop={1}>
        <text fg={palette.text}>
          <strong>Changeyard</strong>
        </text>
      </box>
      <text fg={palette.muted}>{props.project ?? "current project"}</text>
      <box marginTop={1} border borderStyle="rounded" borderColor={palette.border} paddingX={2} paddingY={1}>
        <text fg={palette.text}>
          {props.state.repoStatus
            ? `${props.state.repoStatus.type} ${props.state.repoStatus.displayRef} | ${props.state.repoStatus.diffSummary}`
            : "repository status loading"}
        </text>
      </box>
      <box marginTop={1}>
        <text fg={palette.faint}>{`${props.state.changes.length} changes  |  ${props.state.runtimeConfig?.selectedAgentId ?? "agent"}`}</text>
      </box>
    </box>
  );
}

function WorkspaceView(props: { state: TuiState; onSelectChange: (change: ChangeListItem) => void }) {
  return (
    <box flexGrow={1} flexDirection="row" minHeight={0} paddingX={2} paddingY={1}>
      <box width={34} flexDirection="column" border borderStyle="rounded" borderColor={palette.border} paddingX={1} paddingY={1}>
        <text fg={palette.accent}>
          <strong>Changes</strong>
        </text>
        {props.state.changes.slice(0, 14).map((change) => {
          const active = change.id === props.state.selected?.id;
          return (
            <box key={change.id} backgroundColor={active ? palette.selection : undefined} onMouseDown={() => props.onSelectChange(change)}>
              <text fg={active ? palette.selectionText : palette.text} wrapMode="none">
                {truncate(`${change.id} ${change.status} ${change.title}`, 30)}
              </text>
            </box>
          );
        })}
      </box>
      <box flexGrow={1} flexDirection="column" minWidth={0} marginLeft={1}>
        <box border borderStyle="rounded" borderColor={palette.border} paddingX={1} paddingY={1} marginBottom={1}>
          <text fg={palette.text}>
            <strong>{props.state.detail ? `${props.state.detail.id}: ${props.state.detail.title}` : "No selected change"}</strong>
          </text>
          <text fg={palette.muted}>{props.state.detail?.workspace?.path ?? "workspace not started"}</text>
          <text fg={palette.faint}>{props.state.detail?.planning?.nextAction ?? "no planning next action"}</text>
        </box>
        <SessionPanel state={props.state} />
      </box>
    </box>
  );
}

function buildChangeyardPrompt(detail: { id: string; title: string; status: string; body: string; sections: Array<{ title: string; content: string }> }): string {
  const sections = detail.sections
    .map((section) => `## ${section.title}\n${section.content.trim() || "(empty)"}`)
    .join("\n\n");
  return [
    `You are working on Changeyard change ${detail.id}: ${detail.title}.`,
    `Current status: ${detail.status}.`,
    "Follow the Changeyard workflow for this repository. Keep changes scoped to this task and update completion notes when implementation is done.",
    "",
    detail.body.trim() ? detail.body.trim() : sections,
  ].join("\n");
}
