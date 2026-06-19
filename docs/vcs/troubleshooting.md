# VCS Troubleshooting

## No Active Workspace

The VCS app depends on the active project/workspace served by the hub. Start or verify a workspace first:

```sh
cy start CY-0001
cd .changeyard/workspaces/CY-0001/repo
cy verify CY-0001
cy --vcs
```

## Preview Is Disabled

The provider rejected the pending operation. Read the preview summary, disabled reason, warnings, and diagnostics. Do not enable Apply in the UI unless the provider preview is valid.

## State Looks Stale After Apply

Refresh provider state after applying an operation. The UI should not mutate local stack state optimistically across provider operations that can rewrite history.

## Remote Branches Are Missing

Changeyard does not fetch during read paths. JJ remote bookmark discovery defaults to local-store mode. Configure `vcs.remoteBookmarks` only when a project needs broader local inventory.

## JJ Command Fails

Check the command and revset reference:

- [JJ Supported Functionality](jj-supported-functionality.md)
- [JJ Backend Queries And Commands](jj-backend-queries.md)

Provider errors should be surfaced as preview diagnostics or apply results rather than hidden in the UI.
