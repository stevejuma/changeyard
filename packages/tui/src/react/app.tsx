import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useDialog, useDialogState } from "@opentui-ui/dialog/react";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildDiagnosticBundle } from "../utils/diagnostic-bundle";
import type { DiagnosticBundleFormat } from "../utils/diagnostic-bundle";
import type { ChangeListItem, ProjectConfigUpdateInput, RuntimeClient, TaskChatMessage } from "../runtime-client";
import {
  buildMentionOptions,
  buildSlashOptions,
  extractMentionQuery,
  getAutocompleteMode,
  insertMention,
} from "./autocomplete";
import { AutocompleteDropdown } from "./components/autocomplete-dropdown";
import { CommandPalette } from "./components/command-palette";
import type { CommandPaletteItem } from "./components/command-palette";
import { ChangeyardConfigDialog } from "./components/config-dialog";
import { InputBar } from "./components/input-bar";
import type { TextareaHandle } from "./components/input-bar";
import { StatusBar } from "./components/status-bar";
import { TrackedRobot, useMouseTracker } from "./components/tracked-robot";
import {
  DROPDOWN_MAX_HEIGHT,
  HOME_VIEW_MAX_WIDTH,
  getModeAccent,
  getModeInputBackground,
  palette,
  truncate,
} from "./palette";
import type { AutocompleteOption, ChatEntry, SlashCommand, StatusControl, TuiState, UiMode } from "./types";

