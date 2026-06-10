import type { ParsedKey } from "@opentui/core";
import { createSimpleContext } from "./helper";

export type KeybindKey = "command_list" | "sidebar_toggle" | "profile_cycle" | "profile_cycle_reverse";

const KEYBINDS: Record<KeybindKey, string> = {
  command_list: "ctrl+p",
  sidebar_toggle: "ctrl+b",
  profile_cycle: "tab",
  profile_cycle_reverse: "shift+tab",
};

function parseKeybind(value: string) {
  const parts = value.toLowerCase().split("+");
  return {
    ctrl: parts.includes("ctrl"),
    meta: parts.includes("meta") || parts.includes("cmd"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    name: parts.filter((p) => !["ctrl", "meta", "cmd", "shift", "alt"].includes(p)).join("+") || undefined,
  };
}

function matchKeybind(keybind: ReturnType<typeof parseKeybind>, evt: ParsedKey) {
  if (keybind.ctrl !== Boolean(evt.ctrl)) return false;
  if (keybind.meta !== Boolean(evt.meta)) return false;
  if (keybind.shift !== Boolean(evt.shift)) return false;
  if (keybind.alt !== Boolean(evt.option)) return false;
  if (keybind.name && keybind.name !== evt.name) return false;
  return true;
}

export const { use: useKeybind, provider: KeybindProvider } = createSimpleContext({
  name: "Keybind",
  init: () => ({
    match(key: KeybindKey, evt: ParsedKey) {
      return matchKeybind(parseKeybind(KEYBINDS[key]), evt);
    },
    print(key: KeybindKey) {
      return KEYBINDS[key];
    },
  }),
});
