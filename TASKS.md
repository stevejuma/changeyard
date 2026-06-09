# TASKS: Quick Mode Implementation

Date: 2026-06-09

Objective: Implement the quick-mode proposal described in `PLAN.md` without weakening the completed markdown-first planned-change workflow.

## Tracker Rules

- `TASKS.md` is the live execution tracker for quick mode.
- Update stage status and verification notes as implementation lands.
- Keep completed work checked off and leave pending work explicit.
- Use the quick-mode stages below for active work.
- `PENDING.md` reflects the previous kanban migration effort and is not the active tracker for this feature.

## Current Status

- [x] Quick-mode proposal reviewed and translated into a repo-specific plan
- [x] `PLAN.md` updated with the quick-mode roadmap
- [x] `TASKS.md` updated as the active quick-mode tracker
- [x] Quick-mode implementation started
- [ ] End-to-end quick-mode implementation complete

Current focus: Close out Stage Q4 verification cleanly, then move into Stage Q5 quick-to-planned conversion.

## Stage Q1: Data Model And Template

Status: `completed`

- [x] Add `src/templates/quick.md`
- [x] Define quick template metadata with required frontmatter and required sections
- [x] Add quick template body with Summary, Scope, Acceptance Criteria, and Completion Notes
- [x] Update `src/commands/init.ts` so `cy init` installs `.changeyard/templates/quick.md`
- [x] Ensure `cy init` does not overwrite an existing user-customized quick template
- [x] Update `src/commands/create.ts` so `--template quick` emits `planning.model: none`
- [x] Update quick create generation so `workflow.mode: quick`, `workflow.risk: low`, and `workflow.requiresWorkspace: true`
- [x] Update quick create generation so `checks.profile: minimal`, `checks.lastRun: null`, and `checks.lastStatus: null`
- [x] Default quick changes to `priority: low` unless overridden
- [x] Default quick labels to include `quick` and `low-risk` with de-duplication
- [x] Add or extend typed planning/workflow/check metadata types in `src/types.ts`
- [x] Add `src/change/changeMetadata.ts` helpers for `isQuickChange`, `planningModel`, `workflowMode`, and `checkProfile`
- [x] Add tests for quick template installation
- [x] Add tests for `cy create --template quick --title "Fix typo"`
- [x] Run `npm run check`
- [x] Run `npm test`

Acceptance checks:

- [x] `cy init` installs `quick.md`
- [x] `cy create --template quick --title "Fix typo"` creates a valid quick change
- [x] Generated quick changes include `planning.model: none`
- [x] Generated quick changes include `workflow.mode: quick`
- [x] Generated quick changes default to `priority: low`
- [x] Generated quick changes default to `checks.profile: minimal`
- [x] Existing templates and tests continue to pass

## Stage Q2: CLI Ergonomics

Status: `completed`

- [x] Add `quick` to the CLI command union and dispatcher in `src/cli.ts`
- [x] Implement `cy quick --title "Fix typo in README"`
- [x] Route `cy quick` internally through the same create logic as `--template quick`
- [x] Support `--priority`, `--label`, `--author`, `--dry-run`, and `--json` for `cy quick`
- [x] Add `cy create --quick --title "Fix typo"` sugar
- [x] Ensure `cy create --quick` is equivalent to `cy create --template quick`
- [x] Update top-level usage text with quick examples
- [x] Update `commandUsage("create")` with quick examples
- [x] Add `cy quick --help` usage and examples
- [x] Preserve existing aliases `new`, `begin`, `check`, and `done`
- [x] Add CLI parsing tests for `cy quick`
- [x] Add dry-run test that confirms no change file is written
- [x] Add JSON-output test consistent with current create conventions
- [x] Run `npm run check`
- [x] Run `npm test`

Acceptance checks:

- [x] `cy quick --title "Fix typo"` creates a quick change
- [x] `cy quick --dry-run --title "Fix typo"` writes nothing and reports the intended path
- [x] `cy create --quick --title "Fix typo"` works
- [x] `cy quick --help` shows examples
- [x] Invalid quick command input returns the existing CLI error envelope
- [x] JSON output remains consistent with existing CLI conventions

## Stage Q3: Quick Validation And Risk Guardrails

Status: `completed`

