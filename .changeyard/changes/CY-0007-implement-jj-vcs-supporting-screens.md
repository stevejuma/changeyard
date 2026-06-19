---
id: CY-0007
title: Implement JJ VCS supporting screens
type: agent-task
status: approved
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-11T23:59:16.675Z
updatedAt: 2026-06-18T16:10:10.246Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0007
  path: .changeyard/workspaces/CY-0007/repo
branch:
  name: cy/CY-0007-implement-jj-vcs-supporting-screens
  required: false
  waivedAt: 2026-06-18T16:10:09.562Z
  waivedBy: cy doctor
  waiverReason: Missing JJ bookmark accepted because this ready_for_pr change no longer requires a PR branch.
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-12T12:00:00.000Z
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

Add the supporting JJ VCS screens for branches, history, and settings to the standalone VCS UI, and wire any missing read-only runtime data needed to render them behind `CHANGEYARD_VCS=1`.

# Motivation

The JJ VCS feature already has repository detection, stack state, mutation previews, confirmed mutations, and stacked PR publishing. It still lacks the secondary navigation surfaces called out in `PLAN.md`, which makes the feature incomplete and leaves important repository context hidden behind the main stack board.

# Plan

- [x] Review the current `/vcs` shell, runtime tRPC surface, and existing JJ state data to determine what can be reused for branches/history/settings.
- [x] Add the supporting VCS routes and navigation for `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings`.
- [x] Add any missing read-only runtime/backend APIs required to render those screens safely.
- [x] Add focused tests for the new runtime/UI surfaces and update `PLAN.md` / `TASKS.md`.

<!-- cy:proposal:start -->
# Proposal

## Intent

Complete M7 of the JJ VCS plan by adding the missing supporting screens without broadening scope into new providers or unrelated Kanban behavior.

## Scope

### In Scope

- [x] Standalone VCS routing and navigation updates in `packages/vcs`.
- [x] Read-only runtime/backend additions needed for VCS branches/history/settings data.
- [x] Focused tests for the added routes and tRPC procedures.
- [x] Tracker updates in `PLAN.md` and `TASKS.md`.

### Out of Scope

- [x] New Git provider implementations beyond the current JJ-first shape.
- [x] Non-read-only settings persistence unless required by an existing runtime API.
- [x] Shared UI extraction between `packages/kanban` and `packages/vcs`.
- [x] M8 documentation and final hardening beyond what is needed to land M7 safely.

## Approach

Reuse the current VCS detection and JJ state payloads where they already cover the needed data, add small dedicated runtime procedures only where the current models are insufficient, and keep the UI consistent with the existing VCS shell rather than importing Kanban components.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- The standalone VCS UI MUST expose `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings` behind `CHANGEYARD_VCS=1`.
- The branches screen MUST render bookmark and branch inventory from read-only runtime data.
- The history screen MUST render available JJ operation or change history context from read-only runtime data.
- The settings screen MUST render current VCS command/provider/base configuration diagnostics without mutating repository state.

## MODIFIED Requirements

- The `/vcs/jj` experience MUST provide navigation to the supporting VCS screens instead of being a single isolated screen.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Extend the standalone VCS app router so it can render four views from the current pathname: landing, JJ board, JJ branches, JJ history, and settings. Add small read-only adapters and tRPC procedures only if the existing `vcs.detect` / `vcs.jjState` payloads are not enough for one of those screens.

## Architecture Decisions

- Keep VCS route switching local to `packages/vcs` for now rather than introducing a full frontend router dependency.
- Prefer extending `src/vcs` and the existing `vcs` tRPC group over building a parallel runtime surface.
- Keep settings read-only in this milestone; surface configuration and diagnostics first, then add mutations later only if the roadmap requires them.

## Data / State Impact

This task may add read-only runtime response shapes for history/settings data. It does not change Changeyard markdown schemas, provider storage, or workspace metadata.

## Workspace / Provider Impact

The screens remain behind `CHANGEYARD_VCS=1` and continue to use the current JJ/GitHub detection behavior. GitLab/Forgejo-specific submit flows remain out of scope.

## Risks

