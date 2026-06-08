# Kanban Upstream Snapshot

This repository vendors source from `https://github.com/cline/kanban` for the Changeyard UI integration.

## Pinned upstream revision

- Repository: `https://github.com/cline/kanban`
- Commit: `cb1bf3daea81e9000e929594bf28f1c1d50d88e5`
- Version at snapshot: `0.1.68`
- License: Apache-2.0

## Vendored paths

- Vendored snapshot root: `packages/kanban/upstream/cline-kanban/`
- Copied license: `packages/kanban/LICENSE.kanban`

The vendored snapshot is preserved as reference source for integration work. The active Changeyard runtime remains the adapted package under `packages/kanban/src/` and `packages/kanban/web-ui/` until the remaining adapter work is complete.

## Update procedure

1. Refresh the temp upstream checkout at the desired commit.
2. Replace `packages/kanban/upstream/cline-kanban/` with the new snapshot, excluding `.git`, `node_modules`, and build output.
3. Update the commit and version recorded in this file.
4. Reconcile any upstream file moves or new runtime/web dependencies before changing the active adapter.
5. Re-run `npm run check`, `npm test`, and `npm run pack:check`.

## Notes

- Upstream currently does not ship a `NOTICE` file.
- The active Changeyard build intentionally does not execute vendored upstream telemetry, update, or release scripts.
