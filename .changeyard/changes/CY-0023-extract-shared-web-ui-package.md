---
id: CY-0023
title: Extract shared web UI package
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-17T22:25:40.754Z
updatedAt: 2026-06-17T22:54:05.353Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0023
  path: .changeyard/workspaces/CY-0023/repo
branch:
  name: cy/CY-0023-extract-shared-web-ui-package
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-17T22:44:32.580Z
  lastStatus: passed
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
mergedAt: 2026-06-17T22:54:05.352Z
---

# Summary

Extract the first shared React UI package used by kanban and VCS, centered on common primitives, file-tree utilities, Material file icons, and a shared file listing component.

# Motivation

Kanban and VCS now carry duplicate UI primitives and very similar file-list behavior. A shared package reduces drift, makes future file-list changes cheaper, and gives both apps one implementation for list, folder, and package modes.

# Plan

- [x] Create `packages/web-ui` as `@changeyard/web-ui` and add it to the pnpm workspace.
- [x] Move core shared primitives, file icon, clipboard, and file-tree utilities into the package.
- [x] Add a shared `FileListing` component with list, tree, and package modes plus folder expand/collapse.
- [x] Refactor kanban and VCS to consume the shared package while keeping app-specific wrappers for persistence, routing, and selection semantics.
- [x] Add package, kanban, and VCS tests for the shared file-list behavior.

<!-- cy:proposal:start -->
# Proposal

## Intent

Introduce `@changeyard/web-ui` as the shared home for reusable web UI primitives and file-list behavior used by both `@kanban/web` and `@changeyard/vcs`.

## Scope

### In Scope

- [x] New workspace package at `packages/web-ui`.
- [x] Shared primitives and utilities: `cn`, `button`, `dialog`, `spinner`, `kbd`, `link`, `native-select`, `path-display`, `file-type-icon`, `cline-icon`, `clipboard`, and file-tree helpers.
- [x] Shared `FileListing` component supporting flat list, full folder tree, and package tree with compacted empty directory chains.
- [x] Folder expand/collapse behavior for tree and package modes.
- [x] Shared CSS export as `@changeyard/web-ui/styles.css` while retaining existing `kb-*` class names.
- [x] Kanban and VCS dependency/import updates to consume shared exports.
- [x] Focused tests and typechecks for the new shared package and refactored file-list consumers.

### Out of Scope

- [ ] Moving kanban or VCS app shells, routing, API clients, stores, project navigation, or project dialogs.
- [ ] Moving larger candidates such as `diff-renderer`, `markdown-message-editor`, `directory-autocomplete`, `open-workspace-button`, `app-toaster`, or `status-chip`.
- [ ] Renaming existing CSS class families away from `kb-*`.
- [ ] Changing file-list product behavior beyond preserving the existing three view modes and adding shared folder expand/collapse where file trees are rendered.

## Approach

Build the shared package as a small TypeScript/React workspace package. Move identical or near-identical low-level modules first, then add a shared `FileListing` API that accepts file paths plus render slots for app-specific row details. Refactor kanban and VCS file-list surfaces through thin local wrappers so persistence and domain-specific status behavior remain in each app.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- `@changeyard/web-ui` SHALL expose reusable React UI primitives and utility exports for kanban and VCS.
- `@changeyard/web-ui` SHALL expose `FileListing` with view modes `list`, `tree`, and `package`.
- In package mode, directory chains SHALL compact while a directory has exactly one directory child and no direct file children.
- Folder rows in tree and package modes SHALL support expand/collapse without changing selection behavior for file rows.
- File rows rendered through the shared component SHALL use Material file icons based on file extension.

## MODIFIED Requirements

- Kanban and VCS file-list surfaces SHALL consume the shared primitives, icons, file-tree helpers, and file-list component where their behavior matches the shared API.
- Kanban and VCS SHALL keep their existing mode persistence and app-specific row metadata behavior.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Create `packages/web-ui` with its own package manifest, TypeScript config, source entrypoint, shared CSS entrypoint, and Vitest setup. Export primitives from individual modules and aggregate them from `src/index.ts`. Keep file-tree data construction pure and covered by package tests. Implement `FileListing` as a controlled component that receives files, mode, selected path, expanded folder state, and optional render slots for app-specific status/diff content.

## Architecture Decisions

- Use package path `packages/web-ui` and package name `@changeyard/web-ui`.
- Keep the first extraction narrow: only core primitives and file-list behavior move now.
- Keep `kb-*` CSS class names initially to avoid a broad style migration.
- Keep app-specific wrappers in kanban and VCS to avoid coupling the shared package to app state or routing.

## Data / State Impact

No persisted data schema changes. Existing file-view preferences remain owned by kanban and VCS. Shared expand/collapse state is controlled by the consuming app or wrapper.

## Workspace / Provider Impact

The implementation must happen only inside the Changeyard workspace created for `CY-0023`. The provider is `noop`, so no remote issue or PR sync is expected.

## Risks

- Risk: import-path churn causes circular dependencies. Mitigation: keep `@changeyard/web-ui` free of app imports and use wrapper components in app packages.
- Risk: CSS ordering differences change appearance. Mitigation: expose one shared CSS file and import it before app-specific globals.
- Risk: file-list behavior regresses during extraction. Mitigation: add package tests plus focused kanban and VCS tests around list/tree/package behavior.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm package location, migration scope, and CSS strategy.
- [x] Confirm the implementation must use the Changeyard workflow.

## 2. Implementation

