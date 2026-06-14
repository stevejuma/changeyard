---
id: CY-0008
title: Align VCS UI with GitButler layout
type: agent-task
status: ready_for_pr
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-12T10:01:13.917Z
updatedAt: 2026-06-12T10:36:53.888Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0008
  path: .changeyard/workspaces/CY-0008/repo
branch:
  name: cy/CY-0008-align-vcs-ui-with-gitbutler-layout
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-12T10:36:53.889Z
  lastStatus: passed
planning:
  model: openspec-lite
  storage: inline
  schema: changeyard-openspec-lite@1
  strictness: normal
  phase: complete
  gates:
    proposal: pass
    specDeltas: pass
    design: pass
    tasks: pass
    verification: pass
    strictClarifications: skipped
    strictChecklist: skipped
    strictAnalysis: skipped
---

# Summary

Align the VCS web app with the GitButler-style master/detail workflow described by the user: persistent project selector, secondary VCS context panel, and right-side lanes/details for branches, commit graphs, operation history, and diffs.

# Motivation

The previous VCS UI repair copied Kanban styling primitives, but the app still lacks the intended GitButler/Kanban interaction model and does not reliably show repository data because VCS calls are not driven by an explicit selected project/workspace.

# Plan

- [x] Record the GitButler alignment plan and task checklist.
- [x] Copy/adapt Kanban project navigation and workspace-scoped client patterns into `packages/vcs`.
- [x] Add narrow VCS runtime inventory/operation surfaces where existing workspace APIs do not cover the UI.
- [x] Rework Branches and History into left-context/right-detail layouts using Kanban-style panels, lists, graph rows, and diffs.
- [x] Verify with VCS package checks, root checks where feasible, and browser QA.

<!-- cy:proposal:start -->
# Proposal

## Intent

Make `/vcs` behave like the Kanban app adapted for VCS work: select a project first, then navigate branch/bookmark and operation history data through a left panel with right-side detail lanes/diffs.

## Scope

### In Scope

- [x] VCS package UI shell, project selector, routes, runtime client, branch/history views, and tests.
- [x] Runtime-stack tRPC additions for JJ inventory and operation history/diff data.
- [x] New alignment plan/task markdown files.
- [x] Browser and automated verification for the VCS routes.

### Out of Scope

- [ ] Extracting a shared UI package from Kanban and VCS.
- [ ] Replacing Kanban internals or changing Kanban behavior.
- [ ] Full forge integration beyond displaying PR metadata when existing runtime data can provide it.
- [ ] Implementing destructive operation restore unless runtime support is narrow and safe.

## Approach

Use Kanban as the implementation source for layout and interaction primitives while keeping copied VCS-local files independent. Add project selection first so VCS requests are workspace-scoped, then layer GitButler-style branch and history master/detail views over existing repository/JJ data.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- `/vcs` MUST show a persistent project selector copied/adapted from Kanban.
- VCS data requests MUST be scoped to the selected project/workspace.
- Branches MUST show bookmark/ref inventory in a left context panel and selected commits/diffs in the right detail area.
- History MUST show JJ operation entries in a left timeline and selected operation details in the right detail area.
- New plan/task files MUST document this GitButler alignment pass.

## MODIFIED Requirements

- Existing VCS pages should use Kanban/GitButler-style master/detail chrome instead of a standalone custom navigation shell.
- Existing empty states should distinguish no project, VCS disabled, non-JJ repository, and no branch/history data.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

- Add VCS-local project navigation state and components based on Kanban project navigation.
- Extend the VCS tRPC client to include workspace-scoped request helpers and project APIs.
- Add runtime procedures for JJ inventory and operation history/diff, reusing existing workspace repository APIs for commit lists/diffs when possible.
- Replace branch/history views with reusable VCS panel components for context lists, graph rows, file summaries, and diff detail.
- Keep UI source local to `packages/vcs` until a later shared component extraction.

## Architecture Decisions

- Copy/adapt rather than import Kanban UI internals, preserving package independence.
- Favor read-only operation history/diff first; only expose restore/snapshot actions when the backend can prove safe support.
- Use query-string state for selected workspace/ref/commit/operation so browser refresh preserves context.

## Data / State Impact

- Adds runtime response types for JJ inventory, operation entries, and operation detail/diff diagnostics.
- Adds client state for selected project, selected branch/ref, selected commit, selected operation, filters, and search.

## Workspace / Provider Impact

- Runtime calls use the selected workspace ID via the same tRPC scoping mechanism as Kanban.
- Provider/forge metadata is optional; missing provider data should produce badges/diagnostics rather than emptying the branch list.

## Risks

- JJ operation diff support may be limited by installed JJ behavior; mitigate with clear diagnostics and file summaries.
- Copying Kanban components can pull many dependencies; keep copies focused and compile-gated by VCS tests.
- Existing VCS tests may assume unscoped requests; update tests to cover selected workspace behavior.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Create alignment plan/task files.
- [x] Inspect Kanban project navigation and git history components.

