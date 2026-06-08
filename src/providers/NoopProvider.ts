import type { ChangeProvider, ProviderCapabilities, RemoteIssue, SyncIssueInput } from "./ChangeProvider.js";
import { noProviderCapabilities } from "./ChangeProvider.js";

export class NoopProvider implements ChangeProvider {
  name = "noop";

  capabilities(): ProviderCapabilities {
    return noProviderCapabilities;
  }

  syncIssue(_input: SyncIssueInput): RemoteIssue {
    return {
      provider: this.name,
      issueNumber: null,
      issueUrl: null,
    };
  }
}
