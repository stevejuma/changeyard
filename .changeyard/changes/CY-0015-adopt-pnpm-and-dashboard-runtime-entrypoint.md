---
id: CY-0015
title: Adopt pnpm and dashboard runtime entrypoint
type: agent-task
status: synced
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-14T17:38:01.637Z
updatedAt: 2026-06-14T17:39:52.246Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0015
  path: .changeyard/workspaces/CY-0015/repo
branch:
  name: cy/CY-0015-adopt-pnpm-and-dashboard-runtime-entrypoint
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
---

# Summary

Normalize the repository on pnpm, then add a unified dashboard entrypoint for the web runtime. The runtime should serve a lightweight dashboard at `/`, Kanban at `/kanban`, and VCS at `/vcs`, while packaging the web surfaces through one shared production asset graph so common frontend dependencies are not duplicated per UI slice.

# Motivation

The project currently mixes npm and pnpm commands, lockfiles, documentation, and CI behavior. That creates churn and inconsistent agent guidance. The web runtime also has separate launch concepts for Kanban, VCS, and server-only mode, while the intended product shape is one local runtime with a dashboard that links to the operational UIs.

# Plan

- [ ] Make pnpm the only documented and scripted package manager.
- [ ] Remove npm lockfile artifacts and add a package-manager verification gate.
- [ ] Add a dashboard UI that follows the existing Kanban/VCS operational shell style.
- [ ] Serve dashboard at `/`, Kanban at `/kanban`, and VCS at `/vcs`.
- [ ] Build dashboard, Kanban, and VCS through one production web bundle with shared vendor chunks.
- [ ] Add `cy dashboard` and remove the old `cy server` public command surface.
- [ ] Update docs, CI, scripts, and agent-facing guidance for the new commands.

# Acceptance Criteria

- [ ] `pnpm` is the only package-manager command referenced in tracked source, scripts, docs, workflows, and tracked Changeyard notes; legacy package-manager wording is rejected by a repository check.
- [ ] `pnpm-lock.yaml` is the only tracked dependency lockfile.
- [ ] Root and workspace scripts run through pnpm, including workspace filtering and local binary execution.
- [ ] CI installs, caches, builds, tests, packages, smokes, and publishes through pnpm-compatible commands.
- [ ] `cy dashboard --no-open` starts the web runtime at `/`; `cy --kanban --no-open` opens `/kanban`; `cy --vcs --no-open` opens `/vcs`.
- [ ] `cy server` is removed from help/completions/docs and returns a clear removal message if invoked directly.
- [ ] The runtime serves `/`, `/kanban`, `/kanban/<projectId>`, `/vcs`, and `/api/trpc/*` correctly.
- [ ] Kanban project routing is base-path aware under `/kanban`.
- [ ] The dashboard renders runtime/project status and links to Kanban and VCS using current project context when available.
- [ ] The production web build emits shared chunks for common frontend dependencies and does not eagerly load Kanban or VCS code on the dashboard route.

# Agent Plan

1. Review the current TUI/runtime delta and preserve unrelated user work.
2. Start from pnpm normalization: scripts, lockfiles, CI, docs, generated messages, smoke scripts, and a guard check.
3. Add the dashboard UI using existing runtime client patterns and shared visual structure.
4. Refactor production web packaging into one multi-entry build with shared chunks while keeping source packages independently testable.
5. Update runtime routing and CLI launch commands.
6. Run the focused package-manager guard, build, runtime routing tests, UI tests, and CLI tests.

# Completion Notes

Pending.
