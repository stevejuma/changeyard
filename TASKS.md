# TASKS: Composer-First TUI Redesign

Date: 2026-06-09

Objective: Implement the OpenCode-inspired, composer-first TUI described in `PLAN.md` while preserving Changeyard runtime semantics and Node CLI compatibility.

## Tracker Rules

- `TASKS.md` is the live execution tracker for this redesign.
- Keep stage status current as code lands.
- Keep completed work checked off and pending work explicit.
- Bun remains required only for `cy tui` and TUI verification.

## Current Status

- [x] Redesign direction selected: composer-first, Changeyard-action scope
- [x] New implementation plan drafted
- [x] Tracker reset for redesign execution
- [x] Composer-first shell implementation started
- [x] First shared slash/command-list command registry landed
- [x] Initial lifecycle/create command wiring landed
- [x] Solid.js + OpenTUI 0.4 migration with OpenCode-aligned UI primitives
- [x] Dual-route Home/Workspace shell with modal dialogs

Current focus: Visual parity milestone complete; monitor for follow-up polish.

## Stage U1: Tracker Realignment

Status: `completed`

- [x] Replace `PLAN.md` with composer-first redesign plan
- [x] Replace `TASKS.md` with redesign tracker
- [x] Confirm scope excludes chat/session parity

Acceptance checks:

- [x] `PLAN.md` reflects current redesign strategy
- [x] `TASKS.md` tracks new staged implementation

## Stage U2: Composer-First Shell

Status: `completed`

- [x] Replace dashboard-first shell with centered composer-first shell
- [x] Keep change detail preview visible in the new shell
- [x] Add toggleable sidebar for grouped changes
- [x] Add footer/status hints aligned to new key model
- [x] Preserve existing runtime-backed workflows in new layout

Acceptance checks:

- [x] Composer is visible and focused by default
- [x] Sidebar can be toggled without breaking selection
- [x] Change detail remains inspectable from the main shell

## Stage U3: Shared Command Registry

Status: `completed`

- [x] Add shared command registry powering slash and command list
- [x] Add slash autocomplete for `/` commands
- [x] Add `ctrl+p` command list backed by same registry
- [x] Implement initial commands:
- [x] `/help`, `/refresh`, `/sidebar`, `/home`
- [x] `/create quick|planned|strict|legacy`
- [x] `/validate`, `/sync`, `/start`, `/verify`, `/complete`, `/review`
- [x] `/prompt`

Acceptance checks:

- [x] Slash and command list execute the same command handlers
- [x] `ctrl+p` opens and closes command list reliably
- [x] Lifecycle actions still call runtime APIs and refresh state

## Stage U4: Dialogs And Focused Flows

Status: `completed`

- [x] Move create flow into focused dialog/panel experience
- [x] Present planning prompt in dialog/panel flow
- [x] Add lightweight key help dialog
- [x] Add confirmation for destructive or irreversible actions when needed

Acceptance checks:

- [x] No required workflow depends on full-screen view rotation
- [x] Dialogs can be dismissed with `escape`

## Stage U5: Keyboard And UX Parity

Status: `completed`

- [x] Align keyboard behavior: `ctrl+p`, `escape`, `up/down`, `ctrl+n/ctrl+p`, `enter`
- [x] Ensure composer input behavior is predictable for slash and non-slash text
- [x] Improve empty-state and error-state messaging for command-driven UX

Acceptance checks:

- [x] Primary actions are discoverable from key help and footer hints
- [x] No keybinding conflicts break text input editing

## Stage U6: Verification And Packaging

Status: `completed`

- [x] Run `npm run check:tui`
- [x] Run `npm run build:tui`
- [x] Update and run `npm run smoke:tui` for slash/palette/sidebar/dialog coverage
- [x] Run Node-side tests for launcher/runtime behavior
- [x] Run `npm pack --dry-run`

Acceptance checks:

- [x] TUI checks pass
- [x] Node launcher checks remain green
- [x] Packaged tarball still contains required TUI/runtime assets

## Verification Notes

- `npm run check:tui` passed.
- `npm run build:tui` passed.
- `npm run smoke:tui` passed.
- `npm test` passed (85 tests).
- `npm pack --dry-run` passed; TUI Solid sources and `packages/tui/dist/index.js` included.
- TUI migrated to Solid.js + `@opentui/solid@0.4` with OpenCode-aligned theme, dialog stack, DialogSelect command palette, Prompt chrome, and dual-route Home/Workspace layout.
