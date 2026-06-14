import { useTerminalDimensions } from "@opentui/react";
import { DROPDOWN_MAX_HEIGHT, palette } from "../palette";
import type { AutocompleteMode, AutocompleteOption } from "../types";

const MAX_ROWS = 7;

export function AutocompleteDropdown(props: {
  mode: AutocompleteMode;
  options: AutocompleteOption[];
  selected: number;
  onSelect: (option: AutocompleteOption) => void;
  accent?: string;
  containerWidth?: number;
}) {
  const { width } = useTerminalDimensions();
  if (!props.mode || props.options.length === 0) return null;

  const effectiveWidth = props.containerWidth ?? width;
  const rowBudget = Math.max(10, effectiveWidth - 4);
  const safeSelected = Math.max(0, Math.min(props.selected, props.options.length - 1));
  const visible = buildVisibleOptions(props.options, safeSelected);

  return (
    <box flexDirection="column" border borderStyle="rounded" borderColor="gray" height={Math.min(DROPDOWN_MAX_HEIGHT, visible.length + 2)}>
      {visible.map((item) =>
        item.kind === "more" ? (
          <box key={item.key} paddingX={1} justifyContent="center">
            <text fg="gray">{item.label}</text>
          </box>
        ) : (
          <OptionRow
            key={`${item.option.value}-${item.index}`}
            option={item.option}
            isSelected={item.index === safeSelected}
            rowBudget={rowBudget}
            mode={props.mode}
            accent={props.accent ?? palette.selection}
            onSelect={props.onSelect}
          />
        ),
      )}
    </box>
  );
}

function buildVisibleOptions(options: AutocompleteOption[], selected: number) {
  if (options.length <= MAX_ROWS) {
    return options.map((option, index) => ({ kind: "option" as const, option, index }));
  }
  const halfWindow = Math.floor(MAX_ROWS / 2);
  let start = Math.max(0, selected - halfWindow);
  if (start + MAX_ROWS > options.length) {
    start = options.length - MAX_ROWS;
  }
  const moreAbove = start > 0;
  const moreBelow = start + MAX_ROWS < options.length;
  const slots = MAX_ROWS - (moreAbove ? 1 : 0) - (moreBelow ? 1 : 0);
  const optionStart = moreAbove ? start + 1 : start;
  const rows: Array<
    | { kind: "more"; key: string; label: string }
    | { kind: "option"; option: AutocompleteOption; index: number }
  > = [];
  if (moreAbove) rows.push({ kind: "more", key: "above", label: `▲ ${optionStart} more` });
  rows.push(...options.slice(optionStart, optionStart + slots).map((option, offset) => ({
    kind: "option" as const,
    option,
    index: optionStart + offset,
  })));
  if (moreBelow) rows.push({ kind: "more", key: "below", label: `▼ ${options.length - (optionStart + slots)} more` });
  return rows;
}

function OptionRow(props: {
  option: AutocompleteOption;
  isSelected: boolean;
  rowBudget: number;
  mode: AutocompleteMode;
  accent: string;
  onSelect: (option: AutocompleteOption) => void;
}) {
  const prefix = props.isSelected ? "❯ " : "  ";
  const budgetAfterPrefix = Math.max(1, props.rowBudget - prefix.length);
  const description = props.mode === "@" ? (props.option.file?.changed ? "changed" : "workspace file") : props.option.description;
  const displayName =
    props.mode === "@"
      ? truncateStart(props.option.display, budgetAfterPrefix)
      : truncateEnd(props.option.display, description ? Math.max(1, Math.floor(budgetAfterPrefix * 0.38)) : budgetAfterPrefix);
  const descriptionText = description
    ? truncateEnd(description, Math.max(0, budgetAfterPrefix - displayName.length - 1))
    : "";
  const gap = descriptionText ? Math.max(1, budgetAfterPrefix - displayName.length - descriptionText.length) : 0;

  return (
    <box paddingX={1} backgroundColor={props.isSelected ? props.accent : undefined} onMouseDown={() => props.onSelect(props.option)}>
      <text wrapMode="none">
        <span fg={props.isSelected ? palette.textOnSelection : "gray"}>{prefix}</span>
        <span fg={props.isSelected ? palette.textOnSelection : palette.text}>{displayName}</span>
        {descriptionText ? (
          <span fg={props.isSelected ? palette.textOnSelection : "gray"}>
            {" ".repeat(gap)}
            {descriptionText}
          </span>
        ) : null}
      </text>
    </box>
  );
}

function truncateEnd(value: string, max: number): string {
  if (max <= 0) return "";
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, max - 1)}…`;
}

function truncateStart(value: string, max: number): string {
  if (max <= 0) return "";
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(-max);
  return `…${value.slice(-(max - 1))}`;
}
