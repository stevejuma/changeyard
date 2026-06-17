---
id: CY-0024
title: Adopt RTK Query for kanban core data
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-17T23:14:12.327Z
updatedAt: 2026-06-18T08:21:52.724Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0024
  path: .changeyard/workspaces/CY-0024/repo
branch:
  name: cy/CY-0024-adopt-rtk-query-for-kanban-core-data
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-17T23:39:13.732Z
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
mergedAt: 2026-06-18T08:21:52.720Z
---

# Summary

Migrate kanban core server state to a VCS-style RTK Query boundary with shared caching,
tag invalidation, and focused hook/component adoption.

# Motivation

Kanban currently uses component-local tRPC calls and a small bespoke query hook, so the
same data can be fetched repeatedly and cache refresh decisions are spread across
components. RTK Query gives the kanban app the same shared server-state boundary used
by VCS, including reusable cache entries, mutation invalidation, and clearer ownership
for websocket-driven refresh behavior.

# Plan

- [x] Add a kanban RTK Query service and store.
- [x] Add low-level tRPC fetch/mutation helpers for the RTK service.
- [x] Migrate core project, workspace state, config, change, change-board, and directory endpoints.
- [x] Move key websocket cache invalidation into the RTK service layer.
- [x] Preserve existing hook/component public contracts while migrating call sites.
- [x] Verify with kanban typecheck, tests, and build.

<!-- cy:proposal:start -->
# Proposal

## Intent

Adopt RTK Query for kanban's high-value server-state reads and mutations while
preserving current UI behavior and keeping websocket streaming as the live event source.

## Scope

### In Scope

- [x] `kanbanApi` and `kanbanStore` for the kanban web app.
- [x] Low-level tRPC helpers with workspace headers and abort signals.
- [x] RTK endpoints for projects, workspace state, runtime config, Changeyard config, changes, change-board data, reviews, and directory listing.
- [x] Cache invalidation for project, workspace, and Changeyard change file events.
- [x] Migration of `useChangeyardChanges`, workspace persistence, project navigation/add-project, runtime config hooks, and change-board summary/files/diff loading.

### Out of Scope

- [ ] Backend tRPC procedure changes.
- [ ] Full migration of chat, terminal internals, git history, debug actions, Cline provider/account calls, and miscellaneous file search endpoints.
- [ ] Removing the runtime websocket stream.

## Approach

Mirror the VCS RTK service pattern: keep direct transport calls inside
`runtime/kanban-api.ts`, expose typed hooks from that service, and use RTK tags for
cache invalidation after mutations and stream events. Migrate call sites incrementally
while preserving existing hook return shapes to limit UI churn.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- Kanban SHALL expose a single RTK Query service for migrated server-state calls.
- Migrated mutations SHALL invalidate or update the relevant RTK cache tags.
- Runtime stream events SHALL invalidate project, workspace, and affected Changeyard change caches where applicable.
- Migrated hooks SHALL preserve their current public return shape unless a call site is updated in the same change.

## MODIFIED Requirements

- Changeyard change list/detail, change-board summary/files/diffs, project/config, directory, and workspace-state data SHALL be read through RTK Query instead of component-local tRPC query hooks.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Add `runtime/kanban-api.ts` using `createApi` and `fakeBaseQuery`, plus
`runtime/kanban-store.ts` using `configureStore`. Wrap the kanban/dashboard root in
`Provider` from `react-redux`. Extend `runtime/trpc-client.ts` with low-level
`fetchTrpcQuery` and `postTrpcMutation` helpers while keeping the existing proxy client
for unmigrated code. Migrate high-value hooks/components to RTK hooks and mutations.

## Architecture Decisions

- Keep local UI state in React; RTK owns only migrated server state.
- Keep `useRuntimeStateStream` as the websocket connection; RTK owns cache invalidation for migrated data.
- Keep the VCS route's separate Redux store unchanged because it is loaded through the virtual route plugin.

## Data / State Impact

No persisted schema changes. Client-side server-state caching moves from ad hoc hook
state/local cache to RTK Query cache entries for migrated calls.

## Workspace / Provider Impact

No provider behavior changes. Work follows the Changeyard workspace lifecycle and
implements only inside the verified `CY-0024` workspace checkout.

## Risks

- Risk: stale UI after mutations if tags are too narrow. Mitigation: use conservative invalidation for initial endpoints and add focused tests.
- Risk: duplicated websocket effects between App and RTK. Mitigation: preserve current stream state for UI, but move migrated cache refresh decisions into RTK helpers.
- Risk: broad migration churn. Mitigation: keep hook return shapes and leave lower-value call sites for follow-up work.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Add kanban RTK service/store and root provider.
- [x] Add tRPC transport helpers.
- [x] Implement initial endpoint/tag set.
- [x] Migrate selected hooks and components.
- [x] Add/update focused tests.

## 3. Verification

- [x] Run typecheck, tests, and build.
- [x] Record verification results.
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm --filter @kanban/web run typecheck`
- `pnpm --filter @kanban/web run test`
- `pnpm --filter @kanban/web run build`

## Manual Scenarios

- Project selection and add-project flow.
- Change list/detail load, change creation, status/action mutation, dependency mutation, and body save conflict behavior.
- Change-board summary/files/diff cache reuse.
- Workspace state hydration/persistence conflict handling.

## Result

- Passed: `pnpm --filter @kanban/web run typecheck`
- Passed: `pnpm --filter @kanban/web run test` (95 files, 585 tests)
- Passed: `pnpm --filter @kanban/web run build`
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] `kanbanApi` and `kanbanStore` exist and are mounted for kanban/dashboard without disrupting the VCS route store.
- [x] Migrated endpoints use RTK Query and are no longer fetched through one-off `useTrpcQuery` calls.
- [x] Migrated mutations invalidate or update relevant project, workspace, config, change, review, board, and directory caches.
- [x] Runtime stream events invalidate migrated RTK caches for projects, workspace state, and affected Changeyard change files.
- [x] Existing UI behavior is preserved for migrated hooks/components.
- [x] Expected checks pass or any remaining blockers are documented.

# Agent Plan

1. Start and verify the Changeyard workspace.
2. Inspect current kanban hook/component tests around migrated surfaces.
3. Add RTK service/store and transport helpers.
4. Migrate high-value hooks/components in small slices, updating tests as needed.
5. Run focused tests while iterating, then full kanban typecheck/test/build.

# Completion Notes

Implemented a kanban RTK Query boundary with `kanbanApi`, `kanbanStore`, typed tags,
low-level tRPC transport helpers, and stream-driven cache invalidation. Migrated the
initial high-value surfaces: Changeyard changes, change mutations, change-board
summary/files/diff loading, workspace state persistence, project navigation and
add-project directory flows, runtime config, and Changeyard project config. Existing
hook/component return shapes were preserved where callers still depend on them.

Verification passed:

- `pnpm --filter @kanban/web run typecheck`
- `pnpm --filter @kanban/web run test`
- `pnpm --filter @kanban/web run build`

Follow-up migrations remain intentionally out of scope for chat, terminal internals,
git history, debug actions, Cline provider/account calls, and miscellaneous file search
endpoints.
