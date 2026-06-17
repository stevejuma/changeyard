---
id: CY-0018
title: Open conflicts in full-screen merge editor
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-17T11:09:56.904Z
updatedAt: 2026-06-17T11:54:09.329Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0018
  path: .changeyard/workspaces/CY-0018/repo
branch:
  name: cy/CY-0018-open-conflicts-in-full-screen-merge-editor
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-17T11:53:54.478Z
  lastStatus: passed
planning:
  model: openspec-lite
  storage: inline
  schema: changeyard-openspec-lite@1
  strictness: normal
  phase: draft
  gates:
    proposal: pending
    specDeltas: pending
    design: pending
    tasks: pending
    verification: pending
    strictClarifications: skipped
    strictChecklist: skipped
    strictAnalysis: skipped
mergedAt: 2026-06-17T11:54:09.328Z
---

# Summary

Add a full-screen conflict editing flow in the VCS UI that opens from the current conflict detail area and hosts the three-pane merge editor with an editable center pane.

# Motivation

The current conflict detail panel is too cramped for practical merge resolution. Conflicts should be resolved in the same kind of focused, full-screen surface used for commit editing, with the merge editor controls available in the expected panes.

# Plan

- [x] Inspect the current conflict panel, route state, and edit-commit full-screen UI.
- [x] Add a conflict edit action where the merge panel currently renders.
- [x] Add a full-screen conflict editor view with editable center content and left/right accept-all controls.
- [x] Preserve current read-only behavior for historical conflicted commits unless saving is supported by the existing runtime contract.
- [x] Run targeted VCS and merge checks.

<!-- cy:proposal:start -->
# Proposal

## Intent

Make conflict resolution feel like a primary editing workflow instead of an embedded preview by opening conflicts in a full-screen merge editor.

## Scope

### In Scope

- [ ] VCS UI routing/state for opening and closing a full-screen conflict editor.
- [ ] Conflict detail panel entry button in place of the current embedded merge panel.
- [ ] Three-pane merge editor integration with editable center pane for current workspace conflicts.
- [ ] Accept-all-left and accept-all-right controls visible in the side pane headers.
- [ ] Save/readonly behavior aligned with the existing conflict-file runtime contract.

### Out of Scope

- [ ] Backend provider contract changes beyond what is already present.
- [ ] Automatic rewrite flow for historical conflicted commits.
- [ ] Merge package public API changes unless required to fix integration.

## Approach

Reuse the VCS full-screen edit pattern where possible. Keep conflict-file loading and saving through the existing RTK Query/runtime endpoints, and pass editor configuration into `ThreePaneMergeEditor` rather than duplicating merge behavior in VCS.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- When the selected file is conflicted, the detail area shows an edit-conflicts action instead of embedding the merge editor inline.
- Activating the action opens a full-screen conflict editor with left, center, and right panes.
- The center pane is editable when the selected conflict belongs to the current workspace and saving is supported.
- Accept-all-left and accept-all-right controls are available in the left and right pane headers.

## MODIFIED Requirements

- Historical conflicted commits remain view-only in the full-screen merge editor unless an existing save path supports them.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Find the current route/query state used for selected commit/workspace files and add a local edit-conflict mode that mirrors the edit-commit full-screen structure. Update the conflict merge component wrapper so the diff column renders a compact launch panel and the full-screen overlay renders the merge editor.

## Architecture Decisions

- Prefer local focused-mode state to match the existing edit-commit overlay and avoid adding URL state for a temporary editor surface.
- Keep merge semantics inside `@changeyard/merge`; VCS supplies conflict content, labels, readonly/editable flags, and save callbacks.

## Data / State Impact

No persistent schema changes. The active conflict editor is transient React state.

## Workspace / Provider Impact

No provider changes are expected. Current workspace conflicts continue to save through the existing conflict resolve endpoint; historical commit conflicts remain read-only.

## Risks

