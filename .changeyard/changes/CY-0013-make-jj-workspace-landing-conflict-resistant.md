---
id: CY-0013
title: Make JJ workspace landing conflict resistant
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-14T13:53:25.222Z
updatedAt: 2026-06-14T14:07:52.130Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0013
  path: .changeyard/workspaces/CY-0013/repo
branch:
  name: cy/CY-0013-make-jj-workspace-landing-conflict-resistant
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-14T14:07:44.095Z
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
mergedAt: 2026-06-14T14:07:52.129Z
---

# Summary

Make JJ Changeyard workspaces explicit task commits on the configured target and make landing rebase/verify that known task commit instead of squashing into root `@`.

# Motivation

Parallel agents need deterministic workspace bases and safe landing. The current JJ workspace creation is implicit, and the current land path can mix workspace work with root working-copy changes.

# Plan

- [x] Create JJ workspaces from an explicit base revision with a seeded task description.
- [x] Persist task base/change metadata for start/status/land.
- [x] Require agents to provide a non-default JJ task description containing the change id before landing.
- [x] Rebase task commits onto the current target before landing and abort on conflicts.
- [x] Update status/dry-run/TUI guidance and tests.

<!-- cy:proposal:start -->
# Proposal

## Intent

Make `cy start` and `cy land` safer for parallel JJ-based agents by anchoring each workspace to a known task commit and landing that task commit directly.

## Scope

### In Scope

- [x] JJ `cy start` creates a task commit from the configured base using `workspace add -r ... -m ...`.
- [x] Workspace metadata stores target/base/task identifiers and seed description.
- [x] JJ `cy land` validates the task description, rebases onto latest target when needed, aborts on conflicts, and moves the target bookmark to the task commit.
- [x] Workspace status/dry-run guidance reports target movement and description guard state.
- [x] Focused unit and real-JJ integration tests.

### Out of Scope

- Git/plain-copy landing automation beyond current conservative behavior.
- Remote PR/publish workflows.
- Broad TUI redesign outside next/land/workspace guidance.

## Approach

Extend existing JJ workspace engine and land command helpers with explicit base/change metadata, non-interactive JJ commands, and hard-fail guards. Keep the root working copy out of landing by operating on the workspace task change id.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- `cy start` SHALL create JJ workspaces from an explicit base revision and seed the workspace task description.
- `cy land` SHALL require a non-seed task description containing the internal change id.
- `cy land` SHALL rebase the workspace task commit onto the current target before moving the target bookmark when the target moved.
- `cy workspace status` and `cy land --dry-run` SHALL report landability blockers.

## MODIFIED Requirements

- JJ landing SHALL operate on the workspace task change id instead of squashing into root `@`.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Resolve the configured base in `runStart`, create the JJ workspace with `-r` and `-m`, then read and persist the resulting task change id/commit id. Update `runLand` to read the persisted task change, validate its description, optionally rebase it to the current target, update canonical metadata into that task change, and move the bookmark.

## Architecture Decisions

- The JJ task commit description is the source of truth for landing description.
- The generated start description is only a seed and must be changed before landing.
- Root `@` should not be required to be clean unless canonical metadata cannot be safely updated.

## Data / State Impact

Workspace metadata gains optional fields: `targetRef`, `baseCommitId`, `workspaceChangeId`, `workspaceCommitId`, and `seedDescription`. Older metadata should fail clearly or fall back only where safe.

## Workspace / Provider Impact

JJ workspace creation and landing behavior change. Provider behavior is unchanged.

## Risks

- Risk: rebasing introduces conflicts. Mitigation: re-check conflicts after rebase and do not move the target bookmark on conflict.
- Risk: weak commit descriptions still land. Mitigation: hard-fail description guard.
- Risk: older workspaces lack metadata. Mitigation: explicit recovery/failure messages.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Update JJ workspace start metadata.
- [x] Update JJ land rebase/description guard.
- [x] Update status/dry-run/TUI guidance.
- [x] Add tests.

## 3. Verification

- [x] Run checks and record results
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `npm run build:cli`
- `node --test --test-force-exit dist/tests/changeyard.test.js`
- `npm --workspace @changeyard/kanban run runtime:build`
- `npm run check:tui`

## Manual Scenarios

- Start two JJ changes from `main`, verify distinct task commits.
- Land with unchanged seed description and confirm hard failure.
- Re-describe task commit and land after target moved.
- Confirm root `@` WIP is not squashed into the landed commit.

## Result

Passed:

- `npm run build:cli`
- `node --test --test-force-exit dist/tests/changeyard.test.js`
- `npm --workspace @changeyard/kanban run runtime:build`
- `npm run check:tui`
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] JJ `cy start` creates a described task commit from the configured base.
- [x] Workspace metadata records target/base/task identifiers and seed description.
- [x] `cy land` rejects blank/default/seed descriptions and descriptions missing the change id.
- [x] `cy land` rebases the task commit onto the current target and aborts before moving target on conflicts.
- [x] Root `@` changes are not squashed into landed task commits.
- [x] Workspace status and dry-run output report description guard and target movement.
- [x] Tests cover unit and real-JJ start/land scenarios.

# Agent Plan

1. Validate, sync, start, and verify CY-0013.
2. Inspect current JJ start/land tests and runtime/TUI status surfaces.
3. Implement explicit JJ workspace task commit metadata.
4. Implement description guard, rebase-before-land, and target bookmark movement.
5. Update status/dry-run/TUI guidance and agent docs.
6. Add tests and run targeted checks.

# Completion Notes

Implemented conflict-resistant JJ start/land flow. `cy start` now creates a described JJ task commit from the configured base and records target/base/task metadata. `cy land` now validates the task commit description, rebases the task change onto the current target when needed, snapshots merged metadata in the task workspace, moves the target bookmark to that task change, and leaves unrelated root working-copy changes alone. Workspace status, dry-run output, runtime schemas, and TUI guidance now expose target movement, landability, and description guard failures.

Checks passed:

- `npm run build:cli`
- `node --test --test-force-exit dist/tests/changeyard.test.js`
- `npm --workspace @changeyard/kanban run runtime:build`
- `npm run check:tui`

Residual risk: Git/plain-copy landing remains conservative and outside this JJ-focused change.
