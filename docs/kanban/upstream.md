# Kanban Upstream Provenance

Changeyard Kanban is based on Cline Kanban concepts and visual patterns, but it is now implemented as a native Changeyard package.

## Upstream References

- `cline/kanban` docs describe the upstream engineering-docs pattern and architecture overview.
- `cline/cline/docs/kanban` describes the Cline Kanban core workflow and remote-access safety model.

Changeyard adapts those ideas for its own lifecycle:

- `.changeyard` markdown is the task source of truth.
- `cy validate`, `cy sync`, `cy start`, `cy verify`, and `cy complete` are the lifecycle gates.
- workspace engines include `plain-copy`, `git-worktree`, and `jj`.
- the hub is global by default and shared by dashboard, Kanban, VCS, and TUI.
- the VCS app is a first-class surface with provider-neutral operations.

## Local Package

The active implementation lives under `packages/kanban/`.

Older upstream-copy notes are retained at `docs/kanban-upstream.md` for historical context. Current behavior should be read from:

- `packages/kanban/src/server/index.js`
- `packages/kanban/src/runtime-stack/**`
- `packages/kanban/web-ui/src/**`
- `docs/kanban/**`

## Update Rule

When borrowing upstream docs or UX patterns, rewrite them around Changeyard behavior. Do not copy Cline-specific provider, session, or deployment assumptions unless the same behavior exists in this repository.
