import { createCliRenderer, SyntaxStyle } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer } from "@opentui/react";
import { useEffect, useState } from "react";
import { RuntimeClient, RuntimeClientError, type ChangeDetail, type ChangeListItem, type PlanningSectionId } from "./runtime-client";

type Args = {
  connect: string;
  project?: string;
  debug: boolean;
  smokeTest: boolean;
  smokeCreateAll: boolean;
};

type PreviewTab = "detail" | "planning" | "workspace" | "review";
type DialogId = "create" | "help" | "prompt";

type CreatePreset = {
  id: "quick" | "planned" | "strict" | "legacy";
  label: string;
  help: string;
  template: "feature" | "bug" | "refactor" | "agent-task" | "quick";
  planning?: "none" | "openspec-lite";
  strict?: boolean;
};

type CommandDef = {
  name: string;
  aliases?: string[];
  description: string;
  run: (args: string[]) => void;
};

const markdownSyntaxStyle = SyntaxStyle.fromStyles({});
const createPresets: CreatePreset[] = [
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

function parseArgs(argv: string[]): Args {
  const args: Args = { connect: "", debug: false, smokeTest: false, smokeCreateAll: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--debug") {
      args.debug = true;
      continue;
    }
    if (arg === "--smoke-test") {
      args.smokeTest = true;
      continue;
    }
    if (arg === "--smoke-create-all") {
      args.smokeCreateAll = true;
      continue;
    }
    if (arg === "--connect") {
      args.connect = argv[++index] ?? "";
      continue;
    }
    if (arg === "--project") {
      args.project = argv[++index] ?? "";
    }
  }
  if (!args.connect) {
    throw new Error("Missing --connect <runtime-url>.");
  }
  return args;
}

function groupChanges(changes: ChangeListItem[]): Array<[string, ChangeListItem[]]> {
  const grouped = new Map<string, ChangeListItem[]>();
  for (const change of changes) {
    const current = grouped.get(change.status) ?? [];
    current.push(change);
    grouped.set(change.status, current);
  }
  return Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function badgeText(change: ChangeListItem): string {
  const mode = change.type === "quick" || change.planning === null ? "quick/none" : `${change.planning.model}/${change.planning.strictness}`;
  const remote = change.remote?.issueUrl || change.remote?.pullRequestUrl ? "remote" : "local";
  const workspace = change.workspace?.path ? "workspace" : "no-workspace";
  return `${mode}  ${remote}  ${workspace}`;
}

function firstPromptSection(detail: ChangeDetail | null): PlanningSectionId | null {
  return detail?.sections[0]?.id ?? null;
}

function buildDefaultCreateTitle(preset: CreatePreset): string {
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "-");
  if (preset.template === "quick") return `Quick TUI change ${stamp}`;
  if (preset.strict) return `Strict planned TUI change ${stamp}`;
  if (preset.planning === "openspec-lite") return `Planned TUI change ${stamp}`;
  return `Legacy TUI task ${stamp}`;
}

function presetIndexFromArg(arg: string | undefined): number {
  const normalized = (arg ?? "").toLowerCase();
  if (normalized === "quick") return 0;
  if (normalized === "planned" || normalized === "plan") return 1;
  if (normalized === "strict") return 2;
  if (normalized === "legacy") return 3;
  return 0;
}

function parseSlashCommand(text: string): { commandName: string; args: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const [first, ...rest] = trimmed.slice(1).split(/\s+/);
  if (!first) {
    return null;
  }
  return {
    commandName: first.toLowerCase(),
    args: rest,
  };
}