export function App(props: {
  client: RuntimeClient;
  project?: string;
  debug: boolean;
  smokeTest: boolean;
  smokeCreateAll: boolean;
}) {
  const renderer = useRenderer();
  const dialog = useDialog();
  const dialogOpen = useDialogState((dialogState) => dialogState.isOpen);
  const dimensions = useTerminalDimensions();
  const [input, setInput] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [fileOptions, setFileOptions] = useState<AutocompleteOption[]>([]);
  const [uiMode, setUiMode] = useState<UiMode>("act");
  const [statusControl, setStatusControl] = useState<StatusControl>("act");
  const [selectedTemplateProfile, setSelectedTemplateProfile] = useState<string | null>(null);
  const [autoApproveAll, setAutoApproveAll] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [inputCursor, setInputCursor] = useState<{ visualCol: number; visualRow: number } | null>(null);
  const textareaRef = useRef<TextareaHandle | null>(null);
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
    chatEntries: [],
    sessionSummary: null,
    sessionMessages: [],
  });

  const setPatch = useCallback((patch: Partial<TuiState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const appendChatEntry = useCallback((entry: ChatEntry) => {
    setState((current) => ({ ...current, chatEntries: [...current.chatEntries, entry].slice(-120) }));
  }, []);

  const replaceInput = useCallback((value: string) => {
    setInput(value);
    setInputKey((key) => key + 1);
    queueMicrotask(() => textareaRef.current?.focus());
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

  const selectedAgent = state.runtimeConfig?.agents.find((agent) => agent.id === state.runtimeConfig?.selectedAgentId) ?? null;
  const checkProfiles = useMemo(() => resolveCheckProfiles(state.projectConfig), [state.projectConfig]);
  const checkProfilesKey = checkProfiles.join("\0");
  const templateProfiles = useMemo(() => resolveTemplateProfiles(state.projectConfig), [state.projectConfig]);
  const templateProfilesKey = templateProfiles.join("\0");

  useEffect(() => {
    if (templateProfiles.length === 0) {
      setSelectedTemplateProfile(null);
      return;
    }
    setSelectedTemplateProfile((current) => {
      if (current && templateProfiles.includes(current)) return current;
      return templateProfiles[0] ?? null;
    });
  }, [templateProfilesKey]);

  const selectChange = useCallback(
    async (change: ChangeListItem | null) => {
      if (!change) {
        setPatch({ selected: null, detail: null });
        return;
      }
      const detail = await props.client.getChange(change.id);
      setPatch({ selected: change, detail, view: "chat", status: `Selected ${change.id}`, error: null });
      appendChatEntry({ kind: "status", text: `Selected ${change.id}: ${change.title}` });
    },
    [appendChatEntry, props.client, setPatch],
  );

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
      startInPlanMode: uiMode === "plan",
      cols: Math.max(80, dimensions.width),
      rows: Math.max(24, dimensions.height),
    });
    if (!response.ok) {
      setPatch({ error: response.error ?? "Agent session failed to start." });
      appendChatEntry({ kind: "error", text: response.error ?? "Agent session failed to start." });
      return;
    }
    const messages = await props.client.getTaskChatMessages(selected.id).catch(() => ({ ok: false, messages: [] as TaskChatMessage[] }));
    setPatch({
      sessionSummary: response.summary,
      sessionMessages: messages.messages,
      view: "chat",
      status: `Started ${selectedAgent?.label ?? "agent"} session for ${selected.id}`,
      error: null,
    });
    appendChatEntry({ kind: "status", text: `Started ${selectedAgent?.label ?? "agent"} session for ${selected.id}` });
  }, [
    appendChatEntry,
    dimensions.height,
    dimensions.width,
    props.client,
    selectedAgent?.label,
    setPatch,
    state.detail,
    state.runtimeConfig?.selectedAgentId,
    state.selected,
    uiMode,
  ]);

  const stopAgentSession = useCallback(async () => {
    const taskId = state.sessionSummary?.taskId ?? state.selected?.id;
    if (!taskId) return;
    const response = await props.client.stopTaskSession(taskId);
    setPatch({
      sessionSummary: response.summary,
      status: response.ok ? `Stopped session ${taskId}` : "Session stop failed",
      error: response.error ?? null,
    });
    appendChatEntry({ kind: response.ok ? "status" : "error", text: response.ok ? `Stopped session ${taskId}` : response.error ?? "Session stop failed" });
  }, [appendChatEntry, props.client, setPatch, state.selected?.id, state.sessionSummary?.taskId]);

  const cycleStatusControl = useCallback(() => {
    setStatusControl((current) => {
      if (current === "plan") {
        setUiMode("act");
        return "act";
      }
      if (current === "act") {
        return "profile";
      }
      const profiles = templateProfiles.length > 0 ? templateProfiles : DEFAULT_TEMPLATE_PROFILES;
      const currentProfile = selectedTemplateProfile && profiles.includes(selectedTemplateProfile)
        ? selectedTemplateProfile
        : profiles[0] ?? "quick";
      const currentIndex = profiles.indexOf(currentProfile);
      if (currentIndex >= 0 && currentIndex < profiles.length - 1) {
        const nextProfile = profiles[currentIndex + 1] ?? currentProfile;
        setSelectedTemplateProfile(nextProfile);
        setPatch({ status: `Profile ${nextProfile}`, error: null });
        return "profile";
      }
      setUiMode("plan");
      return "plan";
    });
  }, [selectedTemplateProfile, setPatch, templateProfilesKey]);

  const sendAgentInput = useCallback(
    async (text: string) => {
      const taskId = state.sessionSummary?.taskId ?? state.selected?.id;
      if (!taskId) {
        setPatch({ error: "No active session." });
        return;
      }
      appendChatEntry({ kind: "user", text });
      const response =
        state.sessionSummary?.agentId === "cline"
          ? await props.client.sendTaskChatMessage(taskId, text)
          : await props.client.sendTaskSessionInput(taskId, text, true);
      const messages = await props.client.getTaskChatMessages(taskId).catch(() => ({ ok: false, messages: [] as TaskChatMessage[] }));
      setPatch({
        sessionSummary: response.summary,
        sessionMessages: messages.messages,
        view: "chat",
        status: `Sent input to ${taskId}`,
        error: response.error ?? null,
      });
    },
    [appendChatEntry, props.client, setPatch, state.selected?.id, state.sessionSummary?.agentId, state.sessionSummary?.taskId],
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
      setPatch({ view: "chat", status: `Wrote ${filePath}`, error: null });
      appendChatEntry({ kind: "status", text: `Wrote diagnostics: ${filePath}` });
    },
    [appendChatEntry, props.client, setPatch, state],
  );

  const showChanges = useCallback(() => {
    setPatch({ view: "chat", status: "Changes" });
    const entries: ChatEntry[] = state.changes.length
      ? state.changes.slice(0, 18).map((change) => ({ kind: "status" as const, text: `${change.id} ${change.status} ${change.title}` }))
      : [{ kind: "status", text: "No changes found." }];
    setState((current) => ({ ...current, chatEntries: [...current.chatEntries, ...entries].slice(-120) }));
  }, [setPatch, state.changes]);

  const openConfigDialog = useCallback(() => {
    void dialog.choice<void>({
      size: "large",
      closeOnEscape: true,
      closeOnClickOutside: true,
      style: { backgroundColor: "#111111", borderColor: "gray", paddingX: 2, paddingY: 1 },
      content: (context) => (
        <ChangeyardConfigDialog
          {...context}
          projectConfig={state.projectConfig}
          runtimeConfig={state.runtimeConfig}
          selectedCheckProfile={state.projectConfig?.planningQuickChangeCheckProfile ?? null}
          checkProfiles={checkProfiles}
          onSaveProjectConfig={async (patch: ProjectConfigUpdateInput, status: string, nextProfile?: string) => {
            const projectConfig = await props.client.updateProjectConfig(patch);
            setPatch({ projectConfig, status, error: null });
            return projectConfig;
          }}
          onSaveRuntimeConfig={async (selectedAgentId: string, status: string) => {
            const runtimeConfig = await props.client.saveRuntimeConfig({ selectedAgentId });
            setPatch({ runtimeConfig, status, error: null });
            return runtimeConfig;
          }}
        />
      ),
    }).finally(() => queueMicrotask(() => textareaRef.current?.focus()));
  }, [checkProfilesKey, dialog, props.client, setPatch, state.projectConfig, state.runtimeConfig]);

  const commands = useMemo<SlashCommand[]>(
    () => [
      { name: "help", description: "Show the command surface", run: () => setPatch({ view: "chat", status: "Commands: /changes /config /debug /agent /stop-agent /refresh /home" }) },
      { name: "changes", description: "List Changeyard changes", run: showChanges },
      { name: "config", description: "Open Changeyard settings", run: openConfigDialog },
      { name: "debug", description: "Write a local diagnostic bundle", run: (arg) => exportDiagnostics(arg.trim() === "json" ? "json" : "markdown") },
      { name: "agent", description: "Start the configured agent for this change", run: startAgentSession },
      { name: "stop-agent", description: "Stop the active agent session", run: stopAgentSession },
      { name: "refresh", description: "Reload runtime state", run: loadAll },
      { name: "home", description: "Return to the prompt home screen", run: () => setPatch({ view: "home", status: "Home" }) },
    ],
    [exportDiagnostics, loadAll, openConfigDialog, setPatch, showChanges, startAgentSession, stopAgentSession],
  );

  const paletteItems = useMemo<CommandPaletteItem[]>(
    () =>
      commands.map((command) => ({
        id: command.name,
        label: command.name === "debug" ? "Export diagnostics" : command.name.replace(/-/g, " "),
        description: command.description,
        shortcut: command.name === "config" ? "/config" : "",
        run: () => command.run(""),
      })),
    [commands],
  );

  const autocompleteMode = getAutocompleteMode(input);
  const slashOptions = useMemo(() => buildSlashOptions(commands, input), [commands, input]);
  const autocompleteOptions = autocompleteMode === "/" ? slashOptions : autocompleteMode === "@" ? fileOptions : [];
  const hasAutocomplete = Boolean(autocompleteMode && autocompleteOptions.length > 0);

  useEffect(() => {
    const mentionQuery = extractMentionQuery(input);
    if (mentionQuery === null) {
      setFileOptions([]);
      return;
    }
    let cancelled = false;
    void props.client.searchFiles(mentionQuery, 24).then((files) => {
      if (!cancelled) setFileOptions(buildMentionOptions(files));
    }).catch(() => {
      if (!cancelled) setFileOptions([]);
    });
    return () => {
      cancelled = true;
    };
  }, [input, props.client]);

  const applyAutocomplete = useCallback(
    (option: AutocompleteOption | undefined) => {
      if (!option) return;
      if (autocompleteMode === "@") {
        replaceInput(insertMention(input, option.value));
        return;
      }
      replaceInput(`${option.value} `);
    },
    [autocompleteMode, input, replaceInput],
  );

  const submit = useCallback(
    async (submittedValue = input) => {
      const value = submittedValue.trim();
      if (!value) return;
      replaceInput("");
      try {
        if (value.startsWith("/")) {
          const [name = "", ...rest] = value.slice(1).split(/\s+/);
          const command = commands.find((candidate) => candidate.name === name);
          if (!command) {
            setPatch({ error: `Unknown command: /${name}`, view: "chat" });
            appendChatEntry({ kind: "error", text: `Unknown command: /${name}` });
            return;
          }
          await command.run(rest.join(" "));
          return;
        }
        if (state.sessionSummary) {
          await sendAgentInput(value);
          return;
        }
        appendChatEntry({ kind: "user", text: value });
        const created = await props.client.createChange({ template: selectedTemplateProfile ?? "quick", title: value, planning: "none" });
        await loadAll();
        setPatch({ selected: created, detail: created, view: "chat", status: `Created ${created.id}`, error: null });
        appendChatEntry({ kind: "status", text: `Created ${created.id}: ${created.title}` });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPatch({ error: message, view: "chat" });
        appendChatEntry({ kind: "error", text: message });
      }
    },
    [appendChatEntry, commands, input, loadAll, props.client, replaceInput, selectedTemplateProfile, sendAgentInput, setPatch, state.sessionSummary],
  );

  useKeyboard((event) => {
    if (dialogOpen) return;
    if (commandPaletteOpen) return;
    if (event.ctrl && event.name === "p") {
      event.preventDefault();
      setCommandPaletteOpen(true);
      return;
    }
    if (event.name === "tab" && !event.shift && !autocompleteMode) {
      event.preventDefault();
      cycleStatusControl();
      return;
    }
    if (event.name === "tab" && event.shift && !autocompleteMode) {
      event.preventDefault();
      setAutoApproveAll((enabled) => !enabled);
      return;
    }
    if ((event.name === "enter" || event.name === "return") && !event.shift && !event.ctrl && !event.meta) {
      event.preventDefault();
      const selectedSlashOption = autocompleteMode === "/"
        ? autocompleteOptions[Math.min(Math.max(0, autocompleteIndex), autocompleteOptions.length - 1)]
        : undefined;
      void submit(selectedSlashOption?.value ?? textareaRef.current?.plainText ?? input);
      return;
    }
    if (autocompleteOptions.length === 0) return;
    if (event.name === "escape") {
      event.preventDefault();
      setFileOptions([]);
      replaceInput(input);
      return;
    }
    if (event.name === "down" || (event.ctrl && event.name === "n")) {
      event.preventDefault();
      setAutocompleteIndex((current) => (current >= autocompleteOptions.length - 1 ? 0 : current + 1));
      return;
    }
    if (event.name === "up") {
      event.preventDefault();
      setAutocompleteIndex((current) => (current <= 0 ? autocompleteOptions.length - 1 : current - 1));
      return;
    }
    if (event.name === "tab") {
      event.preventDefault();
      applyAutocomplete(autocompleteOptions[Math.max(0, autocompleteIndex)]);
    }
  });

  const composer = (
    <ComposerStack
      input={input}
      inputKey={inputKey}
      uiMode={uiMode}
      state={state}
      width={dimensions.width}
      variant={state.view === "home" ? "home" : "chat"}
      hasAutocomplete={hasAutocomplete}
      autocompleteMode={autocompleteMode}
      autocompleteOptions={autocompleteOptions}
      autocompleteIndex={autocompleteIndex}
      textareaRef={textareaRef}
      autoApproveAll={autoApproveAll}
      selectedProfile={selectedTemplateProfile}
      statusControl={statusControl}
      onChange={setInput}
      onSubmit={() => void submit(textareaRef.current?.plainText ?? input)}
      onVisualCursorChange={setInputCursor}
      onSelectAutocomplete={applyAutocomplete}
      onCycleStatusControl={cycleStatusControl}
    />
  );

  return (
    <box width={Math.max(dimensions.width, 80)} height={Math.max(dimensions.height, 24)} flexDirection="column">
      {state.view === "home" ? (
        <HomeView width={dimensions.width} height={dimensions.height} composer={composer} project={props.project} inputCursor={inputCursor} hasInput={input.trim().length > 0} />
      ) : (
        <>
          <ChatView state={state} onSelectChange={selectChange} />
          {composer}
        </>
      )}
      {commandPaletteOpen ? (
        <CommandPalette
          items={paletteItems}
          onClose={() => {
            setCommandPaletteOpen(false);
            queueMicrotask(() => textareaRef.current?.focus());
          }}
          onRun={(item) => {
            setCommandPaletteOpen(false);
            void Promise.resolve(item.run()).finally(() => queueMicrotask(() => textareaRef.current?.focus()));
          }}
        />
      ) : null}
    </box>
  );
}

