import { palette, truncate } from "../palette";
import type { AutocompleteMode, AutocompleteOption } from "../types";

export function AutocompleteDropdown(props: {
  mode: AutocompleteMode;
  options: AutocompleteOption[];
  selected: number;
  onSelect: (option: AutocompleteOption) => void;
}) {
  if (!props.mode || props.options.length === 0) return null;
  const visible = props.options.slice(0, 7);
  return (
    <box flexDirection="column" border borderStyle="rounded" borderColor={palette.border}>
      {visible.map((option, index) => {
        const active = index === props.selected;
        const description = props.mode === "@" ? (option.file?.changed ? "changed" : "workspace file") : option.description;
        return (
          <box
            key={`${option.value}-${index}`}
            paddingX={1}
            backgroundColor={active ? palette.selection : undefined}
            onMouseDown={() => props.onSelect(option)}
          >
            <text wrapMode="none">
              <span fg={active ? palette.selectionText : palette.muted}>{active ? "> " : "  "}</span>
              <span fg={active ? palette.selectionText : palette.text}>{truncate(option.display, 42)}</span>
              {description ? (
                <span fg={active ? palette.selectionText : palette.muted}>
                  {"  "}
                  {truncate(description, 44)}
                </span>
              ) : null}
            </text>
          </box>
        );
      })}
    </box>
  );
}
