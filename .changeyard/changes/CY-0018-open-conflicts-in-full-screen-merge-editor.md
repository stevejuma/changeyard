---
id: CY-0018
title: Open conflicts in full-screen merge editor
type: agent-task
status: synced
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-17T11:09:56.904Z
updatedAt: 2026-06-17T11:10:35.891Z
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
checks:
  profile: standard
  lastRun: null
  lastStatus: null
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
---

# Summary

Add a full-screen conflict editing flow in the VCS UI that opens from the current conflict detail area and hosts the three-pane merge editor with an editable center pane.

# Motivation

The current conflict detail panel is too cramped for practical merge resolution. Conflicts should be resolved in the same kind of focused, full-screen surface used for commit editing, with the merge editor controls available in the expected panes.

# Plan

- [ ] Inspect the current conflict panel, route state, and edit-commit full-screen UI.
- [ ] Add a conflict edit action where the merge panel currently renders.
- [ ] Add a full-screen conflict editor view with editable center content and left/right accept-all controls.
- [ ] Preserve current read-only behavior for historical conflicted commits unless saving is supported by the existing runtime contract.
- [ ] Run targeted VCS and merge checks.

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

Document removed behavior, or leave `None.`
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Find the current route/query state used for selected commit/workspace files and extend it with an edit-conflict mode, mirroring the edit-commit full-screen structure. Update the conflict merge component or wrapper so it can render either as a compact launch panel or as the full merge editor.

## Architecture Decisions

- Prefer route/query driven UI state so reload/back behavior stays consistent with the rest of the VCS app.
- Keep merge semantics inside `@changeyard/merge`; VCS supplies conflict content, labels, readonly/editable flags, and save callbacks.

## Data / State Impact

No persistent schema changes are expected. UI state may add a route/query parameter for the active conflict editor.

## Workspace / Provider Impact

No provider changes are expected. Current workspace conflicts continue to save through the existing conflict resolve endpoint; historical commit conflicts remain read-only.

## Risks

- Full-screen route state could conflict with existing file selection query params; mitigate with focused route tests.
- Editable center content could diverge from merge model state; mitigate with targeted UI and package checks.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [ ] Add conflict editor launch state and full-screen view
- [ ] Wire editor save/readonly behavior and accept-all controls

## 3. Verification

- [ ] Run checks and record results
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

_Not run yet._
<!-- cy:verification:end -->

# Acceptance Criteria
- [ ] Conflicted file detail area launches a full-screen merge editor instead of showing the embedded editor.
- [ ] Full-screen editor matches the edit-commit presentation pattern and can close back to the VCS view.
- [ ] Current workspace conflict center pane is editable and save remains gated by resolved conflict state.
- [ ] Accept-all-left/right controls are available in the left/right pane headers and work.
- [ ] Historical commit conflicts open read-only.
- [ ] Targeted checks are recorded in Completion Notes.

# Agent Plan

1. Inspect existing VCS conflict component, routing, and full-screen edit commit code.
2. Implement launch/full-screen state with minimal route changes.
3. Reuse `ThreePaneMergeEditor` with editable center and accept-all side-header controls.
4. Verify with typecheck/tests and the running VCS fixture.

# Completion Notes

Summarize what changed, what checks ran, and what risks remain.
