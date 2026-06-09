# PLAN: Quick Mode Implementation

Date: 2026-06-09

## Active Objective

Implement Changeyard quick mode for small, low-risk changes while preserving the markdown-first source-of-truth model and the completed planned-change workflow.

Quick mode is a first-class workflow lane, not an escape hatch from tracking. A quick change still has a canonical `.changeyard/changes/*.md` file, can be listed in CLI and UI, can sync to providers, can use a workspace, can run checks, and can produce completion/review notes. It simply uses `planning.model: none`, `workflow.mode: quick`, and a minimal issue body instead of OpenSpec-lite planning sections.

## Relationship To Completed Planning Work

The planning-profile work below remains the baseline:

- planned changes use `planning.model: openspec-lite` or strict planning
- lifecycle gates apply only when planning is enabled
- UI and CLI read/write the same canonical markdown
- provider and review projections are generated from local markdown
- adapter exports/imports remain non-canonical mirrors

Quick mode must build on those seams and must not weaken planned-change gates.

## Quick Mode Product Model

Workflow lanes:

| Lane | Canonical file | Planning model | Workspace | Intended use |
|---|---:|---:|---:|---|
| Direct edit | No | none | No | User intentionally edits outside Changeyard |
| Quick change | Yes | `none` | Optional later; initially same as normal start | Small, explicit, low-risk work |
| Planned change | Yes | `openspec-lite` or strict | Yes | Behavior, architecture, API, provider, workspace, UI workflow, storage, security, or ambiguous work |

Generated quick-change frontmatter should include:

```yaml
planning:
  model: none
workflow:
  mode: quick
  risk: low
  requiresWorkspace: true
checks:
  profile: minimal
  lastRun: null
  lastStatus: null
```

Generated quick-change sections:

```md
# Summary
# Scope
# Acceptance Criteria
# Completion Notes
```

Quick changes intentionally omit Proposal, Specification Deltas, Design, Tasks, Verification, Clarifications, Requirements Checklist, and Consistency Analysis sections unless converted to planned mode.

## Quick Mode Design Rules

1. `.changeyard/changes/*.md` remains the only canonical quick-change source.
2. `cy quick` and `cy create --template quick` must produce equivalent quick changes.
3. Quick changes must validate without OpenSpec-lite markers or gates.
4. Planned changes must keep all existing planning gates.
5. Existing change files without `planning` or `workflow` frontmatter keep legacy/default behavior.
6. Quick-mode risk guardrails are explicit checklist/config rules, not initial static code analysis.
7. UI quick-mode support must call shared markdown-backed backend operations, not create separate Kanban state.
8. Provider and review output should clearly label quick mode and avoid noisy planned-change sections.
9. No-workspace quick completion is deferred until the workspace-backed quick flow is stable.

## Quick Mode Implementation Stages

### Stage Q1: Data model and template

Purpose:
- create the quick template and generated metadata without changing lifecycle behavior

Primary files:
- `src/templates/quick.md`
- `src/commands/init.ts`
- `src/commands/create.ts`
- `src/types.ts`
- `src/change/changeMetadata.ts`

Deliverables:
- `cy init` installs `.changeyard/templates/quick.md` without overwriting user templates
- `cy create --template quick --title "Fix typo"` creates a valid quick change
- quick changes default to `priority: low`, `labels: quick, low-risk`, `planning.model: none`, `workflow.mode: quick`, and `checks.profile: minimal`
- typed metadata helpers for planning model, workflow mode, quick-change detection, and check profile

### Stage Q2: CLI ergonomics

Purpose:
- make quick mode easy to discover and use

Primary files:
- `src/cli.ts`
- `src/commands/create.ts`
- CLI tests

Deliverables:
- `cy quick --title "Fix typo in README"`
- `cy create --quick --title "Fix typo"`
- `cy quick --dry-run`
- `cy quick --json` consistent with existing create output conventions
- help text and examples for `quick` and `create`
- existing aliases `new`, `begin`, `check`, and `done` remain stable

### Stage Q3: Quick validation and risk guardrails

Purpose:
- validate quick changes intentionally and expose low-risk checklist violations

Primary files:
- `src/documents/validateDocument.ts`
- `src/documents/validatePlanning.ts` or equivalent planning/workflow validation module
- `src/config/defaults.ts`
- `src/config/schema.ts`
- `src/types.ts`

Deliverables:
- quick changes require `planning.model: none` and `workflow.mode: quick`
- Summary, Scope, Acceptance Criteria, and Completion Notes sections are validated
- Scope checklist presence is validated
- OpenSpec-lite required markers are rejected for quick changes unless converted
- config supports `planning.allowQuickChanges`, `quickChangeCheckProfile`, `quickChangeRequiresWorkspace`, and `quickChangeEscalation: off | warn | block`
- `ValidationResult` supports warnings or an equivalent non-blocking warning path

### Stage Q4: Lifecycle integration

Purpose:
- ensure quick changes sync, start, complete, and review through the normal lifecycle without planned-change gates

Primary files:
- `src/commands/sync.ts`
- `src/commands/start.ts`
- `src/commands/complete.ts`
- `src/commands/review.ts`
- validation/gate helpers

Deliverables:
- `cy sync` works for quick changes and labels workflow metadata
- `cy start` blocks when quick mode is disabled or blocking guardrails fail
- `cy start` does not require Proposal, Design, Specification Deltas, Tasks, or Verification planning sections
- `cy complete --no-pr --profile minimal` uses the minimal profile by default for quick changes
- quick completion requires verification when a workspace was started, non-placeholder Completion Notes, reconciled Acceptance Criteria, and checks-run notes or a not-run rationale
- `cy review start` includes quick metadata and minimal sections