- Full-screen editor state could get stale after conflict resolution; mitigate by closing it after a successful workspace save.
- Editable center content could diverge from merge model state; mitigate with targeted UI and package checks.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Add conflict editor launch state and full-screen view
- [x] Wire editor save/readonly behavior and accept-all controls

## 3. Verification

- [x] Run checks and record results
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm --filter @changeyard/vcs run typecheck`
- `pnpm --filter @changeyard/vcs run test`
- Targeted browser verification on the JJ conflict fixture

## Manual Scenarios

- Open a current workspace conflict and confirm the detail panel shows an edit-conflicts button.
- Open the full-screen conflict editor and confirm the center pane is editable.
- Use accept-all-left and accept-all-right controls from the side headers.
- Open a conflicted historical commit and confirm the editor is read-only.

## Result

- Passed: `pnpm --filter @changeyard/vcs run typecheck`
- Passed: `pnpm --filter @changeyard/vcs run test`
- Passed: `pnpm --filter @changeyard/merge run test`
- Passed: `pnpm --filter @changeyard/merge run typecheck`
- Passed: browser verification on the JJ commit conflict route at `http://127.0.0.1:4174/vcs/jj?workspaceId=repo-t9d5&commit=wwsplsmprqqn`; the detail column shows the launcher and the full-screen merge editor opens read-only.
- Passed: browser verification on the JJ workspace conflict route at `http://127.0.0.1:4174/vcs/jj?workspaceId=repo-t9d5&workspacePath=...CY-CONFLICT...&workingCopyFile=src%2Fconflict.rs`; the full-screen editor has left/right accept-all controls, an editable base textarea, and a save button.
- Passed: browser verification that selecting left replaces the center block, deleting that selected side restores the original center block, and then selecting both left and right stacks both side contents.
- Passed: browser verification that the Radix merge editor options menu opens above the full-screen editor, shows `Ignore whitespace` and synchronized horizontal scroll enabled by default, and updates the same state shown in Settings.
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] Conflicted file detail area launches a full-screen merge editor instead of showing the embedded editor.
- [x] Full-screen editor matches the edit-commit presentation pattern and can close back to the VCS view.
- [x] Current workspace conflict center pane is editable and save remains gated by resolved conflict state.
- [x] Accept-all-left/right controls are available in the left/right pane headers and work.
- [x] Historical commit conflicts open read-only.
- [x] Targeted checks are recorded in Completion Notes.

# Agent Plan

1. Inspect existing VCS conflict component, routing, and full-screen edit commit code.
2. Implement launch/full-screen state with minimal route changes.
3. Reuse `ThreePaneMergeEditor` with editable center and accept-all side-header controls.
4. Verify with typecheck/tests and the running VCS fixture.

# Completion Notes

- Added `VcsConflictMergeLauncher` for compact conflict cards in the diff/detail column.
- Added a full-screen conflict editor overlay in the JJ workspace view, reusing `VcsConflictMergeEditor`.
- Current workspace conflicts open with an editable center pane, visible Save action, and left/right accept-all controls from `@changeyard/merge`.
- Commit conflicts open in the same full-screen view read-only with the existing checkout/edit guidance.
- Fixed render-driven side selection so a single left/right selection replaces center content, deleting that selection restores the original center content, and selecting both sides stacks left then right.
- Restored the left-pane gutter/code border and increased gutter/action spacing.
- Added a Radix-backed merge editor options menu with whitespace/case, synchronized horizontal scroll, gutter action visibility, line diff algorithm, and reset-to-original controls.
- Added persisted VCS merge editor preferences with defaults of `ignoreWhitespace: true` and `syncHorizontalScroll: true`.
- Added a Settings > Merge Editor category using Radix switches/selects and the same global preference state as the editor menu.
- Checks passed: `pnpm --filter @changeyard/merge run test`, `pnpm --filter @changeyard/merge run typecheck`, `pnpm --filter @changeyard/vcs run typecheck`, `pnpm --filter @changeyard/vcs run test`, and targeted browser verification on commit/workspace conflict fixture routes plus merge option popup/settings flows.
