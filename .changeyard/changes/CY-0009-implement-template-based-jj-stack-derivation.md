---
id: CY-0009
title: Implement template-based JJ stack derivation
type: agent-task
status: approved
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-12T17:42:11.694Z
updatedAt: 2026-06-18T14:56:00.068Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0009
  path: .changeyard/workspaces/CY-0009/repo
branch:
  name: cy/CY-0009-implement-template-based-jj-stack-derivation
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-12T17:57:10.095Z
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

Replace the current per-bookmark JJ stack lane derivation with a bounded, template-based stack derivation that emits canonical grouped stacks.

# Motivation

The current implementation runs a graph query per bookmark and treats every bookmark as its own lane. Large repositories or repositories with many related bookmarks can repeat expensive ancestry walks and do not present dependent bookmarks as one stack. A single bounded JJ template read plus in-memory grouping better matches JJ's visible graph model and the intended GitButler-style stack semantics.

# Plan

- [x] Replace lane-based state with canonical stack-based state.
- [x] Read the bounded JJ work graph with templates instead of parsing ASCII graph output.
- [x] Group dependent bookmarks into top-level stacks and migrate submit/UI consumers.
- [x] Cover derivation, state loading, submit planning, and UI behavior with focused tests.

<!-- cy:proposal:start -->
# Proposal

## Intent

Derive JJ stacks from local bookmarks and commit ancestry using JJ template output, avoiding repeated per-bookmark graph walks and replacing `lanes` with `stacks` in the VCS state API.

## Scope

### In Scope

- [ ] `src/vcs` JJ read model, graph derivation, state types, and submit planning.
- [ ] Runtime tRPC schemas for `vcs.jjState`.
- [ ] Standalone VCS UI rendering and client types.
- [ ] Focused backend/frontend tests and full regression checks.

### Out of Scope

- [ ] Parsing JJ ASCII graph output.
- [ ] Persisting stack state.
- [ ] Changing JJ mutation command semantics beyond consuming the new stack shape.
- [ ] Non-GitHub submit provider expansion.

## Approach

Load local candidate bookmarks, read the relevant JJ work graph with one bounded template query, build change/bookmark indexes in memory, identify top-level bookmarks, and emit one stack per top-level bookmark with ordered heads and actionable changes.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- `vcs.jjState` MUST expose `stacks` as the canonical JJ stack collection.
- Each stack MUST include top-most id, tip commit id, base ref, stable order, checkout status, ordered heads, and root-to-tip changes.
- JJ stack derivation MUST use parser-friendly template output, not ASCII graph parsing.

## MODIFIED Requirements

- Dependent active bookmarks MUST derive as one multi-head stack instead of independent lanes.
- `submitStackPreview` and `submitStack` MUST resolve any bookmark inside a stack to that containing stack.
- The VCS board MUST render `stacks` instead of `lanes`.

## REMOVED Requirements

- `lanes` is removed from the VCS JJ state API; no compatibility shim is required.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Replace `buildJjStackLanes` with stack derivation helpers. Extend JJ read helpers to read the bounded graph once with a delimited template. Update state assembly, runtime schemas, frontend types/UI, and submit planning to use `stacks`.

## Architecture Decisions

- Keep JJ CLI interaction argv-based and template-based.
- Keep merge handling conservative by following the primary parent for change ordering and surfacing diagnostics.
- Prefer one bounded graph read for normal repositories; batch only when candidate bookmark volume risks command length.

## Data / State Impact

The runtime response for `vcs.jjState` changes from `lanes` to `stacks`. No persisted state or migrations are required.

## Workspace / Provider Impact

Work remains behind the existing `CHANGEYARD_VCS=1` VCS surface and uses the existing tRPC/runtime bridge. GitHub submit remains provider-gated as before.

## Risks

- Risk: stack grouping changes submit plan order. Mitigation: add focused submit preview tests.
- Risk: template parsing differs across JJ versions. Mitigation: keep templates simple and malformed row handling diagnostic-only.
- Risk: API breakage in UI/runtime schemas. Mitigation: typecheck and focused VCS UI tests.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Replace backend stack derivation and state shape
- [x] Migrate submit planner
- [x] Migrate runtime schemas and VCS UI

## 3. Verification

- [x] Run focused VCS JJ tests
- [x] Run VCS frontend tests
- [x] Run full test suite
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `node --test dist/tests/vcs-jj-graph.test.js dist/tests/vcs-jj-state.test.js dist/tests/vcs-jj-stack-submit.test.js`
- `pnpm --filter @changeyard/vcs run test`
- `pnpm test`

## Manual Scenarios

- JJ board shows grouped stacks for dependent bookmarks.
- Submit preview opened from an inner bookmark resolves to its containing stack.

## Result

- Passed: `node --test --import tsx tests/vcs-jj-graph.test.ts tests/vcs-jj-read.test.ts tests/vcs-jj-state.test.ts tests/vcs-jj-stack-submit.test.ts`
- Passed: `node --test --import tsx tests/vcs-jj-preview.test.ts tests/vcs-jj-apply.test.ts`
- Passed: `pnpm --filter @changeyard/vcs run test`
- Passed: `pnpm test` (183 tests)
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] `vcs.jjState` exposes `stacks` and no longer exposes `lanes`.
- [x] Dependent bookmarks derive into one multi-head stack ordered newest-to-oldest.
- [x] JJ state loading uses bounded template graph reads rather than one graph read per bookmark.
- [x] Submit preview and submit use ordered stack heads.
- [x] VCS board renders stack heads and actionable changes from `stacks`.
- [x] Focused and full regression checks pass or failures are documented.

# Scope Boundaries

## In scope

- `src/vcs/**`
- `packages/vcs/**`
- VCS runtime schemas and tRPC boundary under `packages/kanban/src/runtime-stack/**`
- VCS-focused tests under `tests/**`

## Out of scope

- Unrelated requests, opportunistic refactors, and formatting-only edits outside touched files.

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

1. Update shared VCS types and runtime schemas from lane-based to stack-based state.
2. Implement template-based bounded JJ graph loading and in-memory stack derivation.
3. Migrate `loadJjState`, submit planning, and VCS UI rendering to `stacks`.
4. Update/add derivation, state, submit, and frontend tests.
5. Build and test the changed surface, then record verification results.

# Completion Notes

Implemented canonical template-based JJ stack derivation. `vcs.jjState` now exposes `stacks`, the read model uses bounded template graph reads with batching and malformed-row diagnostics, dependent bookmarks group into multi-head stacks, stacked PR submit resolves through stack heads, and the VCS board renders stack head chains plus actionable changes.

Verification passed with focused JJ/VCS tests, the VCS frontend test suite, and full `pnpm test` after installing the workspace lockfile dependencies with `pnpm install --frozen-lockfile` and `pnpm install --frozen-lockfile --prefix packages/kanban/web-ui`.

Remaining risk: merge-heavy graphs still follow primary-parent ordering for actionable changes and emit diagnostics, as planned.
