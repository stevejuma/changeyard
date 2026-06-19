---
id: CY-0011
title: Implement remaining TUI workflow follow-ups
type: agent-task
status: approved
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-14T12:01:27.967Z
updatedAt: 2026-06-18T16:10:10.245Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0011
  path: .changeyard/workspaces/CY-0011/repo
branch:
  name: cy/CY-0011-implement-remaining-tui-workflow-follow-ups
  required: false
  waivedAt: 2026-06-18T16:10:10.245Z
  waivedBy: cy doctor
  waiverReason: Missing JJ bookmark accepted because this approved change no longer requires a PR branch.
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-14T12:10:35.228Z
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
---

# Summary

Implement the remaining TUI workflow follow-ups after CY-0010: persisted activity history, richer diagnostics, setup guidance, and event-aware refresh hooks.

# Motivation

CY-0010 made activity and diagnostics visible, but the data is still shallow and mostly derived from the current screen state. The TUI should retain meaningful workflow events, expose actionable runtime diagnostics, guide first-time setup, and respond to runtime events when possible.

# Plan

- [x] Add TUI-local persisted workflow activity events and render them in the activity view.
- [x] Expand diagnostics data and UI around runtime/project/refresh state.
- [x] Add setup guidance for uninitialized or partially configured projects.
- [x] Add event-aware refresh plumbing with polling as fallback.
- [x] Cover helper behavior and TUI surfaces with focused tests.

<!-- cy:proposal:start -->
# Proposal

## Intent

Deepen the CY-0010 TUI surfaces without introducing new lifecycle mutations or changing provider behavior.

## Scope

### In Scope

- [x] Persist recent TUI workflow events in local TUI storage.
- [x] Record lifecycle command attempts/results, change creation, doctor runs, and refresh failures.
- [x] Add richer diagnostics for runtime URL, active project, refresh timestamps/errors, provider, VCS, and selected agent state.
- [x] Add a setup guide panel/command for uninitialized or incomplete project configuration.
- [x] Subscribe to runtime event streams if exposed by the local runtime, while keeping polling fallback.

### Out of Scope

- Backend event store or cross-process durable audit log.
- New destructive activity/history actions such as clearing history.
- Provider auth redesign, daemon/hub work, or removing the Bun requirement.
- Changing validate/sync/start/verify/complete/review mutation semantics.

## Approach

Keep the implementation TUI-local where possible. Extend existing state, KV, commands, panels, and runtime client with small read-only additions. Use persisted local events for immediate value and runtime events for opportunistic refresh.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- The TUI SHALL persist a bounded recent activity list for key TUI workflow events.
- The TUI SHALL show richer runtime diagnostics, including active project and refresh state.
- The TUI SHALL expose setup guidance for uninitialized or incomplete Changeyard projects.
- The TUI SHALL attempt event-aware refresh and retain fallback polling.

## MODIFIED Requirements

- The activity panel SHALL include persisted events in addition to current change/doctor-derived rows.
- The diagnostics panel SHALL include runtime/project state in addition to doctor output.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Add small utilities for activity event persistence, diagnostics formatting, setup checklist derivation, and runtime event subscription. Wire these into `AppState`, `RuntimeClient`, command actions, and preview panels.

## Architecture Decisions

- Persist activity in the existing TUI KV store, not in canonical Changeyard markdown.
- Treat runtime events as best-effort invalidation signals, not as required runtime behavior.
- Keep setup guidance read-only; actual config edits stay in existing config views.

## Data / State Impact

Adds TUI-local KV state for bounded activity events. Adds no canonical schema migration.

## Workspace / Provider Impact

No provider write behavior changes. Runtime event subscription is read-only and optional.

## Risks

- Risk: duplicate activity rows. Mitigate with event ids and bounded de-duplication.
- Risk: runtime event endpoint availability differs by mode. Mitigate with fallback polling.
- Risk: diagnostics become noisy. Mitigate by formatting into concise sections and keeping commands explicit.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Add persisted activity event model and tests
- [x] Add runtime diagnostics/setup helpers and panels
- [x] Add event-aware refresh subscription with fallback polling

## 3. Verification

- [x] Run checks and record results
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm run build:cli`
- `pnpm run check:tui`
- Focused TUI helper tests

## Manual Scenarios

- Run lifecycle commands from the TUI and inspect activity rows.
- Open diagnostics and setup guidance from the command palette.
- Confirm refresh still works if event subscription is unavailable.

## Result

- `pnpm run build:cli` passed.
- `pnpm run check:tui` passed.
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] Activity view includes persisted recent events with timestamps and bounded storage.
- [x] Lifecycle/create/doctor/refresh actions append useful success or failure events.
- [x] Diagnostics view includes runtime URL, active project, refresh state, provider/VCS, agent state, and doctor rows.
- [x] Setup guide command/panel derives incomplete setup steps from runtime/project state.
- [x] Runtime event subscription is attempted where available and falls back to existing polling.
- [x] Tests cover activity persistence, diagnostics formatting, setup checklist, and event fallback behavior.

# Scope Boundaries

## In scope

- `packages/tui/src/**`
- `packages/tui/tests/**`
- `packages/tui/package.json`
- Read-only runtime client/event code if needed

## Out of scope

- Unrelated requests, opportunistic refactors, and formatting-only edits outside touched files.
- Backend activity database, provider auth, packaging/distribution, and lifecycle mutation semantics.

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

1. Validate/start/verify the CY-0011 workspace.
2. Inspect CY-0010 TUI state, command, panel, runtime client, and tests in the workspace.
3. Add utilities for persisted activity events, diagnostics formatting, setup checklist derivation, and event fallback behavior.
4. Wire action recording into create/lifecycle/doctor/refresh commands and display persisted rows in the activity panel.
5. Add runtime diagnostics/setup panels and palette/slash commands.
6. Add best-effort runtime event subscription with fallback polling.
7. Run `pnpm run build:cli` and `pnpm run check:tui`; complete the change with notes.

# Completion Notes

Implemented persisted local TUI activity events, richer diagnostics rows, a setup guide panel and `/setup` command, and best-effort runtime event refresh using `/api/runtime/ws` with polling fallback. Activity now records lifecycle, create, doctor, setup, manual refresh, runtime-event refresh, and failure outcomes in bounded KV storage.

Verification:

- `pnpm run build:cli`
- `pnpm run check:tui`

Residual risk: runtime WebSocket support is best-effort in the TUI environment; when unavailable the existing polling path remains active.
