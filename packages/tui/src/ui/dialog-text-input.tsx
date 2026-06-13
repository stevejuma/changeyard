import { TextAttributes, type TextareaRenderable } from "@opentui/core";
import { useTheme } from "../context/theme";
import { useDialog } from "./dialog";
import { useKeyboard } from "@opentui/solid";

export function DialogTextInput(props: {
  title: string;
  initialValue: string;
  placeholder?: string;
  onConfirm: (value: string) => void | Promise<void>;
}) {
  const dialog = useDialog();
  const { theme } = useTheme();
  let input: TextareaRenderable;

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      evt.preventDefault();
      dialog.clear();
    }
    if (evt.name === "return") {
      evt.preventDefault();
      void props.onConfirm(input.plainText.trim());
    }
  });

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <textarea
        maxHeight={1}
        minHeight={1}
        initialValue={props.initialValue}
        placeholder={props.placeholder ?? "Value"}
        focusedBackgroundColor={theme.backgroundPanel}
        cursorColor={theme.primary}
        textColor={theme.text}
        ref={(r: TextareaRenderable) => {
          input = r;
          setTimeout(() => {
            if (!input || input.isDestroyed) return;
            input.focus();
          }, 1);
        }}
      />
      <box flexDirection="row" justifyContent="flex-end" gap={1}>
        <text fg={theme.textMuted}>Enter save</text>
      </box>
    </box>
  );
}
