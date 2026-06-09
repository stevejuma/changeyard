import type { BoxRenderable, TextareaRenderable } from "@opentui/core";
import { createEffect, createSignal, onMount } from "solid-js";
import { useTheme } from "../../context/theme";
import { EmptyBorder } from "../border";
import { useKeybind } from "../../context/keybind";
import { Autocomplete, type AutocompleteRef } from "./autocomplete";
import { useToast } from "../../ui/toast";
import { useDialog } from "../../ui/dialog";
import { parseSlashCommand } from "../../context/app-state";
import { useChangeyardActions } from "../../commands/changeyard";
import { usePromptGlobalShortcuts } from "./global-shortcuts";

export type PromptRef = {
  focused: boolean;
  get value(): string;
  set(value: string): void;
  clear(): void;
  focus(): void;
  blur(): void;
  submit(): void;
};

export type PromptProps = {
  ref?: (ref: PromptRef) => void;
  onSubmit?: () => void;
};

export function Prompt(props: PromptProps) {
  let input: TextareaRenderable;
  let anchor: BoxRenderable;
  let autocomplete: AutocompleteRef;

  const { theme, syntax } = useTheme();
  const keybind = useKeybind();
  const toast = useToast();
  const dialog = useDialog();
  const actions = useChangeyardActions();
  const handleGlobalShortcut = usePromptGlobalShortcuts();

  const [value, setValue] = createSignal("");

  const ref: PromptRef = {
    get focused() {
      return input?.focused ?? false;
    },
    get value() {
      return value();
    },
    set(next: string) {
      setValue(next);
      if (input && !input.isDestroyed) {
        input.setText(next);
      }
    },
    clear() {
      setValue("");
      if (input && !input.isDestroyed) input.clear();
    },
    focus() {
      if (input && !input.isDestroyed) input.focus();
    },
    blur() {
      if (input && !input.isDestroyed) input.blur();
    },
    submit() {
      handleSubmit();
    },
  };

  onMount(() => {
    props.ref?.(ref);
  });

  function handleSubmit() {
    const text = value().trim();
    if (!text) return;

    if (text.startsWith("/")) {
      const parsed = parseSlashCommand(text);
      if (parsed) {
        const executed = actions.executeSlash(text);
        if (executed) {
          ref.clear();
          props.onSubmit?.();
        }
      }
      return;
    }

    toast.show({
      variant: "info",
      message: "Type / for commands. Example: /create quick",
      duration: 2500,
    });
  }

  createEffect(() => {
    if (!input || input.isDestroyed) return;
    input.cursorColor = theme.text;
  });

  return (
    <>
      <Autocomplete
        ref={(r) => (autocomplete = r)}
        anchor={() => anchor}
        input={() => input}
        value={value()}
        onValueChange={setValue}
      />
      <box ref={(r) => (anchor = r)}>
        <box
          border={["left"]}
          borderColor={theme.primary}
          customBorderChars={{
            ...EmptyBorder,
            vertical: "┃",
            bottomLeft: "╹",
          }}
        >
          <box paddingLeft={2} paddingRight={2} paddingTop={1} flexShrink={0} backgroundColor={theme.backgroundElement} flexGrow={1}>
            <textarea
              placeholder="Type /help, /create quick, /validate..."
              textColor={theme.text}
              minHeight={1}
              maxHeight={6}
              onContentChange={() => {
                const next = input.plainText;
                setValue(next);
                autocomplete?.onInput(next);
              }}
              onKeyDown={(e) => {
                if (dialog.stack.length > 0) {
                  if (e.name === "escape") {
                    e.preventDefault();
                    dialog.clear();
                  }
                  return;
                }
                if (handleGlobalShortcut(e, Boolean(autocomplete?.visible))) return;
                if (autocomplete?.onKeyDown(e)) return;
                if (e.name === "return" && !e.shift) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              ref={(r: TextareaRenderable) => {
                input = r;
                setTimeout(() => {
                  if (!input || input.isDestroyed) return;
                  input.cursorColor = theme.text;
                  if (value()) input.setText(value());
                  if (dialog.stack.length === 0) input.focus();
                }, 0);
              }}
              focusedBackgroundColor={theme.backgroundElement}
              cursorColor={theme.text}
              syntaxStyle={syntax()}
            />
          </box>
        </box>
        <box
          height={1}
          border={["left"]}
          borderColor={theme.primary}
          customBorderChars={{
            ...EmptyBorder,
            vertical: theme.backgroundElement.a !== 0 ? "╹" : " ",
          }}
        >
          <box
            height={1}
            border={["bottom"]}
            borderColor={theme.backgroundElement}
            customBorderChars={
              theme.backgroundElement.a !== 0
                ? { ...EmptyBorder, horizontal: "▀" }
                : { ...EmptyBorder, horizontal: " " }
            }
          />
        </box>
        <box flexDirection="row" justifyContent="space-between" paddingTop={1}>
          <text />
          <box gap={2} flexDirection="row">
            <text fg={theme.text}>
              {keybind.print("command_list")} <span style={{ fg: theme.textMuted }}>commands</span>
            </text>
          </box>
        </box>
      </box>
    </>
  );
}
