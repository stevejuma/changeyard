---
id: CY-0001
title: Expand web UI project settings and JJ base ref selection
type: agent-task
status: in_review
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-11T08:44:49.845Z
updatedAt: 2026-06-17T13:48:39.789Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0001
  path: .changeyard/workspaces/CY-0001/repo
  lastVerificationStatus: passed
  lastVerifiedAt: 2026-06-11T08:45:25.686Z
  lastVerifiedPath: .changeyard/workspaces/CY-0001/repo
branch:
  name: cy/CY-0001-expand-web-ui-project-settings-and-jj-base-ref-selection
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-11T09:03:39.718Z
  lastStatus: passed
scope:
  maxChangedFiles: 8
  maxAdditions: 500
  maxDeletions: 200
  unrelatedPolicy: create-new-task
---

# Summary

Expand the web UI Project settings so it can edit core Changeyard CLI config, and update task base-ref selection so JJ working-copy change IDs are available as selectable bases.

# Motivation

The current settings UI only exposes a narrow subset of Changeyard project configuration, which forces users back to config files for common project-level choices. JJ users also cannot select the current working-copy change as a task base when it has no bookmark, which blocks valid task creation workflows.

# Plan

- [x] Extend Changeyard project-config API and local config patching to cover core CLI settings used by the web UI.
- [x] Add Project settings controls in the web UI and save them through the Changeyard config API.
- [x] Update task base-ref option generation so JJ working-copy change IDs are surfaced as selectable base refs.
- [x] Add focused tests for config updates, settings UI behavior, and JJ base-ref option generation.

# Acceptance Criteria

- [x] The web UI Project settings can view and save provider type, VCS engine/fallback, default base, and core planning defaults through `.changeyard/config.local.jsonc`.
- [x] Saving project settings preserves unrelated local config keys and reports validation failures to the UI.
- [x] In JJ repositories, the new-task base-ref list includes the current working-copy change ID when it is not represented by a bookmark.
- [x] Focused automated tests cover the new settings fields and JJ base-ref selection behavior.

# Scope Boundaries

## In scope

- `src/commands/ui.ts`
- `src/config/localConfig.ts`
- `packages/kanban/src/runtime-stack/core/api-contract.ts`
- `packages/kanban/web-ui/src/components/runtime-settings-dialog.tsx`
- `packages/kanban/web-ui/src/hooks/use-task-branch-options.ts`
- Related runtime query hooks and focused tests for the changed behavior

## Out of scope

- Remote provider credential editing in the web UI
- Broad editing of check commands, workspace naming patterns, or PR/review policy settings
- Unrelated requests, opportunistic refactors, and formatting-only edits outside touched files

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

1. Extend the Changeyard project config response and update request to include the agreed core CLI settings, then teach `updateLocalConfig` and the UI command handlers to read/write those values.
2. Add browser-side helpers and settings form state for the Changeyard project config, integrating save and refresh into the existing runtime settings dialog.
3. Update `useTaskBranchOptions` to consider JJ `jjChangeId` alongside branches/bookmarks and keep default base selection stable.
4. Add or update targeted tests around the project settings contract, UI save flow, and JJ base-ref options, then run focused verification.

# Completion Notes

Implemented project-level Changeyard settings editing in the web UI and expanded the backend contract to read and write provider type, VCS engine/fallback, default base, and core planning defaults through `.changeyard/config.local.jsonc`. The settings dialog now loads and saves this config alongside existing runtime settings, and the task base-ref options now include the current JJ working-copy `changeId` when it is not already represented by a bookmark.

Checks run:
- `pnpm run check`
- `pnpm --dir packages/kanban/web-ui run test -- src/components/runtime-settings-dialog.test.tsx src/hooks/use-task-branch-options.test.ts`
- `pnpm run check:tui`
- `pnpm run pack:check`
- `pnpm run build && node --test --test-name-pattern "changes project config routes expose and persist core changeyard settings" dist/tests/ui-server.test.js`
- `pnpm test`

Residual risk:
- The UI server test environment still logs cleanup warnings for stale temporary project paths during shutdown, but the new project-config route and JJ base-ref behavior are verified and passing.
