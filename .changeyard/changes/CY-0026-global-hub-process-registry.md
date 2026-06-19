---
id: CY-0026
title: Global hub process registry
type: agent-task
status: synced
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-19T09:37:45.846Z
updatedAt: 2026-06-19T09:38:37.759Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0026
  path: .changeyard/workspaces/CY-0026/repo
branch:
  name: cy/CY-0026-global-hub-process-registry
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
  strictness: strict
  phase: draft
  gates:
    proposal: pending
    specDeltas: pending
    design: pending
    tasks: pending
    verification: pending
    strictClarifications: pending
    strictChecklist: pending
    strictAnalysis: pending
---

# Summary

Move Changeyard hub process ownership from repo-scoped state to an app-global registry, then expose that registry through the CLI and dashboard so users can see live/stale hub instances, identify the active instance, and stop or kill managed processes.

# Motivation

The current hub state is stored per repository, so opening Changeyard from multiple projects can start multiple dashboard/runtime servers even though the runtime already supports multiple projects. A global hub should be the default owner for dashboard, kanban, VCS, TUI, and CLI flows, with additional instances allowed only when a user intentionally starts a different endpoint.

# Plan

- [ ] Add app-global hub state helpers and a registry for known hub instances.
- [ ] Change hub start/ensure/status/stop/restart behavior to target the global default instance.
- [ ] Add CLI commands to list and kill live or stale hub instances.
- [ ] Expose hub instance listing and kill operations to the runtime server.
- [ ] Update the dashboard to show the serving instance, other instances, and kill controls.
- [ ] Update tests and CLI documentation.

<!-- cy:proposal:start -->
# Proposal

## Intent

Make the Changeyard hub behave as a shared local service by default. The CLI and dashboard should make process ownership visible and provide cleanup controls for stale or unwanted instances.

## Scope

### In Scope

- [ ] App-global hub registry, active-instance tracking, stale process pruning, and legacy per-repo record awareness.
- [ ] CLI lifecycle changes for `cy hub start`, `status`, `stop`, `restart`, plus new `list` and `kill` commands.
- [ ] Runtime/dashboard APIs for reading and terminating hub instances.
- [ ] Dashboard UI that distinguishes connected clients from hub process instances.
- [ ] Tests and documentation for the new behavior.

### Out of Scope

- [ ] Remote/shared hub hosting.
- [ ] Authentication redesign for the local dashboard.
- [ ] Replacing the existing workspace/project registry.
- [ ] Full `cy doctor` cleanup integration beyond any helpers needed by the hub commands.

## Approach

Introduce an app-global hub registry under the Changeyard app state root. Use it as the source of truth for managed hub instances, probe records before reuse, prune stale entries, and keep the default host/port as a singleton endpoint. Preserve explicit alternate host/port support by recording additional instances separately. Surface the same registry through CLI commands and runtime APIs used by the dashboard.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- The default Changeyard hub endpoint MUST be managed as a single app-global instance.
- Starting or ensuring the default hub MUST reuse an existing live default instance, even when invoked from another project.
- Users MUST be able to list known hub instances from the CLI, including pid, URL, liveness, active status, start source, project root, start time, and log path.
- Users MUST be able to terminate a known hub instance from the CLI by pid or registry id.
- The dashboard MUST show which hub instance is serving the current page.
- The dashboard MUST list other known hub instances and provide a kill action.
- Stale registry entries MUST be identified and removed or marked stale during status/list/start operations.

## MODIFIED Requirements

- `cy hub status` MUST report the global active instance instead of only the current repository's record.
- `cy hub stop` MUST stop the global active default instance unless the user specifies another target.
- Hub state MUST no longer be written as the primary record under per-repository app state.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Add hub registry helpers near the existing hub command implementation, using app-state helpers for global storage. Update `ensureHubServer`, `runHubStart`, `runHubStatus`, `runHubStop`, and `runHubRestart` to read/write the global registry and probe candidate processes. Add command parsing for `hub list` and `hub kill`. Add runtime API methods that reuse the same hub registry helpers. Extend the dashboard to render process instances separately from connected runtime clients.

## Architecture Decisions