- [x] Add quick-change validation in `src/documents/validateDocument.ts` or a shared validation module
- [x] Require quick changes to have `planning.model: none`
- [x] Require quick changes to have `workflow.mode: quick`
- [x] Require Summary, Scope, Acceptance Criteria, and Completion Notes sections
- [x] Require Scope to include quick-risk checklist items
- [x] Require Acceptance Criteria to include at least one checkbox before completion
- [x] Reject OpenSpec-lite required planning markers for quick changes unless the change was converted
- [x] Add warning support to `ValidationResult` or an equivalent non-blocking warning path
- [x] Add config defaults for `planning.allowQuickChanges`
- [x] Add config defaults for `planning.quickChangeCheckProfile`
- [x] Add config defaults for `planning.quickChangeRequiresWorkspace`
- [x] Add config defaults for `planning.quickChangeEscalation: off | warn | block`
- [x] Update config schema without requiring planning fields in existing configs
- [x] Add tests for valid quick change validation
- [x] Add tests for malformed quick metadata
- [x] Add tests for warning escalation
- [x] Add tests for blocking escalation
- [x] Run `npm run check`
- [x] Run `npm test`

Acceptance checks:

- [x] Quick changes validate when required metadata, sections, and checkboxes are present
- [x] Quick changes fail validation when `planning.model` is not `none`
- [x] Quick changes fail validation when `workflow.mode` is not `quick`
- [x] Existing configs without `planning` continue to load
- [x] `quickChangeEscalation: warn` reports warnings without blocking
- [x] `quickChangeEscalation: block` blocks risky quick changes

## Stage Q4: Lifecycle Gate Integration

Status: `in_progress`

- [x] Update `cy sync` behavior so quick changes sync without planned-change gates
- [x] Ensure sync output/provider body identifies Mode: quick, Planning: none, and Risk: low
- [x] Add quick start gate helper
- [x] Update `cy start` so quick changes validate but do not require OpenSpec-lite sections
- [x] Block `cy start` when `planning.allowQuickChanges === false`
- [x] Block `cy start` when `quickChangeEscalation === "block"` and scope risk is unresolved
- [x] Add quick completion gate helper
- [x] Make quick completion default to the minimal check profile
- [x] Require workspace verification for quick completion when a workspace was started
- [x] Require non-placeholder Completion Notes for quick completion
- [x] Require Acceptance Criteria to be checked or explicitly deferred at completion
- [x] Require Completion Notes to mention checks run or a not-run rationale
- [x] Update `cy review start` so review artifacts clearly label quick mode
- [x] Add tests for quick sync/start/complete/review
- [x] Add regression tests proving planned and legacy changes are unaffected
- [x] Run `npm run check`
- [ ] Run `npm test`

Acceptance checks:

- [x] `cy sync` works for quick changes
- [x] `cy start` works for quick changes without OpenSpec-lite sections
- [x] `cy start` blocks quick changes when config disables quick changes
- [x] `cy complete --no-pr --profile minimal` works for quick changes after verification and completion notes
- [x] `cy complete` uses the minimal check profile by default for quick changes
- [x] `cy review start` creates a review that clearly labels quick mode

## Stage Q5: Convert Quick Change To Planned Change

Status: `pending`

- [ ] Add `cy plan convert <id> --model openspec-lite`
- [ ] Preserve id, title, remote metadata, workspace metadata, branch, checks, and status during conversion
- [ ] Update converted frontmatter to `planning.model: openspec-lite`
- [ ] Update converted frontmatter to `planning.storage: inline`
- [ ] Update converted frontmatter to `planning.schema: changeyard-openspec-lite@1`
- [ ] Update converted frontmatter to `workflow.mode: planned`
- [ ] Insert OpenSpec-lite Proposal marker section
- [ ] Insert OpenSpec-lite Specification Deltas marker section
- [ ] Insert OpenSpec-lite Design marker section
- [ ] Insert OpenSpec-lite Tasks marker section
- [ ] Insert OpenSpec-lite Verification marker section
- [ ] Preserve the original quick Scope section as historical context
- [ ] Allow conversion for `ready`, `synced`, and `blocked`
- [ ] Block conversion for implementation/review/closed states unless `--force`
- [ ] Add tests for conversion from `ready`
- [ ] Add tests for refusal from `in_progress`
- [ ] Add tests that converted changes fail `cy start` until planning sections are complete
- [ ] Run `npm run check`
- [ ] Run `npm test`

