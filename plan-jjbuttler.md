# Changeyard JJ VCS Implementation Plan

Date: 2026-06-11

## Summary

Add a JJ-first VCS feature area to Changeyard while preserving the existing markdown-first Kanban and TUI workflows.

The first deliverable is not a broad rewrite. The feature starts as a feature-flagged, read-only VCS/JJ surface, then adds preview-only operations, confirmed JJ mutations, and finally vendored stacked PR publishing based on the useful core behavior from `keanemind/jj-stack`.

Locked decisions:

- Use Changeyard's existing tRPC runtime boundary for VCS APIs.
- Do not require users to install `jj-stack` or `jst`.
- Vendor and adapt the useful `keanemind/jj-stack` implementation into Changeyard, preserving MIT attribution and reviewing it before inclusion.
- Keep the feature isolated, feature-flagged, and read-only before adding mutations.
- Do not break, regress, or reshape current Kanban, TUI, CLI, workspace, provider, or markdown-backed change behavior.

## Architecture

Add a separate VCS feature boundary:

- Backend/core VCS code lives under `src/vcs`.
- Frontend VCS UI lives under `packages/vcs`.
- VCS routes are exposed behind `CHANGEYARD_VCS=1`.
- VCS APIs are exposed through the existing runtime/tRPC stack, not raw REST endpoints.
- `packages/kanban` must not import `packages/vcs`.
- VCS may duplicate UI primitives initially; shared UI extraction is a later cleanup after duplication is proven.

Initial route targets:

- `/vcs` - VCS landing and repository detection.
- `/vcs/jj` - main JJ stack board.
- Later `/vcs/jj/branches` - bookmark/branch inventory.
- Later `/vcs/jj/history` - JJ operation log and restore affordances.
- Later `/vcs/settings` - VCS command paths, base/trunk config, safety preferences, and experimental flags.

## tRPC Interface

Extend the existing runtime API contract with a `vcs` router/procedure group equivalent to:

- `vcs.detect`
- `vcs.jjState`
- `vcs.jjDiff`
- `vcs.previewOperation`
- `vcs.applyOperation`
- `vcs.submitStackPreview`
- `vcs.submitStack`
- `vcs.operations`
- `vcs.restoreOperation`

The tRPC procedures should call into `src/vcs` through the Changeyard API bridge created by `createChangeyardUiApi()`.

Shared models should cover:

- repository detection
- JJ repository state
- stack lanes
- bookmark/branch segments
- JJ changes/commits
- unassigned file changes
- operation previews/results
- PR submit plans/results
- PR metadata
- diagnostics

## Vendored `jj-stack` Strategy

Source: `keanemind/jj-stack`, MIT license, default branch `main`.

Vendor and adapt only the core behavior:

- From `src/lib/jjUtils.ts`:
  - bookmark discovery
  - stack graph construction
  - default branch resolution
  - remote detection
  - bookmark push behavior
- From `src/lib/submit.ts`:
  - submission graph analysis
  - PR plan creation
  - existing PR lookup
  - PR base validation/update
  - PR creation
  - stack comment creation/update
- From `src/lib/jjUtils.test.ts`:
  - graph construction tests adapted to Changeyard's `node:test` style

Do not vendor:

- Ink CLI UI
- ReScript command wrappers
- package-level CLI entrypoints
- broad dependency set that is only needed for the standalone `jj-stack` CLI

Adaptation requirements:

- Preserve MIT license/copyright notice in a vendored attribution file.
- Prefer Changeyard's existing validation and process patterns over adding `valibot`.
- Use Changeyard's process wrapper and provider config instead of copying direct `process.env` and `gh auth token` behavior unchanged.
- Redact tokens and auth details in diagnostics.
- Use argv-based process execution only.
- Validate bookmark names, remote names, file paths, and revision inputs before executing commands.
- Keep PR publishing disabled unless GitHub provider/auth state is explicit and valid.
- Add tests for copied graph and PR-planning behavior before enabling execution.

Initial GitHub issue search found no open issues matching `security`, `auth`, `bug`, or `injection`, but implementation must still perform a local vendoring/security review before enabling execution.

## Implementation Roadmap

### M0 - Baseline And Repo Analysis

Confirm current repo facts before product code changes:

- Run current baseline build/tests.
- Confirm package manager and script expectations from `package.json`.
- Confirm tRPC integration points in the runtime stack.
- Confirm frontend package/build integration points.
- Confirm existing JJ/git helpers and provider abstractions.
- Record any implementation deviations directly in this plan.

M0 findings captured on 2026-06-11:

