---
id: CY-0001
title: Add support for cursor's agent cli
type: agent-task
status: approved
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-09T23:56:34.378Z
updatedAt: 2026-06-10T00:29:00.561Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0001
  path: .changeyard/workspaces/CY-0001/repo
branch:
  name: cy/CY-0001-add-support-for-cursor-s-agent-cli
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-10T00:28:43.131Z
  lastStatus: passed
---

# Summary

Add [Cursor CLI](https://cursor.com/cli) (`agent` binary) as a first-class runtime agent in Changeyard, so users can launch, configure, and resume Cursor Agent sessions from the kanban UI, TUI, and task workflows alongside existing agents (Claude Code, Codex, Copilot, etc.).

# Motivation

Changeyard already scaffolds Cursor IDE artifacts (`.cursor/skills`, `/cy-*` commands) via `cy init --tools cursor`, but the runtime stack cannot launch or manage the Cursor Agent CLI today. Users who prefer terminal-based Cursor agents have no way to select Cursor as their default agent, auto-detect installation, or wire kanban lifecycle hooks (in progress → review) into Cursor sessions.

Cursor CLI is now a mature terminal agent with interactive mode, plan mode, resume/continue sessions, sandbox controls, and `.cursor/hooks.json` lifecycle hooks — making it a natural fit for Changeyard's existing agent adapter pattern.

# Plan

- [x] Extend runtime agent types and catalog
  - Add `"cursor"` to `runtimeAgentIdSchema` in `packages/kanban/src/runtime-stack/core/api-contract.ts`
  - Add catalog entry: id `cursor`, label `Cursor Agent`, binary `agent`, install URL `https://cursor.com/cli`
  - Map autonomous mode to `--force` / `--yolo`; plan mode to `--plan` / `--mode=plan`
  - Include `cursor` in `RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS`
- [x] Implement `cursorAdapter` in `agent-session-adapters.ts`
  - Set `--workspace` to task cwd; apply `--force` when autonomous mode is enabled
  - Support resume via `--continue` / `--resume` when resuming from trash
  - Wire kanban lifecycle hooks via project-level `.cursor/hooks.json` (use `stop`, `beforeSubmitPrompt`, `preToolUse`/`postToolUse`, etc. per [Cursor hooks docs](https://cursor.com/docs/hooks))
  - Handle plan-mode prompt prefixing consistently with other adapters
  - Deferred: output transition detection (rely on `.cursor/hooks.json` for lifecycle for now)
- [x] Update agent selection and auto-detect paths
  - `runtime-config.ts`: normalize `"cursor"` in `normalizeAgentId`; add to `AUTO_SELECT_AGENT_PRIORITY`
  - UI ordering/onboarding: `SETTINGS_AGENT_ORDER`, `ONBOARDING_AGENT_IDS`, install instructions in `task-start-agent-onboarding-carousel.tsx`
  - `append-system-prompt.ts`: include `cursor` in supported agents and Linear MCP guidance (`agent mcp ...`)
- [x] Align scaffold metadata (already partially present)
  - Confirm `src/scaffold/agent-tools.ts` Cursor entry stays consistent with runtime id/binary naming
- [x] Tests and verification
  - Extend `agent-catalog.test.ts` for cursor catalog entry and launch support
  - Add adapter unit tests for cursor launch args (autonomous, plan, resume, workspace)
  - Manual smoke: select Cursor Agent in settings, start a task, confirm terminal launches `agent` in workspace cwd

# Acceptance Criteria

- [x] `cursor` appears in runtime agent lists (web UI settings, TUI agent picker) when `agent` is on PATH
- [x] Selecting Cursor Agent as default persists and launches `agent` with the correct workspace directory
- [x] Autonomous mode passes `--force` (or `--yolo`); plan mode starts with `--plan` or equivalent
- [x] Resuming a trashed task uses `--continue` or `--resume` when a prior session exists
- [x] Kanban hook events (`to_review`, `to_in_progress`, `activity`) fire via `.cursor/hooks.json` during Cursor Agent sessions
- [x] Existing agents and scaffold Cursor artifacts (skills/commands) remain unaffected
- [x] Unit tests pass for catalog and adapter changes

# Agent Plan

1. Register `cursor` in the runtime contract, catalog, config normalization, and launch-supported set.
2. Add a `cursorAdapter` that maps Changeyard launch semantics to Cursor CLI flags and merges kanban hook scripts into `.cursor/hooks.json`.
3. Surface Cursor in settings/onboarding ordering and append-system-prompt guidance.
4. Cover catalog and adapter behavior with vitest.

# Completion Notes

Implemented Cursor Agent CLI support in the kanban runtime stack:

- Added `cursor` agent id with binary `agent`, autonomous args `--force`, install URL https://cursor.com/cli
- Implemented `cursorAdapter` with `--workspace`, `--force`, `--approve-mcps`, `--plan`, `--continue`, prompt append, and merged `.cursor/hooks.json` lifecycle hooks (`stop`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`, `subagentStop`) with cleanup on session end
- Updated auto-select priority, settings/onboarding agent order, and Linear MCP guidance
- Added vitest coverage in `agent-catalog.test.ts` and `agent-session-adapters.cursor.test.ts`
- Tightened agent gate guidance (`Gate protocol (hard stops)`) in skill + `/cy-*` command templates

Checks ran:

- `npm run runtime:typecheck` (kanban, workspace) — passed
- Vitest: `agent-catalog.test.ts` + `agent-session-adapters.cursor.test.ts` — 4 passed (workspace)
- `cy verify CY-0001` from `.changeyard/workspaces/CY-0001/repo` — passed

Deferred:

- Output transition heuristics (copilot-style terminal parsing); hook-driven lifecycle covers primary flows
- Manual end-to-end smoke in `cy ui` / task terminal (verify in follow-up if needed)
