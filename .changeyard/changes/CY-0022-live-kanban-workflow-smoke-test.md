---
id: CY-0022
title: Live Kanban workflow smoke test
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-17T19:08:13.413Z
updatedAt: 2026-06-17T22:59:14.614Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0022
  path: .changeyard/workspaces/CY-0022/repo
branch:
  name: cy/CY-0022-live-kanban-workflow-smoke-test
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-17T19:10:13.156Z
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
mergedAt: 2026-06-17T22:59:14.613Z
---

# Summary

Run a live Kanban workflow smoke test against the local Changeyard dev server.

# Motivation

Verify that a task created from the CLI appears in the Kanban UI and moves to the expected columns as lifecycle commands run.

# Plan

- [ ] Start the local Changeyard UI/runtime dev server.
- [x] Create this smoke-test task and verify it appears on the Kanban board.
- [x] Progress the task through validation, sync, workspace start, and workspace verify.
- [x] After each lifecycle step, verify the Kanban UI reflects the expected status.
- [x] Record any issues observed in this change card.

<!-- cy:proposal:start -->
# Proposal

## Intent

Exercise the Changeyard lifecycle end to end while watching the Kanban UI update in real time.

## Scope

### In Scope

- [x] CLI lifecycle commands for this task.
- [x] In-app browser verification of Kanban card placement.
- [x] Notes for any UI/runtime issues found during the test.

### Out of Scope

- [x] Product code changes.
- [x] Landing or merging unrelated existing workspaces.

## Approach

Use the smallest possible no-product-code task as a smoke-test fixture. Run the standard lifecycle gates and compare each CLI state transition with the card's rendered Kanban column.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

No behavior change.

## MODIFIED Requirements

None.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

No implementation is planned. This task records a live workflow smoke test.

## Architecture Decisions

None.

## Data / State Impact

Creates and updates this Changeyard change record and its generated workspace state.

## Workspace / Provider Impact

Uses the configured JJ workspace engine and noop provider for this local test.

## Risks

- The board may not refresh automatically after CLI updates; verify with browser state after each command and record any mismatch.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Run lifecycle commands for this smoke-test task

## 3. Verification

- [x] Verify each visible Kanban transition and record results
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `cy validate CY-0022`
- `cy sync CY-0022`
- `cy start CY-0022`
- `cy verify CY-0022`
- `cy complete CY-0022 --no-pr`

## Manual Scenarios

- Confirm `CY-0022` appears in the expected Kanban column after create/validate/sync.
- Confirm `CY-0022` moves to In Progress after workspace start/verify.
- Confirm `CY-0022` moves to Review / PR or the repository's ready state after completion.

## Result

- `cy validate CY-0022`: passed.
- `cy sync CY-0022`: passed with noop provider.
- `cy start CY-0022`: passed and created `.changeyard/workspaces/CY-0022/repo`.
- `cy verify CY-0022`: passed from the generated workspace checkout.
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] The dev server is running and the Kanban UI is reachable.
- [x] `CY-0022` appears on the board after creation.
- [x] Each lifecycle command result is compared with the visible Kanban card state.
- [x] Any observed UI/runtime issues are recorded below.

# Agent Plan

1. Use the current local dev server and in-app browser.
2. Verify initial card placement for `CY-0022`.
3. Run each lifecycle command and inspect the Kanban UI after each step.
4. Update this card's Completion Notes with the observed transitions and any defects.

# Completion Notes

Smoke test completed through workspace verification. Final completion transition is checked after `cy complete CY-0022 --no-pr`.

## Live UI Observations

- Created `CY-0022` from the CLI while the dev server was running.
- The Kanban board picked up the new card automatically without a browser reload.
- After create/validate, `CY-0022` rendered in `Ready`.
- After `cy sync CY-0022`, `CY-0022` remained in `Ready` and the card badge changed to `Synced`.
- After `cy start CY-0022`, `CY-0022` moved to `In Progress`; the `In Progress` column count increased from 2 to 3.
- After `cy verify CY-0022`, `CY-0022` remained in `In Progress`.
- No UI refresh issue was observed through workspace verification.
