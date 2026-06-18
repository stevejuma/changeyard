---
id: CY-0020
title: Add docs-backed CLI help and rich console output
type: agent-task
status: synced
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-17T16:25:11.177Z
updatedAt: 2026-06-17T16:25:57.829Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0020
  path: .changeyard/workspaces/CY-0020/repo
branch:
  name: cy/CY-0020-add-docs-backed-cli-help-and-rich-console-output
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

Implement docs-backed CLI help, JJ-style color handling, richer human console output, and runtime hook ignore fixes.

# Motivation

Changeyard's current CLI help is manually assembled in `src/cli.ts`, which makes nested command docs and possible values easy to miss or drift. Human command output is also mostly raw `key: value` text, and generated runtime hook files can leak into workspace change detection. This change makes CLI documentation maintainable, improves terminal readability, and keeps generated hook artifacts out of user work.

# Plan

- [ ] Add `docs/cli` markdown docs and a CLI help loader/renderer that supports nested command help and topics.
- [ ] Add color detection, global color flags, and richer human output renderers for high-value command surfaces.
- [ ] Update `cy update` messaging and docs to distinguish static scaffold artifacts from runtime session hooks.
- [ ] Add VCS-aware ignore handling for generated runtime hook files and cover Git/JJ behavior.
- [ ] Run focused build and tests, then update completion notes.

<!-- cy:proposal:start -->
# Proposal

## Intent

Make Changeyard CLI documentation docs-backed and easier to maintain, while improving terminal output clarity and ensuring generated runtime hook files stay out of workspace diffs.

## Scope

### In Scope

- [ ] Markdown-backed command and topic docs under `docs/cli`.
- [ ] Help lookup for root, command, nested subcommand, and `help -k` topic forms.
- [ ] Global `--color <always|never|auto>` handling with terminal/environment detection.
- [ ] Rich human renderers for help, errors, doctor, status, next, plan status, workspace status, list, and workspace list.
- [ ] Runtime generated hook file ignore support for Git and JJ workspaces.
- [ ] Focused tests for docs loading, help, color, rich output, and hook ignore behavior.

### Out of Scope

- [ ] Replacing the custom CLI parser with a new framework.
- [ ] Changing JSON output schemas or hook ingest wire behavior.
- [ ] Persisting task/session-specific hook configuration from `cy update`.
- [ ] Refactoring unrelated web UI or review code already dirty in the main checkout.

## Approach

Keep command execution in TypeScript while moving user-facing help prose into markdown files. Add a small local renderer for help and rich terminal output, then route human command responses through it in `src/cli.ts`. Preserve plain/json output where scripts depend on it. Add a shared VCS-aware ignore helper and use it for generated runtime hook files.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- `cy help <command> [subcommand]`, `cy <command> --help`, and `cy <command> <subcommand> --help` SHALL render docs-backed help content.
- `cy help -k <topic>` SHALL render a markdown-backed CLI help topic.
- `cy --color <always|never|auto>` SHALL control ANSI color in human output.
- Human output for selected command surfaces SHALL use richer terminal formatting when color/rich output is enabled.
- Generated runtime hook files SHALL be locally ignored in Git and JJ workspaces where supported.

## MODIFIED Requirements

- Root CLI help SHALL be generated from command metadata and markdown docs rather than duplicated manual strings.
- `cy update` help/output SHALL list supported agent tool values and clarify runtime hook behavior.
- Error output SHALL preserve existing messages and exit codes while allowing colored error codes on terminals.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Add CLI docs under `docs/cli` and copy them during `build:cli`. Implement a docs loader that parses minimal frontmatter plus markdown body, maps command paths/topics, and exposes data to a help renderer. Add a color-support module and a small styling API. Add terminal renderers that consume existing command data where available and fall back to plain strings where needed. Add a local ignore helper for generated hook files and wire it into Cursor/Copilot adapter paths.

## Architecture Decisions

- Keep the custom CLI parser and avoid adding a large CLI framework dependency in this change.
- Use docs-backed markdown as canonical prose, with code retaining command routing and validation.
- Keep JSON and machine-oriented output uncolored.
- Prefer explicit tests for supported command surfaces over broad snapshot churn.

## Data / State Impact

Adds tracked documentation files under `docs/cli`. Build output copies those docs into `dist/src/docs/cli`. No Changeyard state schema or provider schema changes are expected.

## Workspace / Provider Impact

Runtime hook files generated for agent sessions should no longer appear as workspace changes in Git/JJ workspaces. Provider sync remains noop/configured-provider behavior and is not changed.

## Risks

- Help docs can drift from command routing; mitigate with docs loader tests that validate command paths and option values.
- Rich output can break scripts; mitigate by preserving JSON and adding `--color never`/plain paths.
- JJ ignore handling can differ by version; mitigate with focused JJ-backed tests and best-effort fallback behavior.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [ ] Add docs-backed help loader and markdown docs
- [ ] Add color detection and terminal renderer
- [ ] Add rich output renderers for selected commands
- [ ] Add VCS-aware generated hook ignore handling

## 3. Verification

- [ ] Run focused build and tests
- [ ] Record results and residual risk
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm run build:cli`
- `node --test --test-force-exit dist/tests/changeyard.test.js`
- Focused Kanban runtime adapter tests that cover generated hook files

## Manual Scenarios

- `cy --help`, `cy help hooks`, `cy hooks ingest --help`, and `cy help -k hooks` render useful docs-backed content.
- `cy --color always doctor` emits ANSI-colored status markers; `cy --color never doctor` does not.
- Generated Cursor/Copilot hook files do not appear as workspace changes.

## Result

_Not run yet._
<!-- cy:verification:end -->

# Acceptance Criteria
- [ ] CLI help docs live under `docs/cli` and are copied into built CLI output.
- [ ] Root, command, nested command, and topic help are docs-backed and show possible values.
- [ ] Global `--color <always|never|auto>` works with flag/env/TTY detection.
- [ ] Human console output is richer for doctor, status, next, plan status, workspace status, list, workspace list, and error output.
- [ ] JSON and machine-oriented output remain uncolored.
- [ ] `cy update` docs/output clarify static artifacts versus runtime session hooks.
- [ ] Generated runtime hook files are ignored for Git/JJ workspace change detection where supported.
- [ ] Focused verification commands pass or blockers are documented.

# Agent Plan

Use the Changeyard lifecycle gates before product edits, then implement inside the verified workspace only. Start with CLI docs and loader because help rendering depends on it, add color detection/rendering, then richer command output, then hook ignore handling. Finish with focused tests and completion notes.

# Completion Notes

Summarize what changed, what checks ran, and what risks remain.
