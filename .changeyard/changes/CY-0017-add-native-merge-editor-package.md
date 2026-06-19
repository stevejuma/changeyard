---
id: CY-0017
title: Add native merge editor package
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-16T22:07:08.954Z
updatedAt: 2026-06-18T15:50:57.744Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0017
  path: .changeyard/workspaces/CY-0017/repo
branch:
  name: cy/CY-0017-add-native-merge-editor-package
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-16T22:53:04.085Z
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
mergedAt: 2026-06-17T07:40:28.724Z
review:
  required: false
  waivedAt: 2026-06-18T15:50:57.744Z
  waivedBy: cy doctor
  waiverReason: Stale completed merged change older than 0 days had no review artifact.
---

# Summary

Add a native merge editor package to Changeyard and wire it into the VCS conflict UI. The package should expose pure framework-free merge/diff state helpers plus React components, without depending on Svelte or MergeWeave web components.

# Motivation

Changeyard already surfaces Git and JJ conflicts, but the app only shows conflict state and unified diffs. Users need an in-app merge editor for current workspace conflicts, while conflicted historical commits should be inspectable without requiring Svelte in the React VCS app.

# Plan

- [x] Port the useful MergeWeave diff/merge model into a new `@changeyard/merge` package with attribution.
- [x] Add React wrapper components and token-based CSS under the same package.
- [x] Extend the VCS runtime contract and providers to load conflict file sides and resolve current workspace conflicts.
- [x] Render conflicted workspace files with the merge editor and save resolved center content.
- [x] Render historical conflicted commits read-only in the same merge editor surface.
- [x] Add package, backend, and targeted VCS UI tests.

<!-- cy:proposal:start -->
# Proposal

## Intent

Provide a native Changeyard merge editor that can be used from the React VCS app without importing Svelte, while keeping the merge model reusable outside React.

## Scope

### In Scope

- [x] New `packages/merge` workspace package exposed as `@changeyard/merge`.
- [x] Pure merge/diff APIs, React components, package CSS, and tests.
- [x] VCS runtime endpoints for loading conflict file content and resolving current workspace conflicts.
- [x] Git workspace conflict read/save support.
- [x] JJ workspace and conflicted commit read support using JJ conflict marker parsing.
- [x] JJ current workspace conflict save support by writing resolved file content and verifying the conflict path disappears.
- [x] VCS UI integration for conflicted file rows and commit conflict rows.

### Out of Scope

- [ ] Rewriting non-current conflicted commits from the merge editor.
- [ ] Importing Svelte, Svelte custom elements, or the existing MergeWeave React adapter.
- [ ] Replacing the existing read-only unified diff renderer for non-conflicted files.
- [ ] Publishing the package outside this monorepo.

## Approach

Create a framework-free merge model first, then build React components over that state model. Connect VCS conflict rows through RTK Query so the UI reads conflict-side content through the data layer and saves only current workspace resolutions.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- The repository SHALL include a `packages/merge` workspace package named `@changeyard/merge`.
- `@changeyard/merge` SHALL expose pure TypeScript APIs at `.` and React components at `./react`.
- `@changeyard/merge/styles.css` SHALL style the React components using Changeyard theme tokens.
- The VCS runtime SHALL expose conflict-file loading and current-workspace conflict resolution operations.
- Git conflict loading SHALL read base, ours, and theirs from index stages.
- Git conflict save SHALL write resolved content and stage the path.
- JJ conflict loading SHALL parse JJ conflict marker output from `jj file show`.
- JJ current workspace conflict save SHALL write resolved content and verify the path is no longer listed by `jj resolve --list`.
- VCS conflicted workspace file rows SHALL open a merge editor with save controls.
- VCS conflicted historical commit rows SHALL open a read-only merge editor.

## MODIFIED Requirements

- The VCS diff/details column SHALL render merge-editor content for conflict file selections instead of only a unified diff when three-way conflict data is available.
- VCS cache invalidation SHALL refresh workspace state, diffs, commit changes, and conflict-file reads after a current workspace conflict is saved.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Port MergeWeave's line diffing, block assembly, modified-line overlays, side metadata, conflict resolution state, and merge actions into plain TypeScript data structures. Build React components that render the assembled blocks in two or three panes and call pure actions instead of relying on DOM queries.

## Architecture Decisions

- Use one package with subpath exports rather than separate pure and React packages.
- Use Changeyard-native CSS classes and design tokens instead of upstream styles.
- Keep historical conflicted commits read-only to avoid adding commit rewrite flows in this change.
- Attribute the adapted MIT upstream code using the repo's existing vendor attribution pattern.

