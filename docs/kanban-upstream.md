# Kanban Upstream Provenance

This document records the upstream provenance for the ChangeYard kanban package. It is not an instruction to treat the vendored snapshot as an active second package.

## Pinned upstream revision

- Repository: `https://github.com/cline/kanban`
- Commit: `cb1bf3daea81e9000e929594bf28f1c1d50d88e5`
- Version at snapshot: `0.1.68`
- License: Apache-2.0

## Current provenance material

- Copied license: `packages/kanban/LICENSE.kanban`
- This provenance note: `docs/kanban-upstream.md`

The active ChangeYard package lives under:

- `packages/kanban/src/`
- `packages/kanban/web-ui/`

The earlier vendored upstream source tree has been removed. This repo now keeps provenance as documentation plus the copied upstream license rather than a second live source tree.

## Update procedure

1. Refresh a temporary upstream checkout at the desired commit outside the active package tree.
2. Copy only the specific files, behavior, or structure that the native `packages/kanban` package still needs.
3. Update the commit and version recorded in this file.
4. Reconcile any upstream file moves or new runtime/web dependencies before landing the native package changes.
5. Re-run `pnpm run check`, `pnpm test`, and `pnpm run pack:check`.

## Notes

- Upstream currently does not ship a `NOTICE` file.
- The active Changeyard build intentionally does not execute upstream telemetry, update, or release scripts.
- The target state is now in place: provenance note plus copied license, not a permanent second source tree under `packages/kanban/`.
