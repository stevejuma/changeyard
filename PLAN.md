# PLAN: Planning Profile Adoption

Date: 2026-06-09

## Objective

Adopt a Changeyard-native planning profile that keeps planning data inside the canonical `.changeyard/changes/*.md` file, exposes that data through CLI and UI, and enforces lifecycle gates only for planning-enabled changes.

The default planning profile will be `openspec-lite`:

- inline markdown sections inside the change file
- stable `<!-- cy:* -->` markers for machine-safe edits
- CLI status, validation, prompt, and lifecycle gate support
- UI read/write support over the same canonical markdown
- optional strict mode inspired by Spec Kit
- optional OpenSpec / Spec Kit export-import adapters as generated mirrors only

## Current Repo Seams

The current codebase already has the main integration points this work should build on:

- CLI command entrypoint: `src/cli.ts`
- change creation and lifecycle: `src/commands/create.ts`, `sync.ts`, `start.ts`, `complete.ts`, `review.ts`
- document parsing and validation: `src/documents/frontmatter.ts`, `sections.ts`, `validateDocument.ts`
- UI bridge from CLI package: `src/commands/ui.ts`
- shared board service used by the app-facing surface: `src/board/boardService.ts`
- safe change mutation and atomic writes: `src/board/changeMutations.ts`
- packaged UI server: `packages/kanban/src/server/index.js`
- app runtime APIs: `packages/kanban/src/runtime-stack/trpc/*.ts`

This means the adoption should extend the existing change-file model rather than invent a second planning datastore.

## Non-Negotiable Design Rules

1. `.changeyard/changes/*.md` remains the only canonical planning source.
2. UI and CLI must read and write the same markdown file.
3. Planning gates apply only when `planning.model` is enabled.
4. Existing unplanned changes must continue to work without behavior changes.
5. External OpenSpec or Spec Kit files are exports/imports, never the source of truth.
6. Managed edits must be marker-scoped so unknown markdown stays intact.

## Target Model

Planned changes will carry planning metadata in frontmatter plus inline managed sections.

Example frontmatter shape:

```yaml
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
```

Managed sections:

- `proposal`
- `spec-deltas`
- `design`
- `tasks`
- `verification`
- strict-only: `clarifications`, `requirements-checklist`, `analysis`

Markers:

```md
<!-- cy:proposal:start -->
...
<!-- cy:proposal:end -->
```

## CLI Scope

Add a planning command family and planning-aware creation flow:

```bash
cy create --planning openspec-lite
cy create --planning openspec-lite --strict
cy plan status CY-0007
cy plan validate CY-0007
cy plan prompt CY-0007 proposal
cy plan export CY-0007 --format openspec
cy plan import CY-0007 --format speckit
```

Lifecycle behavior:

- `cy sync` requires proposal readiness for planned changes
- `cy start` requires plan readiness for planned changes
- `cy complete` requires verification and task reconciliation for planned changes
- unplanned changes keep current behavior

## UI Scope

The app should become a first-class planning surface over the same markdown:

- planning badges in list and card views
- planning status and gate summaries in detail views
- read-only planning display before inline editing
- create flow support for planning profile and strict mode
- validation, sync, and start actions backed by the existing CLI-core functions
- marker-scoped planning section editing with conflict protection

This should be wired through existing seams first:

- `src/board/boardService.ts` for change-level reads and lifecycle actions
- `src/board/changeMutations.ts` for safe file mutation
- `src/commands/ui.ts` for passing root-package capabilities into the UI server

## Implementation Stages

### Stage 0: Architecture decision and docs

Purpose:
- make the native inline-planning direction explicit

Primary files:
- `README.md`
- `docs/planning-profiles.md`
- `docs/adr-inline-planning.md`

Deliverables:
- document `openspec-lite` as the default profile
- document strict mode as optional
- document adapter exports/imports as non-canonical mirrors

### Stage 1: Core planning model and marker parser

Purpose:
- add safe planning section parsing and replacement without breaking existing H1-based logic

Primary files:
- `src/planning/types.ts`
- `src/planning/sections.ts`
- `src/planning/model.ts`
- `src/planning/validation.ts`
- `src/planning/status.ts`
- `src/planning/prompts.ts`
- `src/documents/validateDocument.ts`

Deliverables:
- marker parser for `<!-- cy:* -->`
- section replacement constrained to marker ranges
- planning metadata model and gate model
- compatibility with existing `parseSections()` behavior

### Stage 2: Config and planned creation flow

Purpose:
- allow repos and changes to opt into planning cleanly

Primary files:
- `src/types.ts`
- `src/config/schema.ts`
- `src/config/defaults.ts`
- `src/commands/init.ts`
- `src/commands/create.ts`
- `src/templates/*.md`

Deliverables:
- planning config defaults
- `cy create --planning` and `--strict`
- planned change template injection without breaking custom templates

### Stage 3: Planning status in CLI and board service

Purpose:
- expose planning metadata immediately after creation

Primary files:
- `src/cli.ts`
- `src/commands/status.ts`
- `src/commands/list.ts`
- `src/commands/plan.ts`
- `src/board/boardService.ts`

Deliverables:
- `cy plan status`
- additive planning fields in JSON output
- planning phase visibility in `cy list --planning`
- planning summary on board-service card payloads

