# Kanban Overview

Changeyard uses Kanban as an embedded UI/runtime surface, not as a second task database. The board renders Changeyard files and runtime summaries from the current project.

## Source Of Truth

Authoritative state stays in the repository:

- `.changeyard/changes/*.md`
- `.changeyard/reviews/**/*.md`
- `.changeyard/workspaces/**/metadata.json`
- `.changeyard/cache/provider-state.json`
- `.changeyard/cache/local-folder/**`

The UI may keep ephemeral browser state, but it must not create or depend on `.kanban/**`, `kanban.json`, or another parallel task/card store.

## What Kanban Provides

- Board and card reads from Changeyard markdown.
- Planned and unplanned change creation.
- Planning badges, gate summaries, and strictness display.
- Marker-scoped planning section edits.
- Validate, sync, and start actions through the root Changeyard command path.
- Workspace, provider, and project metadata display.
- Runtime state and project registration through the shared hub.
- Workspace-engine awareness for `plain-copy`, `git-worktree`, and `jj`.

## How To Open It

```sh
cy --kanban
```

If no hub is running, Changeyard starts the default hub. If a default hub is already active, Kanban reuses it.

## Read Next

- [Kanban Core Workflow](core-workflow.md)
- [Kanban Architecture](architecture.md)
- [Hub](../hub.md)
