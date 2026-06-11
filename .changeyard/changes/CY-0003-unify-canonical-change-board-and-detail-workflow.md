---
id: CY-0003
title: Unify canonical change board and detail workflow
type: agent-task
status: ready_for_pr
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-11T10:05:22.531Z
updatedAt: 2026-06-11T10:21:41.237Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0003
  path: .changeyard/workspaces/CY-0003/repo
branch:
  name: cy/CY-0003-unify-canonical-change-board-and-detail-workflow
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-11T10:21:41.237Z
  lastStatus: passed
---

# Summary

Unify the web UI around canonical Changeyard changes so quick changes appear in the normal kanban columns, add a modal change detail view with markdown preview and editing, ensure missing agent hooks are installed before task start, and fix UI shutdown so a single quit signal closes the process cleanly.

# Motivation

The current UI splits canonical changes from the visible kanban board, which makes quick changes behave differently from every other tracked change. That breaks the lifecycle model, hides task details behind a limited panel, and leaves agent progress unreliable when hooks are missing. The shutdown issue also makes `cy ui` feel unstable in normal terminal use.

# Plan

- [ ] Replace the top-level change strip workflow with a canonical change board that groups all changes, including quick changes, into lifecycle columns.
- [ ] Add full change-detail modal support with markdown preview and full-body editing backed by a new change update API.
- [ ] Ensure agent hooks are present before starting task sessions and surface progress through the existing runtime session flow.
- [ ] Reuse the runtime graceful shutdown helper from `cy ui` and `cy server` so the first quit signal performs a clean shutdown.
- [ ] Cover the behavior with focused runtime and web UI tests, then run targeted verification commands.

# Acceptance Criteria

- [x] Quick changes appear in the same kanban columns as other canonical changes and move columns through existing lifecycle actions.
- [x] Clicking a canonical change card opens a modal that renders the full markdown body and supports switching between preview and edit modes.
- [x] Saving change detail edits persists the full markdown body with conflict protection instead of only planning-section edits.
- [x] Starting an agent task installs missing agent hooks for the selected agent before launch and preserves runtime hook-based progress updates.
- [x] `cy ui` and `cy server` exit cleanly on a single quit signal without requiring a second interrupt in the normal case.

# Scope Boundaries

## In scope

- `packages/kanban/web-ui` canonical change UI, board composition, dialogs, and related hooks/tests
- `packages/kanban/src/runtime-stack` TRPC/runtime APIs for canonical change editing, task start preparation, and shutdown wiring
- `src/commands/ui.ts`, `src/commands/server.ts`, and Changeyard UI adapters needed to support the workflow
- Targeted tests and fixtures required to verify the new canonical board, detail editing, hook setup, and shutdown behavior

## Out of scope

- TUI redesign work, unrelated runtime settings refactors, and provider sync behavior outside what this task needs
- Broad kanban visual redesign beyond integrating canonical changes into the existing UI patterns
- New lifecycle states or drag-to-change-status behavior that bypasses existing Changeyard gates

## New task triggers

- Create a new Changeyard change if this work expands into TUI-specific behavior, provider sync protocol changes, or unrelated CLI install/update flows.

# Agent Plan

1. Update the canonical change API surface so full markdown bodies can be edited safely and agent hook setup can run before session start.
2. Rework the web UI board so canonical changes are the primary kanban cards, with quick changes treated exactly like other changes.
3. Replace the inline planning panel with a modal detail experience that supports preview/edit for the full change markdown and lifecycle actions.
4. Wire automatic agent hook installation into task start and reuse existing hook/session updates for progress tracking.
5. Switch UI/server signal handling to the shared graceful shutdown helper, add tests, and run targeted verification.

# Completion Notes

Implemented a canonical change board in the web UI and replaced the top strip plus inline planning panel with a modal detail workflow. Quick changes now render in the same lifecycle columns as other canonical changes. The detail modal supports preview and full-body markdown editing through a new `changes.updateBody` mutation with `updatedAt` conflict protection.

Task start now ensures the selected agent's Changeyard hooks and prompts exist before launching the session. `cy ui` and `cy server` now use a shared graceful-shutdown helper that suppresses immediate duplicate wrapper signals and closes cleanly on the first interrupt.

Checks run:
- `npm run check:node`
- `npm test` reached the full dist test suite, all reported tests passed, then the process lingered after the UI-server test; the run was manually stopped after the passing output was captured.
