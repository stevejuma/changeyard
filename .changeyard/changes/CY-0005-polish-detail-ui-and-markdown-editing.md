---
id: CY-0005
title: Polish detail UI and markdown editing
type: agent-task
status: ready_for_pr
priority: medium
labels:
  - ui
  - kanban
author: stevejuma
createdAt: 2026-06-11T13:51:40.983Z
updatedAt: 2026-06-11T14:10:16.000Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0005
  path: .changeyard/workspaces/CY-0005/repo
branch:
  name: cy/CY-0005-polish-detail-ui-and-markdown-editing
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-11T14:10:16.001Z
  lastStatus: passed
---

# Summary

Polish the kanban detail views by standardizing markdown editing, status chips, detail sidebars, header actions, and change diff visibility.

# Motivation

Recent board work restored the combined change/task workflow, but the detail surfaces still feel inconsistent. Markdown editing uses a raw textarea, status labels are rendered in several incompatible styles, the task detail left panel still behaves like board context instead of a properties sidebar, and changes do not expose workspace diffs in their detail view.

# Plan

- [ ] Add `@uiw/react-markdown-editor` to the web UI package and wrap it in a shared markdown editor/preview component.
- [ ] Add a shared status chip component with reusable status-to-icon/tone mappings.
- [ ] Rework task and change detail sidebars into properties panels using shared chips and compact metadata rows.
- [ ] Move valid Changeyard change lifecycle actions, including verify and complete, into the change detail header.
- [ ] Add a change-scoped workspace changes endpoint and render a details/changes tab in the change detail sidebar.
- [ ] Update tests for the editor wrapper, chips, detail sidebars, header actions, and change diff empty/data states.

# Acceptance Criteria

- [ ] Markdown edit/preview in detail views uses the shared UIW markdown component instead of a raw textarea/custom preview pair.
- [ ] Task/change statuses and other prominent statuses render through a shared status chip component.
- [ ] Task and change detail left panels render as properties sidebars with readable chips and metadata rows.
- [ ] Change detail headers show valid lifecycle actions aligned to the right, including verify and complete when available.
- [ ] Change details can show workspace change summary, file list, and diffs when a change has recorded workspace changes, with an empty state otherwise.
- [ ] `npm run check` and relevant kanban web UI tests pass.

# Scope Boundaries

## In scope

- `packages/kanban/web-ui` detail, board, markdown, status, and test code.
- `packages/kanban/src/runtime-stack` APIs needed to expose change workspace diffs.
- Package metadata and lockfile changes needed for `@uiw/react-markdown-editor`.

## Out of scope

- Unrelated requests, broad visual redesigns, PR/provider schema changes, and formatting-only edits outside touched files.

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

- Inspect the current task/change detail components, existing diff runtime APIs, and test setup.
- Add the UIW markdown dependency and a small wrapper component that supports edit and preview modes.
- Implement a shared status chip and use it in the detail surfaces and prominent status labels.
- Replace the task detail column context panel with a properties sidebar and align change detail to the same pattern.
- Extend the runtime API to load workspace changes for a Changeyard change and render those changes in the detail dialog.
- Add focused tests and run the repo checks.

# Completion Notes

Implemented in `.changeyard/workspaces/CY-0005/repo`.

- Added a shared UIW markdown editor/preview wrapper and status chip component.
- Reworked change detail into a properties sidebar plus markdown/details and workspace changes views.
- Moved valid change lifecycle actions into the change detail header.
- Replaced the task detail left board-context panel with a task properties sidebar.
- Added a change workspace changes runtime endpoint and hook.
- Added focused component tests for markdown wrapper, status chips, and change detail behavior.

Checks:

- `npm run check`
- `npm --prefix packages/kanban/web-ui run test`

Manual smoke:

- `KANBAN_WEB_UI_PORT=4174 npm run ui:dev` started and shut down cleanly with one interrupt.
- Playwright loaded the Vite page without bundle/import errors, but the runtime WebSocket returned `403`, so the page showed the disconnected state instead of a fully connected board.