function ComposerStack(props: {
  input: string;
  inputKey: number;
  uiMode: UiMode;
  state: TuiState;
  width: number;
  variant: "home" | "chat";
  hasAutocomplete: boolean;
  autocompleteMode: ReturnType<typeof getAutocompleteMode>;
  autocompleteOptions: AutocompleteOption[];
  autocompleteIndex: number;
  textareaRef: React.MutableRefObject<TextareaHandle | null>;
  autoApproveAll: boolean;
  selectedProfile: string | null;
  statusControl: StatusControl;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onVisualCursorChange?: (cursor: { visualCol: number; visualRow: number }) => void;
  onSelectAutocomplete: (option: AutocompleteOption) => void;
  onCycleStatusControl: () => void;
}) {
  const contentWidth = props.variant === "home" ? Math.min(props.width, HOME_VIEW_MAX_WIDTH) : props.width;
  const accent = getModeAccent(props.uiMode);
  return (
    <box flexDirection="column" width={contentWidth} alignSelf={props.variant === "home" ? "center" : undefined} flexShrink={0}>
      {props.variant === "chat" && props.hasAutocomplete ? (
        <AutocompleteDropdown
          mode={props.autocompleteMode}
          options={props.autocompleteOptions}
          selected={props.autocompleteIndex}
          onSelect={props.onSelectAutocomplete}
          accent={accent}
          containerWidth={contentWidth}
        />
      ) : null}
      <box marginBottom={props.variant === "chat" ? 1 : 0}>
        <InputBar
          accent={accent}
          inputBackground={getModeInputBackground(props.uiMode)}
          inputForeground={palette.inputFg}
          inputPlaceholder={palette.inputPlaceholder}
          placeholder={props.uiMode === "plan" ? "Plan something..." : "What can I do for you?"}
          initialValue={props.input}
          inputKey={props.inputKey}
          onContentChange={props.onChange}
          onSubmit={props.onSubmit}
          onVisualCursorChange={props.onVisualCursorChange}
          textareaRef={props.textareaRef}
        />
      </box>
      {props.variant === "home" ? (
        <box flexDirection="column" height={DROPDOWN_MAX_HEIGHT + 2} marginTop={1}>
          {props.hasAutocomplete ? (
            <AutocompleteDropdown
              mode={props.autocompleteMode}
              options={props.autocompleteOptions}
              selected={props.autocompleteIndex}
              onSelect={props.onSelectAutocomplete}
              accent={accent}
              containerWidth={contentWidth}
            />
          ) : (
            <StatusBar
              state={props.state}
              width={props.width}
              uiMode={props.uiMode}
              statusControl={props.statusControl}
              selectedProfile={props.selectedProfile}
              autoApproveAll={props.autoApproveAll}
              onCycleStatusControl={props.onCycleStatusControl}
              variant="home"
            />
          )}
        </box>
      ) : (
        <StatusBar
          state={props.state}
          width={props.width}
          uiMode={props.uiMode}
          statusControl={props.statusControl}
          selectedProfile={props.selectedProfile}
          autoApproveAll={props.autoApproveAll}
          onCycleStatusControl={props.onCycleStatusControl}
          variant="chat"
        />
      )}
    </box>
  );
}