- Root package manager/scripts are npm-based; root workspaces currently include `packages/kanban` and `packages/tui`.
- Baseline verification passed: `npm run build`, `npm test`, `npm run check:tui`, and `npm pack --dry-run`.
- Runtime APIs are tRPC-based in `packages/kanban/src/runtime-stack/trpc/app-router.ts`.
- The Changeyard bridge for markdown-backed project behavior is created in `src/commands/ui.ts` via `createChangeyardUiApi()`.
- The existing browser UI is built from `packages/kanban/web-ui`; a new `packages/vcs` package will need explicit workspace and root build integration.
- Existing JJ/git helpers are present under `packages/kanban/src/runtime-stack/workspace`, including `jj-utils.ts` and repository history helpers. They are useful references, but the long-term VCS domain boundary remains `src/vcs`.
- No implementation deviations from the locked decisions are required yet.

### M1 - Feature-Flagged VCS Shell

Add a separate frontend package and route shell:

- Create `packages/vcs`.
- Add React/Vite/TypeScript setup matching existing web UI conventions.
- Add build/typecheck scripts.
- Add `/vcs` and `/vcs/jj` behind `CHANGEYARD_VCS=1`.
- Render static placeholder screens only.
- Verify existing Kanban route still works when the flag is off.

M1 implementation landed on 2026-06-11:

- Added a new workspace package at `packages/vcs` with a standalone React/Vite/TypeScript shell.
- Integrated the VCS package into the root workspace/build flow and copied its built assets into the Kanban runtime distribution without creating a source-level dependency from `packages/kanban` to `packages/vcs`.
- Added feature-gated `/vcs` and `/vcs/jj` asset serving in the UI runtime behind `CHANGEYARD_VCS=1`.
- Added server tests covering both flag-off `404` behavior and flag-on shell delivery.
- Verified the milestone with `npm run build`, `node --test dist/tests/ui-server.test.js`, and `npm pack --dry-run`.

### M2 - tRPC VCS Detection

Add the read-only backend foundation:

- Add `src/vcs` types, adapter boundary, detection, and safe process runner.
- Wire `vcs.detect` through tRPC.
- Detect JJ root/version, git remote, provider, base/trunk, and GitHub publishing prerequisites.
- No mutation commands.

M2 implementation landed on 2026-06-11:

- Added root `src/vcs` detection modules with a small argv-only process wrapper, redaction for credential-bearing URLs, and read-only repository/JJ/GitHub prerequisite inspection.
- Extended the runtime API contract with VCS detection schemas and added a dedicated `vcs.detect` procedure group in the existing tRPC router.
- Bridged detection through `createChangeyardUiApi()` instead of creating a parallel backend path.
- Updated the standalone `/vcs` shell to call `vcs.detect` and render repository, remote, base, and diagnostics state.
- Added focused unit coverage for command validation/redaction and detection graphing via an injected runner, plus UI server coverage for the new `vcs.detect` route.

### M3 - JJ Read Model And Stack Graph

Render real JJ repository state:

- Add parser-friendly JJ command wrappers.
- Adapt `jj-stack` graph construction where appropriate.
- Add fixture/unit tests.
- Add `vcs.jjState` and `vcs.jjDiff`.
- Render read-only stack lanes, branch segments, change cards, unassigned changes, diagnostics, and diff drawer.

M3 implementation landed on 2026-06-11:

- Added JJ read-model modules under `src/vcs/jj` for bookmark discovery, log parsing, stack-lane construction, working-copy summaries, and current-change diff loading.
- Adapted the useful `jj-stack` graph behavior into Changeyard-owned domain models and added `node:test` coverage for sibling and deeper stack layouts.
- Extended the runtime API contract and tRPC router with `vcs.jjState` and a read-only `vcs.jjDiff` procedure.
- Updated the standalone `/vcs/jj` route to render real stack lanes, branch segments, change cards, working-copy file summaries, diagnostics, and a read-only current-change diff panel.
- Verified the milestone with `npm run build`, focused JJ VCS tests, and a full `npm test` pass.

### M4 - Preview-Only Interactions

Add the interaction surface without repository mutation:

- Add stack board, detail drawer, drag/drop affordances, keyboard/menu equivalents, and operation preview dialog.
- Add `vcs.previewOperation`.
- Return commands, affected refs, risk level, and warnings only.
- Ensure invalid operations are rejected before any mutation path exists.

### M5 - Confirmed JJ Mutations

Add safe mutations after preview:

- Add `vcs.applyOperation`.
- Support edit message, create bookmark, create change before/after, reorder change, squash, absorb selected files, move bookmark/branch, abandon change, and restore file.
- Refresh state after every mutation.
- Show operation result and undo/restore affordance.

### M6 - Vendored Stacked PR Publishing

Add GitHub stacked PR publishing without an external `jst` install:

