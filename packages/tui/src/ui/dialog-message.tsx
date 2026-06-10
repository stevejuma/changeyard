import { TextAttributes } from "@opentui/core";
import { For, Show } from "solid-js";
import { useTheme } from "../context/theme";
import { useDialog } from "./dialog";
import { useKeyboard } from "@opentui/solid";

export function DialogMessage(props: { title: string; lines: string[] }) {
  const { theme } = useTheme();
  const dialog = useDialog();

  useKeyboard((evt) => {
    if (evt.name === "return" || evt.name === "escape") {
      dialog.clear();
    }
  });

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexDirection="column" maxHeight={18}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc/enter
        </text>
      </box>
      <Show when={props.lines.length > 0} fallback={<text fg={theme.textMuted}>No output.</text>}>
        <For each={props.lines.slice(0, 12)}>
          {(line) => <text fg={theme.textMuted}>{line}</text>}
        </For>
      </Show>
    </box>
  );
}