### Stage Q5: Convert quick to planned

Purpose:
- allow escalation without losing the change ID or history

Primary files:
- `src/commands/plan.ts`
- planning section/template helpers
- `src/board/changeMutations.ts` if UI/backend conversion uses shared mutations

Deliverables:
- `cy plan convert <id> --model openspec-lite`
- conversion preserves id, title, status, remote metadata, workspace metadata, branch, checks, and existing quick Scope
- conversion updates frontmatter to `planning.model: openspec-lite` and `workflow.mode: planned`
- conversion inserts OpenSpec-lite markers without duplicating content
- conversion is allowed for `ready`, `synced`, and `blocked`
- conversion blocks `in_progress`, `ready_for_pr`, `pr_open`, `in_review`, `approved`, `merged`, and `abandoned` unless `--force`

### Stage Q6: UI support

Purpose:
- make quick changes first-class in the UI through canonical markdown-backed operations

Primary files:
- `src/commands/ui.ts`
- `src/board/boardService.ts`
- `src/board/changeMutations.ts`
- `packages/kanban/src/runtime-stack/trpc/*`
- `packages/kanban/web-ui/src/components/**/*`

Deliverables:
- create dialog supports Quick change, Planned change, and Strict planned change
- quick cards show Quick, Planning: none, and Risk: low badges
- quick detail view shows Summary, Scope, Acceptance Criteria, Completion Notes, provider details, workspace details, and checks
- quick section edits write back to `.changeyard/changes/*.md`
- UI validate/sync/start actions use the same backend logic as CLI
- UI convert action calls the same conversion operation as CLI
- filtering supports quick/planned and planning-none/openspec-lite lanes

### Stage Q7: Provider sync and review rendering

Purpose:
- keep remote issues and review artifacts readable for quick changes

Primary files:
- `src/providers/renderChangeIssueBody.ts` or existing provider rendering helpers
- `src/commands/sync.ts`
- `src/commands/review.ts`

Deliverables:
- provider issue bodies clearly label Mode: quick, Planning: none, Risk: low
- quick provider bodies include Summary, Scope, Acceptance Criteria, and local source-of-truth path
- quick provider bodies omit OpenSpec-lite-only sections
- review artifacts include quick metadata, completion notes, check summaries, workspace metadata, and remote metadata

### Stage Q8: Optional no-workspace quick completion

Purpose:
- support explicit main-working-tree quick completion only after the workspace-backed path is stable

Primary files:
- `src/commands/create.ts`
- `src/commands/complete.ts`
- VCS/diff helpers
- docs and tests

Deliverables:
- `cy quick --title "Fix typo" --no-workspace`
- `workflow.requiresWorkspace: false` and `workflow.completionPath: local`
- `cy complete` refuses no-workspace completion unless explicitly allowed
- checks run in the repo root
- workspace verification is skipped only with explicit no-workspace metadata/flag
- command and review output clearly state that workspace verification was skipped

### Stage Q9: Documentation and examples

Purpose:
- document how to choose between direct edits, quick changes, planned changes, and strict planned changes

Primary files:
- `README.md`
- `docs/`
- CLI help text
- UI create-dialog copy

Deliverables:
- README explains quick mode and when not to use it
- docs include `cy quick`, `cy create --template quick`, `cy create --quick`, and `cy plan convert`
- agent guidance says to use quick mode only for obvious, low-risk edits and to convert/create planned changes when in doubt
- docs match CLI and UI behavior

### Stage Q10: Release verification

Purpose:
- close the feature with full coverage and package checks

Required checks:

```bash
npm run check
npm test
npm run pack:check
```

Coverage targets:
- quick template and create flows
- `cy quick` parsing and JSON/dry-run behavior
- quick metadata helpers
- quick validation success/failure/warning/blocking behavior
- quick lifecycle gates
- convert quick to planned
- provider body rendering
- UI create/detail/edit/validate/sync/start/convert flows

## Quick Mode Recommended Build Order

1. Template and generated metadata
2. `cy quick` and `cy create --quick`
3. Metadata helpers
4. Quick validation and config
5. Start, complete, and review gates
6. Convert quick to planned
7. Provider projection
8. UI create/detail/badges/actions
9. Documentation
10. Optional no-workspace mode
11. Final release checks

## Quick Mode Main Risks

- Quick mode becomes a loophole for risky work
- Validation logic fragments between planned and quick changes
- UI creates separate quick-change state
- Provider bodies become noisy or ambiguous
- No-workspace mode weakens safety

Mitigations:

- require explicit Scope checklist and configurable escalation
- centralize planning/workflow metadata helpers
- reuse CLI/backend markdown mutations for UI actions
- add workflow-aware provider rendering
- defer no-workspace mode and make it opt-in with clear output

## Quick Mode Definition Of Done

- `cy init` installs a quick template
- `cy quick --title "<title>"` creates a valid quick change
- `cy create --template quick --title "<title>"` and `cy create --quick --title "<title>"` work
- quick changes include `planning.model: none`, `workflow.mode: quick`, and `checks.profile: minimal`
- quick changes validate without OpenSpec-lite sections
- planned-change validation does not apply to quick changes
- quick changes can be synced, started, verified, completed, and reviewed
- quick completion still requires completion notes and configured checks
- provider and review output clearly label quick changes
- UI can create, display, edit, validate, sync, start, and convert quick changes without separate state
- quick changes can be converted to planned changes before implementation starts
- existing templates, configs, planned changes, and legacy changes stay backward-compatible
- README/docs explain when to use quick mode and when not to
- `npm run check`, `npm test`, and `npm run pack:check` pass

---

# Completed Baseline: Planning Profile Adoption

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
