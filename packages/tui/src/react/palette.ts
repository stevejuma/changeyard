export const palette = {
  bg: "#101317",
  panel: "#171b21",
  panel2: "#1f252d",
  border: "#3a424d",
  text: "#e8edf2",
  muted: "#8e98a6",
  faint: "#596270",
  accent: "#6ee7b7",
  blue: "#7dd3fc",
  yellow: "#fde68a",
  red: "#fca5a5",
  selection: "#2f6f5f",
  selectionText: "#f7fffb",
};

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  if (max <= 3) return value.slice(0, max);
  return `${value.slice(0, max - 3)}...`;
}