- [x] Add `packages/web-ui` and workspace/package wiring.
- [x] Move shared primitives, utilities, CSS, Material file icon support, and file-tree helpers.
- [x] Implement shared `FileListing` with list/tree/package modes and folder expand/collapse.
- [x] Refactor kanban file-list consumers through local wrappers.
- [x] Refactor VCS file-list consumers through local wrappers.
- [x] Update package manifests and lockfile as needed.

## 3. Verification

- [x] Run shared package typecheck and tests.
- [x] Run kanban typecheck and relevant file-list tests.
- [x] Run VCS typecheck and relevant file-list tests.
- [x] Run root TypeScript check if available.
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm --dir packages/web-ui run typecheck`
- `pnpm --dir packages/web-ui test`
- `pnpm --dir packages/kanban/web-ui run typecheck`
- Relevant kanban Vitest files for file tree, changeyard board, review modal, and git diff panel.
- `pnpm --dir packages/vcs run typecheck`
- Relevant VCS file-list tests.
- Root TypeScript check if available in package scripts.

## Manual Scenarios

- In kanban, verify file-list surfaces render Material file icons and support list, folder, and package modes.
- In VCS, verify working-copy and inline file lists render Material file icons and support list, folder, and package modes.
- Verify package mode compacts `a/b/c.txt` as `a/b` when `a` has no direct file siblings, but does not compact `a` when `a/x.ts` also exists.
- Verify folder expand/collapse preserves selected file behavior.

## Result

- `pnpm --dir packages/web-ui run typecheck` passed.
- `pnpm --dir packages/web-ui test` passed: 2 files, 7 tests.
- `pnpm --dir packages/kanban/web-ui run typecheck` passed.
- `pnpm --dir packages/kanban/web-ui exec vitest run src/components/detail-panels/file-tree-panel.test.tsx src/components/changeyard/change-board.test.tsx src/components/changeyard/change-review-modal.test.tsx src/components/git-history/git-commit-diff-panel.test.tsx` passed: 4 files, 32 tests.
- `pnpm --dir packages/vcs run typecheck` passed.
- `pnpm --dir packages/vcs test` passed: 73 tests.
- `pnpm exec tsc --noEmit` passed.
<!-- cy:verification:end -->

<!-- cy:clarifications:start -->
# Clarifications

## Session 2026-06-17

- Q: Where should the shared package live?
  A: Use `packages/web-ui`.
- Q: How broad should the first migration be?
  A: Move core primitives and file-list behavior first; leave larger app-aware components for later changes.
- Q: How should shared styling be exposed?
  A: Use a shared CSS import from `@changeyard/web-ui/styles.css` and keep current `kb-*` classes initially.
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
| CA-001 | low | Shared package extraction changes imports in two apps and can create accidental app-to-package dependencies. | Keep `@changeyard/web-ui` pure and app-agnostic; use app wrappers for state and routing. | accepted |
| CA-002 | low | Shared CSS ordering can subtly affect visual output. | Import shared CSS before app-specific globals and preserve existing class names. | accepted |

## Gate Result

Pass. No unresolved consistency blockers identified.
<!-- cy:analysis:end -->

# Acceptance Criteria
- [x] `packages/web-ui` exists, is part of the pnpm workspace, and exposes `@changeyard/web-ui` plus `@changeyard/web-ui/styles.css`.
- [x] Kanban and VCS depend on `@changeyard/web-ui` and no longer maintain duplicate implementations for the moved primitives, Material file icon, clipboard helper, or file-tree helpers.
- [x] Kanban and VCS file-list surfaces use the shared `FileListing` path or a thin wrapper around it.
- [x] Shared `FileListing` supports list, tree, and package modes with Material file icons and folder expand/collapse.
- [x] Package compaction behavior is covered by tests for the simple compact case, mixed direct-file sibling case, and stable sibling ordering.
- [x] The expected package, kanban, and VCS checks are run and recorded in Completion Notes.

# Agent Plan

1. Validate this change file and sync the noop provider gate.
2. Start and verify the `CY-0023` workspace.
3. Implement the shared package and refactor consumers only in the verified workspace.
4. Run the focused typechecks/tests and record exact results.
5. Update Completion Notes and complete the change locally with `--no-pr`.

# Completion Notes

Implemented `packages/web-ui` as `@changeyard/web-ui` with shared primitive exports, Material file icons, clipboard and file-tree utilities, `FileListing`, `FileListingViewModeToggle`, package tests, and `@changeyard/web-ui/styles.css`.

Updated kanban and VCS manifests, workspace configuration, lockfile, and app entrypoints to consume the shared package and stylesheet. Replaced duplicate local primitive/helper implementations in both apps with compatibility re-exports from `@changeyard/web-ui`.

Refactored kanban `FileTreePanel`, kanban changeyard board file lists, VCS inline file sections, and the VCS JJ board working-copy file list to use shared `FileListing` while keeping app-specific status glyphs, diff stats, conflict markers, drag behavior, selection, and persistence in local wrappers.

Verification passed:
- `pnpm --dir packages/web-ui run typecheck`
- `pnpm --dir packages/web-ui test`
- `pnpm --dir packages/kanban/web-ui run typecheck`
- `pnpm --dir packages/kanban/web-ui exec vitest run src/components/detail-panels/file-tree-panel.test.tsx src/components/changeyard/change-board.test.tsx src/components/changeyard/change-review-modal.test.tsx src/components/git-history/git-commit-diff-panel.test.tsx`
- `pnpm --dir packages/vcs run typecheck`
- `pnpm --dir packages/vcs test`
- `pnpm exec tsc --noEmit`

Residual risk: the shared stylesheet is imported before app globals and keeps existing `kb-*` names, so visual behavior should remain stable, but a quick browser smoke pass is still useful before landing because the refactor touches dense file-list UI.
