# TASKS: Planning Profile Adoption

Date: 2026-06-09

Objective: Implement the native inline planning profile described in `PLAN.md` without breaking the existing markdown-first change workflow.

## Tracker Rules

- `TASKS.md` is the live execution tracker for this initiative.
- Update stage status and verification notes as implementation lands.
- Keep completed work checked off and leave pending work explicit.
- `PENDING.md` reflects the previous kanban migration effort and is not the active tracker for this feature.

## Current Status

- [x] Proposal reviewed and translated into a repo-specific plan
- [x] `PLAN.md` rewritten for planning-profile adoption
- [x] `TASKS.md` created as the live tracker
- [x] Implementation started
- [x] End-to-end planning profile adoption complete

Current focus: Complete. Remaining verification noise is a pre-existing `git-worktree` signing issue outside the planning-profile scope.

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
