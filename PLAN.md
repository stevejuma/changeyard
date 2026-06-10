# PLAN: Composer-First OpenTUI Redesign

Date: 2026-06-09

## Active Objective

Redesign `cy tui` to a composer-first terminal experience inspired by OpenCode's layout and interaction model while preserving Changeyard semantics.

The TUI remains a client layer. It must not introduce a second source of truth. Canonical state remains `.changeyard/changes/*.md`, and all workflows continue through shared runtime APIs.

## Product Direction

The target interaction model is:

- centered composer as the primary interaction surface
- slash commands (`/`) for actions and workflows
- command list/palette (`ctrl+p`) powered by the same command registry
- optional sidebar for grouped change navigation
- dialogs/overlays for focused tasks and confirmations

Scope is explicitly limited to Changeyard actions and workflows. This is not a chat/session clone of OpenCode.

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

### Stage U1: Tracker Realignment

Purpose:
- replace the completed screen-first tracker with the new composer-first objective
- define concrete acceptance checks around slash commands, palette, sidebar, and dialogs

Deliverables:
- `PLAN.md` updated to this redesign plan
- `TASKS.md` updated as the live redesign tracker

### Stage U2: Composer-First Shell

Purpose:
- move from the current three-pane dashboard-first layout to a centered-composer shell

Deliverables:
- centered composer panel becomes the default focus
- optional sidebar is toggleable
- detail preview remains available without rotating whole-screen views
- base design tokens are applied consistently

### Stage U3: Shared Command Registry

Purpose:
- unify slash command and `ctrl+p` command list behavior

Deliverables:
- single command registry with id, aliases, description, and executor
- slash autocomplete from the command registry
- `ctrl+p` command list backed by the same entries
- initial command coverage for existing Changeyard workflows

### Stage U4: Dialogs And Focused Flows

Purpose:
- replace full-screen mode switching with focused overlays/dialog-like panels

Deliverables:
- create flow moves to a focused panel
- planning prompt and key help surfaces presented as dialogs/panels
- confirmation surfaces for state-advancing actions where appropriate

### Stage U5: Keyboard And UX Parity

Purpose:
- align interaction behavior with the intended model and improve discoverability

Deliverables:
- `ctrl+p` opens/closes command list
- `escape` dismisses open overlay/palette before exiting
- `up/down` and `ctrl+n/ctrl+p` navigate list selections
- compact key help surface and footer hints

### Stage U6: Verification And Packaging

Purpose:
- keep redesign changes safe, testable, and releasable

Deliverables:
- TUI typecheck/build remains green
- smoke checks cover slash command invocation, command list open/close, sidebar toggle, and at least one dialog-based action
- Node-side launcher/runtime coverage remains green

## Design Rules

1. `.changeyard/changes/*.md` remains the only canonical source for changes.
2. The TUI uses runtime APIs, not direct markdown writes.
3. `cy ui` remains browser-oriented with unchanged behavior.
4. `cy server` remains the reusable headless runtime entrypoint.
5. `cy tui` requires Bun, but other commands do not.
6. OpenTUI is renderer/client only. Changeyard owns lifecycle, planning, provider, workspace, and review semantics.
7. First implementation slices should favor reliable command coverage over broad but shallow parity.

## Current Milestone

Milestone M1 (completed):
- land the composer-first shell
- land the first command registry
- wire slash commands and `ctrl+p` command list to existing lifecycle and create actions
- keep runtime APIs unchanged

Milestone M2 (completed):
- OpenCode visual alignment: Solid.js migration, theme/dialog/prompt primitives, dual-route shell
- Dialog-based create/help/prompt flows and complete confirmation
- Keyboard parity and expanded smoke/verification coverage

