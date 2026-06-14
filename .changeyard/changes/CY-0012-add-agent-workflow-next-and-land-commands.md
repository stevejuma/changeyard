---
id: CY-0012
title: Add agent workflow next and land commands
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-14T13:02:20.375Z
updatedAt: 2026-06-14T13:23:12.687Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0012
  path: .changeyard/workspaces/CY-0012/repo
branch:
  name: cy/CY-0012-add-agent-workflow-next-and-land-commands
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-14T13:22:59.888Z
  lastStatus: passed
planning:
  model: openspec-lite
  storage: inline
  schema: changeyard-openspec-lite@1
  strictness: normal
  phase: draft
  gates:
    proposal: pass
    specDeltas: pass
    design: pass
    tasks: pass
    verification: pass
    strictClarifications: skipped
    strictChecklist: skipped
    strictAnalysis: skipped
mergedAt: 2026-06-14T13:23:12.686Z
---

# Summary

Add first-class agent workflow commands so Changeyard can report the next action, land completed workspace changes into the default workflow, and manage workspaces without agents doing ad hoc JJ/Git lookups.

# Motivation

The current lifecycle stops at `ready_for_pr`; it does not move workspace code into `main`. Agents then have to infer missing commands and manually run VCS-specific operations. Changeyard should own those steps and expose clear next-action guidance.

# Plan

- [x] Add CLI/runtime support for `cy next`.
- [x] Add local JJ-first `cy land` with safe root/workspace checks.
- [x] Add `cy workspace status/list/delete`.
- [x] Improve validation and lifecycle guidance text.
- [x] Wire TUI commands and activity/diagnostics rows.
- [x] Add focused CLI and TUI tests.

<!-- cy:proposal:start -->
# Proposal

## Intent

Make the Changeyard workflow self-directing for agents from creation through local landing and cleanup.

## Scope

### In Scope

- [x] `cy next <id> [--json]` with status, blockers, workspace path, next command, and readiness flags.
- [x] `cy land <id> [--target <ref>] [--dry-run] [--keep-workspace]` for local landing, optimized for JJ.
- [x] `cy workspace status|list|delete` for workspace inspection and cleanup.
- [x] Updated validation gate flag and clearer lifecycle messages.
- [x] Runtime/TUI bindings for next, land, and workspace commands.
- [x] Agent skill/docs corrections for supported commands.

### Out of Scope

- Remote PR creation or provider publishing.
- Full Git merge/rebase automation beyond conservative failure or safe copy paths.
- Broad VCS UI redesign unrelated to Changeyard lifecycle commands.

## Approach

Implement small command modules that reuse existing change parsing, workspace metadata, verification, and transition helpers. Keep local landing explicit and guarded: verify the change is `ready_for_pr`, verify workspace integrity, verify root cleanliness, transfer workspace changes, update status to `merged`, commit locally, and advance the configured target.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- Changeyard SHALL expose `cy next <id>` to report the next actionable workflow command.
- Changeyard SHALL expose `cy land <id>` to locally land completed workspace changes into the configured default target.
- Changeyard SHALL expose `cy workspace status`, `cy workspace list`, and `cy workspace delete`.
- The TUI SHALL expose next/land/workspace cleanup commands once runtime endpoints exist.

## MODIFIED Requirements

- `cy validate` SHALL accept an explicit validation gate, including `complete`.
- Lifecycle command outputs SHALL include actionable next commands.
- Agent documentation SHALL only advertise supported commands, or clearly mark unsupported future commands.

## REMOVED Requirements

Document removed behavior, or leave `None.`
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Add command modules for next, land, and workspace operations. Add runtime API methods and TUI client/actions for those commands. For JJ landing, use non-interactive `jj squash`, `jj commit`, and `jj bookmark set`; for unsupported unsafe engines, fail with explicit next steps.

## Architecture Decisions

- Local landing is the default; PR/publish remains separate future work.
- JJ is the v1 happy path because it is the current repository and agent workflow.
- Workspace delete refuses dirty unlanded work unless `--force` is supplied.

