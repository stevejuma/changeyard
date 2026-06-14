# Changeyard Kanban Package

This internal package hosts the local board server and web UI used by `cy --kanban` and `cy --vcs`.

Changeyard remains the single source of truth. The UI reads and mutates existing `.changeyard` markdown and workspace metadata; it does not maintain a second task database.

The active frontend is built from `packages/kanban/web-ui/src/*` and served by `packages/kanban/src/server/index.js`. It uses the upstream Kanban visual system and a Changeyard-specific client/runtime bridge.

`packages/kanban` is the canonical package root for the active server, runtime stack, and web UI.

Upstream provenance is recorded in [docs/kanban-upstream.md](/Users/stevejuma/code/changeyard/docs/kanban-upstream.md). The active package no longer carries a vendored upstream source tree.
