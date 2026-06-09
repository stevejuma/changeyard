# PENDING: Native `packages/kanban` + WorkspaceEngine Execution

Date: 2026-06-09

Objective: Make `packages/kanban` the canonical ChangeYard kanban package, finish the visible `ChangeYard` rebrand, and replace the remaining Git-centric runtime workflow with a shared WorkspaceEngine-backed Git/JJ model.

---

## Status

- [x] New implementation plan written in `PLAN.md`
- [x] Native-package migration started
- [x] Native-package migration finished
- [x] Visible ChangeYard rebrand finished
- [x] Shared WorkspaceEngine bridge landed
- [x] Runtime workflow moved off Git-centric helpers
- [x] Upstream snapshot removed or reduced to provenance-only material
- [x] Final smoke verification completed

---

## 1) Native package ownership

- [x] Remove active-source references to `packages/kanban/upstream/cline-kanban` from planning/docs/runtime notes.
  - [x] `.runtime-baseline.md`
  - [x] `PLAN.md`
  - [x] `docs/kanban-integration.md`
  - [x] `docs/kanban-upstream.md`
- [x] Inventory any files still needed from the vendored snapshot and move them under native `packages/kanban` locations.
- [x] Replace the full vendored snapshot with a short provenance note once no active code/docs depend on it.
- [x] Delete `packages/kanban/upstream/cline-kanban`.

## 2) Visible ChangeYard rebrand

- [x] Update active shell branding in:
  - [x] `packages/kanban/web-ui/public/manifest.json`
  - [x] `packages/kanban/web-ui/public/sw.js`
  - [x] `packages/kanban/web-ui/src/components/app-error-boundary.tsx`
  - [x] `packages/kanban/web-ui/src/components/project-navigation-panel.tsx`
  - [x] `packages/kanban/web-ui/src/components/runtime-settings-dialog.tsx`
  - [x] `packages/kanban/web-ui/src/components/debug-dialog.tsx`
- [x] Finish the runtime-facing copy audit where product branding still says `Cline`.
  - [x] `packages/kanban/src/runtime-stack/cline-sdk/cline-session-runtime.ts`
  - [x] `packages/kanban/src/runtime-stack/cline-sdk/cline-task-session-service.ts`
- [x] Re-run a non-test-code search for visible `Cline` strings and clear the remaining simple product-branding cases in the history shell.
- [x] Update tests that assert visible shell copy.
- [x] Manual UI smoke:
  - [x] `npm run cli ui`
  - [x] confirm no visible `Cline` branding remains in the main shell, dialogs, manifest, and service-worker metadata

Note: keep compatibility identifiers as-is for now:
- `agentId: "cline"`
- `@clinebot/*`
- `cline-sdk`
- `.cline` runtime storage paths

## 3) Shared WorkspaceEngine bridge

- [x] Add a shared runtime bridge for ChangeYard workspace engines under the root package.
- [x] Export the bridge from `src/index.ts` or a dedicated root workspace entrypoint.
- [x] Define the adapter boundary between:
  - root `src/workspace/*`
  - kanban runtime task-workspace lifecycle
- [x] Decide whether the bridge wraps existing synchronous engines or whether the engine surface itself should become async.
- [x] Document and implement the current runtime contract surface:
  - [x] engine detection
  - [x] task workspace create
  - [x] task workspace head inspection
  - [x] task workspace delete/unregister
  - [x] workspace verify
  - [x] workspace publish
  - [x] unsupported-action behavior per engine

## 4) Replace Git-centric runtime workflow

- [x] Make runtime repository detection accept Git or JJ projects.
- [x] Make workspace state and project-loading paths resolve Git or JJ roots.
- [x] Add JJ-aware task workspace create/info/delete support in `packages/kanban/src/runtime-stack/workspace/task-worktree.ts`.
- [x] Add JJ-aware summary/sync basics in `packages/kanban/src/runtime-stack/workspace/git-sync.ts`.
- [x] Replace duplicate repo detection in `packages/kanban/src/server/index.js` with the shared WorkspaceEngine bridge.
- [x] Refactor `packages/kanban/src/runtime-stack/workspace/task-worktree.ts` so engine-specific create/delete/head behavior delegates to the shared bridge.
- [x] Refactor `packages/kanban/src/runtime-stack/trpc/workspace-api.ts` away from Git-only naming/assumptions where the UI expects JJ to work.
- [x] Replace or wrap the remaining Git-only read surfaces:
  - [x] `packages/kanban/src/runtime-stack/workspace/get-workspace-changes.ts`
  - [x] `packages/kanban/src/runtime-stack/workspace/git-history.ts`
