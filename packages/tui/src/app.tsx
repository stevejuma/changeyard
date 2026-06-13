import { render, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { Match, Show, Switch, onMount } from "solid-js";
import { ThemeProvider, useTheme } from "./context/theme";
import { KVProvider } from "./context/kv";
import { ComposerSettingsProvider } from "./context/composer-settings";
import { KeybindProvider } from "./context/keybind";
import { RouteProvider, useRoute, type RouteData } from "./context/route";
import { RuntimeProvider } from "./context/runtime";
import { AppStateProvider } from "./context/app-state";
import { ToastProvider } from "./ui/toast";
import { DialogProvider, useDialog } from "./ui/dialog";
import { CommandProvider } from "./component/dialog-command";
import { Home } from "./routes/home";
import { Workspace } from "./routes/workspace";
import { ConfigView } from "./views/config-view";
import type { ConfigTabId } from "./views/config-data";
import { RegisterChangeyardCommands, useChangeyardActions } from "./commands/changeyard";
import { RuntimeClient } from "./runtime-client";
import { createPresets, buildDefaultCreateTitle } from "./context/app-state";
import { DialogHelp } from "./ui/dialog-help";
import { CreateDialog } from "./dialogs/create";

export type AppMode = "board" | "config";

export type AppArgs = {
  client: RuntimeClient;
  project?: string;
  mode?: AppMode;
  configTab?: ConfigTabId;
  smokeTest: boolean;
  smokeCreateAll: boolean;
};

function SmokeRunner(props: { smokeTest: boolean; smokeCreateAll: boolean }) {
  const renderer = useRenderer();
  const actions = useChangeyardActions();
  const dialog = useDialog();

  onMount(() => {
    if (!props.smokeTest) return;
    let cancelled = false;

    const runSmoke = async () => {
      try {
        dialog.replace(() => <DialogHelp />);
        dialog.clear();

        actions.goToWorkspace();
        actions.goToWorkspace();
        const smokePresets = props.smokeCreateAll ? createPresets : [createPresets[0]];
        for (const preset of smokePresets) {
          if (cancelled) return;
          dialog.replace(() => (
            <CreateDialog initialPreset={preset.id} onCreate={actions.createChangeFromPreset} />
          ));
          await actions.createChangeFromPreset(preset.id, buildDefaultCreateTitle(preset));
        }

        await actions.refresh();

        if (!cancelled) {
          await actions.loadPrompt();
          dialog.clear();
        }
      } catch (caught) {
        console.error(caught);
        renderer.destroy();
        return;
      }

      setTimeout(() => {
        if (!cancelled) renderer.destroy();
      }, 800);
    };

    void runSmoke();
    return () => {
      cancelled = true;
    };
  });

  return null;
}

function configTabFromRoute(route: RouteData, fallback?: ConfigTabId): ConfigTabId | undefined {
  return route.type === "config" ? route.tab : fallback;
}

function ConfigModeBootstrap(props: { configTab?: ConfigTabId }) {
  const route = useRoute();
  onMount(() => {
    route.config(props.configTab);
  });
  return null;
}

function AppContent(props: AppArgs) {
  const route = useRoute();
  const dialog = useDialog();
  const renderer = useRenderer();
  const { theme } = useTheme();
  const dimensions = useTerminalDimensions();
  const standaloneConfig = () => props.mode === "config";

  useKeyboard((evt) => {
    if (dialog.stack.length > 0) return;
    if (evt.name === "escape") {
      evt.preventDefault();
      renderer.clearSelection();
      if (route.data.type === "config") {
        if (standaloneConfig()) {
          renderer.destroy();
        } else {
          route.home();
        }
        return;
      }
      if (route.data.type === "workspace") {
        route.home();
      }
    }
  });

  return (
    <box
      width={Math.max(dimensions().width, renderer.width, 80)}
      height={Math.max(dimensions().height, renderer.height, 24)}
      flexDirection="column"
      backgroundColor={theme.background}
    >
      <RegisterChangeyardCommands />
      <Show when={standaloneConfig()}>
        <ConfigModeBootstrap configTab={props.configTab} />
      </Show>
      <Show when={!standaloneConfig()}>
        <SmokeRunner smokeTest={props.smokeTest} smokeCreateAll={props.smokeCreateAll} />
      </Show>
      <box flexGrow={1} flexDirection="column" minHeight={0}>
        <Switch>
          <Match when={route.data.type === "config"}>
            <ConfigView
              standalone={standaloneConfig()}
              initialTab={configTabFromRoute(route.data, props.configTab)}
              projectPath={props.project}
            />
          </Match>
          <Match when={route.data.type === "home"}>
            <Home projectPath={props.project} version="changeyard tui" />
          </Match>
          <Match when={route.data.type === "workspace"}>
            <Workspace />
          </Match>
        </Switch>
      </box>
    </box>
  );
}

export function App(props: AppArgs) {
  return (
    <KVProvider>
      <ThemeProvider mode="dark">
        <KeybindProvider>
          <ToastProvider>
            <RouteProvider>
            <RuntimeProvider client={props.client}>
              <ComposerSettingsProvider>
                <AppStateProvider>
                  <DialogProvider>
                    <CommandProvider>
                      <AppContent {...props} />
                    </CommandProvider>
                  </DialogProvider>
                </AppStateProvider>
              </ComposerSettingsProvider>
            </RuntimeProvider>
            </RouteProvider>
          </ToastProvider>
        </KeybindProvider>
      </ThemeProvider>
    </KVProvider>
  );
}
