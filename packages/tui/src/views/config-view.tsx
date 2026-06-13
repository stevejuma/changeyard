import { TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { useComposerSettings } from "../context/composer-settings";
import { createPresets } from "../context/app-state";
import { useTheme } from "../context/theme";
import { useRoute } from "../context/route";
import { DialogAgentList } from "../component/dialog-agent-list";
import { DialogProviderList } from "../component/dialog-provider-list";
import { DialogThemeList } from "../component/dialog-theme-list";
import { DialogVcsList } from "../component/dialog-vcs-list";
import { DialogSelect } from "../ui/dialog-select";
import { DialogMessage } from "../ui/dialog-message";
import { DialogTextInput } from "../ui/dialog-text-input";
import { useDialog } from "../ui/dialog";
import { useToast } from "../ui/toast";
import {
  CONFIG_TABS,
  PLANNING_PROFILE_OPTIONS,
  PLANNING_STRICTNESS_OPTIONS,
  presetLabelFromIndex,
  resolveConfigTabId,
  rowsForTab,
  type ConfigRow,
  type ConfigTabId,
} from "./config-data";

export type ConfigViewProps = {
  standalone?: boolean;
  initialTab?: ConfigTabId;
  projectPath?: string;
};

function configPaths(projectPath?: string) {
  const root = projectPath?.trim() || process.cwd();
  return {
    base: `${root}/.changeyard/config.jsonc`,
    local: `${root}/.changeyard/config.local.jsonc`,
    schema: `${root}/.changeyard/schema.json`,
  };
}

export function ConfigView(props: ConfigViewProps) {
  const themeCtx = useTheme();
  const dialog = useDialog();
  const toast = useToast();
  const route = useRoute();
  const renderer = useRenderer();
  const settings = useComposerSettings();
  const dimensions = useTerminalDimensions();
  const [tabIndex, setTabIndex] = createSignal(
    Math.max(0, CONFIG_TABS.findIndex((tab) => tab.id === (props.initialTab ?? "project"))),
  );
  const [rowIndex, setRowIndex] = createSignal(0);

  const activeTab = createMemo(() => CONFIG_TABS[tabIndex()] ?? CONFIG_TABS[0]);
  const presetLabel = createMemo(() => presetLabelFromIndex(settings.presetIndex()));
  const selectedAgentLabel = createMemo(
    () => settings.selectedAgent()?.label ?? settings.runtime.selectedAgentId,
  );

  const rows = createMemo(() =>
    rowsForTab(activeTab().id, {
      projectConfig: settings.project.config,
      selectedAgentId: settings.runtime.selectedAgentId,
      selectedAgentLabel: selectedAgentLabel(),
      themeName: themeCtx.selected,
      presetLabel: presetLabel(),
      paths: configPaths(props.projectPath),
    }),
  );

  const selectedRow = createMemo(() => rows()[rowIndex()] ?? null);

  function moveTab(direction: number) {
    const next = (tabIndex() + direction + CONFIG_TABS.length) % CONFIG_TABS.length;
    setTabIndex(next);
    setRowIndex(0);
  }

  function moveRow(direction: number) {
    const list = rows();
    if (list.length === 0) return;
    let next = rowIndex() + direction;
    if (next < 0) next = list.length - 1;
    if (next >= list.length) next = 0;
    setRowIndex(next);
  }

  function closeConfig() {
    if (props.standalone) {
      renderer.destroy();
      return;
    }
    route.home();
  }

  async function runAboutAction(row: ConfigRow) {
    if (row.id === "action-init") {
      const result = await settings.initProject();
      await settings.refreshProjectConfig();
      dialog.replace(() => <DialogMessage title="Init" lines={result.message.split("\n")} />);
      return;
    }
    if (row.id === "action-update") {
      const result = await settings.updateProject();
      await settings.refreshProjectConfig();
      dialog.replace(() => <DialogMessage title="Update" lines={result.message.split("\n")} />);
      return;
    }
    if (row.id === "action-doctor") {
      const report = await settings.doctorProject();
      const lines = [
        ...(report.ok.length > 0 ? [`ok: ${report.ok.join(", ")}`] : []),
        ...report.warnings.map((warning) => `warning: ${warning}`),
        ...report.notes.map((note) => `note: ${note}`),
      ];
      dialog.replace(() => (
        <DialogMessage title="Doctor" lines={lines.length > 0 ? lines : ["No issues found."]} />
      ));
    }
  }

  function openRowEditor(row: ConfigRow) {
    if (!row.editable) return;

    if (row.kind === "action") {
      void runAboutAction(row).catch((error) => toast.error(error));
      return;
    }

    if (row.id === "provider") {
      dialog.replace(() => <DialogProviderList />);
      return;
    }
    if (row.id === "vcs") {
      dialog.replace(() => <DialogVcsList />);
      return;
    }
    if (row.id === "default-base") {
      dialog.replace(() => (
        <DialogTextInput
          title="Default base branch"
          initialValue={settings.project.config?.projectDefaultBase ?? "main"}
          placeholder="main"
          onConfirm={async (value) => {
            if (!value) {
              toast.show({ variant: "warning", message: "Base branch cannot be empty." });
              return;
            }
            await settings.updateDefaultBase(value);
            toast.show({ variant: "success", message: `Default base set to ${value}` });
            dialog.clear();
          }}
        />
      ));
      return;
    }
    if (row.id === "planning-profile") {
      dialog.replace(() => (
        <DialogSelect
          title="Planning profile"
          options={PLANNING_PROFILE_OPTIONS.map((item) => ({ ...item }))}
          current={settings.project.config?.planningDefaultProfile ?? "none"}
          onSelect={(opt) => {
            void settings
              .updatePlanning({ defaultProfile: opt.value as "none" | "openspec-lite" })
              .then(() => {
                toast.show({ variant: "success", message: `Planning profile set to ${opt.title}` });
                dialog.clear();
              })
              .catch((error) => toast.error(error));
          }}
        />
      ));
      return;
    }
    if (row.id === "planning-strictness") {
      dialog.replace(() => (
        <DialogSelect
          title="Planning strictness"
          options={PLANNING_STRICTNESS_OPTIONS.map((item) => ({ ...item }))}
          current={settings.project.config?.planningDefaultStrictness ?? "normal"}
          onSelect={(opt) => {
            void settings
              .updatePlanning({ defaultStrictness: opt.value as "normal" | "strict" })
              .then(() => {
                toast.show({ variant: "success", message: `Planning strictness set to ${opt.title}` });
                dialog.clear();
              })
              .catch((error) => toast.error(error));
          }}
        />
      ));
      return;
    }
    if (row.id === "allow-quick-changes") {
      const next = settings.project.config?.planningAllowQuickChanges === false;
      void settings
        .updatePlanning({ allowQuickChanges: next })
        .then(() => {
          toast.show({ variant: "success", message: `Quick changes ${next ? "enabled" : "disabled"}` });
        })
        .catch((error) => toast.error(error));
      return;
    }
    if (row.id === "selected-agent") {
      dialog.replace(() => <DialogAgentList />);
      return;
    }
    if (row.id === "theme") {
      dialog.replace(() => <DialogThemeList />);
      return;
    }
    if (row.id === "create-preset") {
      dialog.replace(() => (
        <DialogSelect
          title="Create preset"
          options={createPresets.map((preset, index) => ({
            title: preset.label,
            value: String(index),
            description: preset.help,
          }))}
          current={String(settings.presetIndex())}
          onSelect={(opt) => {
            settings.setPresetIndex(Number(opt.value));
            toast.show({ variant: "success", message: `Create preset set to ${opt.title}` });
            dialog.clear();
          }}
        />
      ));
    }
  }

  useKeyboard((evt) => {
    if (dialog.stack.length > 0) return;
    if (evt.name === "escape") {
      evt.preventDefault();
      closeConfig();
      return;
    }
    if (evt.name === "left") {
      evt.preventDefault();
      moveTab(-1);
      return;
    }
    if (evt.name === "right") {
      evt.preventDefault();
      moveTab(1);
      return;
    }
    if (evt.name === "up") {
      evt.preventDefault();
      moveRow(-1);
      return;
    }
    if (evt.name === "down") {
      evt.preventDefault();
      moveRow(1);
      return;
    }
    if (evt.name === "return") {
      const row = selectedRow();
      if (!row) return;
      evt.preventDefault();
      openRowEditor(row);
    }
  });

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between" paddingTop={1}>
        <text attributes={TextAttributes.BOLD} fg={themeCtx.theme.text}>
          Changeyard Config
        </text>
        <text fg={themeCtx.theme.textMuted}>{props.standalone ? "esc: quit" : "esc: back"}</text>
      </box>
      <box flexDirection="row" gap={2} paddingBottom={1}>
        <For each={CONFIG_TABS}>
          {(tab, index) => (
            <text
              fg={index() === tabIndex() ? themeCtx.theme.primary : themeCtx.theme.textMuted}
              attributes={index() === tabIndex() ? TextAttributes.BOLD : undefined}
              onMouseUp={() => {
                setTabIndex(index());
                setRowIndex(0);
              }}
            >
              {tab.label}
            </text>
          )}
        </For>
      </box>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <For each={rows()}>
          {(row, index) => {
            const active = () => index() === rowIndex();
            return (
              <box
                flexDirection="row"
                gap={2}
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={active() ? themeCtx.theme.backgroundPanel : undefined}
                onMouseUp={() => {
                  setRowIndex(index());
                  openRowEditor(row);
                }}
              >
                <box width={22}>
                  <text fg={active() ? themeCtx.theme.text : themeCtx.theme.textMuted}>{row.label}</text>
                </box>
                <box width={18}>
                  <text fg={active() ? themeCtx.theme.accent : themeCtx.theme.text}>{row.value}</text>
                </box>
                <Show when={row.description}>
                  <text fg={themeCtx.theme.textMuted}>{row.description}</text>
                </Show>
              </box>
            );
          }}
        </For>
      </box>
      <box paddingBottom={1}>
        <text fg={themeCtx.theme.textMuted}>
          ←/→ tabs  ↑/↓ rows  Enter edit  width {dimensions().width}
        </text>
      </box>
    </box>
  );
}

export function configTabFromArg(args: string[]): ConfigTabId | undefined {
  const tab = args[0];
  if (!tab) return undefined;
  return resolveConfigTabId(tab);
}
