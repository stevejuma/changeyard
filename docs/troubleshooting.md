# Troubleshooting

This page covers common setup, docs, hub, workspace, and VCS issues.

## pnpm Commands Pass Arguments Incorrectly

Prefer the repository scripts without an extra argument separator:

```sh
pnpm run cy validate CY-0001
pnpm run cy start CY-0001
```

For installed usage, call the binary directly:

```sh
cy validate CY-0001
cy start CY-0001
```

## Hub Shows Stale Instances

List all known records:

```sh
cy hub list
```

Remove dead process records:

```sh
cy hub kill stale
```

If multiple live processes exist, kill the specific instance id or pid that should not be serving clients.

## Dashboard Is Looking At The Wrong Hub

Open `cy hub list` and compare the active and current markers. The active marker is the default instance future launches reuse. The current marker is the process serving the page you are viewing.

If the wrong instance is active, stop or kill it and start the desired endpoint again.

## Workspace Start Or Verify Fails

Run the recovery commands suggested by the CLI first:

```sh
cy audit CY-0001
cy workspace status CY-0001
cy doctor
```

Do not implement product changes in the root checkout after a `cy start` failure. Resolve the gate and verify the workspace before editing.

## VCS App Has No Active Workspace

The VCS app needs an active project/workspace context. Start or verify a workspace from Kanban or the CLI, then reopen VCS from the same hub.

## Docs Build Fails

Regenerate the Starlight content and run the docs build:

```sh
pnpm run docs:build
```

The docs package copies canonical pages from `docs/` into `packages/docs/src/content/docs/` before each build. Do not edit generated content directly.
