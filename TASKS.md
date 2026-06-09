# TASKS: OpenTUI TUI Implementation

Date: 2026-06-09

Objective: Implement the OpenTUI TUI described in `PLAN.md` while preserving Node CLI compatibility and the markdown-first Changeyard workflow.

## Tracker Rules

- `TASKS.md` is the live execution tracker for the OpenTUI TUI.
- Update stage status and verification notes as implementation lands.
- Keep completed work checked off and leave pending work explicit.
- Bun is required only for `cy tui` and TUI verification.

## Current Status

- [x] OpenTUI plan reviewed and translated into a repo-specific plan
- [x] React selected as the v1 OpenTUI binding
- [x] `PLAN.md` replaced with the OpenTUI implementation plan
- [x] `TASKS.md` replaced with this OpenTUI tracker
- [x] Runtime startup refactor implemented
- [x] `cy server` implemented
- [x] Runtime API expanded for TUI lifecycle actions
- [x] Initial `packages/tui` OpenTUI React client implemented
- [x] `cy tui` Bun launcher implemented
- [x] End-to-end OpenTUI TUI implementation complete

Current focus: Completed. Tracker now reflects the delivered OpenTUI implementation and verification coverage.

## Stage T1: Plan And Tracker Replacement

Status: `completed`

- [x] Replace `PLAN.md` with the OpenTUI TUI plan
- [x] Replace `TASKS.md` with this staged implementation tracker
- [x] Preserve quick-mode status as historical context
- [x] Document that Bun is required only for `cy tui`

Acceptance checks:

- [x] `PLAN.md` has OpenTUI as the active objective
- [x] `TASKS.md` has OpenTUI as the active tracker

## Stage T2: Runtime Startup Refactor

Status: `completed`

- [x] Add `startChangeyardRuntime()` to the kanban server package
- [x] Support `mode: "web" | "tui" | "headless"`
- [x] Support `openBrowser`
- [x] Support `serveWebAssets`
- [x] Keep `startChangeyardKanban()` as a compatibility wrapper
- [x] Allow headless runtime startup without browser assets
- [x] Add `cy server [--host <host>] [--port <port|auto>] [--json]`
- [x] Add clean shutdown handling for `cy server`
- [x] Add regression coverage for `cy ui`
- [x] Add regression coverage for `cy server`

Acceptance checks:

- [x] `cy ui --no-open` still starts the browser runtime
- [x] `cy server --port auto` starts the runtime API without opening a browser
- [x] `/api/health` responds for web and headless modes
- [x] Runtime shutdown is clean on Ctrl+C

## Stage T3: Runtime API And Client

Status: `completed`

- [x] Extend runtime create schema to support quick changes
- [x] Expose planning prompt operations
- [x] Expose verify operation
- [x] Expose complete operation
- [x] Expose review start/complete operations
- [x] Add a non-browser runtime client for absolute-url tRPC access
- [x] Add runtime client health check
- [x] Add runtime client error normalization
- [x] Add tests for the new API operations

Acceptance checks:

- [x] TUI can list and inspect changes through runtime APIs
- [x] TUI can create quick/planned/strict changes through runtime APIs
- [x] TUI lifecycle actions do not shell out to `cy`
- [x] Browser UI remains compatible with the runtime API

## Stage T4: OpenTUI Package And Launcher

Status: `completed`

- [x] Add `packages/tui/package.json`
- [x] Add `packages/tui/tsconfig.json`
- [x] Add `packages/tui/src/index.tsx`
- [x] Add OpenTUI React app shell
- [x] Add TUI runtime connection handling
- [x] Add root workspace entry for `packages/tui`
- [x] Add root build/typecheck scripts for TUI
- [x] Add `cy tui`
- [x] Add `cy tui --connect <url>`
- [x] Add `cy tui --project <path>`
- [x] Add `cy tui --debug`
- [x] Detect missing `bun` and print a concise prerequisite message
- [x] Shut down embedded runtime when the TUI exits

Acceptance checks:

- [x] Missing Bun produces a clear `cy tui` error without affecting other commands
- [x] With Bun available, `cy tui` launches the OpenTUI client
- [x] `cy tui --connect` does not start a second runtime
- [x] `cy tui` exits cleanly

## Stage T5: TUI Screens

Status: `completed`

- [x] Dashboard screen with grouped changes
- [x] Change detail screen
- [x] Create change screen
- [x] Planning screen
- [x] Workspace screen
- [x] Lifecycle actions panel
- [x] Review panel
- [x] Keyboard navigation
- [x] Fallback message for OpenTUI startup failure

Acceptance checks:

- [x] TUI lists changes grouped by status
- [x] TUI shows planning and workspace badges
- [x] TUI can create supported change types
- [x] TUI can run validate, sync, start, verify, complete, and review actions
- [x] TUI does not write separate canonical state

## Stage T6: Verification And Packaging

Status: `completed`

- [x] Add Node regression tests for `cy server`
- [x] Add Node regression tests for missing-Bun `cy tui`
- [x] Add runtime-client tests
- [x] Add TUI typecheck/build command
- [x] Add OpenTUI render smoke test when Bun is available
- [x] Update CI with a Bun TUI job
- [x] Update package files to include TUI assets
- [x] Run `npm run check`
- [x] Run `npm run check:tui`
- [x] Run `npm test`
- [x] Run `node --test --test-timeout=30000 dist/tests/*.test.js`
- [x] Run `npm run smoke:tui`
- [x] Run `npm pack --dry-run`

Acceptance checks:

- [x] Node-only CLI commands still work without Bun
- [x] TUI checks pass when Bun is available
- [x] Packaged tarball contains required runtime, browser UI, and TUI files

## Verification Notes

- `npm run check:node` passed.
- `npm run check:tui` passed.
- `npm run build:tui` passed.
- `node --test --test-timeout=30000 dist/tests/*.test.js` passed: 85 tests.
- `node --test --test-force-exit dist/tests/*.test.js` passed: 85 tests.
- `npm test` passed after updating the script to use `--test-force-exit`.
- `npm run smoke:tui` passed and exercised `cy tui --smoke-test --smoke-create-all` against a temporary repository.
- `npm pack --dry-run` passed and includes `packages/tui/src`, `packages/tui/package.json`, and `packages/tui/tsconfig.json`.
- Bun is installed locally, and the Bun-backed OpenTUI smoke path is now covered in CI.
