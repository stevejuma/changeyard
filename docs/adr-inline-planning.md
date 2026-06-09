# ADR: Inline Planning Profiles

Date: 2026-06-09
Status: Accepted

## Context

Changeyard already treats a local markdown change file as the canonical record for a non-trivial change.

That file already carries:

- intent
- lifecycle status
- workspace metadata
- provider sync metadata
- acceptance criteria
- completion notes

The planning-profile work needs to add a stronger proposal, design, tasks, and verification layer without breaking that local-first source-of-truth model.

OpenSpec and Spec Kit provide useful ideas, but their default layouts introduce additional folders and artifacts that do not fit Changeyard's default product model.

## Decision

Changeyard will adopt inline planning profiles inside the canonical change markdown file.

The default planning profile is `openspec-lite`.

Characteristics of the decision:

- planning data lives in `.changeyard/changes/*.md`
- managed planning sections use stable `<!-- cy:* -->` markers
- CLI and UI edit the same underlying markdown
- lifecycle gates are enforced by Changeyard itself
- strict planning checks are optional
- OpenSpec and Spec Kit compatibility is implemented as explicit export/import mirrors only

## Consequences

### Positive

- preserves a single canonical artifact per change
- keeps UI and CLI aligned on the same data model
- reduces user confusion about where planning truth lives
- allows gradual adoption because existing changes can remain unplanned
- supports agent-safe marker-scoped updates instead of whole-file rewrites

### Negative

- requires a robust marker parser and safe partial-write logic
- makes markdown validation more complex
- requires explicit conflict handling when multiple surfaces edit the same file
- means external OpenSpec or Spec Kit tools are adapters rather than first-class native stores

## Rejected alternatives

### Make OpenSpec canonical

Rejected because it would add a second default storage model and push Changeyard away from its markdown-first one-file thesis.

### Make Spec Kit canonical

Rejected because the default Spec Kit artifact layout is heavier than Changeyard's target default workflow and would force stricter planning than many changes need.

### Add a separate UI planning database

Rejected because it would create drift between the CLI and app surfaces and contradict the requirement that the local change markdown remains canonical.

## Implementation notes

The implementation is expected to follow these rules:

1. unplanned changes continue to work unchanged
2. planning is opt-in through `planning.model`
3. marker-scoped edits preserve unknown content outside managed sections
4. provider sync projects planning status outward without replacing local canonical ownership
5. adapter caches are never read implicitly by lifecycle commands

## Follow-up

The active implementation roadmap lives in `PLAN.md`, and the live execution tracker lives in `TASKS.md`.
