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

type View = "dashboard" | "detail" | "planning" | "workspace" | "review" | "create";

type CreatePreset = {
  label: string;
  help: string;
  template: "feature" | "bug" | "refactor" | "agent-task" | "quick";
  planning?: "none" | "openspec-lite";
  strict?: boolean;
};

const markdownSyntaxStyle = SyntaxStyle.fromStyles({});
const createPresets: CreatePreset[] = [
  {
    label: "Quick change",
    help: "Low-risk markdown-first quick lane.",
    template: "quick",
    planning: "none",
  },
  {
    label: "Planned feature",
    help: "OpenSpec-lite planning with normal gates.",
    template: "feature",
    planning: "openspec-lite",
  },
  {
    label: "Strict planned feature",
    help: "OpenSpec-lite planning with strict clarifications/checklist/analysis gates.",
    template: "feature",
    planning: "openspec-lite",
    strict: true,
  },
  {
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

function App({ client, project, smokeTest, smokeCreateAll }: { client: RuntimeClient; project?: string; smokeTest: boolean; smokeCreateAll: boolean }) {
  const renderer = useRenderer();
  const [view, setView] = useState<View>("dashboard");
  const [changes, setChanges] = useState<ChangeListItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detail, setDetail] = useState<ChangeDetail | null>(null);
  const [status, setStatus] = useState("Connecting to Changeyard runtime...");
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
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
    setStatus(nextChanges.length === 0 ? "No changes yet. Press n to open the create view." : "Ready");
  }

  async function runAction(action: "validate" | "sync" | "start" | "verify" | "complete" | "review") {
    if (!selected) return;
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
      setView("detail");
      setDetail(created);
      setPrompt(null);
      setStatus(`Created ${created.id}`);
      await refresh(created.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Create failed");
    }
  }

  async function loadPrompt() {
    if (!selected) return;
    const sectionId = firstPromptSection(detail);
    if (!sectionId) {
      setPrompt(null);
      setStatus("No planning section is available for this change.");
      return;
    }
    try {
      const result = await client.planningPrompt(selected.id, sectionId);
      setPrompt(result.prompt);
      setView("planning");
      setStatus(`Loaded ${sectionId} prompt for ${selected.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Could not load planning prompt");
    }
  }

  useEffect(() => {
    void refresh().catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("Runtime connection failed");
    });
  }, []);

  useEffect(() => {
    if (!smokeTest) return;
    let cancelled = false;
    const runSmoke = async () => {
      if (smokeCreateAll) {
        for (let index = 0; index < createPresets.length; index += 1) {
          if (cancelled) return;
          const preset = createPresets[index];
          setCreateIndex(index);
          setCreateTitle(buildDefaultCreateTitle(preset));
          setView("create");
          setStatus(`Smoke creating ${preset.label.toLowerCase()}...`);
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
    if (key.name === "q") {
      renderer.destroy();
      return;
    }

    if (view === "create") {
      if (key.name === "escape") {
        setView("dashboard");
        return;
      }
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

    if (key.name === "escape") {
      renderer.destroy();
      return;
    }
    if (key.name === "down" || key.name === "j") {
      updateSelection(selectedIndex + 1);
      return;
    }
    if (key.name === "up" || key.name === "k") {
      updateSelection(selectedIndex - 1);
      return;
    }
    if (key.name === "tab") {
      setView(view === "dashboard" ? "detail" : view === "detail" ? "planning" : view === "planning" ? "workspace" : view === "workspace" ? "review" : "dashboard");
      return;
    }
    if (key.name === "r") {
      void refresh();
      return;
    }
    if (key.name === "n") {
      setPrompt(null);
      updateCreatePreset(0);
      setView("create");
      setStatus("Choose a change type, edit the title, then press Enter.");
      return;
    }
    if (key.name === "p") {
      void loadPrompt();
      return;
    }
    if (key.name === "v") {
      void runAction("validate");
      return;
    }
    if (key.name === "s") {
      void runAction("sync");
      return;
    }
    if (key.name === "b") {
      void runAction("start");
      return;
    }
    if (key.name === "y") {
      void runAction("verify");
      return;
    }
    if (key.name === "c") {
      void runAction("complete");
      return;
    }
    if (key.name === "e") {
      void runAction("review");
    }
  });

  const grouped = groupChanges(changes);

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%", backgroundColor: "#101418" }}>
      <box style={{ height: 3, paddingLeft: 1, paddingRight: 1, justifyContent: "space-between", border: true, borderColor: "#3b4652" }}>
        <text fg="#d6e2ef">Changeyard TUI</text>
        <text fg="#8fa3b8">{project ?? "current project"}  q quit  tab view  r refresh</text>
      </box>
      <box style={{ flexGrow: 1, flexDirection: "row" }}>
        <box title="Changes" style={{ width: "34%", border: true, borderColor: view === "dashboard" ? "#62a0ea" : "#3b4652", padding: 1, flexDirection: "column" }}>
          {grouped.length === 0 ? <text fg="#8fa3b8">No changes</text> : grouped.map(([statusName, items]) => (
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
        <box title={detailPaneTitle(view)} style={{ width: "44%", border: true, borderColor: view !== "dashboard" ? "#62a0ea" : "#3b4652", padding: 1, flexDirection: "column" }}>
          {view === "create" ? (
            <CreatePanel
              activeIndex={createIndex}
              title={createTitle}
              presets={createPresets}
              onChangeTitle={setCreateTitle}
            />
          ) : !detail ? (
            <text fg="#8fa3b8">Select a change</text>
          ) : view === "planning" ? (
            <PlanningPanel detail={detail} prompt={prompt} />
          ) : view === "workspace" ? (
            <WorkspacePanel detail={detail} />
          ) : view === "review" ? (
            <ReviewPanel detail={detail} />
          ) : (
            <DetailPanel detail={detail} />
          )}
        </box>
        <box title="Actions" style={{ flexGrow: 1, border: true, borderColor: "#3b4652", padding: 1, flexDirection: "column" }}>
          {view === "create" ? (
            <>
              <text fg="#d6e2ef">j/k choose preset</text>
              <text fg="#d6e2ef">type edit title</text>
              <text fg="#d6e2ef">enter create</text>
              <text fg="#d6e2ef">esc close create</text>
            </>
          ) : (
            <>
              <text fg="#d6e2ef">n open create</text>
              <text fg="#d6e2ef">p planning prompt</text>
              <text fg="#d6e2ef">v validate</text>
              <text fg="#d6e2ef">s sync</text>
              <text fg="#d6e2ef">b start workspace</text>
              <text fg="#d6e2ef">y verify workspace</text>
              <text fg="#d6e2ef">c complete no-pr</text>
              <text fg="#d6e2ef">e start review</text>
            </>
          )}
          <Spacer />
          <text fg={error ? "#ff6b6b" : "#8fa3b8"}>{error ?? status}</text>
        </box>
      </box>
    </box>
  );
}

function detailPaneTitle(view: View): string {
  if (view === "planning") return "Planning";
  if (view === "workspace") return "Workspace";
  if (view === "review") return "Review";
  if (view === "create") return "Create";
  return "Detail";
}

function Spacer() {
  return <box style={{ height: 1 }} />;
}

function DetailPanel({ detail }: { detail: ChangeDetail }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">{detail.id}: {detail.title}</text>
      <text fg="#8fa3b8">type: {detail.type}  status: {detail.status}</text>
      <text fg="#8fa3b8">{badgeText(detail)}</text>
      <text fg="#d6e2ef">path: {detail.path}</text>
      <Spacer />
      <markdown content={detail.body.slice(0, 4000)} syntaxStyle={markdownSyntaxStyle} />
    </box>
  );
}

function PlanningPanel({ detail, prompt }: { detail: ChangeDetail; prompt: string | null }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">planning: {detail.planning ? `${detail.planning.model} ${detail.planning.strictness}` : "none"}</text>
      {detail.planning ? <text fg="#8fa3b8">gates pass={detail.planning.gateSummary.pass} pending={detail.planning.gateSummary.pending} fail={detail.planning.gateSummary.fail} warning={detail.planning.gateSummary.warning}</text> : null}
      {detail.sections.map((section) => <text key={section.id} fg="#d6e2ef">{section.title}: {section.content.trim().slice(0, 120) || "empty"}</text>)}
      <Spacer />
      {prompt ? <markdown content={prompt.slice(0, 3000)} syntaxStyle={markdownSyntaxStyle} /> : <text fg="#8fa3b8">Press p to load a prompt for the first planning section.</text>}
    </box>
  );
}

function WorkspacePanel({ detail }: { detail: ChangeDetail }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">workspace</text>
      <text fg="#d6e2ef">engine: {detail.workspace?.engine ?? "none"}</text>
      <text fg="#d6e2ef">name: {detail.workspace?.name ?? "none"}</text>
      <text fg="#d6e2ef">path: {detail.workspace?.path ?? "not started"}</text>
      <text fg="#8fa3b8">Use b to start, y to verify, c to complete.</text>
    </box>
  );
}

function ReviewPanel({ detail }: { detail: ChangeDetail }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text fg="#ffffff">review</text>
      <text fg="#d6e2ef">status: {detail.status}</text>
      <text fg="#d6e2ef">remote issue: {detail.remote?.issueUrl ?? "none"}</text>
      <text fg="#d6e2ef">remote PR: {detail.remote?.pullRequestUrl ?? "none"}</text>
      <text fg="#8fa3b8">Use e to start review. Review completion stays available through the runtime API.</text>
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
      <text fg="#8fa3b8">Choose a preset with j/k, edit the title, then press Enter.</text>
      <Spacer />
      {input.presets.map((preset, index) => (
        <text key={preset.label} fg={index === input.activeIndex ? "#ffffff" : "#b7c4d1"}>
          {index === input.activeIndex ? "> " : "  "}{preset.label}
        </text>
      ))}
      <Spacer />
      <text fg="#d6e2ef">{activePreset.help}</text>
      <text fg="#8fa3b8">template: {activePreset.template}  planning: {activePreset.planning ?? "none"}{activePreset.strict ? " strict" : ""}</text>
      <Spacer />
      <text fg="#d6e2ef">Title</text>
      <box style={{ border: true, borderColor: "#62a0ea", paddingLeft: 1, paddingRight: 1 }}>
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