Acceptance checks:

- [ ] Quick changes can be converted to planned changes before start
- [ ] Conversion preserves the change file path unless a deliberate rename behavior is added
- [ ] Conversion preserves remote and workspace frontmatter
- [ ] Converted changes use planned-change gates
- [ ] Conversion refuses in-progress changes unless `--force` is provided

## Stage Q6: UI Support

Status: `pending`

- [ ] Add backend/runtime API for creating quick changes
- [ ] Add backend/runtime API for reading quick change details from markdown
- [ ] Add backend/runtime API for editing quick sections
- [ ] Add backend/runtime API for validating quick changes
- [ ] Add backend/runtime API for syncing quick changes
- [ ] Add backend/runtime API for starting quick changes
- [ ] Add backend/runtime API for converting quick changes to planned mode
- [ ] Add create dialog option for Quick change
- [ ] Add create dialog options for Planned and Strict planned change if not already exposed in the same flow
- [ ] Show quick-mode explanatory copy in the create dialog
- [ ] Show Quick, Planning: none, and Risk: low badges on cards
- [ ] Add quick detail view with Summary, Scope, Acceptance Criteria, Completion Notes, Provider, Workspace, and Checks
- [ ] Add quick section editing backed by `.changeyard/changes/*.md`
- [ ] Show validation errors and warnings for quick changes
- [ ] Wire quick sync/start actions through shared backend logic
- [ ] Add Convert to planned change action
- [ ] Add filters for quick/planned and planning-none/openspec-lite
- [ ] Add UI/runtime tests for quick create, detail, edit, validate, sync, start, and convert
- [ ] Run UI typecheck
- [ ] Run UI build

Acceptance checks:

- [ ] UI can create a quick change
- [ ] UI can display quick change badges
- [ ] UI can open quick change detail view
- [ ] UI can edit Summary, Scope, Acceptance Criteria, and Completion Notes
- [ ] UI can validate quick changes and show errors/warnings
- [ ] UI can sync and start quick changes using the same backend logic as CLI
- [ ] UI can convert a quick change to planned mode
- [ ] UI does not write separate Kanban state for quick changes

## Stage Q7: Provider Sync And Review Rendering

Status: `pending`

- [ ] Add or extend provider body rendering for workflow-aware quick issue bodies
- [ ] Render quick Summary in provider issue bodies
- [ ] Render quick Workflow metadata in provider issue bodies
- [ ] Render quick Scope in provider issue bodies
- [ ] Render quick Acceptance Criteria in provider issue bodies
- [ ] Render local source-of-truth path in provider issue bodies
- [ ] Omit OpenSpec-lite-only sections from quick provider bodies
- [ ] Add review projection for quick workflow metadata
- [ ] Add review projection for quick Completion Notes
- [ ] Add review projection for check summary, workspace metadata, and remote metadata
- [ ] Add local-folder provider tests for quick sync
- [ ] Add review rendering tests for quick changes
- [ ] Run `npm run check`
- [ ] Run `npm test`

Acceptance checks:

- [ ] Synced provider issues label quick changes clearly
- [ ] Provider bodies omit OpenSpec-lite sections for quick changes
- [ ] Review artifacts include quick metadata and completion notes
- [ ] Existing provider tests pass
- [ ] New tests cover noop/local-folder quick sync and review rendering

## Stage Q8: Optional No-Workspace Quick Completion

Status: `deferred`

- [ ] Confirm workspace-backed quick workflow is stable before starting this stage
- [ ] Add `cy quick --title "Fix typo" --no-workspace`
- [ ] Set `workflow.requiresWorkspace: false`
- [ ] Set `workflow.completionPath: local`
- [ ] Add `cy complete <id> --no-workspace --no-pr --profile minimal`
- [ ] Refuse no-workspace completion unless frontmatter or flag explicitly allows it
- [ ] Run checks in the repo root
- [ ] Base detected changes on VCS diff when available
- [ ] Add no-VCS fallback behavior
- [ ] Clearly report when workspace verification was skipped
- [ ] Add review artifact output for local/no-workspace completion
- [ ] Add git and no-VCS fallback tests
- [ ] Run `npm run check`
- [ ] Run `npm test`

Acceptance checks:

