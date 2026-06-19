---
id: CY-0015
title: Adopt pnpm and dashboard runtime entrypoint
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-14T17:38:01.637Z
updatedAt: 2026-06-18T15:50:07.242Z
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
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-14T18:20:16.262Z
  lastStatus: passed
mergedAt: 2026-06-14T18:20:27.709Z
review:
  required: false
  waivedAt: 2026-06-18T15:50:07.242Z
  waivedBy: cy doctor
  waiverReason: Stale completed merged change older than 3 days had no review artifact.
---

# Summary

Normalize the repository on pnpm, then add a unified dashboard entrypoint for the web runtime. The runtime should serve a lightweight dashboard at `/`, Kanban at `/kanban`, and VCS at `/vcs`, while packaging the web surfaces through one shared production asset graph so common frontend dependencies are not duplicated per UI slice.

# Motivation

The project currently mixes legacy package-manager and pnpm commands, lockfiles, documentation, and CI behavior. That creates churn and inconsistent agent guidance. The web runtime also has separate launch concepts for Kanban, VCS, and server-only mode, while the intended product shape is one local runtime with a dashboard that links to the operational UIs.

# Plan

- [x] Make pnpm the only documented and scripted package manager.
- [x] Remove legacy lockfile artifacts and add a package-manager verification gate.
- [x] Add a dashboard UI that follows the existing Kanban/VCS operational shell style.
- [x] Serve dashboard at `/`, Kanban at `/kanban`, and VCS at `/vcs`.
- [x] Build dashboard, Kanban, and VCS through one production web bundle with shared vendor chunks.
- [x] Add `cy dashboard` and remove the old `cy server` public command surface.
- [x] Update docs, CI, scripts, and agent-facing guidance for the new commands.

# Acceptance Criteria

- [x] `pnpm` is the only package-manager command referenced in tracked source, scripts, docs, workflows, and tracked Changeyard notes; legacy package-manager wording is rejected by a repository check.
- [x] `pnpm-lock.yaml` is the only tracked dependency lockfile.
- [x] Root and workspace scripts run through pnpm, including workspace filtering and local binary execution.
- [x] CI installs, caches, builds, tests, packages, smokes, and publishes through pnpm-compatible commands.
- [x] `cy dashboard --no-open` starts the web runtime at `/`; `cy --kanban --no-open` opens `/kanban`; `cy --vcs --no-open` opens `/vcs`.
- [x] `cy server` is removed from help/completions/docs and returns a clear removal message if invoked directly.
- [x] The runtime serves `/`, `/kanban`, `/kanban/<projectId>`, `/vcs`, and `/api/trpc/*` correctly.
- [x] Kanban project routing is base-path aware under `/kanban`.
- [x] The dashboard renders runtime/project status and links to Kanban and VCS using current project context when available.
- [x] The production web build emits shared chunks for common frontend dependencies and does not eagerly load Kanban or VCS code on the dashboard route.

# Agent Plan

1. Review the current TUI/runtime delta and preserve unrelated user work.
2. Start from pnpm normalization: scripts, lockfiles, CI, docs, generated messages, smoke scripts, and a guard check.
3. Add the dashboard UI using existing runtime client patterns and shared visual structure.
4. Refactor production web packaging into one multi-entry build with shared chunks while keeping source packages independently testable.
5. Update runtime routing and CLI launch commands.
6. Run the focused package-manager guard, build, runtime routing tests, UI tests, and CLI tests.

# Completion Notes

Implemented pnpm normalization across scripts, workflows, docs, release packaging, and agent-facing guidance. Removed legacy lockfiles, added the `packageManager` field, added `scripts/check-package-manager.mjs`, and wired the guard into `pnpm run check`.

Added `cy dashboard` as the default web runtime launcher, kept `cy --kanban` and `cy --vcs` as route-specific shortcuts, and replaced direct `cy server` use with a clear removal error. The runtime now serves the dashboard at `/`, Kanban at `/kanban`, and VCS at `/vcs`.

Added a dashboard route using the existing web UI structure and runtime state stream. The production dashboard build now lazy-loads dashboard, Kanban, and VCS route code through one web asset graph with shared `react-vendor`, `ui-vendor`, `runtime-vendor`, `xterm-vendor`, `vcs-app`, and `App` chunks.

Validation passed:

- `pnpm run check:package-manager`
- `pnpm run build`
- `node --test --test-force-exit dist/tests/ui-server.test.js`
- `pnpm run check`
- `pnpm --dir packages/kanban/web-ui run test -- src/hooks/app-utils.test.tsx` (Vitest ran 82 files / 534 tests)
- `pnpm run check:tui`
- `pnpm test`
- Dashboard route smoke with `node dist/src/cli.js dashboard --no-open --port auto`: `/`, `/kanban`, `/kanban/demo`, `/vcs`, `/vcs/jj`, and `/api/health` returned 200.
- Removed command probe: `node dist/src/cli.js server --no-open` returned `CHANGEYARD_ERROR: cy server was removed. Use \`cy dashboard\` instead.`

Known residual note: the standalone `@changeyard/vcs` package build still emits its own single large app chunk and Vite warning because it remains independently buildable. The dashboard runtime no longer serves that standalone bundle for `/vcs`; it uses the unified dashboard asset graph.