function HomeView(props: {
  width: number;
  height: number;
  composer: React.ReactNode;
  project?: string;
  inputCursor: { visualCol: number; visualRow: number } | null;
  hasInput: boolean;
}) {
  const mouse = useMouseTracker();
  const centerX = Math.floor(props.width / 2);
  const inputStartX = Math.floor((props.width - Math.min(props.width, HOME_VIEW_MAX_WIDTH)) / 2) + 4;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const trackedCursorX = props.hasInput ? clamp(inputStartX + (props.inputCursor?.visualCol ?? 0), 0, props.width) : mouse.cursor.x || centerX;
  const trackedCursorY = props.hasInput ? clamp(props.height - 2 + (props.inputCursor?.visualRow ?? 0), 0, props.height) : mouse.cursor.y;
  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      alignItems="center"
      justifyContent="center"
      onMouseMove={mouse.onMouseMove}
    >
      <TrackedRobot cursorX={trackedCursorX} cursorY={trackedCursorY} centerX={centerX} />
      <box marginTop={1} marginBottom={1} flexShrink={0}>
        <text fg={palette.text}>
          <strong>What can I do for you?</strong>
        </text>
      </box>
      <box marginBottom={1} flexShrink={0}>
        <text fg="gray">
          <em>Use / for slash commands, @ for file mentions, Ctrl+P for menu</em>
        </text>
      </box>
      {props.composer}
    </box>
  );
}