- [ ] No-workspace mode is opt-in
- [ ] `cy complete` refuses no-workspace completion unless explicitly allowed
- [ ] Checks run in repo root
- [ ] Completion notes are still required
- [ ] Command output and review artifact identify local/no-workspace completion

## Stage Q9: Documentation And Examples

Status: `pending`

- [ ] Update README with direct edit, quick change, planned change, and strict planned change lanes
- [ ] Document when quick mode is appropriate
- [ ] Document when quick mode must not be used
- [ ] Add examples for `cy quick --title "Fix README typo"`
- [ ] Add examples for `cy create --template quick --title "Update docs wording"`
- [ ] Add examples for `cy create --quick --title "Fix broken link"`
- [ ] Add examples for `cy plan convert <id> --model openspec-lite`
- [ ] Add agent instructions for quick-mode escalation
- [ ] Align CLI help examples with README examples
- [ ] Align UI create-dialog copy with README policy
- [ ] Run docs-related checks included in `npm run check`

Acceptance checks:

- [ ] README explains quick mode
- [ ] README explains when not to use quick mode
- [ ] CLI help examples match documentation
- [ ] UI create dialog language matches documentation
- [ ] Agent protocol section mentions quick mode and escalation

## Stage Q10: Final Test Plan And Release Checks

Status: `pending`

- [ ] Add unit tests for `quick.md` template validation
- [ ] Add unit tests for `createChange({ template: "quick" })` or equivalent command path
- [ ] Add unit tests for quick metadata helpers
- [ ] Add unit tests for quick validation failures and warnings
- [ ] Add unit tests for quick completion gate helper
- [ ] Add unit tests for convert quick to planned
- [ ] Add unit tests for provider body rendering
- [ ] Add integration test for `cy init`
- [ ] Add integration test for `cy quick --title "Fix typo"`
- [ ] Add integration test for `cy validate <id>`
- [ ] Add integration test for `cy sync <id>`
- [ ] Add integration test for `cy start <id>`
- [ ] Add integration test for `cy verify <id>`
- [ ] Add integration test for `cy complete <id> --no-pr --profile minimal`
- [ ] Add integration test for `cy review start <id>`
- [ ] Add UI tests for create quick change dialog
- [ ] Add UI tests for quick badge rendering
- [ ] Add UI tests for quick detail view
- [ ] Add UI tests for Scope checklist editing
- [ ] Add UI tests for validation warning display
- [ ] Add UI tests for convert to planned action
- [ ] Run `npm run check`
- [ ] Run `npm test`
- [ ] Run `npm run pack:check`
- [ ] Record final verification notes in this file

## Completed Baseline: Planning Profile Adoption

Status: `completed`

Remaining verification noise from that baseline: pre-existing `git-worktree` signing issue outside the planning-profile scope.

## Stage 0: Architecture Decision And Docs

Status: `completed`

- [x] Add `docs/planning-profiles.md`
- [x] Add `docs/adr-inline-planning.md` or equivalent ADR note
- [x] Document `openspec-lite` as the default planning profile
- [x] Document strict mode as optional and non-default
- [x] Document adapters as generated non-canonical mirrors
- [x] Add a README preview for planned change creation and planning status
- [x] Run `npm run check`
- [x] Run `npm test`

## Stage 1: Core Planning Model And Marker Parser

Status: `completed`

- [x] Add `src/planning/types.ts`
- [x] Add `src/planning/sections.ts`
- [x] Add `src/planning/model.ts`
- [x] Add `src/planning/validation.ts`
- [x] Add `src/planning/status.ts`
- [x] Add `src/planning/prompts.ts`
- [x] Implement marker parsing and replacement for `<!-- cy:* -->`
- [x] Preserve non-managed markdown outside markers
- [x] Detect duplicate, missing, and misordered markers
- [x] Add unit tests for marker parsing, replacement, and nested headings
- [x] Confirm existing `src/documents/sections.ts` behavior still passes tests

## Stage 2: Config And Planned Creation Flow

Status: `completed`

- [x] Extend planning config in `src/types.ts`
- [x] Extend defaults and schema in `src/config/`
- [x] Update `src/commands/init.ts` to emit planning defaults
- [x] Update `src/commands/create.ts` for `--planning`, `--strict`, and `--no-planning`
- [x] Decide between template injection and planned-template variants
- [x] Add or generate planned sections for feature, bug, refactor, and agent-task changes
- [x] Add tests for planned and strict planned creation flows

