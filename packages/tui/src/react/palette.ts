export const palette = {
  act: "cyan",
  plan: "yellow",
  profile: "brightGreen",
  selection: "cyan",
  accent: "cyan",
  border: "gray",
  text: "white",
  muted: "gray",
  faint: "#777777",
  textOnSelection: "black",
  selectionText: "black",
  success: "brightGreen",
  red: "red",
  yellow: "yellow",
  bg: "#000000",
  panel: "#202020",
  panel2: "#3d4140",
  inputActBg: "#3d4140",
  inputPlanBg: "#43413b",
  inputFg: "#eeeeee",
  inputPlaceholder: "#a2a2a2",
};

export const HOME_VIEW_MAX_WIDTH = 68;
export const DROPDOWN_MAX_HEIGHT = 9;

export function getModeAccent(mode: "plan" | "act"): string {
  return mode === "plan" ? palette.plan : palette.act;
}

export function getModeInputBackground(mode: "plan" | "act"): string {
  return mode === "plan" ? palette.inputPlanBg : palette.inputActBg;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  if (max <= 3) return value.slice(0, max);
  return `${value.slice(0, max - 3)}...`;
}
