# PLAN: OpenTUI TUI Implementation

Date: 2026-06-09

## Active Objective

Implement `cy tui` as a rich, keyboard-first terminal application built with OpenTUI and backed by the same Changeyard runtime API used by the browser UI.

The TUI is a client layer. It must not create a second source of truth, a TUI-specific task database, or alternate lifecycle semantics. Canonical state remains `.changeyard/changes/*.md`, with all TUI workflows routed through shared runtime operations.

## Runtime Strategy

Changeyard remains a Node.js CLI package. `cy`, `cy ui`, tests, packaging, and existing commands continue to run under Node.js 22+.

OpenTUI renderer support currently targets Bun for normal application use, so `cy tui` is a Node wrapper that:

- starts or connects to a Changeyard runtime server
- checks that `bun` is available
- launches the TUI package through Bun with inherited stdio
- shuts down an embedded runtime cleanly when the TUI exits

This keeps Bun scoped to the TUI execution path instead of making it a global requirement for all Changeyard users.

## Architecture

```text
Node CLI (`cy`)
  ├─ cy ui       -> Node runtime + browser assets
  ├─ cy server   -> Node runtime, headless API
  └─ cy tui      -> Node runtime + Bun OpenTUI client

Runtime server
  ├─ tRPC API
  ├─ workspace/project APIs
  ├─ Changeyard markdown-backed change APIs
  └─ browser/TUI/runtime clients

Canonical state
  └─ .changeyard/changes/*.md
```

## Implementation Stages

### Stage T1: Plan and tracker replacement

Purpose:
- make OpenTUI the active implementation objective
- preserve quick-mode status only as historical context
- document the Bun prerequisite clearly

Deliverables:
- `PLAN.md` describes the OpenTUI architecture, constraints, and stages
- `TASKS.md` becomes the live OpenTUI implementation tracker
- quick-mode work is no longer the active tracker

### Stage T2: Runtime startup refactor

Purpose:
- separate runtime startup from browser presentation
- add an explicit headless server command

Deliverables:
- `startChangeyardRuntime()` supports `mode: "web" | "tui" | "headless"`, `openBrowser`, and `serveWebAssets`
- `startChangeyardKanban()` remains as the compatibility wrapper for `cy ui`
- `cy server` starts the same runtime API without opening a browser
- `cy ui` behavior remains unchanged

### Stage T3: Runtime API and client

Purpose:
- give the TUI a stable API instead of direct filesystem or CLI shell-out access

Deliverables:
- runtime `changes` API supports quick creation and lifecycle operations needed by the TUI
- planning prompt/status, verify, complete, and review operations are exposed where possible
- a non-browser runtime client wraps absolute-url tRPC calls and runtime health checks
- API responses remain schema validated

### Stage T4: OpenTUI package and launcher

Purpose:
- add the Bun/OpenTUI terminal client without making Bun required for normal CLI use

Deliverables:
- `packages/tui` workspace with `@opentui/react`
- `cy tui` command with `--connect`, `--project`, and `--debug`
- missing-Bun failures print a concise prerequisite message
- embedded mode starts a runtime and launches the TUI against it

### Stage T5: TUI screens

Purpose:
- implement the first usable terminal workflow surface

Deliverables:
- dashboard with grouped changes and quick/planned/strict/provider/workspace badges
- detail view with overview, planning sections, raw markdown, provider, workspace, checks, and review panels
- create flow for quick, planned, strict planned, and legacy unplanned changes
- planning view with prompts, section editing, and gate status
- workspace/lifecycle actions for validate, sync, start, verify, complete, and review

### Stage T6: Verification and packaging

Purpose:
- ensure the TUI path is tested without regressing Node-only users

Deliverables:
- Node checks cover `cy ui`, `cy server`, missing-Bun `cy tui`, and runtime shutdown
- TUI checks cover typecheck/build and an OpenTUI render smoke path when Bun is available
- CI installs Bun only for the TUI job
- `npm pack --dry-run` includes runtime, browser UI assets, and TUI assets

## Design Rules

1. `.changeyard/changes/*.md` remains the only canonical source for changes.
2. The TUI uses runtime APIs, not direct markdown writes, except for opening files in an external editor if that feature is added later.
3. `cy ui` stays browser-oriented and keeps its current behavior.
4. `cy server` is the reusable headless runtime entrypoint.
5. `cy tui` requires Bun, but other commands do not.
6. OpenTUI is only the renderer/client. Changeyard owns lifecycle, planning, provider, workspace, and review semantics.
7. Workspace verification remains mandatory before implementation workflows.

## Historical Context

`PLAN.md` and `TASKS.md` previously tracked quick mode. Quick-mode implementation had reached lifecycle integration work and was not the active tracker after this plan replacement. Any unfinished quick-mode work should be picked up from git history or a dedicated follow-up plan if needed.
