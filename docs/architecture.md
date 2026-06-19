# System Architecture

Changeyard has five layers: canonical markdown state, CLI lifecycle commands, the shared hub runtime, UI surfaces, and workspace/provider execution.

## Mental Model

```text
Repository docs and .changeyard state
        |
        v
CLI lifecycle commands and planning gates
        |
        v
Global hub runtime at 127.0.0.1:3484 by default
        |
        +--> Dashboard
        +--> Kanban
        +--> VCS
        +--> TUI and desktop launchers
        |
        v
Workspace engines, providers, agent sessions, and VCS backends
```

The browser is a control surface. The runtime owns live process state, streaming state, project registration, workspace summaries, and API requests. The repository remains the source of truth for planned changes, reviews, and workspace metadata.

## State Ownership

| Area | Owner | Notes |
| --- | --- | --- |
| Planned changes | `.changeyard/changes/*.md` | CLI and Kanban edit marker-scoped sections. |
| Reviews | `.changeyard/reviews/**/*.md` | Review gates stay file-backed and auditable. |
| Workspaces | `.changeyard/workspaces/**/metadata.json` | Workspace engines own creation, verification, and completion behavior. |
| Provider cache | `.changeyard/cache/provider-state.json` | Mirrors external provider state without becoming authoritative. |
| Hub registry | app-global `CHANGEYARD_HOME` state | Tracks live and stale hub processes across projects. |
| Browser UI state | browser memory and runtime snapshots | Ephemeral and derived from runtime APIs. |
| Provider secrets | provider-specific stores | Do not place provider secrets in project docs or runtime config. |

## Runtime Boundaries

- The CLI validates planning gates and creates verified workspaces before implementation work begins.
- The hub is global by default and serves dashboard, Kanban, VCS, and TUI clients.
- Kanban renders `.changeyard` lifecycle state and can invoke lifecycle actions through the runtime API.
- VCS expresses mutations as neutral operations and delegates provider-specific commands to the backend.
- Workspace engines isolate implementation work from the project root.

## Change Guidance

- Start with docs in this directory when behavior affects user-facing workflow.
- Keep UI code provider-neutral unless it is explicitly inside a provider adapter or provider-specific view.
- Do not add a second task database under `.kanban` or `kanban.json`.
- Do not bypass `cy validate`, `cy sync`, `cy start`, or `cy verify` gates for non-trivial changes.
- Treat remote hub exposure as a security decision, because the runtime can inspect repositories and start local processes.