## 2. Implementation

- [x] Add VCS project selection and workspace-scoped clients.
- [x] Add JJ inventory and operations runtime procedures/types.
- [x] Rebuild Branches as branch inventory plus commit graph/diff detail.
- [x] Rebuild History as operation timeline plus operation detail/diff.
- [x] Update landing/settings/JJ board shell integration.

## 3. Verification

- [x] Run VCS package checks and focused runtime tests.
- [x] Run root checks where feasible.
- [x] Run browser QA for `/vcs`, `/vcs/jj`, `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings`.
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm --filter @changeyard/vcs run typecheck`
- `pnpm --filter @changeyard/vcs run test`
- `pnpm --filter @changeyard/vcs run build`
- Focused runtime tests for VCS tRPC routes.
- `pnpm run build`
- `pnpm test`

## Manual Scenarios

- With `CHANGEYARD_VCS=1`, select a project on `/vcs` and confirm current commit/repository data loads.
- On `/vcs/jj/branches`, select a bookmark/ref and then a commit; confirm graph/list and diff/detail update.
- On `/vcs/jj/history`, select an operation and confirm file summaries/diff diagnostics render.
- Confirm no-project, disabled, non-JJ, and empty-data states are distinct.

## Result

Passed:

- `pnpm --filter @changeyard/vcs run typecheck`
- `pnpm --filter @changeyard/vcs run test` (6 tests)
- `pnpm --filter @changeyard/vcs run build`
- `pnpm run build`
- `node --test --test-name-pattern "scoped JJ inventory" dist/tests/ui-server.test.js`
- `pnpm test` (180 tests)

Browser QA ran with `CHANGEYARD_VCS=1` using a Playwright fallback because the in-app Browser command was unavailable. Checked `/vcs`, `/vcs/jj`, `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings`; the project rail rendered, selected workspace data loaded, Branches showed refs/commit graph/diff detail, and History showed operations/detail output.
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] `plan-gitbutler-align-jjbuttler.md` and `tasks-gitbutler-align-jjbuttler.md` exist and match the implemented scope.
- [x] `/vcs` uses a Kanban-style project selector and passes selected workspace context to VCS data calls.
- [x] Branches page shows refs/bookmarks and opens commit graph/detail/diff for selected items.
- [x] History page shows JJ operations and selected operation details with diff or explicit fallback diagnostics.
- [x] VCS UI uses Kanban primitives/theme and avoids the previous standalone custom shell.
- [x] Automated checks and browser QA results are recorded in Completion Notes.

# Scope Boundaries

## In scope

- `.changeyard/changes/CY-0008-align-vcs-ui-with-gitbutler-layout.md`
- `plan-gitbutler-align-jjbuttler.md`
- `tasks-gitbutler-align-jjbuttler.md`
- `packages/vcs/**`
- VCS-related runtime-stack files under `packages/kanban/src/runtime-stack/**`
- Package manifests/lockfiles only as needed for VCS UI/runtime dependencies.

## Out of scope

- Unrelated requests, opportunistic refactors, and formatting-only edits outside touched files.

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

1. Validate and start the CY-0008 workspace, then work only inside that checkout.
2. Copy/adapt the Kanban project selector and scoped workspace client pattern into VCS.
3. Add typed runtime data surfaces for JJ inventory and operations.
4. Refactor the VCS shell, Branches, History, Landing, and JJ board views into the GitButler/Kanban master-detail layout.
5. Add/update focused tests, run required checks, perform browser QA, and update task/change completion notes.

# Completion Notes

Implemented the GitButler/Kanban alignment in the CY-0008 workspace. The VCS app now has a Kanban-style project rail, workspace-scoped VCS tRPC calls, new read-only JJ inventory and operation endpoints, a Branches view with ref inventory plus commit graph/diff detail, and a History view with operation timeline plus operation detail/patch diagnostics. Added `plan-gitbutler-align-jjbuttler.md`, `tasks-gitbutler-align-jjbuttler.md`, parser coverage for JJ operation files, and a scoped tRPC boundary test for `vcs.jjInventory`, `vcs.jjOperations`, and `vcs.jjOperationDiff`.

Checks ran and passed: `pnpm --filter @changeyard/vcs run typecheck`, `pnpm --filter @changeyard/vcs run test`, `pnpm --filter @changeyard/vcs run build`, `pnpm run build`, `node --test --test-name-pattern "scoped JJ inventory" dist/tests/ui-server.test.js`, and `pnpm test` (180 tests).

Manual browser QA passed with `CHANGEYARD_VCS=1` for `/vcs`, `/vcs/jj`, `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings`. The in-app Browser command was unavailable, so Playwright was used as the QA fallback. The temporary dev server on port 52684 was stopped after QA.

Remaining risk: operation restore/snapshot actions stay disabled because this pass only added safe read-only operation history and detail/diff surfaces. JJ may not provide patch-level details for every operation, so the UI keeps explicit diagnostics and file summaries as the fallback.
