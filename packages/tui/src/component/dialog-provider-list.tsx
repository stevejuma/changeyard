import { DialogSelect } from "../ui/dialog-select";
import { useComposerSettings } from "../context/composer-settings";
import { useDialog } from "../ui/dialog";
import { useToast } from "../ui/toast";
import { onCleanup } from "solid-js";

const PROVIDERS = [
  { title: "noop", value: "noop", description: "Local-only, no remote sync" },
  { title: "local-folder", value: "local-folder", description: "Mirror issues in a local folder" },
  { title: "github", value: "github", description: "GitHub issues and pull requests" },
  { title: "gitlab", value: "gitlab", description: "GitLab issues and merge requests" },
  { title: "forgejo", value: "forgejo", description: "Forgejo / Gitea compatible host" },
] as const;

export function DialogProviderList() {
  const settings = useComposerSettings();
  const dialog = useDialog();
  const toast = useToast();
  let confirmed = false;
  const initial = () => settings.project.config?.providerType ?? "noop";

  onCleanup(() => {
    if (!confirmed && settings.project.config) {
      void settings.updateProvider(settings.project.config.providerType);
    }
  });

  return (
    <DialogSelect
      title="Provider"
      options={PROVIDERS.map((item) => ({ ...item }))}
      current={initial()}
      onMove={(opt) => {
        void settings.updateProvider(opt.value);
      }}
      onSelect={(opt) => {
        confirmed = true;
        void settings
          .updateProvider(opt.value)
          .then(() => {
            toast.show({ variant: "success", message: `Provider set to ${opt.title}` });
            dialog.clear();
          })
          .catch((error) => {
            toast.error(error);
          });
      }}
    />
  );
}
