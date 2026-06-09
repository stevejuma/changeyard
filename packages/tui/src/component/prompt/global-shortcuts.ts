import type { KeyEvent } from "@opentui/core";
import { useCommandDialog } from "../dialog-command";
import { useKeybind } from "../../context/keybind";
import { useAppState } from "../../context/app-state";
import { useDialog } from "../../ui/dialog";
import { useRoute } from "../../context/route";

/**
 * Handles app-wide shortcuts while the composer textarea is focused.
 * Focused inputs receive keys on an internal channel, so renderer-level
 * useKeyboard handlers never see them unless we forward here.
 */
export function usePromptGlobalShortcuts() {
  const keybind = useKeybind();
  const command = useCommandDialog();
  const dialog = useDialog();
  const state = useAppState();
  const route = useRoute();

  return (evt: KeyEvent, autocompleteVisible: boolean): boolean => {
    if (dialog.stack.length > 0) return false;

    if (keybind.match("command_list", evt)) {
      evt.preventDefault();
      command.show();
      return true;
    }

    if (keybind.match("sidebar_toggle", evt)) {
      evt.preventDefault();
      state.toggleSidebar();
      return true;
    }

    if (!autocompleteVisible && evt.name === "escape") {
      evt.preventDefault();
      if (route.data.type === "workspace") {
        route.home();
        return true;
      }
      return true;
    }

    return false;
  };
}
