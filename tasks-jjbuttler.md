# TASKS: JJ VCS Feature

Date: 2026-06-11

Objective: Implement the JJ-first VCS feature described in `PLAN.md` and `changeyard-jjbuttler.md` while preserving existing Changeyard Kanban, TUI, CLI, workspace, provider, and markdown-backed change behavior.

## Tracker Rules

- `TASKS.md` is the live execution tracker for the JJ VCS feature.
- Keep milestone status current as work lands.
- Keep completed work checked off and pending work explicit.
- Keep the VCS feature behind `CHANGEYARD_VCS=1` until it is intentionally promoted.
- Use tRPC for runtime APIs.
- Vendor/adapt the useful `keanemind/jj-stack` core implementation; do not require a `jst` install.
- Do not make `packages/kanban` depend on `packages/vcs`.

## Current Status

- [x] Implementation direction selected: JJ-first VCS, feature-flagged, tRPC-backed
- [x] Decision locked: no external `jj-stack`/`jst` install required
- [x] Decision locked: vendor/adapt useful `keanemind/jj-stack` core code with MIT attribution
- [x] `PLAN.md` reset for JJ VCS implementation
- [x] `TASKS.md` reset for JJ VCS implementation
- [x] Baseline build/test results captured
- [x] Product code implementation started
- [x] JJ VCS implementation completed and verified

Current focus: ready for review and follow-up iteration on defects or polish only.

## M0: Baseline And Repo Analysis

Status: `completed`

- [x] Run `npm run build`
- [x] Run `npm test`
- [x] Run `npm run check:tui`
- [x] Run `npm pack --dry-run`
- [x] Confirm package manager and workspace scripts
- [x] Confirm tRPC runtime integration points
- [x] Confirm frontend package/build integration points
- [x] Confirm existing JJ/git helpers and provider abstractions
- [x] Confirm feature flag integration point for `CHANGEYARD_VCS=1`
- [x] Record implementation deviations in `PLAN.md`

Acceptance checks:

- [x] Baseline status is documented before product code changes
- [x] Existing app behavior is understood before adding VCS code

## M1: Feature-Flagged VCS Shell

Status: `completed`

- [x] Create `packages/vcs`
- [x] Add React/Vite/TypeScript setup matching existing web UI conventions
- [x] Add package build/typecheck scripts
- [x] Add root build script integration
- [x] Add `/vcs` route behind `CHANGEYARD_VCS=1`
- [x] Add `/vcs/jj` placeholder behind `CHANGEYARD_VCS=1`
- [x] Render static VCS landing placeholder
- [x] Render static JJ stack board placeholder
- [x] Verify existing Kanban route still loads when the feature flag is off

Acceptance checks:

- [x] Feature flag off preserves existing UI behavior
- [x] Feature flag on exposes `/vcs` and `/vcs/jj`
- [x] No JJ commands execute in this milestone

Verification notes:

- [x] `npm run build`
- [x] `node --test dist/tests/ui-server.test.js`
- [x] `npm pack --dry-run`

## M2: tRPC VCS Detection

Status: `completed`

- [x] Add `src/vcs/types.ts`
- [x] Add `src/vcs/adapter.ts`
- [x] Add `src/vcs/process.ts` with argv-based command execution
- [x] Add `src/vcs/detect.ts`
- [x] Add read-only JJ detection helpers
- [x] Add runtime API contract schemas/types for VCS detection
- [x] Add tRPC `vcs.detect` procedure
- [x] Wire detection through `createChangeyardUiApi()`
- [x] Render detection result on `/vcs`
- [x] Add detection tests
- [x] Add command runner tests

Acceptance checks:

- [x] Non-repo, Git repo, and JJ repo states are handled gracefully
- [x] JJ root/version/remote/provider/base diagnostics are surfaced when available
- [x] No mutation commands exist

Verification notes:

- [x] `npm run build`
- [x] `node --test dist/tests/vcs-detect.test.js`
- [x] `node --test dist/tests/ui-server.test.js`
- [x] `npm pack --dry-run`

## M3: JJ Read Model And Stack Graph

Status: `completed`

