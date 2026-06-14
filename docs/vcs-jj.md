# Changeyard JJ VCS

Changeyard now includes an experimental JJ-first VCS surface behind `CHANGEYARD_VCS=1`.

For the current provider-neutral Workspace spec and detailed JJ support matrix, see:

- [VCS App Spec](vcs/index.md)
- [JJ Supported Functionality](vcs/jj-supported-functionality.md)
- [JJ UI Interactions](vcs/jj-ui-interactions.md)
- [JJ Backend Queries And Commands](vcs/jj-backend-queries.md)
- [Agent Notes For VCS Work](vcs/agent-notes.md)

## Scope

- Runtime boundary stays on the existing tRPC stack.
- VCS backend code lives under `src/vcs`.
- Standalone VCS UI lives under `packages/vcs`.
- Stacked PR submission is GitHub-only in the first pass.
- No external `jj-stack` or `jst` install is required.

## Routes

With `CHANGEYARD_VCS=1`, the runtime serves:

- `/vcs`
- `/vcs/jj`
- `/vcs/jj/branches`
- `/vcs/jj/history`
- `/vcs/settings`

Without the flag, `/vcs` stays unavailable.

## Runtime Procedures

The VCS surface is exposed through the existing runtime API bridge and tRPC router:

- `vcs.detect`
- `vcs.jjState`
- `vcs.jjDiff`
- `vcs.previewOperation`
- `vcs.applyOperation`
- `vcs.submitStackPreview`
- `vcs.submitStack`

## JJ Operations

Preview/confirm flows are implemented for:

- edit message
- create bookmark
- create change before/after
- reorder change
- squash
- absorb selected files
- move bookmark
- abandon change
- restore file
- undo/redo

Each mutation goes through a preview first, returns argv-based command metadata, and refreshes JJ state after success.

## Stacked PR Publishing

Stacked PR support vendors and adapts the useful `keanemind/jj-stack` core behavior under Changeyard conventions:

- bookmark and stack graph analysis
- PR plan preview
- existing PR lookup
- base-branch adjustment
- PR create/update
- stack comment updates

The adapted code is documented in `src/vcs/vendor/ATTRIBUTION.jj-stack.md`.

Submit stays disabled unless all of the following are true:

- a JJ repository is detected
- the remote provider resolves to GitHub
- a usable remote is configured
- GitHub auth is available

## Safety Notes

- Process execution is argv-based.
- Remote URLs are redacted in diagnostics where needed.
- Invalid bookmark names, revision inputs, and file selections are rejected before execution.
- Missing JJ, missing remote, and unsupported provider states render diagnostics instead of mutation affordances.

## Verification

Latest verification run on 2026-06-12:

- `pnpm run build`
- `pnpm test`
- `pnpm run check:tui`
- `pnpm pack --dry-run`
- `node --test --test-force-exit dist/tests/ui-server.test.js`