function ChatView(props: { state: TuiState; onSelectChange: (change: ChangeListItem) => void }) {
  const entries = buildVisibleChatEntries(props.state);
  return (
    <box flexGrow={1} minHeight={0} flexDirection="column" paddingX={2} paddingY={1}>
      {entries.length === 0 ? (
        <box flexGrow={1} justifyContent="center" alignItems="center">
          <text fg="gray">No messages yet.</text>
        </box>
      ) : (
        <box flexGrow={1} minHeight={0} flexDirection="column" justifyContent="flex-end">
          {entries.slice(-24).map((entry, index) => (
            <ChatRow key={`${index}-${entry.kind}-${entry.text}`} entry={entry} />
          ))}
        </box>
      )}
      {props.state.changes.length > 0 ? (
        <box flexDirection="row" gap={1} marginTop={1} flexShrink={0}>
          {props.state.changes.slice(0, 3).map((change) => (
            <box key={change.id} paddingX={1} border borderStyle="rounded" borderColor="gray" onMouseDown={() => props.onSelectChange(change)}>
              <text fg={change.id === props.state.selected?.id ? palette.act : "gray"} wrapMode="none">
                {truncate(`${change.id} ${change.status}`, 24)}
              </text>
            </box>
          ))}
        </box>
      ) : null}
    </box>
  );
}

