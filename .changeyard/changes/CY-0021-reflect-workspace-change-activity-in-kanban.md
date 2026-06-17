---
id: CY-0021
title: Reflect workspace change activity in Kanban
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-17T17:25:04.820Z
updatedAt: 2026-06-17T17:47:00.580Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0021
  path: .changeyard/workspaces/CY-0021/repo
branch:
  name: cy/CY-0021-reflect-workspace-change-activity-in-kanban
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-17T17:45:25.127Z
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
mergedAt: 2026-06-17T17:47:00.578Z
---

# Summary

Make the Kanban board refresh canonical change status and lazy file-change summaries when agent work updates a started Changeyard workspace.

# Motivation

Agents work inside isolated workspaces, but the Kanban UI currently does not reliably reflect status edits or file changes made there. Users need the board columns and change-card file summaries to follow active workspace activity without manual reloads.

# Plan

- [x] Surface runtime VCS project events to the Kanban app.
- [x] Use workspace path matching to refresh affected Changeyard change data.
- [x] Make change-card file summary caches invalidate when the affected workspace changes.
- [x] Add focused tests for stream handling, refresh orchestration, and lazy card cache invalidation.

<!-- cy:proposal:start -->
# Proposal

## Intent

Reflect agent-driven workspace status and file changes on the Kanban board.

## Scope

### In Scope

- [ ] Runtime stream event handling in the Kanban web UI.
- [ ] Changeyard change list/detail refresh after relevant change markdown updates.
- [ ] Workspace-version-driven invalidation for selected or expanded change-card file summaries.
- [ ] Targeted unit/component tests.

### Out of Scope

- [ ] Backend tRPC API redesign.
- [ ] Polling all change workspaces.
- [ ] Eagerly loading diffs for collapsed change cards.
- [ ] Broad Kanban visual redesign.

## Approach

Consume the existing `vcs_project_event` stream message in the Kanban runtime hook, let the app derive affected change ids from known workspace paths, and pass per-change workspace event versions into the change board. Change cards will include that version in their lazy cache key and refresh currently loaded sections when it changes.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- The Kanban app SHALL react to active-workspace `vcs_project_event` messages.
- If a runtime event changes a root or workspace `.changeyard/changes/*.md` file, the app SHALL refetch canonical Changeyard changes.
- If a runtime event changes files under a started change workspace, the affected change card SHALL invalidate lazy board summary/file caches.
- Collapsed and unselected cards SHALL remain lazy and avoid eager file summary/diff loading.

## MODIFIED Requirements

- Change-card board summary/file cache identity SHALL include a live workspace event version in addition to existing change metadata.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Extend `useRuntimeStateStream` to expose the latest active-workspace VCS project event. In `App`, map event paths to known `changeyardChanges` workspace paths and update a per-change version map, refetching change list/detail when change markdown paths are affected. Pass that map to `ChangeBoard`; each change card receives its version and uses it in cache keys plus a small effect to reload already selected/expanded data.

## Architecture Decisions

- Reuse existing backend watcher events instead of adding a new polling mechanism.
- Keep backend API contracts unchanged unless type exports require frontend exposure.
- Scope invalidation to known change workspace paths so unrelated project file events do not churn the whole board.

## Data / State Impact

Frontend-only transient state: `latestVcsProjectEvent` in the runtime stream hook and a per-change event version map in `App`. No persisted schema changes.

## Workspace / Provider Impact

Improves JJ/Git workspace visibility through existing watcher events. Provider sync behavior is unchanged.

## Risks

- Missed path matching for relative workspace paths; mitigate with normalized path matching tests.
- Excess refreshes for broad events; mitigate by only refetching changes for `.changeyard/changes/*.md` paths and only invalidating matched workspaces.
- Stale expanded file diffs after invalidation; mitigate by clearing selected file diff when the selected change workspace version changes.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Expose active-workspace VCS project events from `useRuntimeStateStream`.
- [x] Add Kanban app refresh orchestration for change markdown and workspace file events.
- [x] Add workspace-version cache invalidation to `ChangeBoard`.

## 3. Verification

- [x] Add and run targeted tests.
- [x] Run Kanban web typecheck.
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm --dir packages/kanban/web-ui run test -- src/runtime/use-runtime-state-stream.test.tsx src/components/changeyard/change-board.test.tsx src/utils/changeyard-workspace-events.test.ts`
- `pnpm --filter @changeyard/kanban run web:typecheck`

## Manual Scenarios

- Start a change workspace, edit its change markdown status, and confirm the Kanban card moves columns.
- Edit a file inside a started change workspace and confirm an expanded change card refreshes its file count/list without a browser reload.

## Result

- Passed: `pnpm --dir packages/kanban/web-ui run test -- src/runtime/use-runtime-state-stream.test.tsx src/components/changeyard/change-board.test.tsx src/utils/changeyard-workspace-events.test.ts` (Vitest ran the package suite: 90 files, 552 tests).
- Passed: `pnpm --filter @changeyard/kanban run web:typecheck`.
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] Workspace `.changeyard/changes/*.md` edits trigger Changeyard change list refresh in the Kanban UI.
- [x] Workspace file edits invalidate only affected change-card lazy summaries/files.
- [x] Expanded selected change cards refresh visible file summary/list after relevant workspace events.
- [x] Tests cover stream event handling, refresh orchestration, and cache invalidation.
- [x] Targeted tests and typecheck pass or blockers are documented.

# Agent Plan

Follow the Changeyard gates, then implement inside the verified workspace only. First expose `vcs_project_event` from the runtime stream hook and test it. Next add app-level path matching and per-change version state. Finally wire the version into `ChangeBoard`, update tests for lazy refresh behavior, and run targeted checks.

# Completion Notes

Implemented workspace-aware Kanban refresh in the verified CY-0021 workspace. The runtime stream hook now exposes active `vcs_project_event` messages, project navigation forwards them to `App`, and Kanban derives affected change ids from normalized workspace paths. Change markdown events refetch canonical change data, while ordinary workspace file events bump per-change versions so selected/expanded change cards invalidate lazy summary/file caches without eager loading collapsed cards.

Added focused tests for stream event handling, workspace path matching, and selected change-card cache refresh. Verification passed with the web UI test command and Kanban web typecheck. Remaining risk is limited to watcher path coverage for unusual workspace layouts; the path helper covers root-relative and absolute workspace metadata paths.