### Stage 4: Planning validation and lifecycle gates

Purpose:
- enforce planning at the right lifecycle boundaries

Primary files:
- `src/documents/validateDocument.ts`
- `src/commands/validate.ts`
- `src/commands/sync.ts`
- `src/commands/start.ts`
- `src/commands/complete.ts`
- `src/commands/review.ts`

Deliverables:
- gate-aware validation
- actionable gate failures pointing to exact sections
- no behavior regression for unplanned issues

### Stage 5: Agent prompt generation

Purpose:
- give agents a safe canonical-file workflow

Primary files:
- `src/commands/plan.ts`
- `src/planning/prompts.ts`
- `src/planning/templates/prompts/*.md`

Deliverables:
- `cy plan prompt <id> <section>`
- prompts that target one marker only
- prompts that explicitly forbid creating `openspec/` or `specs/` folders by default

### Stage 6: Provider sync and review projection

Purpose:
- project planning state into remote issues and reviews without changing the local source of truth

Primary files:
- provider rendering helpers under `src/providers/`
- `src/commands/sync.ts`
- `src/commands/review.ts`

Deliverables:
- planning summary included in synced remote issue bodies
- planning summary included in review output
- clear notice that local markdown remains canonical

### Stage 7: UI read-only planning display

Purpose:
- show planning state in the app before allowing writes

Primary files:
- `src/commands/ui.ts`
- `src/board/boardService.ts`
- `packages/kanban/src/server/index.js`
- `packages/kanban/src/runtime-stack/trpc/*.ts`
- `packages/kanban/web-ui/src/components/**/*`

Deliverables:
- planning badges
- planning gate list
- planned/unplanned change detail display
- no new planning state files

### Stage 8: UI lifecycle actions and planned create flow

Purpose:
- let the UI create, validate, sync, and start planned changes through shared core logic

Primary files:
- `src/board/boardService.ts`
- `packages/kanban/src/runtime-stack/trpc/*.ts`
- `packages/kanban/web-ui/src/components/**/*`

Deliverables:
- planned change creation from the UI
- lifecycle actions blocked by the same gate logic as CLI
- useful UI error messages with missing section names

### Stage 9: UI inline editing

Purpose:
- edit planning sections directly in the canonical change file

Primary files:
- `src/board/changeMutations.ts`
- `src/planning/sections.ts`
- `packages/kanban/src/runtime-stack/trpc/*.ts`
- `packages/kanban/web-ui/src/components/**/*`

Deliverables:
- `planning.updateSection`
- marker-scoped writes only
- conflict protection with hash or timestamp precondition

### Stage 10: Strict mode

Purpose:
- add optional heavier planning quality gates without burdening the default workflow

Primary files:
- `src/planning/*`
- `src/commands/plan.ts`
- UI planning components

Deliverables:
- enable/disable strict mode on an existing planned issue
- strict section insertion without duplication
- strict start and complete gate enforcement

### Stage 11: Adapter export/import

Purpose:
- interoperate with OpenSpec and Spec Kit without making them canonical

Primary files:
- `src/planning/adapters/openspec/*`
- `src/planning/adapters/speckit/*`

Deliverables:
- export/import commands
- generated cache under `.changeyard/cache/planning/`
- round-trip coverage for section fidelity

### Stage 12: Final docs, migration, and release checks

Purpose:
- document opt-in migration and close the feature with clear guarantees

Primary files:
- `README.md`
- `docs/ui.md`
- `docs/provider-sync.md`
- `docs/adapters.md`

Deliverables:
- migration guidance for existing issues
- planned vs unplanned workflow docs
- release notes and final verification

## Recommended Build Order

1. Stage 0
2. Stage 1
3. Stage 2
4. Stage 3
5. Stage 4
6. Stage 5
7. Stage 7
8. Stage 8
9. Stage 9
10. Stage 10
11. Stage 6
12. Stage 11
13. Stage 12

The key dependency is parser/model first, then CLI behavior, then read-only UI visibility, then UI writes.

## Verification Strategy

Core checks expected during the rollout:

```bash
npm run check
npm test
npm run pack:check
```

Additional targeted coverage:

- planning parser and replacement tests
- create/status/list/validate/sync/start/complete planning integration tests
- provider rendering tests for planned and unplanned changes
- UI runtime contract tests for planning summaries and actions
- browser smoke for planning badges, detail panels, and gated actions

## Main Risks

- marker replacement corrupts user markdown
- UI accidentally creates a second planning state model
- lifecycle gates break existing unplanned workflows
- provider bodies become verbose or ambiguous
- UI and CLI edits race and overwrite each other

Mitigations:

- marker-scoped parsing and atomic writes
- reuse `changeMutations` locking behavior
- additive config and output changes
- explicit canonical-source wording in provider projections
- stale-write conflict checks for UI edits

## Definition of Done

- unplanned changes behave exactly as they do now
- planned changes can be created with `cy create --planning openspec-lite`
- `cy plan status` reports model, phase, gates, and next action
- `cy sync`, `cy start`, and `cy complete` enforce planning only when enabled
- UI shows planning state from the same markdown files used by CLI
- UI can safely edit planning sections without creating a second datastore
- provider sync and review include planning summaries while preserving local canonical ownership
- optional adapters round-trip through generated cache paths only
- docs explain the workflow clearly
- release checks pass
