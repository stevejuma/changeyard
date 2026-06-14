import type { BoxRenderable, TextareaRenderable } from "@opentui/core";
import { createEffect, createSignal, onMount } from "solid-js";
import { useTheme } from "../../context/theme";
import { EmptyBorder } from "../border";
import { useKeybind } from "../../context/keybind";
import { Autocomplete, type AutocompleteRef } from "./autocomplete";
import { useDialog } from "../../ui/dialog";
import { parseSlashCommand } from "../../context/app-state";
import { useChangeyardActions } from "../../commands/changeyard";
import { useComposerSettings } from "../../context/composer-settings";
import { usePromptGlobalShortcuts } from "./global-shortcuts";
import { useKV } from "../../context/kv";
import {
  getHistoryNavigationAction,
  normalizePromptHistory,
  prependPromptHistoryEntry,
  resolvePromptHistoryEntry,
  type HistoryDirection,
} from "../../utils/prompt-history";

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
  const dialog = useDialog();
  const actions = useChangeyardActions();
  const composerSettings = useComposerSettings();
  const handleGlobalShortcut = usePromptGlobalShortcuts();
  const kv = useKV();

  const [value, setValue] = createSignal("");
  const [history, setHistory] = createSignal<string[]>(normalizePromptHistory(kv.get("prompt_history")));
  const [historyIndex, setHistoryIndex] = createSignal(-1);
  const [savedInput, setSavedInput] = createSignal("");
  let applyingHistory = false;

  createEffect(() => {
    if (!kv.ready) return;
    setHistory(normalizePromptHistory(kv.get("prompt_history")));
  });

  function recordHistoryEntry(entry: string) {
    const next = prependPromptHistoryEntry(history(), entry);
    setHistory(next);
    setHistoryIndex(-1);
    kv.set("prompt_history", next);
  }

  function navigateHistory(direction: HistoryDirection): boolean {
    if (!input || input.isDestroyed) return false;
    const action = getHistoryNavigationAction({
      direction,
      cursorOffset: input.cursorOffset,
      textLength: input.plainText.length,
      visualRow: input.visualCursor.visualRow,
      height: input.height,
      virtualLineCount: input.virtualLineCount,
    });
    if (action === "ignore") return false;
    if (action === "move-to-boundary") {
      input.cursorOffset = direction === "up" ? 0 : input.plainText.length;
      return true;
    }
    const nextIndex = resolvePromptHistoryEntry({
      history: history(),
      index: historyIndex(),
      direction,
    });
    if (nextIndex === historyIndex()) return false;
    if (historyIndex() === -1 && direction === "up") {
      setSavedInput(value());
    }
    setHistoryIndex(nextIndex);
    const next = nextIndex === -1 ? savedInput() : history()[nextIndex] ?? "";
    applyingHistory = true;
    ref.set(next);
    applyingHistory = false;
    input.cursorOffset = direction === "up" ? 0 : next.length;
    return true;
  }

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
          recordHistoryEntry(text);
          ref.clear();
          props.onSubmit?.();
        }
      }
      return;
    }

    const preset = composerSettings.preset();
    void actions.createChangeFromPreset(preset.id, text).then(() => {
      recordHistoryEntry(text);
      ref.clear();
      props.onSubmit?.();
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
              placeholder="Type a change title, /help, or /create quick..."
              textColor={theme.text}
              minHeight={1}
              maxHeight={6}
              onContentChange={() => {
                const next = input.plainText;
                setValue(next);
                if (!applyingHistory) setHistoryIndex(-1);
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
                if (!autocomplete?.visible) {
                  if (e.name === "up" || e.name === "down") {
                    if (navigateHistory(e.name)) {
                      e.preventDefault();
                      return;
                    }
                  }
                  if (keybind.match("profile_cycle", e)) {
                    e.preventDefault();
                    composerSettings.cyclePreset(1);
                    return;
                  }
                  if (keybind.match("profile_cycle_reverse", e)) {
                    e.preventDefault();
                    composerSettings.cyclePreset(-1);
                    return;
                  }
                }
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
            <box paddingTop={1}>
              <text fg={theme.text}>
                <span style={{ fg: theme.primary }}>{composerSettings.preset().label}</span>
                <span style={{ fg: theme.textMuted }}>
                  {" "}
                  · {composerSettings.selectedAgent()?.label ?? "agent"}
                </span>
              </text>
            </box>
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
        <box flexDirection="row" justifyContent="space-between" paddingTop={1} paddingLeft={2} paddingRight={2}>
          <text fg={theme.textMuted}>
            {composerSettings.project.config?.providerType ?? "provider"} ·{" "}
            {composerSettings.project.config?.vcsEngine ?? "vcs"}
          </text>
          <box gap={2} flexDirection="row">
            <text fg={theme.text}>
              {keybind.print("profile_cycle")} <span style={{ fg: theme.textMuted }}>profiles</span>
            </text>
            <text fg={theme.text}>
              {keybind.print("command_list")} <span style={{ fg: theme.textMuted }}>commands</span>
            </text>
          </box>
        </box>
      </box>
    </>
  );
}
