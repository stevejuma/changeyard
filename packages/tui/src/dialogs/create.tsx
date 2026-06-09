import { createSignal, For, Show } from "solid-js";
import { useTheme } from "../context/theme";
import { useDialog } from "../ui/dialog";
import { useKeyboard } from "@opentui/solid";
import { createPresets, buildDefaultCreateTitle, presetIndexFromArg, type CreatePreset } from "../context/app-state";

export function CreateDialog(props: {
  initialPreset?: string;
  onCreate: (presetId?: string, title?: string) => void | Promise<void>;
}) {
  const { theme } = useTheme();
  const dialog = useDialog();
  const [index, setIndex] = createSignal(presetIndexFromArg(props.initialPreset));
  const [title, setTitle] = createSignal(buildDefaultCreateTitle(createPresets[index()] ?? createPresets[0]));

  const activePreset = () => createPresets[index()] ?? createPresets[0];

  function updatePreset(next: number) {
    const clamped = Math.max(0, Math.min(createPresets.length - 1, next));
    setIndex(clamped);
    setTitle(buildDefaultCreateTitle(createPresets[clamped]));
  }

  useKeyboard((evt) => {
    if (evt.name === "down" || evt.name === "j") {
      updatePreset(index() + 1);
      evt.preventDefault();
    }
    if (evt.name === "up" || evt.name === "k") {
      updatePreset(index() - 1);
      evt.preventDefault();
    }
    if (evt.name === "return") {
      void props.onCreate(activePreset().id, title());
      evt.preventDefault();
    }
  });

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexDirection="column">
      <text fg={theme.text}>Create change</text>
      <text fg={theme.textMuted}>j/k select preset, Enter to create</text>
      <For each={createPresets}>
        {(preset, i) => (
          <text fg={i() === index() ? theme.primary : theme.textMuted}>
            {i() === index() ? "▶ " : "  "}
            {preset.label}
          </text>
        )}
      </For>
      <text fg={theme.textMuted}>{activePreset().help}</text>
      <text fg={theme.textMuted}>
        template: {activePreset().template} planning: {activePreset().planning ?? "none"}
        {activePreset().strict ? " strict" : ""}
      </text>
      <text fg={theme.text}>Title</text>
      <input
        focused
        value={title()}
        placeholder="Change title"
        onInput={setTitle}
        focusedBackgroundColor={theme.backgroundElement}
        cursorColor={theme.primary}
      />
      <box flexDirection="row" justifyContent="flex-end">
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc cancel
        </text>
      </box>
    </box>
  );
}