## Data / State Impact

Updates change frontmatter status to `merged` during `cy land`, records checks/updatedAt as needed, and leaves existing workspace metadata schema intact.

## Workspace / Provider Impact

Adds local workspace orchestration. No provider writes are added. JJ landing mutates local JJ history and target bookmark.

## Risks

- Risk: landing unrelated root work. Mitigate by requiring clean root/default workspace before land.
- Risk: dirty workspace deletion loses work. Mitigate by refusing delete unless landed or forced.
- Risk: Git/plain-copy behavior is less certain. Mitigate by making unsupported cases explicit.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Implement CLI next/land/workspace commands.
- [x] Implement runtime/TUI bindings.
- [x] Update docs/agent workflow guidance.
- [x] Add tests.

## 3. Verification

- [x] Run checks and record results
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm run build:cli`
- Targeted node tests for CLI workflow helpers
- `pnpm run check:tui`

## Manual Scenarios

- Create/start/verify/complete a JJ change, then land it into `main`.
- Run `cy next` at each major status.
- Run workspace status/list/delete against existing workspaces.

## Result

- `pnpm run build:cli` passed.
- `node --test --test-force-exit dist/tests/changeyard.test.js` passed: 78 tests.
- `pnpm --filter @changeyard/kanban run runtime:build` passed.
- `pnpm run check:tui` passed.
- `pnpm run build:kanban` and `pnpm run check:node` are blocked in the kanban web UI typecheck before this change's runtime code because `vitest/globals` type definitions are missing.
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] `cy next <id>` returns actionable next-step data in text and JSON.
- [x] `cy land <id>` locally lands a completed JJ workspace into the default target and marks the change `merged`.
- [x] `cy workspace status/list/delete` work for existing Changeyard workspaces with dirty-work refusal by default.
- [x] `cy validate <id> --gate complete` supports completion-ready documents.
- [x] `cy verify` and `cy complete` print correct next actions.
- [x] TUI/runtime expose next/land/workspace cleanup commands and activity events.
- [x] Agent docs no longer require unsupported `cy audit`, `cy guard install`, or `cy pr create` as active workflow steps.
- [x] Tests cover next mapping, validate gate, workspace status/delete, and JJ land behavior.

# Scope Boundaries

## In scope

- `src/commands/**`
- `src/workspace/**`
- `src/cli.ts`
- `src/documents/**`
- `packages/kanban/src/runtime-stack/trpc/**`
- `packages/tui/src/**`
- `tests/**`
- `.agents/skills/changeyard/SKILL.md`

## Out of scope

- Unrelated requests, opportunistic refactors, and formatting-only edits outside touched files.

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

1. Validate, sync, start, and verify CY-0012.
2. Inspect current CLI, workspace engines, runtime router, TUI command registration, and test harnesses.
3. Implement command modules for next, workspace status/list/delete, validate gate, and JJ-first land.
4. Add runtime API/client/TUI wiring for next, land, and workspace operations.
5. Update agent workflow docs to advertise implemented commands only.
6. Add and run focused tests plus `pnpm run build:cli` and `pnpm run check:tui`.
7. Complete CY-0012 and land it into `main` using the safest available path.

# Completion Notes

Implemented `cy next`, JJ-first `cy land`, and `cy workspace status/list/delete`; added runtime and TUI bindings for next/land/workspace cleanup; updated lifecycle output and complete-gate validation; corrected the Changeyard agent skill; and added focused CLI/JJ/TUI coverage.

Checks run: `pnpm run build:cli`; `node --test --test-force-exit dist/tests/changeyard.test.js`; `pnpm --filter @changeyard/kanban run runtime:build`; `pnpm run check:tui`.

Known unrelated blocker: `pnpm run build:kanban` and `pnpm run check:node` still fail in the kanban web UI typecheck because `vitest/globals` type definitions are missing.
