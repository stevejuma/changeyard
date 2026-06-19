---
id: CY-0025
title: Fix Kanban theme contrast and selected states
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-18T15:04:18.175Z
updatedAt: 2026-06-18T15:50:57.746Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0025
  path: .changeyard/workspaces/CY-0025/repo
branch:
  name: cy/CY-0025-fix-kanban-theme-contrast-and-selected-states
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-18T15:35:11.834Z
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
mergedAt: 2026-06-18T15:35:58.696Z
review:
  required: false
  waivedAt: 2026-06-18T15:50:57.746Z
  waivedBy: cy doctor
  waiverReason: Stale completed merged change older than 0 days had no review artifact.
---

# Summary

Fix Kanban theme contrast and selected-state styling across default, dark, light, and high-contrast themes. Align duplicated Kanban/VCS theme tokens and metadata where required, keep shared UI styles authoritative, and add automated contrast checks for theme tokens, selected states, and terminal selections.

# Motivation

CY-0016 improved light-theme contrast but did not enforce dark/default accent contrast, selected-row descendant contrast, or terminal selection contrast. Kanban still has older file-tree overrides, translucent selected text, inline selected color overrides, and selected card borders that can render poorly across themes.

# Plan

- [x] Preserve unrelated working-copy changes and avoid CLI/schema/runtime/config edits.
- [x] Align theme tokens and metadata for Kanban and VCS where token parity requires it.
- [x] Add selected-state CSS variables and apply them to Kanban rows, cards, badges, icons, and Git panels.
- [x] Remove or align stale Kanban file-tree CSS so shared selected glyph/conflict styling applies.
- [x] Extend theme contract tests and focused component tests.
- [x] Add Playwright coverage for rendered theme contrast and selected-state borders.
- [x] Run the requested build, unit, e2e, and check commands.

<!-- cy:proposal:start -->
# Proposal

## Intent

Make Kanban selected states, borders, and theme colors readable and visually consistent across all supported themes.

## Scope

### In Scope

- [ ] Kanban theme CSS, theme metadata, terminal theme colors, selected-state component styling, and tests.
- [ ] Shared `@changeyard/web-ui` file-listing styles when needed for Kanban/VCS parity.
- [ ] VCS duplicated theme tokens and metadata only where required to keep the shared theme contract consistent.

### Out of Scope

- [ ] CLI behavior, command schemas, runtime APIs, persistence, provider integrations, or `.changeyard/config*` files.
- [ ] Broad VCS component redesign beyond token/metadata parity.
- [ ] Changing theme ids or local-storage compatibility.

## Approach

Introduce explicit selected-state tokens, replace low-contrast selected text patterns, preserve theme identities, and enforce measurable contrast with tests plus rendered Playwright checks.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- Kanban selected-state text and muted selected metadata MUST meet at least 4.5:1 contrast in every supported theme.
- Kanban selected-state borders and focus/selection boundaries MUST meet at least 3:1 contrast against adjacent surfaces.
- Theme contract tests MUST cover the implicit default theme and each explicit `[data-theme]` block.
- Terminal selections MUST meet readable contrast in every theme, including high-contrast-dark.

## MODIFIED Requirements

- Accent foreground token pairs are contrast-safe for all themes while preserving existing theme ids.
- Kanban selected rows, cards, badges, file glyphs, and Git panels use selected-state variables instead of translucent foreground utilities.
- Kanban file tree styling follows the shared UI selected/conflict row contract.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

- Add `--kb-selected-bg`, `--kb-selected-fg`, `--kb-selected-muted-fg`, and `--kb-selected-border` in theme CSS.
- Update Kanban and VCS theme CSS and metadata for contrast-safe accent foreground pairs and selected-state values.
- Replace Kanban `text-accent-fg/60`, transparent selected text mixes, selected inline `text-primary`, and hard-coded white selected badge backgrounds with selected-state variables.
- Fix project rows, file tree rows, Git ref rows, Git commit rows, board cards, change cards, badges, icons, and terminal selections.
- Extend root theme contract tests, focused Kanban component tests, and Playwright computed-style checks.

## Architecture Decisions

- Keep duplicated Kanban/VCS theme files for now and rely on contract tests to prevent drift.
- Prefer selected-state variables over broad Tailwind opacity utilities so contrast can be tested by token.
- Limit VCS changes to token and metadata parity unless a shared CSS change requires a small compatibility adjustment.

## Data / State Impact

No data, schema, local-storage key, or persisted theme id changes.

## Workspace / Provider Impact

Implementation must occur only inside the verified Changeyard workspace for CY-0025. Provider remains `noop`; no PR is created.

## Risks

