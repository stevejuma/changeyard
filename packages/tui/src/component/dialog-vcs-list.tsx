import { DialogSelect } from "../ui/dialog-select";
import { useComposerSettings } from "../context/composer-settings";
import { useDialog } from "../ui/dialog";
import { useToast } from "../ui/toast";
import { onCleanup } from "solid-js";

const ENGINES = [
  { title: "plain-copy", value: "plain-copy", description: "Copy workspace files without git metadata" },
  { title: "git-worktree", value: "git-worktree", description: "Isolated git worktree per change" },
  { title: "jj", value: "jj", description: "Jujutsu-based workspace isolation" },
] as const;

export function DialogVcsList() {
  const settings = useComposerSettings();
  const dialog = useDialog();
  const toast = useToast();
  let confirmed = false;
  const initial = () => settings.project.config?.vcsEngine ?? "plain-copy";

  onCleanup(() => {
    if (!confirmed && settings.project.config) {
      void settings.updateVcs(settings.project.config.vcsEngine, settings.project.config.vcsFallback);
    }
  });

  return (
    <DialogSelect
      title="VCS engine"
      options={ENGINES.map((item) => ({ ...item }))}
      current={initial()}
      onMove={(opt) => {
        void settings.updateVcs(opt.value, opt.value);
      }}
      onSelect={(opt) => {
        confirmed = true;
        void settings
          .updateVcs(opt.value, opt.value)
          .then(() => {
            toast.show({ variant: "success", message: `VCS engine set to ${opt.title}` });
            dialog.clear();
          })
          .catch((error) => {
            toast.error(error);
          });
      }}
    />
  );
}