function ChatRow(props: { entry: ChatEntry }) {
  const prefix = props.entry.kind === "user" ? ">" : props.entry.kind === "error" ? "!" : "·";
  const color = props.entry.kind === "user" ? palette.act : props.entry.kind === "error" ? palette.red : props.entry.kind === "assistant" ? palette.text : "gray";
  return (
    <box marginBottom={0}>
      <text fg={color} wrapMode="word">
        <span fg={props.entry.kind === "user" ? palette.act : "gray"}>{prefix} </span>
        {props.entry.text}
      </text>
    </box>
  );
}

function buildVisibleChatEntries(state: TuiState): ChatEntry[] {
  const sessionEntries: ChatEntry[] = state.sessionMessages.map((message) => ({
    kind: message.role === "user" ? "user" : message.role === "assistant" ? "assistant" : message.role === "reasoning" ? "assistant" : "status",
    text: `${message.meta?.displayRole ?? message.role}: ${message.content}`,
  }));
  if (sessionEntries.length > 0) return [...state.chatEntries, ...sessionEntries];
  if (state.chatEntries.length > 0) return state.chatEntries;
  if (!state.selected) return [];
  return [
    { kind: "status", text: `${state.selected.id}: ${state.selected.title}` },
    { kind: "status", text: state.detail?.workspace?.path ?? "workspace not started" },
    { kind: "status", text: state.detail?.planning?.nextAction ?? "no planning next action" },
  ];
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

function resolveCheckProfiles(projectConfig: TuiState["projectConfig"]): string[] {
  const configured = projectConfig?.checkProfiles?.map((profile) => profile.trim()).filter(Boolean) ?? [];
  const profiles = configured.length > 0 ? configured : ["minimal", "standard", "full"];
  return [...new Set(profiles)];
}

const DEFAULT_TEMPLATE_PROFILES = ["quick", "feature", "bug", "refactor", "agent-task", "review"];

function resolveTemplateProfiles(projectConfig: TuiState["projectConfig"]): string[] {
  const configured = projectConfig?.templateProfiles?.map((profile) => profile.trim()).filter(Boolean) ?? [];
  const profiles = configured.length > 0 ? configured : DEFAULT_TEMPLATE_PROFILES;
  return [...new Set(profiles)];
}