## Stage 3: CLI Status And Board-Service Exposure

Status: `completed`

- [x] Add `cy plan` command family in `src/cli.ts`
- [x] Add `src/commands/plan.ts`
- [x] Extend `src/commands/status.ts` with additive planning output
- [x] Extend `src/commands/list.ts` with `--planning`
- [x] Surface planning summary from `src/board/boardService.ts`
- [x] Add JSON output coverage for planned and unplanned changes

## Stage 4: Planning Validation And Lifecycle Gates

Status: `completed`

- [x] Extend `src/documents/validateDocument.ts` with planning-aware validation
- [x] Add gate-specific validation helpers
- [x] Enforce proposal readiness in `cy sync` for planned changes
- [x] Enforce design/tasks readiness in `cy start` for planned changes
- [x] Enforce task completion and verification readiness in `cy complete` for planned changes
- [x] Keep unplanned lifecycle behavior unchanged
- [x] Add integration tests for sync/start/complete gate failures and passes

## Stage 5: Agent Prompt Generation

Status: `completed`

- [x] Implement `cy plan prompt <id> <section>`
- [x] Add prompt templates under `src/planning/templates/prompts/`
- [x] Include canonical path, target markers, current content, and edit constraints
- [x] Add `--json` support for prompt generation
- [x] Add prompt tests that assert no default external-folder instructions

## Stage 6: Provider Sync And Review Projection

Status: `completed`

- [x] Add provider rendering helper for planning summaries
- [x] Include planning summary in synced remote issue bodies for planned changes
- [x] Include planning summary in review output
- [x] Keep unplanned provider rendering stable
- [x] Add provider tests for planned and unplanned changes

## Stage 7: UI Read-Only Planning Display

Status: `completed`

- [x] Extend root-to-UI adapter flow in `src/commands/ui.ts`
- [x] Expose planning summary through runtime APIs in `packages/kanban/src/runtime-stack/trpc/`
- [x] Add planning badges in the web UI
- [x] Add planning gate list and detail display in the web UI
- [x] Confirm UI reads canonical change markdown only
- [x] Run UI typecheck and a server smoke test

## Stage 8: UI Create, Validate, Sync, And Start Actions

Status: `completed`

- [x] Add planned change create flow in the UI
- [x] Add validation action with planning-aware error display
- [x] Route sync/start actions through shared board or command logic
- [x] Block UI start when planning gates fail
- [x] Show actionable gate failures with section names
- [x] Add runtime/API coverage for planned action flows

## Stage 9: UI Inline Editing

Status: `completed`

- [x] Add planning section update API
- [x] Reuse atomic mutation and locking behavior from `src/board/changeMutations.ts`
- [x] Implement marker-scoped planning writes only
- [x] Add stale-write conflict protection
- [x] Add UI editing flow with reload-on-conflict behavior
- [x] Add tests for safe updates and conflict handling

## Stage 10: Strict Mode

Status: `completed`

- [x] Add strict-mode enable and disable commands
- [x] Insert strict-only markers without duplicating content
- [x] Enforce clarifications, checklist, and analysis gates when strict mode is enabled
- [x] Expose strict-mode state in CLI and UI
- [x] Add strict-mode test coverage across lifecycle gates

## Stage 11: Adapter Export And Import

Status: `completed`

- [x] Add OpenSpec export/import adapters
- [x] Add Spec Kit export/import adapters
- [x] Write generated files under `.changeyard/cache/planning/`
- [x] Add non-canonical warning text to generated exports
- [x] Add round-trip tests for canonical section fidelity

## Stage 12: Final Docs, Migration, And Release Checks

Status: `completed`

- [x] Update README for planned and unplanned workflows
- [x] Update UI docs for planning behavior
- [x] Add adapter docs and migration guidance
- [x] Document opt-in enable/disable flow for existing issues
- [x] Run `npm run check`
- [x] Run `npm test`
- [x] Run `npm run pack:check`
- [x] Record final verification notes in this file

## Verification Log

