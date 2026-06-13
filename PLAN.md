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

## Milestone 5: Event-Driven VCS Cache And Watcher Abstraction

- Add a backend `VcsProjectWatcher` abstraction so Chokidar can be swapped for Watchman later.
- Implement `ChokidarVcsProjectWatcher` as the first backend.
- Watch targeted JJ metadata and normal project files while ignoring `.git`, most of `.jj`, `node_modules`, and build/cache output.
- Emit semantic project events over the runtime WebSocket stream:
  - `project://<projectId>/worktree_changes`
  - `project://<projectId>/vcs/activity`
  - `project://<projectId>/vcs/head`
  - `project://<projectId>/vcs/fetch`
- Start watchers only while runtime WebSocket clients are active for the project and stop them when the last client disconnects or the project is removed.
- Add a contained RTK Query spike behind a VCS data service layer:
  - `getJjState`
  - `getJjInventory`
  - `getJjDiff`
  - `getRepositoryCommitDiff`
- Keep event subscriptions in the service layer through active cache entries; components continue reading query results.
- Audit JJ read commands so metadata/history/branch/stack/base reads avoid working-copy snapshots where supported.
- Leave working-copy diff/status reads snapshot-capable and explicit.

### STOP: Verify Event-Driven VCS Cache

- Run watcher tests.
- Run focused JJ/VCS tests.
- Run `npm --workspace @changeyard/vcs run test`.
- Run VCS and runtime typechecks.
- Start the VCS UI.
- Open `/vcs/jj/branches` and `/vcs/jj`.
- Edit a normal project file externally and verify Working Copy updates without manual refresh.
- Move or create a JJ commit externally and verify Branches/Workspace refresh through VCS activity/head events.
- Verify repeated navigation does not create duplicate visible active requests.
- Record notes in `TASKS.md` before continuing.

## Milestone 6: Deterministic VCS E2E Harness And RTK Adoption

- Treat the RTK Query spike as successful and close it as the chosen VCS server-state direction.
- Add a deterministic JJ fixture generator that can create a real JJ/Git repository from scratch at any path.
- The fixture must include:
  - configured target/base `origin/main`
  - independent active stacks
  - dependent multi-head stacks
  - a remote-only branch
  - a file-backed Git remote for push/fetch behavior
  - an optional dirty working-copy change
- Wire fixture generation into package scripts so it can be run with npm or pnpm:
  - `npm run vcs:fixture -- <path> --force`
  - `pnpm vcs:fixture -- <path> --force`
- Add VCS package Playwright E2E coverage against the generated fixture.
- Cover the current critical routes before continuing migration:
  - Branches stack derivation and remote-only rows
  - Workspace apply-to-workspace, changed-files, and diff flow
  - History operation log and commit graph rendering
- Add `packages/vcs/AGENTS.md` documenting:
  - RTK Query as the VCS data boundary
  - service-owned event subscriptions and tag invalidation
  - shared UI primitives that agents must reuse
  - column/stack/file interaction patterns
- Complete the remaining VCS read and mutation migration to RTK Query.
- Keep any direct TRPC fetch/post helpers contained inside the RTK service layer.
- Each migration step must add or update E2E coverage and pass the VCS E2E suite before moving on.

### STOP: Verify VCS E2E Harness And RTK Adoption

- Run fixture generation with a temp path.
- Run `npm --workspace @changeyard/vcs run test`.
- Run `npm --workspace @changeyard/vcs run typecheck`.
- Run `npm --workspace @changeyard/vcs run e2e`.
- Open the generated fixture manually with `npm run vcs:fixture -- <path> --force` when visual verification is needed.
- Record notes in `TASKS.md` after verification.

## Milestone 7: VCS SPA Routing

- Add a lightweight internal router for the VCS app instead of adding `react-router-dom`.
- Track browser `pathname`, `search`, and `hash` in React state.
- Navigate Workspace, Branches, History, and Overview through `pushState`/`popstate` so the Redux provider and RTK Query cache remain mounted.
- Open Settings as a dialog over the current page without changing the URL or unmounting the active route.
- Preserve `workspaceId` across top-level VCS navigation.
- Keep route selection URL params such as `ref`, `commit`, `file`, `operation`, and `workingCopyFile` working through router-backed query updates.
- Keep direct browser loads of `/vcs`, `/vcs/jj`, `/vcs/jj/branches`, `/vcs/jj/history`, and legacy `/vcs/settings` supported.

### STOP: Verify VCS SPA Routing

- Run VCS unit tests.
- Run VCS typecheck.
- Run fixture-backed VCS E2E.
- Verify Workspace -> Branches -> History navigation does not reload the browser document.
- Verify opening Settings does not change the current route URL.
- Verify browser back/forward updates the displayed VCS route.
- Record notes in `TASKS.md` after verification.

## Final Verification

- Run focused JJ/VCS tests.
- Run `npm --workspace @changeyard/vcs run test`.
- Run `npm --workspace @changeyard/vcs run e2e`.
- Run `npm test`.
- Manually inspect `/vcs/jj/branches` and `/vcs/jj`.
- Update `TASKS.md` with final verification results.
