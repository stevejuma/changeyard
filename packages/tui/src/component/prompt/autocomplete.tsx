import type { BoxRenderable, TextareaRenderable, KeyEvent, ScrollBoxRenderable } from "@opentui/core";
import fuzzysort from "fuzzysort";
import { createEffect, createMemo, createSignal, For, Index, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { useTheme, selectedForeground } from "../../context/theme";
import { SplitBorder } from "../border";
import { useCommandDialog } from "../dialog-command";
import { useTerminalDimensions } from "@opentui/solid";

export type AutocompleteRef = {
  onInput: (value: string) => void;
  /** Returns true when the key was handled and default handling should stop. */
  onKeyDown: (e: KeyEvent) => boolean;
  visible: false | "/";
};

export type AutocompleteOption = {
  display: string;
  value?: string;
  aliases?: string[];
  disabled?: boolean;
  description?: string;
  onSelect?: () => void;
};

export function Autocomplete(props: {
  value: string;
  anchor: () => BoxRenderable;
  input: () => TextareaRenderable;
  ref: (ref: AutocompleteRef) => void;
  onValueChange?: (value: string) => void;
}) {
  const command = useCommandDialog();
  const { theme } = useTheme();
  const dimensions = useTerminalDimensions();

  const [store, setStore] = createStore({
    index: 0,
    selected: 0,
    visible: false as AutocompleteRef["visible"],
    input: "keyboard" as "keyboard" | "mouse",
  });

  const [positionTick, setPositionTick] = createSignal(0);

  createEffect(() => {
    if (store.visible) {
      let lastPos = { x: 0, y: 0, width: 0 };
      const interval = setInterval(() => {
        const anchor = props.anchor();
        if (anchor.x !== lastPos.x || anchor.y !== lastPos.y || anchor.width !== lastPos.width) {
          lastPos = { x: anchor.x, y: anchor.y, width: anchor.width };
          setPositionTick((t) => t + 1);
        }
      }, 50);
      onCleanup(() => clearInterval(interval));
    }
  });

  const position = createMemo(() => {
    if (!store.visible) return { x: 0, y: 0, width: 0 };
    positionTick();
    const anchor = props.anchor();
    const parent = anchor.parent;
    return {
      x: anchor.x - (parent?.x ?? 0),
      y: anchor.y - (parent?.y ?? 0),
      width: anchor.width,
    };
  });

  const filter = createMemo(() => {
    if (!store.visible) return;
    props.value;
    return props.input().getTextRange(store.index + 1, props.input().cursorOffset);
  });

  const [search, setSearch] = createSignal("");
  createEffect(() => {
    const next = filter();
    setSearch(next ? next : "");
  });

  createEffect(() => {
    filter();
    setStore("input", "keyboard");
  });

  const commands = createMemo((): AutocompleteOption[] => {
    const results: AutocompleteOption[] = [...command.slashes()];
    results.sort((a, b) => a.display.localeCompare(b.display));
    const max = results.reduce((acc, item) => Math.max(acc, item.display.length), 0);
    return results.map((item) => ({
      ...item,
      display: item.display.padEnd(max + 2),
    }));
  });

  const options = createMemo(() => {
    const mixed = [...commands()];
    const searchValue = search();
    if (!searchValue) return mixed;
    return fuzzysort
      .go(searchValue, mixed, {
        keys: [(obj) => (obj.value ?? obj.display).trimEnd(), "description", (obj) => obj.aliases?.join(" ") ?? ""],
        limit: 10,
        scoreFn: (objResults) => {
          let score = objResults.score;
          if (objResults[0]?.target.startsWith("/" + searchValue)) score *= 2;
          return score;
        },
      })
      .map((arr) => arr.obj);
  });

  createEffect(() => {
    filter();
    setStore("selected", 0);
  });

  function move(direction: -1 | 1) {
    if (!store.visible || !options().length) return;
    let next = store.selected + direction;
    if (next < 0) next = options().length - 1;
    if (next >= options().length) next = 0;
    moveTo(next);
  }

  function moveTo(next: number) {
    setStore("selected", next);
    if (!scroll) return;
    const viewportHeight = Math.min(height(), options().length);
    const scrollBottom = scroll.scrollTop + viewportHeight;
    if (next < scroll.scrollTop) scroll.scrollBy(next - scroll.scrollTop);
    else if (next + 1 > scrollBottom) scroll.scrollBy(next + 1 - scrollBottom);
  }

  function dismiss() {
    command.keybinds(true);
    setStore("visible", false);
  }

  function completeSlash(selected: AutocompleteOption) {
    const input = props.input();
    const commandText = selected.display.trimEnd();
    const currentCursorOffset = input.cursorOffset;

    input.cursorOffset = store.index;
    const startCursor = input.logicalCursor;
    input.cursorOffset = currentCursorOffset;
    const endCursor = input.logicalCursor;

    input.deleteRange(startCursor.row, startCursor.col, endCursor.row, endCursor.col);
    input.insertText(commandText + " ");
    props.onValueChange?.(input.plainText);
  }

  function select() {
    const selected = options()[store.selected];
    if (!selected) return;
    completeSlash(selected);
    dismiss();
  }

  function show(mode: "/") {
    command.keybinds(false);
    setStore({ visible: mode, index: props.input().cursorOffset });
  }

  function hide() {
    const text = props.input().plainText;
    if (store.visible === "/" && !text.endsWith(" ") && text.startsWith("/")) {
      const cursor = props.input().logicalCursor;
      props.input().deleteRange(0, 0, cursor.row, cursor.col);
      props.onValueChange?.(props.input().plainText);
    }
    dismiss();
  }

  onMount(() => {
    props.ref({
      get visible() {
        return store.visible;
      },
      onInput(value) {
        if (store.visible) {
          if (
            props.input().cursorOffset <= store.index ||
            props.input().getTextRange(store.index, props.input().cursorOffset).match(/\s/) ||
            (store.visible === "/" && value.match(/^\S+\s+\S+\s*$/))
          ) {
            hide();
          }
          return;
        }

        const offset = props.input().cursorOffset;
        if (offset === 0) return;
        if (value.startsWith("/") && !value.slice(0, offset).match(/\s/)) {
          show("/");
          setStore("index", 0);
        }
      },
      onKeyDown(e: KeyEvent) {
        if (!store.visible) return false;

        const name = e.name?.toLowerCase();
        const ctrlOnly = e.ctrl && !e.meta && !e.shift;
        const isNavUp = name === "up" || (ctrlOnly && name === "p");
        const isNavDown = name === "down" || (ctrlOnly && name === "n");

        if (isNavUp) {
          e.preventDefault();
          move(-1);
          return true;
        }
        if (isNavDown) {
          e.preventDefault();
          move(1);
          return true;
        }
        if (name === "tab" || name === "return") {
          e.preventDefault();
          if (options().length === 0) {
            dismiss();
            return false;
          }
          select();
          return true;
        }
        if (name === "escape") {
          e.preventDefault();
          hide();
          return true;
        }
        return false;
      },
    });
  });

  let scroll: ScrollBoxRenderable | undefined;
  const height = createMemo(() => Math.min(10, options().length));

  return (
    <Show when={store.visible}>
      <box
        position="absolute"
        left={position().x}
        top={position().y - height() - 2}
        width={position().width}
        zIndex={1000}
        flexDirection="column"
        backgroundColor={theme.backgroundMenu}
        border={SplitBorder.border}
        customBorderChars={SplitBorder.customBorderChars}
        borderColor={theme.border}
      >
        <scrollbox
          ref={(r: ScrollBoxRenderable) => (scroll = r)}
          maxHeight={height()}
          scrollbarOptions={{ visible: false }}
        >
          <Index each={options()}>
            {(option, index) => {
              const active = () => index === store.selected;
              return (
                <box
                  flexDirection="row"
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={active() ? theme.primary : undefined}
                  onMouseOver={() => {
                    if (store.input !== "mouse") return;
                    moveTo(index);
                  }}
                  onMouseUp={() => {
                    moveTo(index);
                    select();
                  }}
                >
                  <text fg={active() ? selectedForeground(theme, theme.primary) : theme.text}>{option().display}</text>
                  <Show when={option().description}>
                    <text fg={active() ? selectedForeground(theme, theme.primary) : theme.textMuted}>
                      {option().description}
                    </text>
                  </Show>
                </box>
              );
            }}
          </Index>
        </scrollbox>
      </box>
    </Show>
  );
}
