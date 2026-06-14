import { useTerminalDimensions } from "@opentui/solid";
import { useAppState } from "../context/app-state";
import { useComposerSettings } from "../context/composer-settings";
import { useTheme } from "../context/theme";
import { formatStatusRows } from "../utils/status-format";

export function StatusBar() {
  const { theme } = useTheme();
  const state = useAppState();
  const settings = useComposerSettings();
  const dimensions = useTerminalDimensions();
  const rows = () =>
    formatStatusRows({
      selected: state.selected,
      detail: state.detail,
      status: state.status,
      error: state.error,
      projectConfig: settings.project.config,
      runtimeHealthy: state.runtimeHealthy,
      width: dimensions().width,
    });

  return (
    <box
      height={3}
      paddingLeft={1}
      paddingRight={1}
      border={true}
      borderColor={state.error ? theme.error : theme.border}
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
    >
      <text fg={state.error ? theme.error : theme.text}>{rows()[0]}</text>
      <text fg={theme.textMuted}>{rows()[1]}</text>
    </box>
  );
}
