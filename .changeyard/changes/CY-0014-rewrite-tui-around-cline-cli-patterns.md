---
id: CY-0014
title: Rewrite TUI around Cline CLI patterns
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-14T14:25:35.665Z
updatedAt: 2026-06-14T15:18:56.956Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0014
  path: .changeyard/workspaces/CY-0014/repo
branch:
  name: cy/CY-0014-rewrite-tui-around-cline-cli-patterns
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-14T15:08:26.609Z
  lastStatus: passed
planning:
  model: openspec-lite
  storage: inline
  schema: changeyard-openspec-lite@1
  strictness: strict
  phase: ready
  gates:
    proposal: complete
    specDeltas: complete
    design: complete
    tasks: complete
    verification: complete
    strictClarifications: complete
    strictChecklist: complete
    strictAnalysis: complete
mergedAt: 2026-06-14T15:18:56.951Z
---

# Summary

Rewrite the Changeyard TUI around Cline CLI's React/OpenTUI structure and update the public launch model to root-level flags. The new TUI should keep Changeyard workflows intact while adopting Cline-style layout, input, autocomplete, status, config/control panels, and agent-session surfaces.

# Motivation

The current TUI is Solid-based, visually separate from the web/runtime agent workflow, and still uses legacy launch commands. Cline's CLI has a stronger OpenTUI shell for bottom input, slash commands, `@` file mentions, status display, config browsing, and session interaction. Aligning with that shape gives Changeyard a more polished terminal UI and creates a path to starting configured agent sessions directly from the TUI.

# Plan

- [ ] Replace the TUI implementation with React/OpenTUI components modeled on Cline CLI.
- [ ] Update CLI launch routing to `cy`, `cy --tui`, `cy --kanban`, and `cy --vcs`.
- [ ] Add Cline-style bottom input, slash autocomplete, `@` file mentions, status bar, config/control panel, and tracked logo.
- [ ] Add runtime-client support for repository status, workspace file search, and configured agent sessions.
- [ ] Preserve existing Changeyard workflow commands and diagnostics behavior.
- [ ] Verify CLI routing, TUI type safety, helper tests, and smoke launch behavior.

<!-- cy:proposal:start -->
# Proposal

## Intent

Make the Changeyard terminal experience match the structure and ergonomics of Cline CLI while remaining workflow/VCS-focused. The TUI should launch by default, present a Cline-style terminal shell, and be able to start a configured agent session against a Changeyard change.

## Scope

### In Scope

- [ ] React/OpenTUI migration for `packages/tui`.
- [ ] Root-level CLI launcher flags: `--tui`, `--kanban`, and `--vcs`.
- [ ] Removal of old public UI commands: `cy tui`, `cy ui`, `cy view`, and `cy menu`.
- [ ] Cline-style home/workspace/config views, bottom input, autocomplete, status bar, and logo.
- [ ] `@` workspace file mention autocomplete.
- [ ] JJ/Git status display on the TUI landing/status surface.
- [ ] TUI runtime-client wrappers for existing task-session APIs.
- [ ] Agent-session panel that can start, follow, send input to, and stop configured agent sessions.
- [ ] Tests and docs/help/completion updates for the new invocation model.

### Out of Scope

- [ ] Rewriting the web Kanban or VCS UI.
- [ ] Changing Changeyard document/workflow semantics.
- [ ] Replacing the existing backend Cline SDK or PTY session managers.
- [ ] Platform binary packaging parity with Cline; this remains a later slice.
- [ ] Copying visible Cline branding, account UX, or model/provider concepts that are not relevant to Changeyard.

## Approach

Port the TUI in vertical slices. First migrate the package and app shell to React/OpenTUI, then layer in Cline-style shared components and routes. Keep workflow mutations behind the existing runtime APIs. Add small runtime-client methods for any existing backend APIs that the TUI cannot call yet. Use the existing Cline SDK path when the selected agent is `cline` and the existing PTY-backed terminal path for other configured agents.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- `cy` with no arguments SHALL launch the main TUI.
- `cy -i`, `cy --tui`, and `cy -i --tui` SHALL launch the main TUI.
- `cy --kanban` SHALL launch the web Kanban UI currently reached by `cy ui`.
- `cy --vcs` SHALL launch the web VCS UI directly.
- The TUI SHALL use React/OpenTUI rather than Solid/OpenTUI.
- The TUI SHALL render Cline-style bottom slash-command suggestions.
- The TUI SHALL support `@` file mentions using workspace file search and quote paths containing spaces.
- The TUI SHALL show repository status for JJ or Git, including an active diff summary when available.
- The TUI SHALL expose a Cline-style control/config panel.
- The TUI SHALL include an animated tracked logo adapted from Cline with attribution.
- The TUI SHALL be able to start a configured agent session for a selected Changeyard change.
- The TUI SHALL display live session output/messages and allow follow-up input and stop/cancel actions.

## MODIFIED Requirements

- TUI configuration SHALL move from standalone `cy config` interactive launch into in-TUI `/config` and command-palette style navigation.
- TUI command routing SHALL preserve non-interactive Changeyard commands while removing legacy public UI subcommands.

## REMOVED Requirements

- `cy tui` SHALL no longer be the public TUI launcher.
- `cy ui` SHALL no longer be the public web UI launcher.
- `cy view` and `cy menu` SHALL no longer alias the TUI.
- Interactive `cy config` SHALL no longer launch the config TUI; `cy config --json` remains supported.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Convert `packages/tui` to React/OpenTUI, reorganizing source around Cline-like `components`, `views`, `hooks`, `contexts`, `commands`, and `utils`. Update build and launcher preload paths. Preserve runtime API boundaries and add missing TUI client wrappers for repo status, file search, and task sessions.

