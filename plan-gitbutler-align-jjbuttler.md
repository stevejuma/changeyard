# GitButler-Style VCS UI Alignment Plan

## Summary

Align `/vcs` with the GitButler-style workflow requested by the product review: a persistent project selector, a left context panel, and a right-side detail canvas for branches, commit graphs, operation history, and diffs. Kanban remains the implementation reference for shell primitives, project selection, lane/detail layouts, and interaction patterns.

## Key Changes

- Copy/adapt Kanban project navigation into `packages/vcs` as local code, including project selection, add/remove project actions, and collapsed rail behavior.
- Scope VCS tRPC calls to the selected workspace so choosing a project drives detect, JJ state, diff, branch inventory, and operation history data.
- Add narrow VCS runtime surfaces for JJ inventory, operation history, and operation detail/diff diagnostics.
- Replace standalone VCS route chrome with Kanban/GitButler-style layout: far-left project rail, secondary context panel, and right detail canvas.
- Rebuild Branches so selecting a branch/bookmark/ref shows commit graph rows and selecting a commit shows changes.
- Rebuild History so selecting an operation shows affected files and a diff or an explicit fallback diagnostic.
- Keep copied UI code local to `packages/vcs`; shared UI extraction remains a later change.

## Acceptance Criteria

- `/vcs` shows a project selector before VCS data is loaded.
- Selecting a project passes workspace context to all VCS runtime calls.
- `/vcs/jj/branches` shows bookmark/ref inventory, selected branch commits, and selected commit details.
- `/vcs/jj/history` shows JJ operation history and selected operation details.
- Empty states distinguish no project, VCS disabled, non-JJ repository, and no branch/history data.
- UI uses Kanban primitives/theme conventions and avoids the previous standalone VCS shell.

## Verification

- `pnpm --filter @changeyard/vcs run typecheck`
- `pnpm --filter @changeyard/vcs run test`
- `pnpm --filter @changeyard/vcs run build`
- Focused runtime tests for VCS tRPC routes and feature flag behavior.
- `pnpm run build`
- `pnpm test`
- Browser QA with `CHANGEYARD_VCS=1` for `/vcs`, `/vcs/jj`, `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings`.

## Assumptions

- The screenshots supplied in the review are the primary visual target; GitButler’s repository and README are reference context.
- PR metadata is optional and should not block branch/ref rendering when forge authentication is unavailable.
- JJ operation diff support may be partial; the UI should still show timeline entries and affected file summaries with diagnostics.
