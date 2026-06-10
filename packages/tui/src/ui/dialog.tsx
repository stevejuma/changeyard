import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { batch, createContext, createMemo, Show, useContext, type JSX, type ParentProps } from "solid-js";
import { useTheme } from "../context/theme";
import { MouseButton, Renderable, RGBA } from "@opentui/core";
import { createStore } from "solid-js/store";

export function Dialog(
  props: ParentProps<{
    size?: "medium" | "large";
    onClose: () => void;
  }>,
) {
  const dimensions = useTerminalDimensions();
  const { theme } = useTheme();
  const renderer = useRenderer();

  let dismiss = false;

  return (
    <box
      onMouseDown={() => {
        dismiss = !!renderer.getSelection();
      }}
      onMouseUp={() => {
        if (dismiss) {
          dismiss = false;
          return;
        }
        props.onClose?.();
      }}
      width={dimensions().width}
      height={dimensions().height}
      alignItems="center"
      position="absolute"
      paddingTop={dimensions().height / 4}
      left={0}
      top={0}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
    >
      <box
        onMouseUp={(e) => {
          dismiss = false;
          e.stopPropagation();
        }}
        width={props.size === "large" ? 80 : 60}
        maxWidth={dimensions().width - 2}
        backgroundColor={theme.backgroundPanel}
        paddingTop={1}
      >
        {props.children}
      </box>
    </box>
  );
}

function DialogBody(props: { content: JSX.Element | (() => JSX.Element) }) {
  return typeof props.content === "function" ? props.content() : props.content;
}

function init() {
  const [store, setStore] = createStore({
    stack: [] as { element: JSX.Element | (() => JSX.Element); onClose?: () => void }[],
    size: "medium" as "medium" | "large",
  });

  const renderer = useRenderer();

  useKeyboard((evt) => {
    if (store.stack.length === 0) return;
    if (evt.defaultPrevented) return;
    if (evt.name === "escape" && renderer.getSelection()?.getSelectedText()) return;
    if (evt.name === "escape") {
      const current = store.stack.at(-1)!;
      current.onClose?.();
      setStore("stack", store.stack.slice(0, -1));
      evt.preventDefault();
      evt.stopPropagation();
      refocus();
    }
  });

  let focus: Renderable | null;
  function refocus() {
    setTimeout(() => {
      if (!focus) return;
      if (focus.isDestroyed) return;
      function find(item: Renderable) {
        for (const child of item.getChildren()) {
          if (child === focus) return true;
          if (find(child)) return true;
        }
        return false;
      }
      const found = find(renderer.root);
      if (!found) return;
      focus.focus();
    }, 1);
  }

  return {
    clear() {
      for (const item of store.stack) {
        item.onClose?.();
      }
      batch(() => {
        setStore("size", "medium");
        setStore("stack", []);
      });
      refocus();
    },
    replace(input: JSX.Element | (() => JSX.Element), onClose?: () => void) {
      if (store.stack.length === 0) {
        focus = renderer.currentFocusedRenderable;
        focus?.blur();
      }
      for (const item of store.stack) {
        if (item.onClose) item.onClose();
      }
      setStore("size", "medium");
      setStore("stack", [{ element: input, onClose }]);
    },
    get stack() {
      return store.stack;
    },
    get size() {
      return store.size;
    },
    setSize(size: "medium" | "large") {
      setStore("size", size);
    },
  };
}

export type DialogContext = ReturnType<typeof init>;

const ctx = createContext<DialogContext>();

export function DialogProvider(props: ParentProps) {
  const value = init();
  const top = createMemo(() => value.stack.at(-1));
  return (
    <ctx.Provider value={value}>
      {props.children}
      <box position="absolute">
        <Show when={top()}>
          {(item) => (
            <Dialog onClose={() => value.clear()} size={value.size}>
              <DialogBody content={item().element} />
            </Dialog>
          )}
        </Show>
      </box>
    </ctx.Provider>
  );
}

export function useDialog() {
  const value = useContext(ctx);
  if (!value) throw new Error("useDialog must be used within a DialogProvider");
  return value;
}