- [x] Define explicit unsupported responses for operations that stay Git-only after the bridge lands.

## 5) Verification

- [x] `npm --workspace @changeyard/kanban run typecheck`
- [x] `npm --workspace @changeyard/kanban run build`
- [x] `npm run build:cli`
- [x] Targeted UI test pass for rebrand-sensitive components
- [x] Direct JJ task-workspace smoke against built runtime modules
- [x] Full `npm run cli ui` smoke after the remaining rebrand and bridge work
- [x] Manual Git project workflow smoke
- [x] Manual JJ project workflow smoke through the UI/runtime API surface

Manual validation log:
- Replaced the old vendored-upstream cutover checklist with the native-package/WorkspaceEngine migration plan.
- `npm --workspace @changeyard/kanban run typecheck` passed after the first JJ-aware runtime changes.
- `npm --workspace @changeyard/kanban run build` passed after branding and JJ runtime changes.
- `npm run build:cli` passed.
- Added root workspace runtime detection helpers in `src/workspace/runtimeBridge.ts` and exported them from the root package.
- Extended `src/workspace/runtimeBridge.ts` with shared task-workspace create/delete/head helpers for Git and JJ.
- `packages/kanban/src/server/index.js` now loads the root workspace runtime bridge for repository detection, with a local fallback for package-only development before the root CLI build exists.
- Added `packages/kanban/src/runtime-stack/workspace/workspace-runtime-bridge.ts` so runtime-stack code can consume the shared bridge with a local fallback.
- Replaced the remaining user-facing runtime session errors that still said `Cline` with `ChangeYard agent` wording in the active runtime stack.
- Updated `docs/kanban-integration.md`, `docs/kanban-upstream.md`, and `.runtime-baseline.md` so they describe the active native package and provenance state instead of the old upstream-cutover posture.
- Removed `packages/kanban/upstream/cline-kanban` after confirming active code and build paths no longer referenced it.
- Updated `packages/kanban/README.md`, `docs/kanban-integration.md`, `docs/kanban-upstream.md`, and `PLAN.md` so they describe the provenance-note state instead of a still-present vendored tree.
- Added shared git-style patch parsing under `packages/kanban/src/runtime-stack/workspace/git-style-patch.ts`.
- `packages/kanban/src/runtime-stack/workspace/get-workspace-changes.ts` now supports JJ working-copy diffs, JJ diff-from-ref, and JJ diff-between-refs.
- `packages/kanban/src/runtime-stack/workspace/git-history.ts` now supports JJ refs, JJ commit log, and JJ commit diff responses while preserving the current API contract.
- `packages/kanban/src/runtime-stack/workspace/task-worktree.ts` now uses the bridge for engine-specific task workspace create/delete/head operations instead of issuing inline Git/JJ commands directly.
- Targeted tests passed:
  - `src/components/board-card.test.tsx`
  - `src/components/detail-panels/cline-agent-chat-panel.test.tsx`
  - `src/components/project-navigation-panel.test.tsx`
  - `src/components/runtime-settings-dialog.test.tsx`
  - `src/components/task-agent-model-picker.test.tsx`
