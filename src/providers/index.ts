import type { ChangeyardConfig } from "../types.js";
import type { ChangeProvider } from "./ChangeProvider.js";
import { ForgejoProvider } from "./ForgejoProvider.js";
import { GitHubProvider } from "./GitHubProvider.js";
import { GitLabProvider } from "./GitLabProvider.js";
import { LocalFolderProvider } from "./LocalFolderProvider.js";
import { NoopProvider } from "./NoopProvider.js";

export function createProvider(type: string, config?: ChangeyardConfig): ChangeProvider {
  switch (type) {
    case "noop":
      return new NoopProvider();
    case "local-folder":
      return new LocalFolderProvider();
    case "forgejo":
      if (!config) throw new Error("Forgejo provider requires loaded config");
      return new ForgejoProvider(config);
    case "github":
      if (!config) throw new Error("GitHub provider requires loaded config");
      return new GitHubProvider(config);
    case "gitlab":
      if (!config) throw new Error("GitLab provider requires loaded config");
      return new GitLabProvider(config);
    default:
      throw new Error(`Unsupported provider: ${type}`);
  }
}
