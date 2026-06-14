// Adapted from Cline CLI prompt history boundary navigation (Apache-2.0).
// See packages/tui/src/vendor/ATTRIBUTION.cline-cli.md.
export type HistoryDirection = "up" | "down";
export type HistoryNavigationAction = "navigate" | "move-to-boundary" | "ignore";

export type HistoryNavigationPosition = {
  direction: HistoryDirection;
  cursorOffset: number;
  textLength: number;
  visualRow: number;
  height: number;
  virtualLineCount: number;
};

const MAX_PROMPT_HISTORY = 100;

export function getHistoryNavigationAction(position: HistoryNavigationPosition): HistoryNavigationAction {
  if (position.direction === "up") {
    if (position.cursorOffset <= 0) return "navigate";
    return position.visualRow === 0 ? "move-to-boundary" : "ignore";
  }

  if (position.cursorOffset >= position.textLength) return "navigate";

  const visibleLineCount = Math.max(
    1,
    Math.min(position.height, Math.max(1, position.virtualLineCount)),
  );
  const bottomVisualRow = visibleLineCount - 1;
  return position.visualRow >= bottomVisualRow ? "move-to-boundary" : "ignore";
}

export function normalizePromptHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, MAX_PROMPT_HISTORY);
}

export function prependPromptHistoryEntry(history: readonly string[], entry: string): string[] {
  const normalized = entry.trim();
  if (!normalized) return [...history];
  return [
    normalized,
    ...history.filter((item) => item.trim() !== normalized),
  ].slice(0, MAX_PROMPT_HISTORY);
}

export function resolvePromptHistoryEntry(input: {
  history: readonly string[];
  index: number;
  direction: HistoryDirection;
}): number {
  if (input.history.length === 0) return -1;
  if (input.direction === "up") {
    return input.index < input.history.length - 1 ? input.index + 1 : input.index;
  }
  return input.index > -1 ? input.index - 1 : -1;
}
