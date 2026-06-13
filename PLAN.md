# Branches And Workspace Redesign Plan

## Operating Rule

This work happens directly on the current branch. Do not use the Changeyard workflow, Changeyard lifecycle commands, or Changeyard workspaces for this redesign.

## Summary

Implement a UI-first redesign of the JJ Branches page and the JJ Board page, now presented as the Workspace page. The first implementation uses existing JJ state, stack derivation, and UI primitives. The broader full workspace model is planned as later milestones.

The implementation must stop at explicit verification checkpoints before continuing to the next milestone.

## Milestone 0: Planning Files First

- Create root `PLAN.md` and `TASKS.md`.
- Make these files the source of truth for this redesign.
- Include the current-branch-only and no-Changeyard-workflow instruction.
- Track every checkpoint in `TASKS.md`.

## Milestone 1: Branches Page Stack Layout

- Keep the current left branch/bookmark list and current workspace target.
- Query or pass `vcs.jjState` so Branches can use `data.stacks`.
- Remove the old commits lane and `workspace.getRepositoryLog` usage from Branches.
- Add a new collapsible stack detail column.
- Resolve selected branch/bookmark rows to the containing stack.
- Render selected stack heads newest-to-oldest and show changes under each head.
- Show a read-only empty state for remote-only refs, tags, and refs outside a derived stack.

### STOP: Verify Branches Stack Layout

- Run focused tests for stack lookup/grouping.
- Start the VCS UI locally.
- Open `/vcs/jj/branches`.
- Verify the branch list still works, the commits lane is gone, selecting a bookmark opens the stack detail column, and the layout matches the intended GitButler-style structure.
- Record notes in `TASKS.md` before continuing.

## Milestone 2: Branches Files And Diff Flow

- Clicking a stack change selects its `commitId`.
- Use `workspace.getRepositoryCommitDiff` for changed files.
- Reuse `VcsInlineFileSection` for changed files.
- Clicking a file opens the existing right-side `VcsFileDiffColumn`.
- Preserve URL params: `ref`, `commit`, `file`.
- Preserve collapse and resize behavior.

### STOP: Verify Branches File/Diff Interaction

- Run focused VCS tests.
- Open `/vcs/jj/branches`.
- Select a stack, select a change, select a file.
- Verify changed files render inline and the diff column opens correctly.
- Record notes in `TASKS.md` before continuing.

## Milestone 3: Workspace Page UI Rename And Layout

- Rename user-facing "JJ Board" navigation/title to "Workspace".
- Keep `/vcs/jj` route behavior.
- Reframe existing `data.stacks` rendering as workspace stack lanes.
- Keep existing preview/apply/submit controls.
- Keep unassigned working-copy changes visible using `data.unassignedChanges`.

### STOP: Verify Workspace Page

- Run route/nav tests.
- Open `/vcs/jj`.
- Verify navigation says "Workspace", stack lanes render correctly, existing operation controls still appear, and unassigned work remains visible.
- Record notes in `TASKS.md` before continuing.

## Milestone 4: Applied Workspace Stack Lanes

- Add durable `vcsAppliedStacks` project config backed by local `vcs.appliedStacks`.
- Wire Branches `Apply to workspace` to persist the selected branch's containing derived stack id.
- Allow applied stacks to be unapplied without mutating JJ repository state.
- Replace the Workspace page with a focused Working Copy column plus only applied stack lanes.
- Persist fold/collapse state as browser-local VCS UI preferences, not project config:
  - project picker
  - Branches columns
  - History columns
  - Workspace Working Copy column
  - Workspace stack columns by stack id
- Remove old Workspace stats, repository, preview/apply/submit, mutation-control, details, and current-diff panels.
- Reuse shared UI primitives for buttons, status, avatars, copy values, file status glyphs, and stack cards.

### STOP: Verify Applied Workspace Stack Lanes

- Run focused config, branch, and Workspace tests.
- Open `/vcs/jj/branches`, apply one stack, then open `/vcs/jj`.
- Verify only the applied stack appears in Workspace.
- Unapply the stack and verify the Workspace empty state returns.
- Verify the Working Copy column renders working-copy changes and its file diffs.
- Verify relevant collapsed columns remain collapsed after reload.
- Record notes in `TASKS.md` before continuing.

## Later Milestones: Full JJ Workspace Model

- Add repository-mutating apply/unapply stack APIs.
- Add internal workspace merge and WIP bookmarks.
- Rebuild workspace merge from base plus applied stack tips.
- Preserve unrelated WIP changes.
- Surface conflicts and invalid workspace state.
- Add richer branch metadata: file counts, line stats, conflicts, local/remote classification, PR title/review/check state.
- Add local vs remote/forge action grouping and disabled states.

## Final Verification

- Run focused JJ/VCS tests.
- Run `npm --workspace @changeyard/vcs run test`.
- Run `npm test`.
- Manually inspect `/vcs/jj/branches` and `/vcs/jj`.
- Update `TASKS.md` with final verification results.