- Direct JJ task-workspace smoke passed for create/info/delete against the built runtime module.
- Earlier server smoke succeeded with `npm run cli -- ui --host 127.0.0.1 --port 3491 --no-open`, `/api/health`, and `/manifest.json`.
- `npm run cli -- ui --host 127.0.0.1 --port 3492 --no-open` served successfully after the workspace-bridge change.
- `GET /api/health` returned `{"ok":true}` after the workspace-bridge change.
- `GET /manifest.json` still returned `ChangeYard` for both `name` and `short_name`.
- `GET /api/trpc/projects.list?batch=1&input=%7B%7D` returned a live project payload after the workspace-bridge change, proving the runtime server path still booted correctly.
- Direct built-module JJ verification passed for:
  - `getWorkspaceChanges(cwd)`
  - `getWorkspaceChangesFromRef({ cwd, fromRef: "@-" })`
  - `getWorkspaceChangesBetweenRefs({ cwd, fromRef, toRef })`
  - `getGitRefs(cwd)`
  - `getGitLog({ cwd, maxCount: 3 })`
  - `getCommitDiff({ cwd, commitHash })`
- `npm run build:cli` passed after extending the shared runtime bridge with task-workspace helpers.
- `npm --workspace @changeyard/kanban run typecheck` passed after the task-worktree bridge refactor.
- `npm --workspace @changeyard/kanban run build` passed after the task-worktree bridge refactor.
- Direct built-module JJ task-workspace verification passed for:
  - `ensureTaskWorktreeIfDoesntExist({ cwd, taskId, baseRef })`
  - `getTaskWorkspaceInfo({ cwd, taskId, baseRef })`
  - `deleteTaskWorktree({ repoPath: cwd, taskId })`
- `npm run build:cli` passed after removing the vendored upstream tree.
- `npm --workspace @changeyard/kanban run build` still passed after removing the vendored upstream tree.
- `npm run cli -- ui --host 127.0.0.1 --port 3493 --no-open` still served successfully after removing the vendored upstream tree.
- `GET /api/health` returned `{"ok":true}` after vendored-tree removal.
- `GET /api/trpc/projects.list?batch=1&input=%7B%7D` returned a live project payload after vendored-tree removal.
- `GET /manifest.json` still returned `ChangeYard` for both `name` and `short_name` after vendored-tree removal.
- Added repository-neutral TRPC aliases in `packages/kanban/src/runtime-stack/trpc/app-router.ts` and `workspace-api.ts`, then moved the history UI to those aliases.
- Updated visible history-shell labels from Git-specific wording to repository-neutral wording in the web UI.
- `npm --workspace @changeyard/kanban run typecheck` passed after the repository-history alias pass.
- `npm --prefix packages/kanban/web-ui run test -- --run src/components/git-history/use-git-history-data.test.tsx src/components/remote-file-browser-dialog.test.tsx` passed after the repository-history relabeling pass.
- `npm --workspace @changeyard/kanban run build` passed after the repository-history alias and UI relabeling pass.
- Extended the root workspace runtime bridge with `verifyTaskWorkspace()` and `publishTaskWorkspace()`, then exposed matching async wrappers in the kanban runtime bridge.
- Kept the root `WorkspaceEngine` surface synchronous and treated `packages/kanban` as the async adapter boundary.
- Tightened JJ-only unsupported responses so pull, branch switching, and discard return explicit user-facing guidance instead of generic not-implemented errors.
- Replaced the last visible upstream-branding holdouts in the active shell:
  - onboarding media now uses local ChangeYard-branded PNG assets
  - the settings docs link now points at the local repo docs
  - the issue link now points at the ChangeYard repo
  - the provider base-URL placeholder no longer shows `api.cline.bot`
- Live UI verification passed against `npm run cli -- ui --host 127.0.0.1 --port 3494 --no-open`:
  - `GET /api/health` returned `{"ok":true}`
  - `GET /manifest.json` returned `ChangeYard`
  - Playwright screenshots of the main shell, onboarding modal, and settings dialog showed no visible `Cline` branding
- Live Git workflow smoke passed through the runtime API surface:
  - added a disposable Git project
  - verified summary, refs, log, diff, workspace changes, task worktree create/info/delete, and discard
- Live JJ workflow smoke passed through the runtime API surface:
  - added a disposable JJ project
  - verified summary, refs, log, diff, workspace changes, task worktree create/info/delete
  - verified explicit unsupported responses for pull, branch switching, and discard
- Removed the disposable smoke projects from the UI project list and deleted the temporary repos after verification.
