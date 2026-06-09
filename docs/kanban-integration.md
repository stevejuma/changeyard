# Changeyard Kanban Integration

Changeyard uses Kanban as an embedded UI/runtime surface, not as a second task database.

## Source of truth

Authoritative state stays in Changeyard:

- `.changeyard/changes/*.md`
- `.changeyard/reviews/**/*.md`
- `.changeyard/workspaces/**/metadata.json`
- `.changeyard/cache/provider-state.json`
- `.changeyard/cache/local-folder/**`

The UI may keep ephemeral browser state, but it must not create or rely on `.kanban/**`, `kanban.json`, or any separate task/card database.

## Current active integration

The active runtime is the native Changeyard package under `packages/kanban/`:

- `packages/kanban/src/server/index.js`
- `packages/kanban/web-ui/src/*`

The served UI is a built React/Vite frontend that uses the upstream Kanban visual system together with the active Changeyard runtime stack.

The current active surface provides:

- board and card reads from Changeyard markdown
- planned and unplanned change creation
- planning badges, gate summaries, and strictness display
- inline planning section editing with marker-scoped writes
- planning `validate`, `sync`, and `start` actions through the root Changeyard command path
- stale-write conflict reload behavior for inline planning edits
- provider and workspace metadata display
- runtime state, transport, and project registration under `packages/kanban/src/runtime-stack/**`
- workspace-engine awareness for `plain-copy`, `git-worktree`, and `jj`

## Upstream provenance

The active implementation lives under `packages/kanban/`.

Upstream provenance is documented in `docs/kanban-upstream.md`. The active package no longer keeps a vendored upstream source tree under `packages/kanban/`, so current runtime behavior, package layout, and build wiring must be read from the native package itself.

## Workspace engines

The UI must respect Changeyard workspace metadata and engine behavior:

- `plain-copy`
  Workspace path is a copied checkout under `.changeyard/workspaces/<id>/repo`.
  Diff and terminal support must operate on that path without assuming git worktrees.

- `git-worktree`
  Workspace creation, verification, and publish behavior must continue to flow through `GitWorktreeEngine`.

- `jj`
  Workspace creation, verification, and publish behavior must continue to flow through `JjWorkspaceEngine`, including bookmark-based publish flows.

## Running locally

```bash
npm install
npm run build
npm run cli -- ui --no-open
```

The UI binds to localhost by default and serves board data from the current repository root.
