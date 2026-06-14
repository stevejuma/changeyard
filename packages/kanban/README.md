# Changeyard Kanban Package

This internal package hosts the shared local hub runtime and web UI used by `cy --dashboard`, `cy --kanban`, `cy --vcs`, and `cy --tui`.

Changeyard remains the single source of truth. The UI reads and mutates existing `.changeyard` markdown and workspace metadata; it does not maintain a second task database.

The active frontend is built from `packages/kanban/web-ui/src/*` and served by `packages/kanban/src/server/index.js`. It uses the upstream Kanban visual system and a Changeyard-specific client/runtime bridge.

Use `pnpm run ui:dev` from the repository root for dashboard/Kanban HMR and `pnpm run ui:vcs:dev` for VCS HMR. Both scripts restart the runtime wrapper when backend source changes. Managed hub pid/state/log files live in global Changeyard app state, overridable with `CHANGEYARD_HOME`, instead of under the project `.changeyard` directory.

`packages/kanban` is the canonical package root for the active server, runtime stack, and web UI.

Upstream provenance is recorded in [docs/kanban-upstream.md](/Users/stevejuma/code/changeyard/docs/kanban-upstream.md). The active package no longer carries a vendored upstream source tree.