## Data / State Impact

Add TypeScript contract types for conflict-file reads and saves. No persisted schema or user configuration changes are required.

## Workspace / Provider Impact

Git and JJ workspace engines gain conflict-file methods. Git uses index stages for content and `git add` for save. JJ uses `jj file show`/marker parsing for reads and writes resolved workspace files for current-workspace saves.

## Risks

- Risk: JJ conflict marker parsing may not cover every conflict shape. Mitigation: support the fixture-backed 2-sided format first and surface unsupported marker shapes as diagnostics instead of corrupting files.
- Risk: merge-model identity can become unstable after edits. Mitigation: base actions on deterministic block ids generated from block order and content.
- Risk: UI integration can disturb existing diff workflows. Mitigation: route only conflict selections to the merge editor and leave normal diff rendering unchanged.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Create and validate `CY-0017`.
- [x] Start and verify the isolated Changeyard workspace.

## 2. Implementation

- [x] Add `packages/merge` package metadata, TypeScript config, exports, CSS, and tests.
- [x] Implement pure merge/diff model and React components.
- [x] Add VCS runtime contract, provider methods, RTK Query endpoints, and UI wiring.
- [x] Add attribution for adapted MergeWeave code.

## 3. Verification

- [x] Run package tests and typecheck.
- [x] Run VCS backend tests and VCS typecheck.
- [x] Run targeted Playwright conflict coverage.
- [x] Run full build before completion.
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm --filter @changeyard/merge run typecheck`
- `pnpm --filter @changeyard/merge run test`
- `pnpm --filter @changeyard/vcs run typecheck`
- `pnpm --filter @changeyard/vcs run test`
- `pnpm --filter @changeyard/vcs run e2e -- --grep "conflict"`
- `pnpm run build`

## Manual Scenarios

- Open a JJ workspace conflict fixture, select the conflicted file, accept one side, save, and confirm the conflict state refreshes.
- Open a historical conflicted commit and confirm the merge editor is read-only.
- Select non-conflicted files and confirm existing unified diff behavior is unchanged.

## Result

Passed:

- `pnpm --filter @changeyard/merge run typecheck`
- `pnpm --filter @changeyard/merge run test`
- `pnpm --filter @changeyard/vcs run typecheck`
- `pnpm --filter @changeyard/vcs run test`
- `node --test dist/tests/vcs-git-workspace.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-jj-conflict-parser.test.js`
- `pnpm --filter @changeyard/vcs exec playwright test tests/vcs-jj-fixture.spec.ts --grep "renders workspace and commit conflict scenarios"`
- `pnpm run build`

The broader `pnpm --filter @changeyard/vcs run e2e -- --grep "conflict"` form was covered with the targeted JJ conflict fixture spec above, because the conflict coverage added in this change lives in that scenario test.
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] `packages/merge` exists, builds, and exports pure APIs, React APIs, and CSS as planned.
- [x] Merge package tests cover one-way diff, three-way diff, overlays, whitespace/case options, merge actions, resolved state, and serialization.
- [x] VCS runtime can load conflict file sides for Git and JJ.
- [x] VCS runtime can save current workspace conflict resolutions for Git and JJ.
- [x] VCS UI opens conflicted workspace files in the merge editor with save controls.
- [x] VCS UI opens historical conflicted commits in read-only merge mode.
- [x] No Svelte dependency or Svelte custom element is introduced into Changeyard.
- [x] MergeWeave attribution is recorded.
- [x] Validation commands from the Verification section have been run or documented with blockers.

# Agent Plan

Follow the Changeyard gate sequence first. After `cy verify CY-0017` passes in the workspace checkout, implement the package, provider/runtime APIs, UI integration, and tests entirely inside that verified workspace. Keep the implementation scoped to conflict-editor behavior and leave ordinary diff rendering untouched.

# Completion Notes

Implemented a new `@changeyard/merge` workspace package with framework-free merge assembly/actions, React two-pane and three-pane editors, Changeyard-token CSS, tests, and MergeWeave MIT attribution. Extended VCS contracts, tRPC, RTK Query, Git/JJ provider methods, and the VCS UI so current workspace conflicts can be loaded, resolved, and saved, while conflicted historical commits open the same editor read-only.

Validation passed with the package checks, VCS typecheck/tests, compiled Git/JJ conflict provider tests, the targeted JJ Playwright conflict scenario, and `pnpm run build`.

Remaining risk: JJ conflict parsing intentionally targets the fixture-backed marker shape in this change and reports diagnostics for unsupported conflict marker shapes rather than attempting an unsafe parse.
