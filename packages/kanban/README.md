# Changeyard Kanban Package

This internal package hosts the local board server and web UI used by `cy ui`.

Changeyard remains the single source of truth. The UI reads and mutates existing `.changeyard` markdown and workspace metadata; it does not maintain a second task database.

Vendored upstream Kanban source is stored under `packages/kanban/upstream/cline-kanban/`. That snapshot is intentionally inert: the active Changeyard build does not execute upstream telemetry, update, or release scripts while the adapter layer is still being integrated.
