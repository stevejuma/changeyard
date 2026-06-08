# Changeyard Kanban Package

This internal package hosts the local board server and web UI used by `cy ui`.

Changeyard remains the single source of truth. The UI reads and mutates existing `.changeyard` markdown and workspace metadata; it does not maintain a second task database.

The active frontend is built from `packages/kanban/web-ui/src/*` and served by `packages/kanban/src/server/index.js`. It uses the upstream Kanban visual system and a Changeyard-specific client/runtime bridge.

Vendored upstream Kanban source is stored under `packages/kanban/upstream/cline-kanban/`. That snapshot remains partially inert: the active Changeyard build does not execute upstream telemetry, update, or release scripts, and it does not yet boot the vendored upstream runtime stack unchanged.