- The default endpoint is a singleton because normal user flows should share one runtime.
- Explicit alternate host/port starts are allowed and tracked as separate instances to preserve development/debug workflows.
- Registry state is process metadata only; project switching remains owned by the existing workspace registry.
- Dashboard kill operations call server-side APIs; the browser never sends raw OS signals directly.

## Data / State Impact

- Adds app-global hub registry files under the Changeyard app state root.
- Existing per-repo hub records are treated as legacy inputs for status/cleanup but are not the primary write target.
- Hub instance records include process metadata such as pid, URL, host, port, source command, repo root, log path, and timestamps.

## Workspace / Provider Impact

No provider changes are expected. This change uses a standard Changeyard workspace and updates local CLI/runtime behavior only.

## Risks

- Race conditions during startup: mitigate with a global startup lock or atomic registry update.
- Killing unrelated processes: only kill processes that are known from registry records or explicitly targeted by pid after liveness checks.
- Dashboard killing its own serving process: require an explicit action and ensure stale registry cleanup remains available from CLI.
- Project routing on reused hubs: keep this scoped to ensuring the runtime can see the requested project without replacing workspace registry ownership.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [ ] Add global registry helpers
- [ ] Update CLI lifecycle commands
- [ ] Add runtime APIs
- [ ] Update dashboard UI
- [ ] Update docs and tests

## 3. Verification

- [ ] Run automated tests
- [ ] Run focused hub CLI smoke checks
- [ ] Record results
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `npm test -- --runInBand` or the repository's closest focused test command if the full suite is too broad.
- Focused tests for hub CLI behavior.
- Manual smoke checks for `cy hub status`, `cy hub list`, and stale registry handling.

## Manual Scenarios

- Start the hub from one project and ensure a second project reuses the same default instance.
- Start an alternate port and confirm it appears as a separate known instance.
- Kill a stale or alternate instance and confirm list/status update.
- Open the dashboard and verify the current serving instance is clearly marked.

## Result

_Not run yet._
<!-- cy:verification:end -->

<!-- cy:clarifications:start -->
# Clarifications

## Session YYYY-MM-DD

- Q: Should default hub ownership be per project or app-global?
  A: App-global by default; additional instances are only expected when explicitly started on a different endpoint.
<!-- cy:clarifications:end -->

<!-- cy:requirements-checklist:start -->
# Requirements Checklist

- [x] Requirements are testable.
- [x] Success criteria are measurable.
- [x] Edge cases are documented.
- [x] Scope boundaries are explicit.
- [x] Implementation details are not mixed into behavior requirements.
<!-- cy:requirements-checklist:end -->

<!-- cy:analysis:start -->
# Consistency Analysis

## Findings

| ID | Severity | Summary | Recommendation | Status |
|----|----------|---------|----------------|--------|
| A1 | Medium | Existing README describes a shared local UI/runtime process, but implementation writes per-repo hub state. | Align implementation with documented shared-hub behavior. | Accepted |
| A2 | Medium | Dashboard currently tracks connected clients, not OS hub process instances. | Add a separate hub instance view and avoid conflating process instances with websocket clients. | Accepted |

## Gate Result

Ready for validation.
<!-- cy:analysis:end -->

# Acceptance Criteria
- [ ] Default hub start/ensure reuses one live app-global instance across projects.
- [ ] Explicit alternate endpoint starts are tracked as separate instances.
- [ ] `cy hub list` shows live/stale instances with pid, URL, active marker, source, repo root, start time, and log path.
- [ ] `cy hub kill` can terminate a known instance and update/prune registry state.
- [ ] Dashboard shows the current serving instance and other known instances with kill controls.
- [ ] Existing hub start/status/stop/restart tests are updated and passing.
- [ ] Hub CLI docs describe global instance behavior and cleanup commands.

# Agent Plan

1. Validate this planned change and start the isolated workspace.
2. Inspect the verified workspace for current hub, runtime API, and dashboard contracts.
3. Implement global hub registry helpers and migrate CLI lifecycle behavior.
4. Add runtime API endpoints and dashboard rendering/actions for instances.
5. Update tests and docs.
6. Run focused verification, update completion notes, and complete the Changeyard change locally.

# Completion Notes

_Not started._
