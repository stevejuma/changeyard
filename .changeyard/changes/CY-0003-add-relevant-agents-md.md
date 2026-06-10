---
id: CY-0003
title: add relevant AGENTS.md
type: agent-task
status: approved
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-10T21:01:44.996Z
updatedAt: 2026-06-10T21:06:55.386Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0003
  path: .changeyard/workspaces/CY-0003/repo
branch:
  name: cy/CY-0003-add-relevant-agents-md
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-10T21:04:05.229Z
  lastStatus: passed
---

# Summary

Add a root-level `AGENTS.md` file to the Changeyard repository, giving cross-tool coding agents a single entry point for project context, dev commands, conventions, and pointers to the existing Changeyard agent skill.

# Motivation

The repo already ships agent guidance via `.agents/skills/changeyard/SKILL.md` and `.cursor/commands/cy-*.md`, but lacks the portable [agents.md](https://agents.md/) convention file that Cursor, Codex, Copilot, and other tools read automatically. A root `AGENTS.md` complements those tool-specific artifacts without duplicating the full gate-protocol table.

# Plan

- [x] Run `cy validate`, `cy sync`, `cy start`, and `cy verify`
- [x] Create `AGENTS.md` at repo root (~80–120 lines)
- [x] Verify linked paths and npm commands match `package.json`
- [x] Update Completion Notes and run `cy complete --no-pr`

# Acceptance Criteria

- [x] `AGENTS.md` exists at repository root
- [x] File includes copy-pasteable setup and verification commands
- [x] File links to `.agents/skills/changeyard/SKILL.md` for full gate protocol
- [x] File documents monorepo layout and edit boundaries (`dist/`, `skill-generation.ts`)
- [x] All internal markdown links resolve to existing files
- [x] `cy validate`, `cy verify`, and `cy complete --no-pr` pass

# Agent Plan

Create `AGENTS.md` with these sections:

1. **Project overview** — Changeyard purpose, canonical state in `.changeyard/changes/*.md`, monorepo layout (`src/`, `packages/kanban/`, `packages/tui/`, `tests/`, `dist/`)
2. **Change workflow** — condensed gate summary with link to `.agents/skills/changeyard/SKILL.md`
3. **Setup and commands** — `npm install`, `npm run build`, `npm run cy:dev`, `npm test`, `npm run check`, etc.
4. **Code conventions** — ESM/NodeNext, `.js` import extensions, strict TypeScript, `node:test`
5. **Boundaries** — do not edit `dist/`; skill source in `src/scaffold/skill-generation.ts`
6. **Key docs** — links to README, planning docs, PLAN.md

Out of scope: scaffold changes to `cy init`, new `.cursor/rules/`.

# Completion Notes

Added `AGENTS.md` at the repository root with project overview, Changeyard gate workflow pointer, setup/verification commands, code conventions, edit boundaries, and links to key docs. Verified all internal markdown links resolve from the workspace checkout. Docs-only change; no test run required.
