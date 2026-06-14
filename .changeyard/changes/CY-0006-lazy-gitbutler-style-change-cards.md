---
id: CY-0006
title: Lazy GitButler-style change cards
type: agent-task
status: ready_for_pr
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-11T16:22:08.629Z
updatedAt: 2026-06-11T16:33:30.604Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0006
  path: .changeyard/workspaces/CY-0006/repo
branch:
  name: cy/CY-0006-lazy-gitbutler-style-change-cards
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-11T16:33:30.605Z
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
---

# Summary

Redesign canonical Changeyard change cards so they can show GitButler-style commit and file summaries without making the board eagerly load repository history for every visible card.

# Motivation

The board should make active changes easier to inspect directly from the kanban columns, while staying responsive on repositories with many changes or large diffs.

# Plan

- [x] Add compact board summary/file runtime endpoints for Changeyard changes.
- [x] Add bounded client-side caches for lazy summary and file-list data.
- [x] Redesign canonical change cards with selectable headers, aggregate file banners, commit rows, and per-commit file expansion.
- [x] Cover lazy loading and cache behavior with focused tests.

<!-- cy:proposal:start -->
# Proposal

## Intent

Provide richer canonical change cards with commit/file context loaded on demand.

## Scope

### In Scope

- [x] Runtime queries for change board summaries and compact file lists.
- [x] Client LRU cache for selected-card summary and expanded file data.
- [x] Canonical change card UI and interaction changes only.
- [x] Tests for runtime contract surface, cache eviction, and lazy board calls.

### Out of Scope

- [ ] Full patch rendering inside board cards.
- [ ] Task card redesign.
- [ ] Changeyard markdown schema changes.
- [ ] Detail dialog diff behavior beyond using existing current behavior.

## Approach

Build board-specific runtime endpoints on the existing workspace resolution, git/jj log, and commit diff helpers. Keep the board’s initial data path unchanged, then fetch summary data only when a change header is selected and file lists only when aggregate or commit file sections are expanded.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- The board MUST NOT request commit or file data for canonical changes during initial render.
- Selecting a canonical change card header MUST request a compact board summary lazily.
- Expanding aggregate or commit file sections MUST request compact file summaries lazily.
- Client caches MUST bound summary entries and commit/all-file entries with LRU eviction.
- Board runtime file responses MUST exclude full patch text.

## MODIFIED Requirements

- Canonical change cards show richer metadata, aggregate file banners, and commit rows when selected.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Add runtime schemas and router procedures for `changes.getBoardSummary` and `changes.getBoardFiles`. Implement the procedures in `changes-api` using the resolved change workspace path, repository head information, existing log helpers, `getWorkspaceChanges`, and compact mappings from commit diffs. Add a web UI cache module with bounded LRU maps and consume it from `ChangeCard`.

## Architecture Decisions

- Keep board cache data compact: commit metadata and file stats only.
- Scope selection state to the board so opening details remains a separate icon action.
- Use existing VCS helpers rather than introducing a second diff parser.

## Data / State Impact

No Changeyard markdown schema changes. Runtime API adds read-only board-specific response shapes.

## Workspace / Provider Impact

Queries operate on the existing Changeyard workspace checkout if the change has been started. Changes without a workspace return safe empty states.

## Risks

- Git and jj revision range behavior may differ; mitigate by using existing helpers and safe fallbacks.
- UI complexity can hurt drag behavior; keep drag handle on the card while stopping action button propagation.
- Cache invalidation may miss dirty workspace edits; include change metadata and backend version token where available.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Add runtime board summary and file endpoints
- [x] Add client-side LRU cache
- [x] Redesign canonical change card UI

## 3. Verification

- [x] Add/update tests
- [x] Run `pnpm run check`
- [x] Run `pnpm --dir packages/kanban/web-ui run test`
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm run check`
- `pnpm --dir packages/kanban/web-ui run test`

## Manual Scenarios

- Load the board and confirm canonical cards render before any board summary request.
- Select a change card header and confirm the summary/commit rows load.
- Expand All Changes and commit file sections and confirm compact file rows render.

## Result

Passed:

- `pnpm --dir packages/kanban/web-ui run test` (82 files, 531 tests)
- `pnpm run check`
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] Initial board render uses existing change metadata only.
- [x] Selecting a canonical change card loads summary data once and reuses cache.
- [x] Aggregate and per-commit file lists load only when expanded.
- [x] Canonical change cards provide header, action bar/tags, commit rows, selected accent, and file banners.
- [x] Cache sizes are bounded and evict least recently used entries.
- [x] Runtime endpoints return compact file summaries without patch text.

# Scope Boundaries

## In scope

- `packages/kanban/src/runtime-stack/core/api-contract.ts`
- `packages/kanban/src/runtime-stack/trpc/app-router.ts`
- `packages/kanban/src/runtime-stack/trpc/changes-api.ts`
- `packages/kanban/src/runtime-stack/workspace/git-history.ts`
- `packages/kanban/web-ui/src/components/changeyard/*`
- `packages/kanban/web-ui/src/runtime/*`
- Focused tests for touched runtime/UI behavior.

## Out of scope

- Unrelated requests, opportunistic refactors, and formatting-only edits outside touched files.

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

1. Add compact runtime contracts for board summaries and board file lists.
2. Implement workspace resolution helpers in `changes-api` and query summary/files through existing VCS/workspace utilities.
3. Add a small web UI LRU cache with summary/file caps and tests.
4. Refactor canonical `ChangeCard` to select on header, lazy-load summary, render aggregate and commit file banners, and keep the detail button separate.
5. Add/update component tests proving no eager fetch, lazy fetch/caching, and visible file sections.
6. Run the kanban tests and repository check commands, then record results.

# Completion Notes

Implemented lazy GitButler-style canonical change cards.

- Added read-only base revision metadata to runtime change summaries.
- Added `changes.getBoardSummary` and `changes.getBoardFiles` endpoints that resolve the change workspace and return compact commit/file data.
- Added git/jj range-log and compact commit-file summary helpers.
- Added bounded LRU caches for board summaries and file lists.
- Redesigned canonical change cards with selectable headers, selected accent, aggregate All Changes banner, list/tree file views, action bar tags, commit rows, and per-commit file expansion.
- Added tests for lazy request boundaries and LRU eviction.

Verification:

- `pnpm --dir packages/kanban/web-ui run test` passed.
- `pnpm run check` passed.

Notes:

- Installed dependencies in the isolated workspace to run checks; pnpm lockfile metadata churn was restored before completion.
- Board responses do not return full patch text. JJ commit file summaries still rely on parsing jj git-style diff output internally because that is the existing compactable source for file stats.
