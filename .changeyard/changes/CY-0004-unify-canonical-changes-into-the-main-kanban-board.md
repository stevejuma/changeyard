---
id: CY-0004
title: Unify canonical changes into the main kanban board
type: agent-task
status: in_progress
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-11T10:56:05.699Z
updatedAt: 2026-06-11T21:05:39.464Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0004
  path: .changeyard/workspaces/CY-0004/repo
branch:
  name: cy/CY-0004-unify-canonical-changes-into-the-main-kanban-board
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

Unify canonical Changeyard changes into the main kanban board so the UI uses one board surface with a top-level `All / Changes / Planned` filter, instead of rendering canonical changes in a separate section.

# Motivation

The current follow-up should remove the split mental model between the legacy board and canonical changes. A single board surface will make the UI easier to scan, reduce duplicated navigation, and enable lifecycle drag/drop interactions on canonical changes without forcing users to think in terms of separate board regions.

# Plan

- [x] Replace the separate canonical change section with a unified board surface that can show all cards or filtered canonical subsets.
- [x] Add a top toggle for `All`, `Changes`, and `Planned` views without introducing a second source of truth.
- [x] Define drag/drop behavior for canonical changes so drops run lifecycle transitions and invalid transitions roll back cleanly with user-facing errors.
- [x] Update tests and manual verification around filtering, dragging, and mixed board rendering.

<!-- cy:proposal:start -->
# Proposal

## Intent

Use one kanban board as the primary surface for both existing board cards and canonical changes, while preserving Changeyard lifecycle rules for canonical transitions.

## Scope

### In Scope

- [ ] Unify the main board composition in the web UI
- [ ] Add `All / Changes / Planned` filtering controls
- [ ] Support lifecycle-aware drag/drop for canonical changes
- [ ] Remove the separate canonical board section introduced in CY-0003

### Out of Scope

- [ ] Reworking the full task/card domain model beyond what is required to share the board surface
- [ ] Changing Changeyard lifecycle states or provider sync semantics
- [ ] TUI changes

## Approach

Adapt the main board renderer so it can compose canonical changes and existing task cards in a single surface. Canonical change drags should call lifecycle mutations rather than directly editing status, and the board filter should control which canonical subsets are shown.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- A unified board mode must support `All`, `Changes`, and `Planned` filtering.
- Canonical changes must be draggable across lifecycle columns through supported transitions.

## MODIFIED Requirements

- The web UI no longer presents canonical changes as a separate stacked board section.

## REMOVED Requirements

Document removed behavior, or leave `None.`
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Refactor the board composition layer to support a shared board model or compatible adapter between task cards and canonical changes. Add filter state in the main UI and map canonical drag/drop operations to existing change lifecycle mutations.

## Architecture Decisions

- Preserve Changeyard lifecycle gates during drag/drop rather than mutating status directly.
- Prefer a shared board surface over parallel board sections.

## Data / State Impact

Likely requires a richer board view model in the web UI, but should avoid changing canonical markdown storage unless needed for drag feedback.

## Workspace / Provider Impact

No provider protocol change expected. Workspace behavior should continue to follow existing `start`, `verify`, and review actions.

## Risks

- Mixing legacy tasks and canonical changes into one board may increase adapter complexity.
- Drag/drop needs clear rollback behavior when a lifecycle transition fails.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm unified board composition and drag semantics

## 2. Implementation

- [x] Replace the separate canonical board with a unified filtered board
- [x] Add lifecycle drag/drop for canonical changes

## 3. Verification

- [x] Run focused UI and runtime checks and record drag/filter scenarios
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm run check:node`
- Focused web UI tests for unified board behavior
- `pnpm test`

## Manual Scenarios

- Switch between `All`, `Changes`, and `Planned`
- Drag canonical changes through valid lifecycle columns
- Attempt invalid drag transitions and confirm rollback/error behavior
- Open canonical change detail from the unified board

## Result

Automated checks passed:

- `pnpm run check:node`
- `pnpm test`
- `pnpm --dir packages/kanban/web-ui run test -- src/components/changeyard/change-board.test.tsx`

Covered scenarios:

- `All` renders legacy task cards alongside canonical changes in one board surface
- `Planned` filter isolates planned canonical changes
- Canonical change drag events route through lifecycle-aware mutations

Manual browser pass against `cy ui` on `http://127.0.0.1:4311/repo-kgd6`:

- Confirmed `All`, `Changes`, and `Planned` filtering behavior using disposable workspace-local quick/planned fixtures
- Confirmed clicking a canonical change opens the detail modal with preview/edit controls
- Attempted live drag/drop validation in Playwright, but the DnD interaction did not fire in automation, so browser-level drag verification remains inconclusive even though the mutation path and component tests pass
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] The main board surface supports `All`, `Changes`, and `Planned` without a separate canonical board section.
- [ ] Canonical changes can be dragged across supported lifecycle columns and invalid drops do not leave stale UI state.
- [x] Planned changes can be isolated via the `Planned` filter and quick/non-planned changes via the `Changes` filter.
- [x] Mixed board rendering remains usable with existing task cards and canonical changes on the same surface.

# Scope Boundaries

## In scope

- `packages/kanban/web-ui` board composition, filtering, and drag/drop handling
- Runtime/web API glue needed to support lifecycle drag interactions for canonical changes
- Focused tests for unified board behavior

## Out of scope

- Separate provider workflow changes, TUI behavior, and unrelated CLI install/update work

## New task triggers

- Create a new Changeyard change if this expands into TUI redesign, provider sync protocol changes, or non-board workflow refactors.

# Agent Plan

1. Normalize the board composition requirements against the current task and canonical change models.
2. Refactor the main board surface to support `All / Changes / Planned` filtering.
3. Add lifecycle-aware drag/drop for canonical changes with rollback on failure.
4. Remove the separate canonical section and verify the unified interaction flow.

# Completion Notes

Implemented the unified main board surface in the web UI. Canonical changes now render in the main board area with a top-level `All / Changes / Planned` filter, and `All` includes existing task cards so the board remains mixed instead of split into stacked sections.

Added a new `changes.updateStatus` runtime path for allowed direct lifecycle transitions used by drag/drop, and extended transition validation to allow blocked changes to resume to `in_progress`. Dragged canonical changes now resolve through lifecycle actions or direct validated status updates, and invalid drops surface an error without leaving stale local board state.

Verification completed with:

- `pnpm run check:node`
- `pnpm test`
- `pnpm --dir packages/kanban/web-ui run test -- src/components/changeyard/change-board.test.tsx`

Manual browser verification covered the `All / Changes / Planned` filter behavior and the change-detail modal on a live `cy ui` instance. Disposable quick/planned workspace fixtures were created for that pass and removed afterwards so the workspace diff stayed clean.

Browser-level drag/drop is still the one open item. The lifecycle mutation path is implemented and covered by runtime/component tests, but Playwright did not trigger the hello-pangea DnD interaction in the live board, so that specific acceptance check still needs direct interactive confirmation or a better browser automation harness.