- Add adapted `jj-stack` submit planner under `src/vcs/jj/stackSubmit`.
- Add `vcs.submitStackPreview`.
- Add `vcs.submitStack`.
- Use GitHub provider/auth integration where possible.
- Push required bookmarks and create/update PRs only after confirmation.
- Gracefully disable submit when GitHub/provider/auth requirements are missing.

M6 implementation landed on 2026-06-12:

- Added vendored attribution for the adapted `keanemind/jj-stack` code path under `src/vcs/vendor/`.
- Added a first `src/vcs/jj/stack-submit.ts` preview planner that adapts the useful `jj-stack` ideas around GitHub repo parsing, stack analysis, PR lookup, and base-branch planning without pulling in the upstream CLI shell.
- Wired a new tRPC `vcs.submitStackPreview` procedure through the existing Changeyard runtime boundary.
- Completed the confirmed submit path with GitHub-backed bookmark push, PR create/update, and stack-comment create/update behavior behind the same tRPC/runtime boundary.
- Replaced the temporary browser confirm flow in `packages/vcs` with an in-app submit dialog that shows the ordered plan, command preview, warnings, and final per-bookmark submit results.
- Kept the implementation GitHub-only, token-gated, and covered by mocked GitHub API tests plus focused VCS frontend state tests.

### M7 - Supporting Screens

Complete secondary VCS surfaces:

- Add `/vcs/jj/branches`.
- Add `/vcs/jj/history`.
- Add `/vcs/settings`.
- Add command path diagnostics, base/trunk config, safety preferences, and experimental flags.

M7 implementation landed on 2026-06-12:

- Added standalone VCS routes and navigation for `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings` behind `CHANGEYARD_VCS=1`.
- Added explicit client-side VCS route resolution so the supporting URLs render their intended views instead of falling back to the main JJ board or landing page.
- Extended the VCS shell to render bookmark inventory, JJ operation history, and read-only repository/provider/settings diagnostics without creating a dependency from `packages/kanban` back to `packages/vcs`.
- Kept the settings surface informational in this pass while exposing current JJ root, bookmark/base context, remote/provider state, and submit readiness through the existing tRPC/runtime bridge.
- Covered the supporting screens through the existing standalone VCS runtime/tests rather than introducing a parallel route or data path.

### M8 - Docs, Hardening, And Verification

Make the feature safe enough to keep as an experimental route:

- Add `docs/vcs-jj.md`.
- Add empty/error/loading states.
- Add accessibility pass.
- Add no-JJ/no-remote/no-provider states.
- Run full verification.
- Smoke test feature flag off/on.

M8 implementation landed on 2026-06-12:

- Added a JJ VCS usage and architecture note at `docs/vcs-jj.md`.
- Kept the standalone VCS UI defensive with explicit empty/loading/diagnostic states for repo detection, JJ state, diff previews, and stacked PR submission readiness.
- Hardened runtime shutdown cleanup by suppressing expected missing/non-repository workspace warnings during cleanup, which removed a large `ui-server.test` log flood and restored reliable suite completion.
- Re-ran the full verification matrix successfully: `npm run build`, `npm test`, `npm run check:tui`, `npm pack --dry-run`, `node --test --test-force-exit dist/tests/ui-server.test.js`, and `node --test --import tsx tests/changeyard.test.ts --test-name-pattern='hydrate copies allowlisted files and skips denied secrets'`.
- Verified the supporting screens in a live flagged browser session with Playwright against `http://127.0.0.1:4311` for `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings`.

## Test Plan

Baseline:

- `npm run build`
- `npm test`
- `npm run check:tui`
- `npm pack --dry-run`

Backend:

- detection tests
- command runner tests
- JJ parser fixtures
- adapted `jj-stack` graph tests
- PR plan tests with mocked GitHub API
- operation preview validation tests

Integration:

- temporary JJ repositories where available
- stack graph construction
- safe mutation commands
- operation log/undo behavior

Frontend:

- feature flag off hides VCS route
- feature flag on renders `/vcs`
- `/vcs/jj` renders mocked stack state
- drag/drop opens preview without mutation
- invalid operations show diagnostics

Non-regression:

- existing `cy ui` Kanban route still works
- existing markdown-backed workflows still pass
- no Kanban dependency on VCS package

## Assumptions

- Initial feature flag is `CHANGEYARD_VCS=1`.
- GitHub is the first PR publishing provider because vendored `jj-stack` is GitHub-specific.
- GitLab/Forgejo PR publishing is out of scope for the first vendored submit implementation.
- Git adapter support is designed into interfaces but not implemented first.
- Vendored code is adapted to Changeyard conventions rather than copied verbatim.
