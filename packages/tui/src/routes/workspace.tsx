import { For, Show } from "solid-js";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { TextareaRenderable } from "@opentui/core";
import { Prompt } from "../component/prompt";
import { PreviewPanel } from "../component/panels";
import { StatusBar } from "../component/status-bar";
import { Toast } from "../ui/toast";
import { useTheme } from "../context/theme";
import { useAppState, groupChanges } from "../context/app-state";
import { useChangeyardActions } from "../commands/changeyard";
import { useDialog } from "../ui/dialog";

export function Workspace() {
  const { theme } = useTheme();
  const state = useAppState();
  const actions = useChangeyardActions();
  const dialog = useDialog();
  const renderer = useRenderer();

  const grouped = () => groupChanges(state.changes);

  useKeyboard((evt) => {
    if (dialog.stack.length > 0) return;
    if (renderer.currentFocusedRenderable instanceof TextareaRenderable) return;

    const control = Boolean(evt.ctrl);
    if (control && evt.name === "b") {
      state.toggleSidebar();
      evt.preventDefault();
      return;
    }

    if (evt.name === "down" || evt.name === "j" || (control && evt.name === "n")) {
      actions.updateSelection(state.selectedIndex + 1);
      evt.preventDefault();
      return;
    }

    if (evt.name === "up" || evt.name === "k" || (control && evt.name === "p")) {
      actions.updateSelection(state.selectedIndex - 1);
      evt.preventDefault();
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme.background}>
      <box flexGrow={1} flexDirection="row" minHeight={0}>
        <Show when={state.sidebarOpen}>
          <box
            width="22%"
            flexDirection="column"
            border={true}
            borderColor={theme.border}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={1}
            backgroundColor={theme.backgroundPanel}
          >
            <Show
              when={grouped().length > 0}
              fallback={<text fg={theme.textMuted}>No changes. Run /create quick.</text>}
            >
              <For each={grouped()}>
                {([statusName, items]) => (
                  <box flexDirection="column" marginBottom={1}>
                    <text fg={theme.warning}>{statusName}</text>
                    <For each={items}>
                      {(change) => {
                        const idx = () => state.changes.findIndex((c) => c.id === change.id);
                        const active = () => idx() === state.selectedIndex;
                        return (
                          <text
                            fg={active() ? theme.primary : theme.textMuted}
                            onMouseUp={() => actions.updateSelection(idx())}
                          >
                            {active() ? "▶ " : "  "}
                            {change.id}
                          </text>
                        );
                      }}
                    </For>
                  </box>
                )}
              </For>
            </Show>
          </box>
        </Show>

        <box flexGrow={1} flexDirection="column" minHeight={0}>
          <box flexGrow={1} border={true} borderColor={theme.border} padding={1} minHeight={0} backgroundColor={theme.background}>
            <PreviewPanel
              tab={state.previewTab}
              detail={state.detail}
              prompt={state.planningPrompt}
              changes={state.changes}
              doctor={state.doctor}
            />
          </box>
          <box alignItems="center" paddingTop={1} paddingBottom={1} paddingLeft={2} paddingRight={2}>
            <box width="100%" maxWidth={75}>
              <Prompt />
            </box>
          </box>
        </box>
      </box>

      <StatusBar />
      <Toast />
    </box>
  );
}