- 2026-06-09: Completed Stage Q3 by adding `src/documents/validateQuick.ts`, wiring quick validation and warnings through `src/documents/validateDocument.ts`, extending planning config defaults/schema for quick mode, and adding quick validation coverage for valid, malformed, warn, and block cases in `tests/changeyard.test.ts`.
- 2026-06-09: Advanced Stage Q4 by adding `src/change/quickLifecycle.ts`, enforcing quick start and completion gates in `src/commands/start.ts` and `src/commands/complete.ts`, defaulting quick completion to the minimal check profile, and making sync/review rendering explicitly label quick workflow metadata in `src/commands/sync.ts` and `src/providers/renderIssueBody.ts`.
- 2026-06-09: Added Stage Q4 coverage in `tests/changeyard.test.ts` for quick sync rendering, quick start success and config blocking, quick completion profile and gate enforcement, and quick review context generation.
- 2026-06-09: `npm run check` passed after the Stage Q4 lifecycle slice. `npm test` printed the full pass set including the new quick lifecycle tests, but the command still leaves lingering `node --test` processes after the UI-server cleanup warnings, so the tracker keeps that verification step open until the suite exits cleanly.
- 2026-06-09: Added `cy quick` plus `cy create --quick` in `src/cli.ts`, routed both through shared create-option parsing, and updated top-level and command-specific help text with quick-mode examples.
- 2026-06-09: Added CLI coverage in `tests/changeyard.test.ts` for `cy quick --dry-run`, `cy create --quick --json`, and `cy quick --help`, and re-ran `npm run check`, `node --test dist/tests/changeyard.test.js`, and `npm test` successfully after the Stage Q2 slice.
- 2026-06-09: Added `src/templates/quick.md`, taught `cy init` to install it, and updated `src/commands/create.ts` so quick changes now emit `planning.model: none`, `workflow.mode: quick`, `priority: low`, quick labels, and the minimal check profile by default.
- 2026-06-09: Added `src/change/changeMetadata.ts` plus typed quick/planning/workflow/check metadata helpers in `src/types.ts`, and covered quick template installation, quick-change creation, and helper behavior in `tests/changeyard.test.ts`.
- 2026-06-09: `npm run check`, `node --test dist/tests/changeyard.test.js`, and `npm test` all passed after the Stage Q1 quick-mode implementation slice.
- 2026-06-09: Reviewed the attached quick-mode proposal, updated `PLAN.md` with the active quick-mode roadmap, and replaced the active `TASKS.md` tracker with concrete quick-mode stages while preserving the completed planning-profile baseline.
- 2026-06-09: Reviewed the attached planning-profile proposal and mapped it onto the current repo seams.
- 2026-06-09: Replaced the old active `PLAN.md` with the planning-profile adoption roadmap.
- 2026-06-09: Added `TASKS.md` as the live tracker for this implementation effort.
- 2026-06-09: Added `docs/planning-profiles.md` and `docs/adr-inline-planning.md`, and updated `README.md` with the planning-profile target and workflow preview.
- 2026-06-09: `npm run check` passed after the Stage 0 docs changes.
- 2026-06-09: Replaced the stale `tests/ui-server.test.ts` board-endpoint assertions with smoke coverage for the current built UI server surface (`/api/health`, `/manifest.json`, shell HTML, and `projects.list`).
- 2026-06-09: `npm test` passed after aligning the UI server smoke test with the current runtime server contract.
- 2026-06-09: Added `src/planning/types.ts`, `sections.ts`, `model.ts`, `validation.ts`, `status.ts`, and `prompts.ts` as the Stage 1 planning foundation.
- 2026-06-09: Added `tests/planning.test.ts` covering marked-section parsing, replacement, malformed markers, planning metadata, status summaries, and prompt generation.
- 2026-06-09: `npm run check` and `npm test` both passed after the Stage 1 planning foundation landed.
- 2026-06-09: Extended `ChangeyardConfig`, config defaults, and `configSchema` with planning defaults and UI planning settings.
- 2026-06-09: Added planned-change generation to `src/commands/create.ts`, including `--planning`, `--strict`, `--no-planning`, inline planning metadata, strict-mode markers, and dry-run messaging.
- 2026-06-09: Updated `src/cli.ts` help and parsing for planning-aware create flags.
- 2026-06-09: Added integration coverage for unplanned create, planned create, strict planned create, and planned dry-run output in `tests/changeyard.test.ts`.
- 2026-06-09: `npm run check` and `npm test` both passed after the Stage 2 planning config and creation flow landed.
- 2026-06-09: Extended `src/planning/status.ts` with a reusable planning summary object including gate counts, missing sections, errors, and next-action hints.
- 2026-06-09: Added `src/commands/plan.ts` and wired `cy plan status <id>` into `src/cli.ts`.
- 2026-06-09: Extended `src/commands/status.ts`, `src/commands/list.ts`, and `src/board/boardService.ts` to expose planning summaries consistently.
- 2026-06-09: Extended `src/types.ts` and `src/board/boardTypes.ts` so planning summaries are part of change summaries and board cards.
- 2026-06-09: Added Stage 3 coverage in `tests/changeyard.test.ts` and `tests/board-service.test.ts` for planned status output, `cy plan status`, `cy list --planning`, and board-service planning summaries.
- 2026-06-09: `npm run check` and `npm test` both passed after the Stage 3 planning status and board-service slice landed.
- 2026-06-09: Added shared planning section templates in `src/planning/templates.ts` so planned-create defaults and gate validation use the same source of truth.
- 2026-06-09: Extended `src/planning/validation.ts` and `src/documents/validateDocument.ts` with gate-aware planning validation for document, sync, start, and complete phases.
- 2026-06-09: Wired planning gates into `src/commands/sync.ts`, `src/commands/start.ts`, and `src/commands/complete.ts` so planned changes block on proposal, spec/design/tasks, strict checklist rules, and verification/task reconciliation.
- 2026-06-09: Added Stage 4 coverage in `tests/changeyard.test.ts` for malformed planning markers, sync gate failures, start gate failures, strict checklist blocking, incomplete planned completion, and successful planned completion.
- 2026-06-09: Added prompt template assets under `src/planning/templates/prompts/`, copied them in `build:cli`, and extended `src/planning/prompts.ts` to render marker-aware prompt output.
- 2026-06-09: Extended `src/commands/plan.ts`, `src/cli.ts`, and `src/index.ts` with `cy plan prompt <id> <section>` and JSON-compatible prompt output.
- 2026-06-09: Added Stage 5 coverage in `tests/changeyard.test.ts` plus updated `tests/planning.test.ts` for marker-aware prompt rendering.
- 2026-06-09: `npm run check` and `npm test` both passed after the Stage 4 lifecycle gates and Stage 5 prompt generation slices landed.
- 2026-06-09: Added `src/providers/renderIssueBody.ts` to render planning-aware sync and review projections while keeping the local markdown change canonical.
- 2026-06-09: Wired projected planning summaries into `src/commands/sync.ts`, `src/commands/review.ts`, and local review-start context generation.
- 2026-06-09: Added Stage 6 coverage in `tests/changeyard.test.ts` for planned local-folder sync, planned local-folder review publication, and mocked GitHub/GitLab/Forgejo sync payloads containing the planning projection.
- 2026-06-09: `npm run check` and `npm test` both passed after the Stage 6 provider sync and review projection slice landed.
- 2026-06-09: Added a root-injected `changeyardApi` in `src/commands/ui.ts` so the packaged UI server reads canonical change markdown via `ChangeyardBoardService` and marked planning sections rather than introducing a second planning datastore.
- 2026-06-09: Added runtime `changes.list` and `changes.get` APIs plus contract schemas in `packages/kanban/src/runtime-stack/core/api-contract.ts` and `packages/kanban/src/runtime-stack/trpc/`.
- 2026-06-09: Added a markdown-backed change strip, planning badges, and a read-only planning detail panel in `packages/kanban/web-ui/src/components/changeyard/` and wired them into `packages/kanban/web-ui/src/App.tsx`.
- 2026-06-09: `npm run check` passed after the Stage 7 runtime and web UI changes.
- 2026-06-09: `node --test --test-name-pattern='markdown-backed planned and unplanned changes' dist/tests/ui-server.test.js` passed, covering planned and unplanned `changes.list/get` responses through the UI server.
- 2026-06-09: `npm test` currently still reports a pre-existing failure in `git-worktree engine integrates with a real temporary git repository`; the new Stage 7 UI runtime test passes when run in isolation.
- 2026-06-09: Extended the injected `changeyardApi` in `src/commands/ui.ts` plus runtime `changes.create`, `changes.validate`, `changes.sync`, and `changes.start` routes so the UI can create planned changes and run lifecycle actions against the canonical markdown-backed core logic.
- 2026-06-09: Added a planned-create dialog, validation/sync/start controls, and planning-aware action error display in `packages/kanban/web-ui/src/App.tsx` and `packages/kanban/web-ui/src/components/changeyard/`.
- 2026-06-09: `npm run check` and `npm run build` passed after the Stage 8 runtime and UI action changes.
- 2026-06-09: `node --test dist/tests/ui-server.test.js` passed, including the Stage 8 mutation flow that creates a strict planned change, surfaces grouped validation errors with section markers, blocks sync/start until planning sections are filled, then allows sync/start once proposal, design, tasks, clarifications, and checklist content are present.
- 2026-06-09: Added a conflict-aware `updatePlanningSection` mutation in `src/board/changeMutations.ts`, exposed it through `src/commands/ui.ts`, and added runtime `changes.updatePlanningSection` support so inline planning edits reuse the existing lock and atomic-write path instead of introducing a second markdown writer.
- 2026-06-09: Replaced the Stage 7 read-only planning panel with inline section editors, markdown preview, and reload-on-conflict messaging in `packages/kanban/web-ui/src/App.tsx` and `packages/kanban/web-ui/src/components/changeyard/change-detail-planning-panel.tsx`.
- 2026-06-09: `npm run check` passed after the Stage 9 inline-editing and conflict-handling changes.
- 2026-06-09: `node --test dist/tests/ui-server.test.js` passed with Stage 9 coverage for marker-scoped `changes.updatePlanningSection` writes plus stale `expectedUpdatedAt` conflicts returning HTTP 409 and preserving the last successful section content.
- 2026-06-09: Added `cy plan strict enable <id>` and `cy plan strict disable <id>` in `src/commands/plan.ts` and `src/cli.ts`, keeping strict-only sections in the canonical markdown so disabling strict mode does not delete existing clarification, checklist, or analysis content.
- 2026-06-09: Strict-mode enable now inserts only missing strict markers, re-enable is idempotent, and disable relaxes strict-only lifecycle gates while leaving marker content intact for future re-enable flows.
- 2026-06-09: `npm run check` passed after the Stage 10 strict-mode command changes.
- 2026-06-09: `node --test dist/tests/changeyard.test.js` passed all new Stage 10 strict-mode tests, including strict enable idempotence and strict disable gate relaxation; the file still reports the pre-existing `git-worktree engine integrates with a real temporary git repository` failure caused by the environment's `git commit` path (`1Password: failed to fill whole buffer`).
- 2026-06-09: Added `src/planning/adapters.ts` plus `cy plan export <id> --format <openspec|speckit>` and `cy plan import <id> --format <openspec|speckit>` so OpenSpec and Spec Kit interoperability stays explicitly cache-backed and non-canonical.
- 2026-06-09: Adapter exports now write `README.md`, `manifest.json`, and per-section mirror files under `.changeyard/cache/planning/<change-id>/<format>/`, each carrying non-canonical warnings and an adapter-content marker so imports strip warning text before updating the canonical change markdown.
- 2026-06-09: `npm run check` passed after the Stage 11 adapter export/import changes.
- 2026-06-09: `node --test --test-name-pattern='plan export and import round-trip planning sections through non-canonical adapter mirrors' dist/tests/changeyard.test.js` passed, covering both OpenSpec and Spec Kit export/import mirrors and round-trip canonical section fidelity.
- 2026-06-09: Updated `README.md`, `docs/planning-profiles.md`, and `docs/kanban-integration.md` to describe the current planned and unplanned workflows, UI behavior, adapter mirrors, and strict-mode opt-in/out flow for existing planned changes.
- 2026-06-09: `npm run check` passed after the Stage 12 documentation and migration guidance updates.
- 2026-06-09: `npm run pack:check` passed, including a fresh build and `npm pack --dry-run` for the current package contents.
- 2026-06-09: Re-ran `npm test`; all new planning-profile coverage passed, but the suite still stalls on the pre-existing `git-worktree engine integrates with a real temporary git repository` path while `git commit -m initial` waits on `1Password` signing (`op-ssh-sign`). The planning-profile changes do not introduce an additional failing test.