- [x] Add parser-friendly JJ command wrappers
- [x] Add JJ log/bookmark/status parsing fixtures
- [x] Adapt `jj-stack` graph construction for Changeyard domain models
- [x] Add adapted `jj-stack` graph tests using `node:test`
- [x] Add base/trunk resolution
- [x] Add `vcs.jjState`
- [x] Add `vcs.jjDiff`
- [x] Render read-only stack lanes
- [x] Render branch segments
- [x] Render change/commit cards
- [x] Render unassigned working-copy changes
- [x] Render diagnostics for ambiguous/divergent/conflicted states
- [x] Render diff drawer

Acceptance checks:

- [x] Sample JJ state maps to stack lanes correctly
- [x] Change cards show title, change ID, commit ID, files, and warnings
- [x] UI remains read-only

Verification notes:

- [x] `npm run build`
- [x] `node --test dist/tests/vcs-detect.test.js dist/tests/vcs-jj-diff.test.js dist/tests/vcs-jj-graph.test.js dist/tests/vcs-jj-state.test.js`
- [x] `npm test`

## M4: Preview-Only UI Interactions

Status: `completed`

- [x] Add stack board interaction components
- [x] Add detail drawer interactions
- [x] Add drag/drop affordances
- [x] Add keyboard/menu equivalents for drag/drop actions
- [x] Add operation preview dialog
- [x] Add operation validation
- [x] Add tRPC `vcs.previewOperation`
- [x] Return command argv, affected refs, risk level, and warnings
- [x] Reject invalid drops before preview
- [x] Add frontend tests for preview flow
- [x] Add backend preview validation tests

Acceptance checks:

- [x] Drag/drop and keyboard/menu actions open preview only
- [x] Preview does not mutate repository state
- [x] Invalid operations show actionable diagnostics

Verification notes:

- [x] `npm run build`
- [x] `node --test dist/tests/vcs-detect.test.js dist/tests/vcs-jj-diff.test.js dist/tests/vcs-jj-graph.test.js dist/tests/vcs-jj-preview.test.js dist/tests/vcs-jj-state.test.js`
- [x] `npm --workspace @changeyard/vcs run test`
- [x] `npm test`

## M5: Confirmed JJ Mutations

Status: `completed`

- [x] Add tRPC `vcs.applyOperation`
- [x] Implement edit message
- [x] Implement create bookmark
- [x] Implement create change before/after
- [x] Implement reorder change
- [x] Implement squash
- [x] Implement absorb selected files
- [x] Implement move bookmark/branch
- [x] Implement abandon change
- [x] Implement restore file
- [x] Refresh state after every mutation
- [x] Capture operation result metadata
- [x] Show undo/restore affordance
- [x] Add temporary JJ repo integration tests where available

Acceptance checks:

- [x] Every mutation requires preview and confirmation
- [x] Failed commands show useful diagnostics without crashing UI
- [x] Repository state refreshes after success

Verification notes:

- [x] `npm run build`
- [x] `node --test dist/tests/vcs-jj-apply.test.js`
- [x] `node --test dist/tests/vcs-jj-preview.test.js dist/tests/vcs-jj-apply.test.js`
- [x] `node --test --test-name-pattern='vcs.applyOperation' dist/tests/ui-server.test.js`
- [x] `node --test --test-name-pattern='create_bookmark previews' dist/tests/ui-server.test.js`
- [x] `node --test --test-name-pattern='edit_message previews' dist/tests/ui-server.test.js`
- [x] `node --test --test-name-pattern='create_change previews' dist/tests/ui-server.test.js`
- [x] `node --test --test-name-pattern='move_bookmark previews' dist/tests/ui-server.test.js`
- [x] `node --test --test-name-pattern='abandon_change previews' dist/tests/ui-server.test.js`
- [x] `node --test --test-name-pattern='squash_change previews' dist/tests/ui-server.test.js`
- [x] `node --test --test-name-pattern='absorb_file previews' dist/tests/ui-server.test.js`
- [x] `node --test --test-name-pattern='restore_file previews' dist/tests/ui-server.test.js`
- [x] `node --test --test-name-pattern='undo_last previews|redo_last previews' dist/tests/ui-server.test.js`
- [x] `node --test dist/tests/vcs-jj-integration.test.js`
- [x] `npm --workspace @changeyard/vcs run test`
- [x] `npm test`

