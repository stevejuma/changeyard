import type { KeyEvent } from "@opentui/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useMemo, useRef, useState } from "react";
import { palette, truncate } from "../palette";

export type CommandPaletteItem = {
  id: string;
  label: string;
  description: string;
  shortcut: string;
  run: () => void | Promise<void>;
};

export function CommandPalette(props: {
  items: CommandPaletteItem[];
  onClose: () => void;
  onRun: (item: CommandPaletteItem) => void;
}) {
  const { width, height } = useTerminalDimensions();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const filtered = useMemo(() => filterItems(props.items, query), [props.items, query]);
  const safeSelected = Math.min(selected, Math.max(0, filtered.length - 1));
  const filteredRef = useRef(filtered);
  const safeSelectedRef = useRef(safeSelected);
  filteredRef.current = filtered;
  safeSelectedRef.current = safeSelected;

  useKeyboard((key: KeyEvent) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      key.preventDefault();
      props.onClose();
      return;
    }
    if (key.name === "return" || key.name === "enter" || key.name === "tab") {
      key.preventDefault();
      const item = filteredRef.current[safeSelectedRef.current];
      if (item) props.onRun(item);
      return;
    }
    if (key.name === "up" || (key.ctrl && key.name === "p")) {
      key.preventDefault();
      setSelected((index) => (filteredRef.current.length === 0 ? 0 : index <= 0 ? filteredRef.current.length - 1 : index - 1));
      return;
    }
    if (key.name === "down" || (key.ctrl && key.name === "n")) {
      key.preventDefault();
      setSelected((index) => (filteredRef.current.length === 0 ? 0 : index >= filteredRef.current.length - 1 ? 0 : index + 1));
    }
  });

  const dialogWidth = Math.min(64, Math.max(46, Math.floor(width * 0.58)), Math.max(36, width - 8));
  const visibleCount = Math.max(3, Math.min(7, height - 10));
  const start = Math.max(0, Math.min(safeSelected - Math.floor(visibleCount / 2), Math.max(0, filtered.length - visibleCount)));
  const visible = filtered.slice(start, start + visibleCount);
  const contentWidth = Math.max(20, dialogWidth - 4);
  const shortcutWidth = 7;
  const labelWidth = Math.max(10, contentWidth - shortcutWidth - 2);
  const dialogHeight = Math.min(height - 2, 14);
  const dialogTop = Math.max(1, Math.min(Math.floor(height * 0.22), Math.max(1, height - dialogHeight - 1)));

  return (
    <box
      position="absolute"
      zIndex={10}
      top={dialogTop}
      left={Math.max(2, Math.floor((width - dialogWidth) / 2))}
      width={dialogWidth}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor="gray"
      paddingX={1}
      paddingY={1}
      backgroundColor="#111111"
      gap={1}
    >
      <box flexDirection="row" width="100%" justifyContent="space-between">
        <text fg={palette.text}>Command Palette</text>
        <text fg="gray">Ctrl+P</text>
      </box>
      <box border borderStyle="rounded" borderColor="gray" paddingX={1} width="100%">
        <input
          value={query}
          onInput={(value: string) => {
            setQuery(value);
            setSelected(0);
          }}
          placeholder="Search actions..."
          focused
          flexGrow={1}
        />
      </box>
      <box flexDirection="column" width="100%">
        {visible.length === 0 ? (
          <text fg="gray">No matching commands found.</text>
        ) : (
          visible.map((item, offset) => {
            const absoluteIndex = start + offset;
            const isSelected = absoluteIndex === safeSelected;
            return (
              <box
                key={item.id}
                flexDirection="column"
                backgroundColor={isSelected ? palette.selection : undefined}
                paddingX={1}
                onMouseDown={() => props.onRun(item)}
              >
                <box flexDirection="row" width={contentWidth}>
                  <text fg={isSelected ? palette.textOnSelection : palette.text} width={labelWidth} wrapMode="none">
                    {truncate(item.label, labelWidth)}
                  </text>
                  <text fg={isSelected ? palette.textOnSelection : palette.act} width={shortcutWidth} wrapMode="none">
                    {truncate(item.shortcut, shortcutWidth)}
                  </text>
                </box>
                <text fg={isSelected ? palette.textOnSelection : "gray"} wrapMode="none">
                  {truncate(item.description, contentWidth)}
                </text>
              </box>
            );
          })
        )}
      </box>
      <text fg="gray">Type to search, arrows navigate, Enter runs, Esc closes</text>
    </box>
  );
}

function filterItems(items: CommandPaletteItem[], query: string): CommandPaletteItem[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return items;
  return items
    .map((item) => {
      const haystack = `${item.label} ${item.description} ${item.id}`.toLowerCase();
      const score = tokens.reduce((sum, token) => {
        if (item.label.toLowerCase().startsWith(token)) return sum + 4;
        if (haystack.includes(token)) return sum + 1;
        return -100;
      }, 0);
      return { item, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