- Risk: accent foreground changes alter visual tone. Mitigation: preserve accent hues and verify screenshots in every theme.
- Risk: component-specific inline styles override CSS variables. Mitigation: add targeted source assertions and computed-style Playwright checks.
- Risk: e2e coverage is slow or fixture-dependent. Mitigation: use existing Kanban smoke-test harness and create deterministic local UI state in the test.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Update theme tokens, metadata, and selected-state variables.
- [x] Fix Kanban selected rows/cards/badges/icons and stale file-tree overrides.
- [x] Fix terminal selected contrast.
- [x] Add/extend root contract, component, and Playwright tests.

## 3. Verification

- [x] Run requested checks and record results.
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm run build:cli && node --test dist/tests/theme-contract.test.js`
- `pnpm --filter @changeyard/kanban run web:typecheck`
- `pnpm --dir packages/kanban/web-ui run test`
- `pnpm --dir packages/kanban/web-ui run e2e`
- `pnpm run check`

## Manual Scenarios

- Render Kanban in default, graphite, midnight, pitch, solarized-dark, light, overcast, solarized-light, latte, high-contrast-dark, and high-contrast-light.
- Verify selected project rows, selected board cards, selected change cards, selected file rows, selected Git refs/commits, badges/icons, borders, hover, focus, and terminal selection contrast.

## Result

- Passed: `pnpm run build:cli && node --test dist/tests/theme-contract.test.js` (7 tests).
- Passed: `pnpm --filter @changeyard/kanban run web:typecheck`.
- Passed: `pnpm --dir packages/kanban/web-ui run test` (95 files, 587 tests; existing Node localStorage experimental warnings).
- Partial: `pnpm --dir packages/kanban/web-ui run e2e` passed the 11 new theme contrast tests but failed the existing `tests/smoke.spec.ts` cases because the plain Vite server renders the dashboard at `/` and `/kanban` shows the runtime-disconnected fallback without a Changeyard runtime/mock harness.
- Passed: `pnpm --dir packages/kanban/web-ui run e2e -- tests/theme-contrast.spec.ts` (11 themes).
- Passed: `pnpm run check`.
<!-- cy:verification:end -->

<!-- cy:clarifications:start -->
# Clarifications

## Session 2026-06-18

- Q: Should implementation use Changeyard strict planning and an isolated workspace?
  A: Yes. Use `cy create --template agent-task --planning openspec-lite --strict`, then validate, sync, start, verify, and edit only inside the verified workspace.
- Q: Is enforcement guidance-only or runtime behavior?
  A: Runtime behavior for UI styling only; no CLI/schema/runtime lifecycle changes.
- Q: Is VCS component behavior in scope?
  A: No, except duplicated theme token/metadata parity required by the shared contract.
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

## Gate Result

Pending implementation after lifecycle gates pass.
<!-- cy:analysis:end -->

# Acceptance Criteria
- [x] Kanban selected text, muted selected metadata, badges, and icons meet contrast thresholds in every theme.
- [x] Selected borders and focus/selection boundaries are visible in dark and light modes.
- [x] Kanban file-tree selected/conflict styling matches shared UI behavior and no stale local override regresses it.
- [x] High-contrast-dark terminal selection meets contrast requirements.
- [x] Theme contract, Kanban component, Playwright, typecheck, and repo check commands pass or unrelated blockers are documented.

# Agent Plan

1. Run `cy validate CY-0025`, `cy sync CY-0025`, `cy start CY-0025`, and `cy verify CY-0025`.
2. Implement only in `.changeyard/workspaces/CY-0025/repo`.
3. Update theme CSS/metadata, selected-state component styles, terminal colors, and tests.
4. Run targeted checks first, then the requested full verification commands.
5. Record verification results and complete locally with `cy complete CY-0025 --no-pr`.

# Completion Notes

Implemented in the CY-0025 workspace.

Changed areas:
- Kanban and VCS theme CSS/metadata now use contrast-safe accent foreground pairs, root `color-scheme`, selected-state tokens, and high-contrast terminal selection colors.
- Kanban selected project rows, Git refs, Git commits, board/change cards, badges, file rows, status glyphs, and shared file-listing styles now use selected-state tokens instead of low-contrast translucent foregrounds.
- Theme contract, Kanban component, shared file-listing, and Playwright theme contrast coverage now assert selected-state contrast and source-pattern regressions.

Checks:
- `pnpm run build:cli && node --test dist/tests/theme-contract.test.js` passed.
- `pnpm --filter @changeyard/kanban run web:typecheck` passed.
- `pnpm --dir packages/kanban/web-ui run test` passed.
- `pnpm --dir packages/kanban/web-ui run e2e -- tests/theme-contrast.spec.ts` passed.
- `pnpm run check` passed.
- `pnpm --dir packages/kanban/web-ui run e2e` is blocked by existing smoke-spec runtime assumptions; the new theme spec passed within that run.

Remaining risk: the pre-existing Playwright smoke spec still needs a runtime/mock harness or updated route assumptions to pass under the package's plain Vite web server.
