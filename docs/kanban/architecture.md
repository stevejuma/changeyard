# Kanban Architecture

Kanban is a browser UI backed by the shared Changeyard hub runtime. It follows the same browser, runtime, and execution split used by upstream Cline Kanban, but the data model is Changeyard-specific.

## Layers

| Layer | Responsibility |
| --- | --- |
| Browser UI | Board, detail views, dashboard links, planning editors, and runtime controls. |
| Runtime API | TRPC routes, project registration, state streaming, workspace summaries, and hub instance management. |
| Changeyard lifecycle | Markdown parsing, planning gates, provider sync, workspace start/verify/complete, and review files. |
| Execution | Workspace engines, terminal sessions, agent sessions, and provider-specific commands. |

## Runtime State

The runtime serves the built Kanban frontend and exposes APIs under the hub process. It tracks live state such as:

- active project and project registry
- board summaries
- workspace status
- terminal/session summaries
- hub instance list and kill operations
- VCS app bridge data

This state is derived or ephemeral. The runtime should be able to rebuild it from `.changeyard` files, workspace metadata, and provider adapters.

## Execution Modes

Kanban can surface different kinds of execution:

- CLI-backed lifecycle commands such as validate, sync, start, verify, and complete.
- Workspace shell or terminal sessions.
- Native Cline SDK task sessions where configured.
- VCS provider operations through the shared VCS bridge.

Provider settings and credentials belong to their provider-specific storage. Do not copy provider secrets into Changeyard docs, `.changeyard` files, or runtime config.

## Design Rules

- Keep `.changeyard` as the canonical task and review database.
- Keep UI writes marker-scoped when editing Markdown planning sections.
- Keep runtime process state in the global hub registry, not per-project pid files.
- Keep provider-specific behavior behind provider adapters.
- Expose unsafe operations, such as killing a hub process or applying a VCS mutation, with clear confirmation and preview behavior.
