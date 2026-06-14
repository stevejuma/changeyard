import type { KeyEvent } from "@opentui/core";
import type { ChoiceContext } from "@opentui-ui/dialog/react";
import { useDialogKeyboard } from "@opentui-ui/dialog/react";
import { useMemo, useRef, useState } from "react";
import type {
  ProjectConfigResponse,
  ProjectConfigUpdateInput,
  RuntimeConfigResponse,
} from "../../runtime-client";
import { palette, truncate } from "../palette";

type ConfigTabId = "runtime" | "project" | "planning";

type ConfigTab = {
  id: ConfigTabId;
  label: string;
};

type ConfigOption = {
  label: string;
  value: string;
};

type ConfigRow = {
  id: string;
  tab: ConfigTabId;
  label: string;
  value: string;
  display: string;
  detail: string;
  options: ConfigOption[];
  save: (next: string) => Promise<void>;
};

const CONFIG_TABS: ConfigTab[] = [
  { id: "runtime", label: "Runtime" },
  { id: "project", label: "Project" },
  { id: "planning", label: "Planning" },
];

export function ChangeyardConfigDialog(props: ChoiceContext<void> & {
  projectConfig: ProjectConfigResponse | null;
  runtimeConfig: RuntimeConfigResponse | null;
  selectedCheckProfile: string | null;
  checkProfiles: string[];
  onSaveProjectConfig: (patch: ProjectConfigUpdateInput, status: string, selectedCheckProfile?: string) => Promise<ProjectConfigResponse>;
  onSaveRuntimeConfig: (selectedAgentId: string, status: string) => Promise<RuntimeConfigResponse>;
}) {
  const {
    checkProfiles,
    onSaveProjectConfig,
    onSaveRuntimeConfig,
    selectedCheckProfile: initialSelectedCheckProfile,
  } = props;
  const [projectConfig, setProjectConfig] = useState(props.projectConfig);
  const [runtimeConfig, setRuntimeConfig] = useState(props.runtimeConfig);
  const [selectedProfile, setSelectedProfile] = useState(initialSelectedCheckProfile);
  const [activeTab, setActiveTab] = useState<ConfigTabId>("runtime");
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo<ConfigRow[]>(() => {
    const agents = runtimeConfig?.agents ?? [];
    const selectedAgent = agents.find((agent) => agent.id === runtimeConfig?.selectedAgentId) ?? agents[0] ?? null;
    const agentOptions = agents.map((agent) => ({ label: agent.label, value: agent.id }));
    const profileOptions = checkProfiles.length > 0 ? checkProfiles : ["minimal", "standard", "full"];
    const activeProfile = projectConfig?.planningQuickChangeCheckProfile ?? selectedProfile ?? profileOptions[0] ?? "minimal";
    const quickChangeEnabled = projectConfig?.planningAllowQuickChanges ?? true;
    const configRows: ConfigRow[] = [
      {
        id: "agent",
        tab: "runtime",
        label: "Agent",
        value: selectedAgent?.id ?? "",
        display: selectedAgent?.label ?? runtimeConfig?.selectedAgentId ?? "unknown",
        detail: selectedAgent ? `${selectedAgent.command}${selectedAgent.configured ? "" : " (not configured)"}` : "runtime agent",
        options: agentOptions,
        save: async (next: string) => {
          const updated = await onSaveRuntimeConfig(next, `Agent ${labelFor(agentOptions, next)}`);
          setRuntimeConfig(updated);
        },
      },
      {
        id: "provider",
        tab: "project",
        label: "Provider",
        value: projectConfig?.providerType ?? "noop",
        display: projectConfig?.providerType ?? "noop",
        detail: "change metadata backend",
        options: ["noop", "local-folder", "forgejo", "github", "gitlab"].map(asOption),
        save: async (next: string) => {
          const updated = await onSaveProjectConfig({ providerType: next as ProjectConfigResponse["providerType"] }, `Provider ${next}`);
          setProjectConfig(updated);
        },
      },
      {
        id: "vcs-engine",
        tab: "project",
        label: "VCS engine",
        value: projectConfig?.vcsEngine ?? "plain-copy",
        display: projectConfig?.vcsEngine ?? "plain-copy",
        detail: "workspace creation strategy",
        options: ["plain-copy", "jj", "git-worktree"].map(asOption),
        save: async (next: string) => {
          const updated = await onSaveProjectConfig({ vcsEngine: next as ProjectConfigResponse["vcsEngine"] }, `VCS engine ${next}`);
          setProjectConfig(updated);
        },
      },
      {
        id: "vcs-fallback",
        tab: "project",
        label: "VCS fallback",
        value: projectConfig?.vcsFallback ?? "plain-copy",
        display: projectConfig?.vcsFallback ?? "plain-copy",
        detail: "used when engine cannot create a workspace",
        options: ["plain-copy", "jj", "git-worktree"].map(asOption),
        save: async (next: string) => {
          const updated = await onSaveProjectConfig({ vcsFallback: next as ProjectConfigResponse["vcsFallback"] }, `VCS fallback ${next}`);
          setProjectConfig(updated);
        },
      },
      {
        id: "planning-profile",
        tab: "planning",
        label: "Planning",
        value: projectConfig?.planningDefaultProfile ?? "none",
        display: projectConfig?.planningDefaultProfile ?? "none",
        detail: `base ${projectConfig?.projectDefaultBase ?? "main"}`,
        options: ["none", "openspec-lite"].map(asOption),
        save: async (next: string) => {
          const updated = await onSaveProjectConfig({ planningDefaultProfile: next as ProjectConfigResponse["planningDefaultProfile"] }, `Planning ${next}`);
          setProjectConfig(updated);
        },
      },
      {
        id: "strictness",
        tab: "planning",
        label: "Strictness",
        value: projectConfig?.planningDefaultStrictness ?? "normal",
        display: projectConfig?.planningDefaultStrictness ?? "normal",
        detail: "default validation gate",
        options: ["normal", "strict"].map(asOption),
        save: async (next: string) => {
          const updated = await onSaveProjectConfig({ planningDefaultStrictness: next as ProjectConfigResponse["planningDefaultStrictness"] }, `Strictness ${next}`);
          setProjectConfig(updated);
        },
      },
      {
        id: "quick-changes",
        tab: "planning",
        label: "Quick changes",
        value: quickChangeEnabled ? "enabled" : "disabled",
        display: quickChangeEnabled ? "enabled" : "disabled",
        detail: "plain prompt creates a quick change",
        options: ["enabled", "disabled"].map(asOption),
        save: async (next: string) => {
          const enabled = next === "enabled";
          const updated = await onSaveProjectConfig({ planningAllowQuickChanges: enabled }, `Quick changes ${next}`);
          setProjectConfig(updated);
        },
      },
      {
        id: "check-profile",
        tab: "planning",
        label: "Checks profile",
        value: activeProfile,
        display: activeProfile,
        detail: "used by Tab profile control",
        options: profileOptions.map(asOption),
        save: async (next: string) => {
          const updated = await onSaveProjectConfig({ planningQuickChangeCheckProfile: next }, `Profile ${next}`, next);
          setProjectConfig(updated);
          setSelectedProfile(next);
        },
      },
    ];
    return configRows.filter((row) => row.options.length > 0);
  }, [checkProfiles, onSaveProjectConfig, onSaveRuntimeConfig, projectConfig, runtimeConfig, selectedProfile]);

  const activeRows = useMemo(() => rows.filter((row) => row.tab === activeTab), [activeTab, rows]);
  const rowsRef = useRef(activeRows);
  const selectedRef = useRef(selected);
  const savingRef = useRef(saving);
  const activeTabRef = useRef(activeTab);
  rowsRef.current = activeRows;
  selectedRef.current = Math.min(selected, Math.max(0, activeRows.length - 1));
  savingRef.current = saving;
  activeTabRef.current = activeTab;

  const runRow = async (row: ConfigRow | undefined) => {
    if (savingRef.current) return;
    if (!row) return;
    const next = nextValue(row.options, row.value);
    setSaving(row.id);
    setError(null);
    try {
      await row.save(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(null);
    }
  };

  const runSelected = async () => {
    await runRow(rowsRef.current[selectedRef.current]);
  };

  const selectTab = (tabId: ConfigTabId) => {
    setActiveTab(tabId);
    setSelected(0);
    setError(null);
  };

  const cycleTab = (direction: 1 | -1) => {
    const index = CONFIG_TABS.findIndex((tab) => tab.id === activeTabRef.current);
    const nextIndex = (index + direction + CONFIG_TABS.length) % CONFIG_TABS.length;
    selectTab(CONFIG_TABS[nextIndex]?.id ?? "runtime");
  };

  useDialogKeyboard((key: KeyEvent) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      key.preventDefault();
      props.dismiss();
      return;
    }
    if (key.name === "tab") {
      key.preventDefault();
      cycleTab(key.shift ? -1 : 1);
      return;
    }
    if (key.name === "left") {
      key.preventDefault();
      cycleTab(-1);
      return;
    }
    if (key.name === "right") {
      key.preventDefault();
      cycleTab(1);
      return;
    }
    if (key.name === "up" || (key.ctrl && key.name === "p")) {
      key.preventDefault();
      setSelected((index) => (rowsRef.current.length === 0 ? 0 : index <= 0 ? rowsRef.current.length - 1 : index - 1));
      return;
    }
    if (key.name === "down" || (key.ctrl && key.name === "n")) {
      key.preventDefault();
      setSelected((index) => (rowsRef.current.length === 0 ? 0 : index >= rowsRef.current.length - 1 ? 0 : index + 1));
      return;
    }
    if (key.name === "return" || key.name === "enter" || key.name === "space") {
      key.preventDefault();
      void runSelected();
    }
  }, props.dialogId);

  const contentWidth = 68;
  return (
    <box flexDirection="column" width={contentWidth} gap={1}>
      <box flexDirection="row" justifyContent="space-between" width="100%">
        <text fg={palette.text}>
          <strong>Changeyard Settings</strong>
        </text>
        <text fg="gray">Esc</text>
      </box>
      <box flexDirection="row" gap={1}>
        {CONFIG_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <box
              key={tab.id}
              paddingX={1}
              backgroundColor={isActive ? palette.selection : undefined}
              onMouseDown={() => selectTab(tab.id)}
            >
              <text fg={isActive ? palette.textOnSelection : "gray"} wrapMode="none">
                {isActive ? "●" : "○"} {tab.label}
              </text>
            </box>
          );
        })}
      </box>
      <text fg="gray" wrapMode="word">
        Configure the selected Changeyard settings tab.
      </text>
      <box flexDirection="column" width="100%">
        {activeRows.length === 0 ? (
          <text fg="gray">No settings available.</text>
        ) : (
          activeRows.map((row, index) => {
            const isSelected = index === selectedRef.current;
            return (
              <box
                key={row.id}
                flexDirection="row"
                width="100%"
                paddingX={1}
                backgroundColor={isSelected ? palette.selection : undefined}
                onMouseDown={() => {
                  setSelected(index);
                  void runRow(row);
                }}
              >
                <text fg={isSelected ? palette.textOnSelection : palette.text} width={16} wrapMode="none">
                  {truncate(row.label, 16)}
                </text>
                <text fg={isSelected ? palette.textOnSelection : palette.act} width={18} wrapMode="none">
                  {saving === row.id ? "saving..." : truncate(row.display, 18)}
                </text>
                <text fg={isSelected ? palette.textOnSelection : "gray"} wrapMode="none">
                  {truncate(row.detail, contentWidth - 38)}
                </text>
              </box>
            );
          })
        )}
      </box>
      {error ? <text fg={palette.red}>{truncate(error, contentWidth)}</text> : null}
      <text fg="gray">Tab/Shift+Tab switch tabs, ↑/↓ navigate, Enter/Space changes value</text>
    </box>
  );
}

function asOption(value: string): ConfigOption {
  return { label: value, value };
}

function nextValue(options: ConfigOption[], current: string): string {
  if (options.length === 0) return current;
  const index = options.findIndex((option) => option.value === current);
  return options[index >= 0 && index < options.length - 1 ? index + 1 : 0]?.value ?? current;
}

function labelFor(options: ConfigOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