- The existing JJ state model may not expose enough history detail; mitigate by adding a narrow read-only history procedure instead of overloading unrelated payloads.
- Route handling in the static VCS shell can drift from server asset mounting; mitigate with focused UI server tests for the new URLs.
- Settings can invite mutation scope creep; mitigate by keeping the first pass strictly informational.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Add branches, history, and settings route rendering
- [x] Add any missing read-only VCS runtime procedures
- [x] Add route/runtime tests

## 3. Verification

- [x] Run focused VCS UI/runtime checks and record results
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm run build`
- `pnpm --filter @changeyard/vcs run test`
- `node --test dist/tests/ui-server.test.js --test-name-pattern='ui server serves the standalone VCS shell when CHANGEYARD_VCS=1 is enabled|ui server exposes vcs\\.'`

## Manual Scenarios

- Load `/vcs/jj/branches` with `CHANGEYARD_VCS=1` and confirm bookmarks/branch inventory render from runtime data.
- Load `/vcs/jj/history` and confirm read-only history content renders without offering repository mutations.
- Load `/vcs/settings` and confirm the current JJ/GitHub/base diagnostics render clearly.

## Result

- `pnpm run build`
- `node --test --test-force-exit dist/tests/ui-server.test.js`
- `pnpm test`
- `pnpm run check:tui`
- `pnpm pack --dry-run`
- `node --test --import tsx tests/changeyard.test.ts --test-name-pattern='hydrate copies allowlisted files and skips denied secrets'`
- Playwright manual QA against `http://127.0.0.1:4311` for `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings`
<!-- cy:verification:end -->

# Acceptance Criteria

- [x] `/vcs/jj/branches` renders from the standalone VCS shell when `CHANGEYARD_VCS=1` is enabled.
- [x] `/vcs/jj/history` renders read-only JJ history context from runtime data.
- [x] `/vcs/settings` renders read-only VCS settings/configuration diagnostics.
- [x] Any new VCS runtime procedures are exposed through the existing tRPC boundary.
- [x] Focused tests cover the new route/runtime behavior without regressing the existing `/vcs` and `/vcs/jj` screens.
- [x] Browser-level manual QA is recorded for the new supporting screens in a live flagged UI session.

# Scope Boundaries

## In scope

- `packages/vcs/**`
- `src/vcs/**`
- `src/commands/ui.ts`
- `packages/kanban/src/runtime-stack/core/api-contract.ts`
- `packages/kanban/src/runtime-stack/trpc/app-router.ts`
- `packages/kanban/src/runtime-stack/trpc/vcs-api.ts`
- `packages/kanban/src/runtime-stack/server/runtime-server.ts`
- `tests/ui-server.test.ts`
- Focused VCS backend tests if new read-only procedures are added.

## Out of scope

- Unrelated requests, opportunistic refactors, and formatting-only edits outside touched files.

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

1. Inspect the existing standalone VCS shell path switching and decide whether the new screens can reuse `vcs.detect` and `vcs.jjState` directly.
2. Add lightweight navigation and route rendering for branches, history, and settings.
3. Add any missing read-only runtime/backend procedures for history or settings-specific data.
4. Add focused UI/runtime tests for the new routes and data path.
5. Run the focused build/test checks and record the results here.

# Completion Notes

Added the missing VCS supporting screens, finished the standalone VCS route wiring behind `CHANGEYARD_VCS=1`, and completed the hardening pass by documenting the JJ VCS feature and suppressing expected shutdown cleanup noise from stale temp workspaces.

Checks run:

- `pnpm run build`
- `node --test --test-force-exit dist/tests/ui-server.test.js`
- `pnpm test`
- `pnpm run check:tui`
- `pnpm pack --dry-run`
- `node --test --import tsx tests/changeyard.test.ts --test-name-pattern='hydrate copies allowlisted files and skips denied secrets'`
- Browser QA screenshots captured at `/tmp/vcs-jj-branches-verified.png`, `/tmp/vcs-jj-history-verified.png`, and `/tmp/vcs-settings-verified.png`

Remaining risk is follow-up polish only: the settings screen is still informational in this pass, and non-GitHub stacked PR providers remain out of scope.
