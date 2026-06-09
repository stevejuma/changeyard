import { DialogSelect } from "../ui/dialog-select";
import { useComposerSettings } from "../context/composer-settings";
import { useDialog } from "../ui/dialog";
import { onCleanup } from "solid-js";

export function DialogAgentList() {
  const settings = useComposerSettings();
  const dialog = useDialog();
  let confirmed = false;
  const initial = () => settings.runtime.selectedAgentId;

  const options = () =>
    settings.runtime.agents.map((agent) => ({
      title: agent.label,
      value: agent.id,
      description: agent.installed
        ? agent.configured
          ? agent.command
          : "installed, needs configuration"
        : "not installed",
      disabled: !agent.installed,
    }));

  onCleanup(() => {
    if (!confirmed) void settings.setAgent(initial());
  });

  return (
    <DialogSelect
      title="Agents"
      options={options()}
      current={initial()}
      onMove={(opt) => {
        if (!opt.disabled) void settings.setAgent(opt.value);
      }}
      onSelect={(opt) => {
        if (opt.disabled) return;
        confirmed = true;
        void settings.setAgent(opt.value).then(() => dialog.clear());
      }}
    />
  );
}
