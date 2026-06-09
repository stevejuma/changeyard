import { render, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { Match, Switch, onMount } from "solid-js";
import { ThemeProvider, useTheme } from "./context/theme";
import { KVProvider } from "./context/kv";
import { KeybindProvider } from "./context/keybind";
import { RouteProvider, useRoute } from "./context/route";
import { RuntimeProvider } from "./context/runtime";
import { AppStateProvider } from "./context/app-state";
import { ToastProvider } from "./ui/toast";
import { DialogProvider, useDialog } from "./ui/dialog";
import { CommandProvider } from "./component/dialog-command";
import { Home } from "./routes/home";
import { Workspace } from "./routes/workspace";
import { RegisterChangeyardCommands, useChangeyardActions } from "./commands/changeyard";
import { RuntimeClient } from "./runtime-client";
import { createPresets, buildDefaultCreateTitle } from "./context/app-state";
import { DialogHelp } from "./ui/dialog-help";
import { CreateDialog } from "./dialogs/create";

export type AppArgs = {
  client: RuntimeClient;
  project?: string;
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

function AppContent(props: AppArgs) {
  const route = useRoute();
  const dialog = useDialog();
  const renderer = useRenderer();
  const { theme } = useTheme();
  const dimensions = useTerminalDimensions();

  useKeyboard((evt) => {
    if (dialog.stack.length > 0) return;
    if (evt.name === "escape") {
      evt.preventDefault();
      renderer.clearSelection();
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
      <SmokeRunner smokeTest={props.smokeTest} smokeCreateAll={props.smokeCreateAll} />
      <box flexGrow={1} flexDirection="column" minHeight={0}>
        <Switch>
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
                <AppStateProvider>
                  <DialogProvider>
                    <CommandProvider>
                      <AppContent {...props} />
                    </CommandProvider>
                  </DialogProvider>
                </AppStateProvider>
              </RuntimeProvider>
            </RouteProvider>
          </ToastProvider>
        </KeybindProvider>
      </ThemeProvider>
    </KVProvider>
  );
}
