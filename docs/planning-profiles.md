# Changeyard Planning Profiles

This document defines the current planning-profile model Changeyard implements for structured change planning.

## Status

The implementation is tracked in `PLAN.md` and `TASKS.md`, but the workflow described here is now available in the current repository.

## Core decision

Changeyard will add planning without changing its source-of-truth model.

Canonical planning state stays in:

- `.changeyard/changes/*.md`

Planning state will not become canonical in:

- `openspec/`
- `specs/`
- `checklists/`
- UI-specific state files
- Kanban card databases

## Default profile: `openspec-lite`

The default planning profile is `openspec-lite`.

It is "lite" in the sense that it borrows the useful shape of OpenSpec-style planning while staying native to Changeyard's existing one-file change model.

The default inline planning sections are:

- `Proposal`
- `Specification Deltas`
- `Design`
- `Tasks`
- `Verification`

These sections will be machine-addressable through stable marker pairs:

```md
<!-- cy:proposal:start -->
...
<!-- cy:proposal:end -->
```

Those markers allow the CLI, UI, and agents to update only the managed planning section without rewriting unrelated user content in the same file.

## Strict mode

Strict mode is optional and non-default.

Strict mode adds heavier planning checks inspired by Spec Kit, but Changeyard will not make those checks mandatory for the default workflow.

Strict mode adds the following managed sections:

- `Clarifications`
- `Requirements Checklist`
- `Consistency Analysis`

Strict mode exists for teams that want stronger spec hygiene before work starts, but the default Changeyard planning path remains lightweight enough for everyday feature and refactor work.

## Canonical storage model

A planned change still remains a single markdown file under `.changeyard/changes/`.

The planned shape is:

1. frontmatter records the planning model, strictness, phase, and gates
2. inline marker-managed sections hold planning content
3. regular markdown sections such as `Summary`, `Motivation`, `Acceptance Criteria`, and `Completion Notes` remain in the same file

This keeps planning, lifecycle state, provider metadata, and completion notes together in one artifact.

## CLI surface

The primary planning surface is a native Changeyard command family:

```bash
cy create --planning openspec-lite
cy create --planning openspec-lite --strict
cy plan status CY-0007
cy plan prompt CY-0007 proposal
cy plan strict enable CY-0007
cy plan strict disable CY-0007
cy plan export CY-0007 --format openspec
cy plan import CY-0007 --format speckit
```

Changeyard does not require the `openspec` CLI or `specify` / Spec Kit tooling for normal use.

For existing planned changes:

- `cy plan strict enable <id>` inserts only missing strict sections and keeps re-enable idempotent
- `cy plan strict disable <id>` relaxes strict-only gates without deleting clarification, checklist, or analysis content

For existing unplanned changes:

- the current opt-in path is to create a new planned change
- a dedicated "enable planning on an existing unplanned change" command is not implemented yet

## UI behavior

The UI is a first-class surface over the same canonical markdown.

Current app behavior:

- show planning badges on changes
- show planning sections and gate status in detail views
- create planned changes with optional strict mode
- edit planning sections inline with marker-scoped writes
- reload the latest section content when a stale-write conflict is detected
- use the same validation and lifecycle rules as CLI
- write planning edits back into `.changeyard/changes/*.md`
- avoid any separate planning database or board-state files

## Adapter mirrors

Changeyard may export and import OpenSpec or Spec Kit folder layouts for interoperability, but those artifacts are generated mirrors only.

Generated planning adapters will live under:

```text
.changeyard/cache/planning/
```

Rules for adapters:

- exports are non-canonical mirrors
- lifecycle commands do not read adapter caches implicitly
- imports explicitly update the canonical change file
- generated `README.md`, `manifest.json`, and section mirror files should carry a warning that the local change markdown remains canonical

Current commands:

```bash
cy plan export CY-0007 --format openspec
cy plan import CY-0007 --format openspec
cy plan export CY-0007 --format speckit
cy plan import CY-0007 --format speckit
```

Mirror layout:

- `.changeyard/cache/planning/<change-id>/openspec/`
- `.changeyard/cache/planning/<change-id>/speckit/`

Imports strip adapter warning text before updating canonical planning sections.

## Backward compatibility

Planning is opt-in.

Expected compatibility guarantees:

- existing changes without planning metadata continue to work
- existing templates keep their current simple flow
- planning gates apply only when a change enables a planning model
- normal installation, build, test, and usage flows must not depend on external planning CLIs

## Summary

Changeyard planning profiles extend the existing markdown-first workflow rather than replace it:

- one canonical local change file
- `openspec-lite` by default
- strict mode only when requested
- UI and CLI operating on the same markdown
- external planning folders treated as interoperability mirrors, not truth
