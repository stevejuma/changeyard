import { useTheme } from "../context/theme";
import { useDialog } from "../ui/dialog";
import { useKeyboard } from "@opentui/solid";
import { Show } from "solid-js";

export function PlanningPromptDialog(props: { prompt: string | null }) {
  const { theme, syntax } = useTheme();
  const dialog = useDialog();

  useKeyboard((evt) => {
    if (evt.name === "return" || evt.name === "escape") {
      dialog.clear();
    }
  });

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexDirection="column" maxHeight={20}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text}>Planning prompt</text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={props.prompt} fallback={<text fg={theme.textMuted}>No prompt loaded.</text>}>
        {(prompt) => <markdown content={prompt().slice(0, 3000)} syntaxStyle={syntax()} />}
      </Show>
    </box>
  );
}
