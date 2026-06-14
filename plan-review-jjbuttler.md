# VCS UI Review Repair Plan

Date: 2026-06-12

## Summary

Repair the JJ VCS frontend implementation so it follows the intended Kanban UI direction. The previous implementation broadly matched the backend/runtime plan, but `packages/vcs` created a custom visual shell, custom CSS, and a large monolithic `App.tsx` instead of copying Kanban UI primitives into the VCS package.

This pass keeps `packages/kanban` and `packages/vcs` independent, duplicates the needed Kanban UI foundation locally in `packages/vcs`, and refactors the VCS app into smaller runtime, route, shell, dialog, and view modules.

## Review Findings

- `packages/vcs/src/App.tsx` was a 2,312-line monolith with local runtime types, tRPC helpers, route resolution, dialogs, and all views.
- `packages/vcs/src/styles.css` defined a custom serif, gradient-backed visual language that did not match Kanban.
- `@changeyard/vcs` did not include the Radix/Tailwind dependencies required by Kanban's copied primitives.
- CY-0007 intentionally kept the VCS UI consistent with the custom VCS shell, which conflicts with the desired direction to copy Kanban shell/primitives into VCS.
- The original JJ VCS plan mentioned `vcs.operations` and `vcs.restoreOperation`, but the implementation exposes undo, redo, and file restore through `vcs.previewOperation` and `vcs.applyOperation`.

## Key Changes

- Copy Kanban UI primitives and theme globals into `packages/vcs` as local source, without importing from `packages/kanban`.
- Replace the custom VCS CSS and shell with Kanban-style app chrome: left navigation, top bar, dense panels, copied buttons, dialogs, tooltips, spinners, and status chips.
- Split the VCS frontend into focused modules for runtime types/client hooks, route resolution, shared shell/panels, dialogs, and individual VCS views.
- Keep VCS behavior behind `CHANGEYARD_VCS=1` and keep runtime APIs on the existing tRPC boundary.
- Do not add new `vcs.operations` or `vcs.restoreOperation` endpoints in this pass. Current undo, redo, and file restore behavior is already represented by preview/apply operation kinds, and the history screen documents that runtime shape.

## Acceptance Criteria

- [x] `plan-review-jjbuttler.md` and `tasks-review-jjbuttler.md` exist and describe the review repair.
- [x] `packages/vcs` uses copied Kanban UI primitives and theme globals instead of a custom CSS shell.
- [x] `packages/vcs/src/App.tsx` is only the top-level route composition root.
- [x] VCS views render with Kanban-style shell/navigation and VCS-specific labels/actions.
- [x] `packages/kanban` does not import `packages/vcs`, and `packages/vcs` does not import `packages/kanban` source.
- [x] The operations/restore endpoint deviation is documented.

## Verification

- `pnpm --filter @changeyard/vcs run typecheck`
- `pnpm --filter @changeyard/vcs run test`
- `pnpm --filter @changeyard/vcs run build`
- `pnpm run build`
- Focused runtime/UI server tests for VCS routes and tRPC procedures
- Browser QA with `CHANGEYARD_VCS=1` for `/vcs`, `/vcs/jj`, `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings`
