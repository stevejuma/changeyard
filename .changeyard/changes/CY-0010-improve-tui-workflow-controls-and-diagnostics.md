---
id: CY-0010
title: Improve TUI workflow controls and diagnostics
type: agent-task
status: ready_for_pr
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-14T11:45:40.452Z
updatedAt: 2026-06-14T11:57:46.180Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0010
  path: .changeyard/workspaces/CY-0010/repo
branch:
  name: cy/CY-0010-improve-tui-workflow-controls-and-diagnostics
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-14T11:57:46.181Z
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

Add Cline-inspired workflow controls to the Changeyard OpenTUI client: a stronger command palette, prompt history, a richer status bar, activity/diagnostic surfaces, and read-only runtime support where needed.

# Motivation

The current TUI can create and manage changes, but important commands and health information are spread across slash commands, config screens, and footer text. Borrowing proven interaction patterns from Cline's CLI will make Changeyard's TUI feel more like a persistent work surface for change lifecycle work.

# Plan

- [x] Add tested helpers for command palette scoring, prompt history, status formatting, and activity/history display.
- [x] Expand the TUI command surface and status bar without changing existing lifecycle mutation semantics.
- [x] Add read-only runtime/client support for activity and diagnostics needed by the TUI.
- [x] Add focused TUI tests and smoke coverage for the new behavior.

<!-- cy:proposal:start -->
# Proposal

## Intent

Improve TUI discoverability and operational context while preserving the existing Changeyard lifecycle model.

## Scope

### In Scope

- [x] Command palette/search improvements and slash command discoverability.
- [x] Prompt history navigation for submitted titles and commands.
- [x] Richer TUI status/context bar.
- [x] Read-only activity/history and diagnostics/doctor panels.
- [x] Focused tests for the new TUI helpers and flows.

### Out of Scope

- Replacing Solid/OpenTUI with React.
- Copying Cline's agent runtime, provider auth, daemon/hub, connector, schedule, MCP, or team-command systems.
- Removing the Bun requirement for packaged TUI execution.
- Changing lifecycle mutation semantics for validate/sync/start/verify/complete/review.

## Approach

Adapt low-coupling Cline CLI patterns into Changeyard-native Solid/OpenTUI modules. Prefer small helper modules with tests over large component rewrites. Preserve Apache-2.0 attribution where behavior is directly adapted.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- The TUI SHALL expose lifecycle, navigation, config, doctor, and VCS-related actions through a searchable command palette.
- The TUI prompt SHALL persist and recall submitted change titles and slash commands with boundary-aware up/down navigation.
- The TUI workspace view SHALL show a compact status/context bar with selected change, lifecycle status, provider, VCS engine, workspace state, and runtime health.
- The TUI SHALL expose read-only activity/history and diagnostics views.

## MODIFIED Requirements

- Existing slash command behavior remains available but becomes discoverable through palette entries and aliases.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Add helper modules under `packages/tui/src` for command filtering, prompt history, status formatting, and activity formatting. Extend the runtime client and server bridge only for read-only data. Update existing TUI route/action components to consume these helpers and add UI surfaces for activity and diagnostics.

## Architecture Decisions

- Keep TUI implementation in Solid/OpenTUI.
- Copy/adapt only small Apache-2.0-compatible helper behavior from Cline where useful.
- Keep mutation endpoints unchanged and add new read-only runtime support behind the existing runtime client.

## Data / State Impact

Add TUI-local persisted prompt history. Add read-only runtime response shapes for activity/diagnostic summaries if existing endpoints are insufficient.

## Workspace / Provider Impact

No provider write behavior changes. Diagnostics may report provider/VCS/workspace state already known by Changeyard.

## Risks

- Risk: TUI keyboard handling regressions. Mitigate with focused interaction tests.
- Risk: status/activity data becomes stale. Mitigate with explicit refresh actions and conservative read-only runtime calls.
- Risk: copied helper code license ambiguity. Mitigate with attribution comments and a local vendor attribution file.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Add/adapt helper modules and tests
- [x] Update TUI command palette, prompt, workspace footer, and routes
- [x] Add runtime/client read-only diagnostics and activity support

## 3. Verification

- [x] Run checks and record results
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `npm run build:cli`
- `npm run check:tui`
- Focused `bun` tests for changed TUI helpers where applicable

## Manual Scenarios

- Open the TUI, search and run commands through the command palette.
- Submit prompts, then recall prior titles and slash commands with up/down.
- Inspect status bar, activity/history, and doctor/diagnostics screens.

## Result

- `npm run build:cli` passed.
- `npm run check:tui` passed.
- `bun run ./packages/tui/tests/workflow-helpers.test.ts` passed during focused verification.
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] Command palette includes lifecycle, navigation, config, doctor, VCS, and activity commands with search and aliases.
- [x] Prompt history persists submitted titles and slash commands and navigates without interfering with multiline editing.
- [x] Workspace footer shows richer status/context data and fits narrow terminals.
- [x] Activity/history and diagnostic views are available from commands and read only.
- [x] Tests cover command search, prompt history, status formatting, and activity/diagnostic formatting.
- [x] Verification commands are recorded in Completion Notes.
- [ ] Deferred: persisted backend lifecycle history remains a future enhancement.

# Scope Boundaries

## In scope

- `packages/tui/src/**`
- `src/commands/ui.ts` and related runtime API bridge/router code needed for read-only TUI data
- TUI-focused tests and smoke scripts
- Vendor attribution documentation for adapted Cline helper code

## Out of scope

- Unrelated requests, opportunistic refactors, and formatting-only edits outside touched files.
- Agent runtime, provider auth, daemon/hub, connector, schedule, MCP, and packaging/distribution rewrites.

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

1. Validate and start the Changeyard workspace for this task.
2. Inspect the current TUI command, prompt, footer, runtime client, and test structure inside the workspace.
3. Implement slice 1 helpers and UI integration: command palette search, prompt history, and richer status bar.
4. Implement slice 2 read-only depth: activity/history and diagnostics surfaces backed by existing or small read-only runtime APIs.
5. Add focused tests for helper behavior and update smoke coverage where practical.
6. Run `npm run build:cli` and `npm run check:tui`; record results and any remaining risk in Completion Notes.

# Completion Notes

Implemented Cline-inspired TUI workflow controls in the CY-0010 workspace:

- Added Apache-2.0-attributed helper logic for command search/scoring and prompt history navigation.
- Added prompt history persistence, richer command metadata/search, activity and diagnostics preview tabs, and a compact status bar.
- Added focused helper tests and included them in the TUI test script.

Verification:

- `npm run build:cli` passed.
- `npm run check:tui` passed.
- Focused helper test `bun run ./packages/tui/tests/workflow-helpers.test.ts` passed before the full TUI check.

Remaining risk:

- Activity/history is read-only and derived from current changes plus the latest doctor result; deeper persisted lifecycle history remains a future backend enhancement.
