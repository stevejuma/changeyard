---
id: CY-0016
title: Fix theme contrast across Kanban and VCS
type: agent-task
status: synced
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-15T20:09:59.377Z
updatedAt: 2026-06-15T20:10:48.159Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0016
  path: .changeyard/workspaces/CY-0016/repo
branch:
  name: cy/CY-0016-fix-theme-contrast-across-kanban-and-vcs
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

Improve light-theme contrast across the Kanban, dashboard, and VCS web surfaces by tightening shared theme tokens, removing off-contract variable usage, and adding theme contract tests.

# Motivation

Light themes currently have weak surface separation, low-contrast borders, unreadable status colors, and a few component styles that bypass the theme contract. This makes hover states, selected rows, cards, file glyphs, and borders hard to distinguish.

# Plan

- [ ] Update Kanban and VCS theme token definitions for light themes.
- [ ] Align theme metadata and VCS theme typing with the CSS token contract.
- [ ] Replace off-contract or hard-coded contrast-sensitive styles in dashboard, status glyphs, selected rows, diffs, warnings, and VCS patterned backgrounds.
- [ ] Add root theme contract tests for token parity, undefined token usage, and contrast thresholds.
- [ ] Run targeted typechecks, tests, and visual QA.

<!-- cy:proposal:start -->
# Proposal

## Intent

Make theme variables reliable and readable across Kanban and VCS, with special focus on light-mode hover, border, selected, status, and diff states.

## Scope

### In Scope

- [ ] `packages/kanban/web-ui` theme tokens, theme metadata, dashboard styles, shared diff/history styling, and targeted tests.
- [ ] `packages/vcs` theme tokens, VCS theme metadata, status glyphs, selected-row styling, diff/warning styles, patterned backgrounds, and targeted tests.
- [ ] Root-level theme contract coverage.

### Out of Scope

- [ ] Runtime API, persistence, routing, or data model changes.
- [ ] Introducing a shared UI package for Kanban/VCS.
- [ ] Changing the intentionally dark/inverted terminal rendering unless validation shows a regression.

## Approach

Preserve the upstream token model, but replace weak light palettes with stronger theme-specific values and darker light-safe status tokens. Then remove component usages that bypass those tokens and enforce the contract with tests.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- Theme CSS files MUST expose the same theme token keys for every theme block across Kanban and VCS.
- App source MUST NOT reference undefined `--color-*` CSS variables.
- Light-theme text, status, and accent foreground pairs MUST meet at least 4.5:1 contrast against their intended surfaces.
- Light-theme adjacent hover surfaces and borders MUST meet minimum visible separation thresholds.

## MODIFIED Requirements

- Light themes use stronger surface, border, text, accent, and status palettes while preserving existing theme ids and user storage.
- Dashboard, VCS file glyphs, selected rows, diff rows, warning states, and patterned backgrounds use theme tokens instead of undefined variables or hard-coded color literals.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

- Edit both `globals.css` files with the new light palettes and per-light-theme status overrides.
- Update Kanban `use-theme.ts` and VCS `vcs-theme.ts` metadata to match CSS swatches; add `accentFg` and `accent2Fg` to VCS theme definitions.
- Replace `--color-text-muted`, hard-coded VCS status glyph utility colors, selected-row white rgba constants, raw warning/diff rgba backgrounds, and VCS radial grey literals with theme-token classes or `color-mix()`.
- Add `tests/theme-contract.test.ts` to parse theme CSS and scan source files.

## Architecture Decisions

- Keep duplicated Kanban/VCS theme files for this pass and use tests to keep them aligned.
- Prioritize readable contrast over exact upstream `cline/kanban` light-theme hex values.
- Keep existing theme ids and local-storage key compatibility.

## Data / State Impact

No data, schema, or persisted-state changes. Existing stored theme ids continue to work.

## Workspace / Provider Impact

No provider impact. Work should be implemented in the verified Changeyard workspace checkout.

## Risks

- Risk: visual tone changes for light themes. Mitigation: keep theme identities recognizable and run browser QA across light themes.
- Risk: test thresholds are too strict for high-contrast or decorative surfaces. Mitigation: test only contract pairs used for readable UI and hover/border visibility.
- Risk: duplicated CSS drifts again. Mitigation: root theme contract checks parity.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [ ] Update theme token palettes and metadata.
- [ ] Replace off-contract component styles.
- [ ] Add theme contract tests.

## 3. Verification

- [ ] Run theme contract test.
- [ ] Run Kanban typecheck and targeted tests.
- [ ] Run VCS typecheck and tests.
- [ ] Run browser visual QA for requested routes/themes.
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm run build:cli && node --test dist/tests/theme-contract.test.js`
- `pnpm --filter @changeyard/kanban run web:typecheck`
- `pnpm --dir packages/kanban/web-ui run test -- src/components/runtime-settings-dialog.test.tsx src/terminal/terminal-options.test.ts src/components/ui/status-chip.test.tsx`
- `pnpm --filter @changeyard/vcs run typecheck`
- `pnpm --filter @changeyard/vcs run test`

## Manual Scenarios

Visual QA in `light`, `overcast`, `solarized-light`, `latte`, and `high-contrast-light` on `/`, `/kanban`, `/vcs/jj`, `/vcs/jj/branches`, and `/vcs/jj/history`, checking hover states, selected rows, card borders, status chips, file glyphs, and diff rows.

## Result

_Not run yet._
<!-- cy:verification:end -->

# Acceptance Criteria
- [ ] Kanban and VCS light themes have readable hover, border, selected, status, and diff states.
- [ ] Theme metadata swatches match the CSS palettes.
- [ ] No app source references undefined `--color-*` variables.
- [ ] Root theme contract tests cover token parity and light-theme contrast.
- [ ] Targeted Kanban and VCS verification commands pass or any unrelated blockers are documented.

# Agent Plan

1. Run Changeyard validate/sync/start/verify gates.
2. Implement token and metadata updates in the verified workspace.
3. Replace off-contract style usage and add contract tests.
4. Run automated verification and browser visual QA.
5. Update completion notes and complete the change locally.

# Completion Notes

Summarize what changed, what checks ran, and what risks remain.