## Architecture Decisions

- Prefer Cline visual/interaction parity for the first React migration over an unrelated design refresh.
- Keep runtime ownership in `packages/kanban/src/runtime-stack`; the TUI should call runtime APIs rather than spawn agents itself.
- Use Cline SDK sessions only when selected agent is `cline`; use existing PTY-backed sessions for Codex, Claude, Cursor, Copilot, Droid, and Kiro.
- Keep `cy server` and non-interactive workflow commands stable.

## Data / State Impact

No persistent schema migration is expected. TUI local history/config cache may change format if needed, but existing Changeyard change files, runtime config, and workspace metadata remain authoritative.

## Workspace / Provider Impact

The work changes launch routing and TUI packaging. The web runtime, VCS UI, and provider integrations should continue to operate through the existing runtime server. Copied or adapted Cline code/assets require Apache-2.0 attribution.

## Risks

- React/OpenTUI version mismatch with Cline or current OpenTUI could break rendering; mitigate with a small shell first and type/smoke tests.
- Full pixel parity is difficult in terminals; mitigate with fixed-size smoke/manual checks and behavior-level acceptance.
- Agent-session rendering differs between Cline SDK and PTY sessions; mitigate by using a shared session summary model and two data adapters.
- CLI defaulting to TUI may affect automation; mitigate by keeping all explicit non-interactive subcommands stable and rejecting old UI commands with clear messages.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Add new CLI launcher flags and legacy invocation migration errors.
- [x] Convert TUI package/build/app shell from Solid to React.
- [x] Port/adapt Cline-style TUI components and route structure.
- [x] Add repository status and file mention runtime-client support.
- [x] Add task-session runtime-client support and session panel.
- [x] Update docs/help/completions/tests.

## 3. Verification

- [x] Run checks and record results.
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `npm run build:cli`
- `npm --workspace @changeyard/tui run typecheck`
- `npm --workspace @changeyard/tui run test`
- `node scripts/verify-tui-endpoints.mjs`
- CLI tests or targeted Node tests for launcher routing.
- TUI smoke launch where practical.

## Manual Scenarios

- `cy` launches TUI.
- `cy --tui` launches TUI.
- `cy --kanban` opens the web Kanban UI.
- `cy --vcs` opens the VCS UI.
- Removed invocations print migration hints.
- Slash commands appear below the input.
- `@` mentions search and insert workspace files.
- A selected change can start an agent session and render live output/messages.

## Result

Passed:

- `npm run build`
- `npm run check:tui`
- `npm run smoke:tui`
- `npm run smoke:install`
- `npm pack --dry-run --json --ignore-scripts`
- `node dist/src/cli.js --kanban --no-open --port auto` startup probe
- Removed invocation probes for `cy ui`, `cy tui`, `cy view`, and interactive `cy config`
<!-- cy:verification:end -->

<!-- cy:clarifications:start -->
# Clarifications

## Session YYYY-MM-DD

- Q: Should agent sessions be part of the first rewrite rather than a later follow-up?
  A: Yes. Include them as a relevant milestone using the existing runtime Cline SDK and PTY session APIs.
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

Pass.
<!-- cy:analysis:end -->

# Acceptance Criteria
- [x] `cy`, `cy -i`, `cy --tui`, and `cy -i --tui` route to the TUI launcher.
- [x] `cy --kanban` launches the web Kanban UI and `cy --vcs` launches the VCS UI.
- [x] `cy tui`, `cy ui`, `cy view`, and `cy menu` are rejected with migration hints.
- [x] `cy config --json` remains supported.
- [x] `packages/tui` no longer depends on Solid and builds/typechecks with React/OpenTUI.
- [x] The TUI includes Cline-style home/workspace/config surfaces, bottom input, slash autocomplete, status bar, and tracked logo.
- [x] The TUI supports `@` file mentions.
- [x] The TUI shows JJ/Git repository state and active diff summary when available.
- [x] The TUI can start and follow a configured agent session for a Changeyard change.
- [x] Existing workflow commands and `/export-diagnostics` remain available from the TUI.
- [x] Required checks run and results are recorded.

# Agent Plan

Implement in a verified Changeyard workspace. Start with launch routing and package migration, because those define the new entrypoint. Then port the React shell and Cline-style components, preserving existing command/runtime behavior. Add repo status and `@` mentions. Finally wire existing runtime task-session APIs into the TUI and verify the combined behavior with targeted tests and smoke checks.

# Completion Notes

Replaced the Solid TUI with a React/OpenTUI shell inspired by Cline CLI: landing, workspace, config/control blocks, bottom composer, slash suggestions, `@` file mentions, status bar, animated tracked logo, and an agent-session panel backed by existing runtime task-session APIs. Updated runtime-client calls for repository status, workspace file search, and session lifecycle/input/message APIs.

Changed launch routing to `cy`/`cy -i`/`cy --tui`, `cy --kanban`, and `cy --vcs`; old `cy tui`, `cy ui`, `cy view`, `cy menu`, and interactive `cy config` now return migration hints while `cy config --json` remains available. Packaging now builds and ships `packages/tui/dist`, bundles React/OpenTUI React into the TUI artifact, and promotes runtime dependencies needed by packed installs.

Verification passed with `npm run build`, `npm run check:tui`, `npm run smoke:tui`, `npm run smoke:install`, dry pack file-list inspection, local `cy --kanban --no-open --port auto` startup probe, and targeted removed-invocation probes.