function App({ client, project, smokeTest, smokeCreateAll }: { client: RuntimeClient; project?: string; smokeTest: boolean; smokeCreateAll: boolean }) {
  const renderer = useRenderer();
  const [changes, setChanges] = useState<ChangeListItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detail, setDetail] = useState<ChangeDetail | null>(null);
  const [status, setStatus] = useState("Connecting to Changeyard runtime...");
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>("detail");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeDialog, setActiveDialog] = useState<DialogId | null>(null);

  const [composer, setComposer] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteIndex, setPaletteIndex] = useState(0);

  const [createIndex, setCreateIndex] = useState(0);
  const [createTitle, setCreateTitle] = useState(buildDefaultCreateTitle(createPresets[0]));

  const selected = changes[selectedIndex] ?? null;
  const activePreset = createPresets[createIndex] ?? createPresets[0];

  function updateSelection(nextIndex: number, nextChanges = changes) {
    const clampedIndex = nextChanges.length === 0 ? 0 : Math.max(0, Math.min(nextChanges.length - 1, nextIndex));
    setSelectedIndex(clampedIndex);
    const nextSelected = nextChanges[clampedIndex] ?? null;
    if (nextSelected) {
      void client.getChange(nextSelected.id).then(setDetail).catch((caught) => {
        setError(caught instanceof Error ? caught.message : String(caught));
      });
    } else {
      setDetail(null);
    }
  }

  function updateCreatePreset(nextIndex: number) {
    const clampedIndex = Math.max(0, Math.min(createPresets.length - 1, nextIndex));
    const nextPreset = createPresets[clampedIndex] ?? createPresets[0];
    setCreateIndex(clampedIndex);
    setCreateTitle(buildDefaultCreateTitle(nextPreset));
  }

  async function refresh(nextSelectedId = selected?.id) {
    setError(null);
    await client.health();
    await client.selectCurrentWorkspace();
    const nextChanges = await client.listChanges();
    setChanges(nextChanges);
    const desiredIndex = nextSelectedId ? nextChanges.findIndex((change) => change.id === nextSelectedId) : 0;
    const clampedIndex = desiredIndex >= 0 ? desiredIndex : 0;
    setSelectedIndex(clampedIndex);
    const nextSelected = nextChanges[clampedIndex] ?? null;
    setDetail(nextSelected ? await client.getChange(nextSelected.id) : null);
    setStatus(nextChanges.length === 0 ? "No changes yet. Run /create quick to start." : "Ready");
  }

  async function runAction(action: "validate" | "sync" | "start" | "verify" | "complete" | "review") {
    if (!selected) {
      setStatus("Select a change first.");
      return;
    }
    setError(null);
    setStatus(`${action} ${selected.id}...`);
    try {
      if (action === "validate") {
        setDetail(await client.validate(selected.id));
        setStatus(`Validated ${selected.id}`);
      } else if (action === "sync") {
        setDetail(await client.sync(selected.id));
        setStatus(`Synced ${selected.id}`);
      } else if (action === "start") {
        setDetail(await client.start(selected.id));
        setStatus(`Started ${selected.id}`);
      } else if (action === "verify") {
        const result = await client.verify(selected.id);
        setDetail(result.change);
        setStatus(result.message);
      } else if (action === "complete") {
        const result = await client.complete(selected.id);
        setDetail(result.change);
        setStatus(result.message);
      } else {
        const result = await client.reviewStart(selected.id);
        setDetail(result.change);
        setStatus(result.message);
      }
      await refresh(selected.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Action failed");
    }
  }

  async function createChangeFromPreset() {
    setError(null);
    setStatus(`Creating ${activePreset.label.toLowerCase()}...`);
    try {
      const created = await client.createChange({
        template: activePreset.template,
        title: createTitle.trim() || buildDefaultCreateTitle(activePreset),
        planning: activePreset.planning,
        strict: activePreset.strict,
      });
      setPreviewTab("detail");
      setDetail(created);
      setPrompt(null);
      setStatus(`Created ${created.id}`);
      setActiveDialog(null);
      setComposer("");
      await refresh(created.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Create failed");
    }
  }

  async function loadPrompt() {
    if (!selected) {
      setStatus("Select a change first.");
      return;
    }
    const sectionId = firstPromptSection(detail);
    if (!sectionId) {
      setPrompt(null);
      setStatus("No planning section is available for this change.");
      return;
    }
    try {
      const result = await client.planningPrompt(selected.id, sectionId);
      setPrompt(result.prompt);
      setActiveDialog("prompt");
      setPreviewTab("planning");
      setStatus(`Loaded ${sectionId} prompt for ${selected.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Could not load planning prompt");
    }
  }

  const commands: CommandDef[] = [
    {
      name: "help",
      description: "Open key and command help",
      run: () => setActiveDialog("help"),
    },
    {
      name: "refresh",
      aliases: ["r"],
      description: "Refresh change list and selected detail",
      run: () => {
        void refresh();
      },
    },
    {
      name: "sidebar",
      description: "Toggle sidebar visibility",
      run: () => setSidebarOpen((value) => !value),
    },
    {
      name: "create",
      aliases: ["new"],
      description: "Open create panel: /create quick|planned|strict|legacy",
      run: (args) => {
        const nextIndex = presetIndexFromArg(args[0]);
        updateCreatePreset(nextIndex);
        setActiveDialog("create");
        setPreviewTab("detail");
        setStatus("Choose preset and press Enter to create.");
      },
    },
    {
      name: "prompt",
      description: "Load first planning prompt for selected change",
      run: () => {
        void loadPrompt();
      },
    },
    {
      name: "validate",
      description: "Run validate on selected change",
      run: () => {
        void runAction("validate");
      },
    },
    {
      name: "sync",
      description: "Run sync on selected change",
      run: () => {
        void runAction("sync");
      },
    },
    {
      name: "start",
      description: "Start workspace for selected change",
      run: () => {
        void runAction("start");
      },
    },
    {
      name: "verify",
      description: "Run verify for selected change",
      run: () => {
        void runAction("verify");
      },
    },
    {
      name: "complete",
      description: "Complete selected change (no PR)",
      run: () => {
        void runAction("complete");
      },
    },
    {
      name: "review",
      description: "Start review for selected change",
      run: () => {
        void runAction("review");
      },
    },
    {
      name: "detail",
      description: "Show detail preview",
      run: () => setPreviewTab("detail"),
    },
    {
      name: "planning",
      description: "Show planning preview",
      run: () => setPreviewTab("planning"),
    },
    {
      name: "workspace",
      description: "Show workspace preview",
      run: () => setPreviewTab("workspace"),
    },
    {
      name: "review-view",
      aliases: ["reviewview"],
      description: "Show review preview",
      run: () => setPreviewTab("review"),
    },
  ];

  function executeSlash(raw: string): boolean {
    const parsed = parseSlashCommand(raw);
    if (!parsed) {
      return false;
    }
    const command = commands.find((entry) => {
      if (entry.name === parsed.commandName) return true;
      return (entry.aliases ?? []).includes(parsed.commandName);
    });
    if (!command) {
      setStatus(`Unknown command: /${parsed.commandName}`);
      return false;
    }
    command.run(parsed.args);
    return true;
  }

  const slashQuery = composer.trim().startsWith("/") ? composer.trim().slice(1).toLowerCase() : "";
  const slashMatches = slashQuery.length === 0
    ? commands
    : commands.filter((entry) => {
      const names = [entry.name, ...(entry.aliases ?? [])].join(" ");
      return names.includes(slashQuery);
    });

  const paletteMatches = slashMatches;
  const safePaletteIndex = paletteMatches.length === 0
    ? 0
    : Math.max(0, Math.min(paletteMatches.length - 1, paletteIndex));

  useEffect(() => {
    void refresh().catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Runtime connection failed");
    });
  }, []);

  useEffect(() => {
    setPaletteIndex(safePaletteIndex);
  }, [safePaletteIndex]);

  useEffect(() => {
    if (!smokeTest) return;
    let cancelled = false;
    const runSmoke = async () => {
      if (smokeCreateAll) {
        for (let index = 0; index < createPresets.length; index += 1) {
          if (cancelled) return;
          const preset = createPresets[index];
          try {
            const created = await client.createChange({
              template: preset.template,
              title: buildDefaultCreateTitle(preset),
              planning: preset.planning,
              strict: preset.strict,
            });
            setDetail(created);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
            setStatus("Smoke create failed");
            renderer.destroy();
            return;
          }
        }
        if (!cancelled) {
          await refresh();
        }
      }
      const timeout = setTimeout(() => {
        renderer.destroy();
      }, 800);
      if (cancelled) {
        clearTimeout(timeout);
      }
    };
    void runSmoke();
    return () => {
      cancelled = true;
    };
  }, [client, renderer, smokeCreateAll, smokeTest]);

  useKeyboard((key) => {
    const control = Boolean((key as { ctrl?: boolean }).ctrl);

    if (control && key.name === "p") {
      setPaletteOpen((open) => !open);
      return;
    }

    if (control && key.name === "b") {
      setSidebarOpen((open) => !open);
      return;
    }

    if (key.name === "q" && !activeDialog && !paletteOpen) {
      renderer.destroy();
      return;
    }

    if (key.name === "escape") {
      if (activeDialog) {
        setActiveDialog(null);
        return;
      }
      if (paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      renderer.destroy();
      return;
    }

    if (activeDialog === "create") {
      if (key.name === "down" || key.name === "j") {
        updateCreatePreset(createIndex + 1);
        return;
      }
      if (key.name === "up" || key.name === "k") {
        updateCreatePreset(createIndex - 1);
        return;
      }
      if (key.name === "return") {
        void createChangeFromPreset();
        return;
      }
      return;
    }

    if (paletteOpen) {
      if (key.name === "down" || key.name === "j" || (control && key.name === "n")) {
        setPaletteIndex((index) => Math.min(Math.max(0, paletteMatches.length - 1), index + 1));
        return;
      }
      if (key.name === "up" || key.name === "k" || (control && key.name === "p")) {
        setPaletteIndex((index) => Math.max(0, index - 1));
        return;
      }
      if (key.name === "return") {
        const selectedCommand = paletteMatches[safePaletteIndex] ?? null;
        if (selectedCommand) {
          selectedCommand.run([]);
          setPaletteOpen(false);
          setComposer("");
        }
        return;
      }
      return;
    }

    if (key.name === "down" || key.name === "j" || (control && key.name === "n")) {
      updateSelection(selectedIndex + 1);
      return;
    }

    if (key.name === "up" || key.name === "k" || (control && key.name === "p")) {
      updateSelection(selectedIndex - 1);
      return;
    }

    if (key.name === "return") {
      if (composer.trim().startsWith("/")) {
        const executed = executeSlash(composer);
        if (executed) {
          setComposer("");
        }
      } else {
        setStatus("Type / for commands. Example: /create quick");
      }
    }
  });

  const grouped = groupChanges(changes);

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#0e1116" }}>
      <box style={{ height: 3, paddingLeft: 1, paddingRight: 1, justifyContent: "space-between", border: true, borderColor: "#2b3440" }}>
        <text fg="#dce8f5">Changeyard TUI</text>
        <text fg="#8ca2b8">{project ?? "current project"}  ctrl+p commands  ctrl+b sidebar  esc close/quit</text>
      </box>

      <box style={{ flexGrow: 1, flexDirection: "row" }}>
        {sidebarOpen ? (
          <box title="Changes" style={{ width: "30%", border: true, borderColor: "#2b3440", padding: 1, flexDirection: "column" }}>
            {grouped.length === 0 ? <text fg="#8ca2b8">No changes</text> : grouped.map(([statusName, items]) => (
              <box key={statusName} style={{ flexDirection: "column", marginBottom: 1 }}>
                <text fg="#f0c674">{statusName}</text>
                {items.map((change) => {
                  const index = changes.findIndex((candidate) => candidate.id === change.id);
                  const active = index === selectedIndex;
                  return (
                    <text key={change.id} fg={active ? "#ffffff" : "#b7c4d1"}>
                      {active ? "> " : "  "}{change.id} {change.title}
                    </text>
                  );
                })}
              </box>
            ))}
          </box>
        ) : null}

        <box style={{ flexGrow: 1, flexDirection: "column", padding: 1 }}>
          <box title={previewTitle(previewTab)} style={{ flexGrow: 1, border: true, borderColor: "#2b3440", padding: 1 }}>
            {!detail ? (
              <text fg="#8ca2b8">Select a change from the sidebar, or run /create quick.</text>
            ) : previewTab === "planning" ? (
              <PlanningPanel detail={detail} prompt={prompt} />
            ) : previewTab === "workspace" ? (
              <WorkspacePanel detail={detail} />
            ) : previewTab === "review" ? (
              <ReviewPanel detail={detail} />
            ) : (
              <DetailPanel detail={detail} />
            )}
          </box>

          <box style={{ alignItems: "center", justifyContent: "center", paddingTop: 1 }}>
            <box title="Composer" style={{ width: "78%", border: true, borderColor: "#4f6b86", padding: 1, flexDirection: "column" }}>
              <text fg="#8ca2b8">Slash commands and command list share the same registry.</text>
              <box style={{ border: true, borderColor: "#4f6b86", paddingLeft: 1, paddingRight: 1, marginTop: 1 }}>
                <input
                  focused={activeDialog !== "create"}
                  value={composer}
                  placeholder="Type /help, /create quick, /validate..."
                  onChange={setComposer}
                />
              </box>
              <text fg="#8ca2b8">Enter run command  |  ctrl+p command list  |  ctrl+b sidebar  |  esc close</text>
              {composer.trim().startsWith("/") ? (
                <box style={{ flexDirection: "column", marginTop: 1 }}>
                  {slashMatches.slice(0, 6).map((command, index) => (
                    <text key={command.name} fg={index === safePaletteIndex ? "#ffffff" : "#9fb2c4"}>
                      {index === safePaletteIndex ? "> " : "  "}/{command.name} - {command.description}
                    </text>
                  ))}
                </box>
              ) : null}
            </box>
          </box>
        </box>

        {paletteOpen ? (
          <box title="Command list (ctrl+p)" style={{ width: "28%", border: true, borderColor: "#4f6b86", padding: 1, flexDirection: "column" }}>
            {paletteMatches.length === 0 ? (
              <text fg="#8ca2b8">No commands match current query.</text>
            ) : paletteMatches.slice(0, 14).map((entry, index) => (
              <text key={entry.name} fg={index === safePaletteIndex ? "#ffffff" : "#b7c4d1"}>
                {index === safePaletteIndex ? "> " : "  "}{entry.name}  {entry.description}
              </text>
            ))}
          </box>
        ) : null}
      </box>

      {activeDialog ? (
        <box style={{ border: true, borderColor: "#4f6b86", marginLeft: 1, marginRight: 1, marginBottom: 1, padding: 1, flexDirection: "column" }}>
          {activeDialog === "create" ? (
            <CreatePanel
              activeIndex={createIndex}
              title={createTitle}
              presets={createPresets}
              onChangeTitle={setCreateTitle}
            />
          ) : activeDialog === "help" ? (
            <HelpPanel commands={commands} />
          ) : (
            <PromptDialog prompt={prompt} />
          )}
        </box>
      ) : null}

      <box style={{ height: 2, paddingLeft: 1, paddingRight: 1, border: true, borderColor: "#2b3440", justifyContent: "space-between" }}>
        <text fg={error ? "#ff6b6b" : "#8ca2b8"}>{error ?? status}</text>
        <text fg="#8ca2b8">selected: {selected?.id ?? "none"}</text>
      </box>
    </box>
  );
}

function previewTitle(tab: PreviewTab): string {
  if (tab === "planning") return "Planning Preview";
  if (tab === "workspace") return "Workspace Preview";
  if (tab === "review") return "Review Preview";
  return "Detail Preview";
}

function Spacer() {
  return <box style={{ height: 1 }} />;
}

function DetailPanel({ detail }: { detail: ChangeDetail }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">{detail.id}: {detail.title}</text>
      <text fg="#8ca2b8">type: {detail.type}  status: {detail.status}</text>
      <text fg="#8ca2b8">{badgeText(detail)}</text>
      <text fg="#cfe0f2">path: {detail.path}</text>
      <Spacer />
      <markdown content={detail.body.slice(0, 4000)} syntaxStyle={markdownSyntaxStyle} />
    </box>
  );
}

function PlanningPanel({ detail, prompt }: { detail: ChangeDetail; prompt: string | null }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">planning: {detail.planning ? `${detail.planning.model} ${detail.planning.strictness}` : "none"}</text>
      {detail.planning ? <text fg="#8ca2b8">gates pass={detail.planning.gateSummary.pass} pending={detail.planning.gateSummary.pending} fail={detail.planning.gateSummary.fail} warning={detail.planning.gateSummary.warning}</text> : null}
      {detail.sections.map((section) => <text key={section.id} fg="#cfe0f2">{section.title}: {section.content.trim().slice(0, 120) || "empty"}</text>)}
      <Spacer />
      {prompt ? <text fg="#8ca2b8">Prompt loaded. Open dialog content below.</text> : <text fg="#8ca2b8">Use /prompt to load the first planning prompt.</text>}
    </box>
  );
}

function WorkspacePanel({ detail }: { detail: ChangeDetail }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">workspace</text>
      <text fg="#cfe0f2">engine: {detail.workspace?.engine ?? "none"}</text>
      <text fg="#cfe0f2">name: {detail.workspace?.name ?? "none"}</text>
      <text fg="#cfe0f2">path: {detail.workspace?.path ?? "not started"}</text>
      <text fg="#8ca2b8">Run /start, /verify, /complete from composer.</text>
    </box>
  );
}

function ReviewPanel({ detail }: { detail: ChangeDetail }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">review</text>
      <text fg="#cfe0f2">status: {detail.status}</text>
      <text fg="#cfe0f2">remote issue: {detail.remote?.issueUrl ?? "none"}</text>
      <text fg="#cfe0f2">remote PR: {detail.remote?.pullRequestUrl ?? "none"}</text>
      <text fg="#8ca2b8">Run /review to start review workflow.</text>
    </box>
  );
}

function HelpPanel({ commands }: { commands: Array<{ name: string; description: string }> }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">Help</text>
      <text fg="#8ca2b8">Composer-first controls</text>
      <text fg="#cfe0f2">ctrl+p command list</text>
      <text fg="#cfe0f2">ctrl+b toggle sidebar</text>
      <text fg="#cfe0f2">enter execute slash command</text>
      <text fg="#cfe0f2">escape close dialog/list or exit</text>
      <Spacer />
      <text fg="#8ca2b8">Commands</text>
      {commands.map((command) => (
        <text key={command.name} fg="#cfe0f2">/{command.name} - {command.description}</text>
      ))}
    </box>
  );
}

function PromptDialog({ prompt }: { prompt: string | null }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">Planning prompt</text>
      <Spacer />
      {prompt ? <markdown content={prompt.slice(0, 3000)} syntaxStyle={markdownSyntaxStyle} /> : <text fg="#8ca2b8">No prompt loaded.</text>}
    </box>
  );
}

function CreatePanel(input: {
  activeIndex: number;
  title: string;
  presets: CreatePreset[];
  onChangeTitle: (value: string) => void;
}) {
  const activePreset = input.presets[input.activeIndex] ?? input.presets[0];
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">Create change</text>
      <text fg="#8ca2b8">Use j/k then Enter, or run /create quick|planned|strict|legacy.</text>
      <Spacer />
      {input.presets.map((preset, index) => (
        <text key={preset.label} fg={index === input.activeIndex ? "#ffffff" : "#b7c4d1"}>
          {index === input.activeIndex ? "> " : "  "}{preset.label}
        </text>
      ))}
      <Spacer />
      <text fg="#cfe0f2">{activePreset.help}</text>
      <text fg="#8ca2b8">template: {activePreset.template}  planning: {activePreset.planning ?? "none"}{activePreset.strict ? " strict" : ""}</text>
      <Spacer />
      <text fg="#cfe0f2">Title</text>
      <box style={{ border: true, borderColor: "#4f6b86", paddingLeft: 1, paddingRight: 1 }}>
        <input
          focused
          value={input.title}
          placeholder="Change title"
          onChange={input.onChangeTitle}
        />
      </box>
    </box>
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = new RuntimeClient(args.connect);
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  });
  createRoot(renderer).render(<App client={client} project={args.project} smokeTest={args.smokeTest} smokeCreateAll={args.smokeCreateAll} />);
}

main().catch((error) => {
  const message = error instanceof RuntimeClientError || error instanceof Error ? error.message : String(error);
  process.stderr.write([
    "OpenTUI could not start.",
    message,
    "",
    "Fallback options:",
    "- retry with `cy tui --debug`",
    "- launch the browser UI with `cy ui`",
    "- inspect changes with `cy list` and `cy status <id>`",
    "",
  ].join("\n"));
  process.exitCode = 1;
});
