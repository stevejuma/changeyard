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

The active runtime is the adapted internal package under `packages/kanban/`:

- `packages/kanban/src/server/index.js`
- `packages/kanban/web-ui/src/*`

The served UI is now a built React/Vite frontend that uses the upstream Kanban style system and an internal Changeyard API client. The runtime contract is still Changeyard-specific rather than the full vendored upstream tRPC/runtime stack.

The current active surface provides:

- board and card reads from Changeyard markdown
- provider and workspace metadata display
- `sync` and `start` actions via Changeyard command functions
- workspace-engine awareness for `plain-copy`, `git-worktree`, and `jj`

## Vendored upstream source

The current upstream Kanban snapshot is stored in:

- `packages/kanban/upstream/cline-kanban/`

This lets the repo preserve the real upstream UI/runtime as reference source while the adapter layer is integrated incrementally. The active frontend now reuses the upstream visual system, but it does not yet boot the vendored upstream `App.tsx` and runtime server unchanged.

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