## M6: Vendored Stacked PR Publishing

Status: `completed`

- [x] Add vendored attribution/license notice for `keanemind/jj-stack`
- [x] Port/adapt bookmark discovery needed for submit planning
- [x] Reuse/adapt JJ bookmark discovery in submit planning
- [x] Port/adapt submission graph analysis
- [x] Port/adapt PR plan creation
- [x] Port/adapt existing PR lookup
- [x] Port/adapt PR base validation/update
- [x] Port/adapt PR creation
- [x] Port/adapt stack comment creation/update
- [x] Use Changeyard provider/auth config where possible
- [x] Add tRPC `vcs.submitStackPreview`
- [x] Add tRPC `vcs.submitStack`
- [x] Add mocked GitHub API tests for PR planning
- [x] Add tests for auth-disabled/provider-missing states
- [x] Add submit stack dialog
- [x] Add confirmed submit action in the JJ UI
- [x] Surface submit stack preview in the JJ UI

Acceptance checks:

- [x] No external `jst` binary is required
- [x] Submit is disabled unless GitHub provider/auth state is valid
- [x] Preview shows ordered PR plan before any push/create/update
- [x] Tokens and auth details are redacted from diagnostics

Verification notes:

- [x] `npm run build`
- [x] `node --test dist/tests/vcs-jj-stack-submit.test.js`
- [x] `node --test dist/tests/ui-server.test.js`
- [x] `node --test dist/tests/vcs-jj-stack-submit.test.js --test-name-pattern='submitJjStack|previewJjStackSubmit'`
- [x] `npm --workspace @changeyard/vcs run test`
- [x] `node --test dist/tests/ui-server.test.js --test-name-pattern='ui server exposes vcs.submitStack through the runtime tRPC boundary|ui server exposes vcs.submitStackPreview through the runtime tRPC boundary'`
- [x] `npm test`

## M7: Branches, History, And Settings

Status: `completed`

- [x] Add `/vcs/jj/branches`
- [x] Add bookmark search/filtering
- [x] Add bookmark action menu
- [x] Add `/vcs/jj/history`
- [x] Show JJ operation log
- [x] Add restore/revert confirmation UX
- [x] Add `/vcs/settings`
- [x] Add command path diagnostics
- [x] Add base/trunk configuration
- [x] Add safety preferences
- [x] Add experimental flags for risky operations

Acceptance checks:

- [x] Users can inspect bookmarks outside the main board
- [x] Users can inspect operations and restore after confirmation
- [x] Settings render through the VCS surface without touching Kanban markdown state

## M8: Docs, Hardening, And Final Verification

Status: `completed`

- [x] Add `docs/vcs-jj.md`
- [x] Add troubleshooting notes
- [x] Add empty states
- [x] Add loading states
- [x] Add error boundaries
- [x] Add no-JJ/no-remote/no-provider test states
- [x] Run accessibility pass
- [x] Run full build/test matrix
- [x] Smoke test default `cy ui`
- [x] Smoke test feature flag off
- [x] Smoke test feature flag on

Acceptance checks:

- [x] Existing Changeyard functionality is unaffected
- [x] `/vcs` is hidden or unavailable unless enabled
- [x] `/vcs/jj` handles errors clearly
- [x] Full verification passes or failures are documented

## Verification Notes

- `npm run build` passed.
- `node --test --test-force-exit dist/tests/ui-server.test.js` passed: 26 tests, 0 failures.
- `npm test` passed: 177 tests, 0 failures.
- `npm run check:tui` passed, including 12/12 TUI interaction tests.
- `npm pack --dry-run` passed; package dry-run produced `changeyard-0.1.0.tgz` metadata without writing a tracked tarball.
- `node --test --import tsx tests/changeyard.test.ts --test-name-pattern='hydrate copies allowlisted files and skips denied secrets'` passed.
- Live browser QA passed for `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings` against a flagged local server.
- Runtime shutdown cleanup now suppresses expected missing/non-repository workspace warnings, which removed the prior `ui-server.test` log flood.
