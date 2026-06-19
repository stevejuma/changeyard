# VCS Provider Model

The VCS app is provider-neutral at the UI boundary. Provider adapters translate neutral operations into JJ, Git, or provider-specific commands.

## Neutral Contract

Shared UI code works with:

- repository stacks
- commits
- paths and hunks
- workspace state
- previews
- apply results
- submit previews and submit results

Shared UI code must not depend on JJ revsets, JJ operation ids, or Git-only command shapes unless those values are returned as provider metadata.

## Provider Responsibilities

Provider adapters own:

- reading repository state
- deriving stack and branch inventory
- building previews
- validating operations
- applying mutations
- reporting conflicts and diagnostics
- implementing submit or publish behavior

JJ currently has the deepest implementation. Git support should implement the shared subset without forcing Git assumptions into the JJ path.

## Preview And Apply Shape

The preview is the safety boundary. It must be loaded from the provider before apply and must still match the pending operation when the user applies it.

Providers should return explicit warnings instead of letting the UI infer risk from provider-specific command strings.

## Remote Discovery

Read paths must not fetch from remotes implicitly. For JJ, remote bookmark discovery is local-store only by default and can be expanded through `vcs.remoteBookmarks` configuration when a project needs it.

## Adding A Provider

When adding provider support:

1. implement read-only state first,
2. add previews for one neutral operation,
3. add apply for that operation,
4. document support in the provider matrix,
5. add tests for both valid and rejected previews.
