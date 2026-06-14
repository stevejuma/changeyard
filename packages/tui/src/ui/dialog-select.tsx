import { RGBA, ScrollBoxRenderable, TextAttributes, type TextareaRenderable } from "@opentui/core";
import { useTheme, selectedForeground } from "../context/theme";
import { batch, createEffect, createMemo, For, Show, type JSX, on } from "solid-js";
import { createStore } from "solid-js/store";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import { useDialog, type DialogContext } from "./dialog";
import { filterCommandItems } from "../utils/command-search";

export interface DialogSelectOption<T = string> {
  title: string;
  value: T;
  description?: string;
  footer?: JSX.Element | string;
  category?: string;
  keywords?: readonly string[];
  disabled?: boolean;
  bg?: RGBA;
  onSelect?: (ctx: DialogContext) => void;
}

export type DialogSelectRef<T = string> = {
  filter: string;
  filtered: DialogSelectOption<T>[];
};

export interface DialogSelectProps<T = string> {
  title: string;
  placeholder?: string;
  options: DialogSelectOption<T>[];
  flat?: boolean;
  ref?: (ref: DialogSelectRef<T>) => void;
  onMove?: (option: DialogSelectOption<T>) => void;
  onSelect?: (option: DialogSelectOption<T>) => void;
  onFilter?: (query: string) => void;
  skipFilter?: boolean;
  current?: T;
}

function isDeepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function DialogSelect<T>(props: DialogSelectProps<T>) {
  const dialog = useDialog();
  const { theme } = useTheme();
  const [store, setStore] = createStore({
    selected: 0,
    filter: "",
    input: "keyboard" as "keyboard" | "mouse",
  });

  createEffect(
    on(
      () => props.current,
      (current) => {
        if (current !== undefined) {
          const currentIndex = flat().findIndex((opt) => isDeepEqual(opt.value, current));
          if (currentIndex >= 0) setStore("selected", currentIndex);
        }
      },
    ),
  );

  let input: TextareaRenderable;

  const filtered = createMemo(() => {
    if (props.skipFilter) return props.options.filter((x) => x.disabled !== true);
    const needle = store.filter;
    const options = props.options.filter((x) => x.disabled !== true);
    if (!needle) return options;
    return filterCommandItems(options, needle);
  });

  createEffect(() => {
    filtered();
    setStore("input", "keyboard");
  });

  const flatten = createMemo(() => props.flat && store.filter.length > 0);

  const grouped = createMemo<[string, DialogSelectOption<T>[]][]>(() => {
    if (flatten()) return [["", filtered()]];
    const map = new Map<string, DialogSelectOption<T>[]>();
    for (const option of filtered()) {
      const category = option.category ?? "";
      const list = map.get(category) ?? [];
      list.push(option);
      map.set(category, list);
    }
    return Array.from(map.entries());
  });

  const flat = createMemo(() => grouped().flatMap(([_, options]) => options));

  const rows = createMemo(() => {
    const headers = grouped().reduce((acc, [category], i) => {
      if (!category) return acc;
      return acc + (i > 0 ? 2 : 1);
    }, 0);
    return flat().length + headers;
  });

  const dimensions = useTerminalDimensions();
  const height = createMemo(() => Math.min(rows(), Math.floor(dimensions().height / 2) - 6));
  const selected = createMemo(() => flat()[store.selected]);

  createEffect(
    on([() => store.filter, () => props.current], ([filter, current]) => {
      setTimeout(() => {
        if (filter.length > 0) {
          moveTo(0, true);
        } else if (current !== undefined) {
          const currentIndex = flat().findIndex((opt) => isDeepEqual(opt.value, current));
          if (currentIndex >= 0) moveTo(currentIndex, true);
        }
      }, 0);
    }),
  );

  function move(direction: number) {
    if (flat().length === 0) return;
    let next = store.selected + direction;
    if (next < 0) next = flat().length - 1;
    if (next >= flat().length) next = 0;
    moveTo(next, true);
  }

  function moveTo(next: number, center = false) {
    setStore("selected", next);
    const option = selected();
    if (option) props.onMove?.(option);
    if (!scroll) return;
    const target = scroll.getChildren().find((child) => child.id === JSON.stringify(selected()?.value));
    if (!target) return;
    const y = target.y - scroll.y;
    if (center) {
      scroll.scrollBy(y - Math.floor(scroll.height / 2));
    } else {
      if (y >= scroll.height) scroll.scrollBy(y - scroll.height + 1);
      if (y < 0) scroll.scrollBy(y);
    }
  }

  useKeyboard((evt) => {
    setStore("input", "keyboard");
    if (evt.name === "up" || (evt.ctrl && evt.name === "p")) move(-1);
    if (evt.name === "down" || (evt.ctrl && evt.name === "n")) move(1);
    if (evt.name === "pageup") move(-10);
    if (evt.name === "pagedown") move(10);
    if (evt.name === "home") moveTo(0);
    if (evt.name === "end") moveTo(flat().length - 1);
    if (evt.name === "return") {
      const option = selected();
      if (option) {
        evt.preventDefault();
        evt.stopPropagation();
        if (props.onSelect) {
          props.onSelect(option);
        } else {
          option.onSelect?.(dialog);
        }
      }
    }
  });

  let scroll: ScrollBoxRenderable | undefined;
  const ref: DialogSelectRef<T> = {
    get filter() {
      return store.filter;
    },
    get filtered() {
      return filtered();
    },
  };
  props.ref?.(ref);

  return (
    <box gap={1} paddingBottom={1}>
      <box paddingLeft={4} paddingRight={4}>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={theme.text} attributes={TextAttributes.BOLD}>
            {props.title}
          </text>
          <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
            esc
          </text>
        </box>
        <box paddingTop={1}>
          <textarea
            maxHeight={1}
            minHeight={1}
            placeholder={props.placeholder ?? "Search"}
            onContentChange={() => {
              const next = input.plainText;
              setStore("filter", next);
              props.onFilter?.(next);
            }}
            onKeyDown={(evt) => {
              setStore("input", "keyboard");
              if (evt.name === "escape") {
                evt.preventDefault();
                dialog.clear();
                return;
              }
              if (evt.name === "up" || (evt.ctrl && evt.name === "p")) {
                evt.preventDefault();
                move(-1);
                return;
              }
              if (evt.name === "down" || (evt.ctrl && evt.name === "n")) {
                evt.preventDefault();
                move(1);
                return;
              }
              if (evt.name === "return") {
                const option = selected();
                if (!option) return;
                evt.preventDefault();
                if (props.onSelect) {
                  props.onSelect(option);
                } else {
                  option.onSelect?.(dialog);
                }
              }
            }}
            focusedBackgroundColor={theme.backgroundPanel}
            cursorColor={theme.primary}
            textColor={theme.textMuted}
            ref={(r: TextareaRenderable) => {
              input = r;
              setTimeout(() => {
                if (!input || input.isDestroyed) return;
                input.focus();
              }, 1);
            }}
          />
        </box>
      </box>
      <Show
        when={grouped().length > 0}
        fallback={
          <box paddingLeft={4} paddingRight={4} paddingTop={1}>
            <text fg={theme.textMuted}>No results found</text>
          </box>
        }
      >
        <scrollbox
          paddingLeft={1}
          paddingRight={1}
          scrollbarOptions={{ visible: false }}
          ref={(r: ScrollBoxRenderable) => (scroll = r)}
          maxHeight={height()}
        >
          <For each={grouped()}>
            {([category, options], index) => (
              <>
                <Show when={category}>
                  <box paddingTop={index() > 0 ? 1 : 0} paddingLeft={3}>
                    <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                      {category}
                    </text>
                  </box>
                </Show>
                <For each={options}>
                  {(option) => {
                    const active = createMemo(() => isDeepEqual(option.value, selected()?.value));
                    const current = createMemo(() => isDeepEqual(option.value, props.current));
                    return (
                      <box
                        id={JSON.stringify(option.value)}
                        flexDirection="row"
                        onMouseUp={() => {
                          if (props.onSelect) {
                            props.onSelect(option);
                          } else {
                            option.onSelect?.(dialog);
                          }
                        }}
                        onMouseOver={() => {
                          if (store.input !== "mouse") return;
                          const idx = flat().findIndex((x) => isDeepEqual(x.value, option.value));
                          if (idx === -1) return;
                          moveTo(idx);
                        }}
                        backgroundColor={active() ? (option.bg ?? theme.primary) : RGBA.fromInts(0, 0, 0, 0)}
                        paddingLeft={current() ? 1 : 3}
                        paddingRight={3}
                      >
                        <text fg={active() ? selectedForeground(theme, option.bg ?? theme.primary) : theme.text}>
                          {option.title}
                        </text>
                        <Show when={option.description}>
                          <text fg={active() ? selectedForeground(theme, option.bg ?? theme.primary) : theme.textMuted}>
                            {"  "}
                            {option.description}
                          </text>
                        </Show>
                        <Show when={option.footer}>
                          <box flexGrow={1} />
                          <text fg={active() ? selectedForeground(theme, option.bg ?? theme.primary) : theme.textMuted}>
                            {option.footer}
                          </text>
                        </Show>
                      </box>
                    );
                  }}
                </For>
              </>
            )}
          </For>
        </scrollbox>
      </Show>
    </box>
  );
}
