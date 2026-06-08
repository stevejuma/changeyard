# PENDING: Vendored Upstream App.tsx + Runtime Stack Cutover

Date: 2026-06-09

## Goal
Run the vendored upstream Kanban web UI (currently `packages/kanban/web-ui/src/App.tsx`) on a real upstream runtime surface:
- upstream tRPC router (`/api/trpc`)
- upstream websocket/runtime bus (`/api/runtime/ws`, `/api/terminal/io`, `/api/terminal/control`)
- upstream passcode flow (`/api/passcode/status`, `/api/passcode/verify`)
- Changeyard-backed persistence and project/workspace management.

This PENDING file is the execution plan and live checklist.

---

## Track
- [ ] not started
- [x] done

---

## 0) Baseline checks (do these before code edits)

- [ ] Verify upstream UI contract in this branch:
  - [ ] `web-ui/src/main.tsx` renders `App` from `web-ui/src/App.tsx` and contains the Passcode gate/telemetry/error-boundary providers.
  - [ ] `web-ui/src/runtime/trpc-client.ts` still points to `/api/trpc` with `x-kanban-workspace-id`.
  - [ ] `web-ui/src/runtime/use-runtime-state-stream.ts` still points to `/api/runtime/ws`.
  - [ ] `web-ui/src/terminal/persistent-terminal-manager.ts` still points to `/api/terminal/io` and `/api/terminal/control`.
  - [ ] no `custom` legacy fetch path is used by the App path except compatibility features.
- [ ] Snapshot legacy endpoints currently still handled by `packages/kanban/src/server/index.js`:
  - [ ] `/api/board`
  - [ ] `/api/cards*`
  - `/api/events`
  - [ ] `/api/trpc` currently returns `RUNTIME_STACK_NOT_YET_IMPLEMENTED`.
- [ ] Inspect upstream server composition entrypoint for reuse in this repo:
  - [ ] `packages/kanban/upstream/cline-kanban/src/cli.ts` (server-start orchestration)
  - [ ] `packages/kanban/upstream/cline-kanban/src/server/runtime-server.ts`
  - [ ] `packages/kanban/upstream/cline-kanban/src/server/runtime-state-hub.ts`
  - [ ] `packages/kanban/upstream/cline-kanban/src/server/workspace-registry.ts`.

---

## 1) Rewrite `packages/kanban/src/server/index.js` to use upstream runtime host

- [ ] Replace custom REST handlers in `packages/kanban/src/server/index.js`:
  - [ ] remove Changeyard board service path (`createChangeyardBoardService` and `/api/board*`)
  - [ ] remove file-watch invalidation SSE (`/api/events`) if no longer needed
  - [ ] remove stub `/api/trpc` response.
- [ ] Lift runtime-startup flow from upstream:
  - [ ] import and call `createWorkspaceRegistry`
  - [ ] import and call `createRuntimeStateHub`
  - [ ] import and call `createRuntimeServer`
  - [ ] preserve `options.open` browser launch and existing return contract (`url`, `close`).
- [ ] Implement dependency surface for `createRuntimeServer` in this package:
  - [ ] `resolveProjectInputPath`
  - [ ] `pickDirectoryPathFromSystemDialog`
  - [ ] `resolveInteractiveShellCommand`
  - [ ] `runCommand`
  - [ ] `assertPathIsDirectory` / `hasGitRepository`
  - [ ] `disposeWorkspace` integration with terminal-manager cleanup
  - [ ] `collectProjectWorktreeTaskIdsForRemoval`
  - [ ] `getUpdateStatus` and `runUpdateNow`.
- [ ] Ensure server lifecycle:
  - [ ] `close()` and CLI shutdown route call runtime `shutdown` path
  - [ ] terminal managers and runtime state hub are disposed cleanly.
- [ ] Keep `/api/health` in place for compatibility.

---

## 2) Add/adjust Changeyard adapter layer for runtime expectations

- [ ] Create explicit Changeyard adapters (or confirm already copied versions) to decouple runtime assumptions from raw Changeyard internals:
  - [ ] project registry adapter (`load/sync projects`, `create/remove project` semantics, stable IDs)
  - [ ] workspace state adapter (board/state/session persistence mapping)
  - [ ] runtime config adapter (`loadGlobalRuntimeConfig`, `loadRuntimeConfig`, `saveRuntimeConfig`)
  - [ ] terminal adapter (command execution hooks, session bootstrap/cleanup).
- [ ] Wire adapters into runtime entrypoint glue:
  - [ ] `runtime-stack/server/workspace-registry.ts`
  - [ ] `runtime-stack/state/workspace-state.ts` if runtime persistence path differs from Changeyard source
  - [ ] `runtime-stack/trpc/*-api.ts` implementations as needed.
- [ ] Decide and document source-of-truth policy:
  - [ ] existing `.changeyard`/repo-based state continues as canonical task/workspace truth
  - [ ] runtime board/session writes are translated into this canonical store without duplicate IDs.
- [ ] Create a migration note for any transitional legacy API behavior in `PENDING.md` or `docs/`.

---

## 3) Build and packaging wiring for runtime stack output

- [ ] Fix `packages/kanban/scripts/build.mjs` ordering:
  - [ ] stop deleting `dist/runtime-stack` after `runtime:build`.
  - [ ] copy `dist/runtime-stack/**` into final package output after `runtime:build` or preserve both `dist/src` and `dist/runtime-stack`.
  - [ ] keep web UI assets path matching `runtime-server`/`server/index`.
- [ ] Validate package entrypoints still resolve to compiled files:
  - [ ] `packages/kanban/package.json` `main` and `exports`
  - [ ] `dist/server/index.js` imports runtime modules by working relative paths.
- [ ] Add/adjust scripts so repeated builds are deterministic:
  - [ ] `build` runs `runtime:build` and does not wipe runtime runtime artifacts.
  - [ ] optional: `runtime:check` target to run `runtime:typecheck` and fail fast before full build.

---

## 4) Runtime compile/type hardening

- [ ] Run `npm run --workspace @changeyard/kanban run runtime:typecheck` and resolve all errors in vendored files:
  - [ ] convert extensionless internal runtime imports to NodeNext-compatible form where needed.
  - [ ] remove/replace implicit `any` hotspots introduced by the vendoring pass.
  - [ ] reconcile any package API mismatch with installed `@clinebot/*` versions.
  - [ ] ensure JSON imports (e.g. package metadata) are typed correctly for this package context.
- [ ] Add minimal typing helpers where needed instead of `any` shortcuts.
- [ ] Run `npm run --workspace @changeyard/kanban run runtime:build` and confirm `dist/runtime-stack` emits.
- [ ] Update/remove local `.d.ts` patches only if unavoidable (document why).

---

## 5) Endpoint parity and behavior verification

- [ ] `/api/trpc` must return real router responses for procedures used by App:
  - [ ] projects API
  - [ ] workspace API
  - [ ] runtime API
  - [ ] hooks API.
- [ ] `/api/runtime/ws`:
  - [ ] open stream successfully
  - [ ] receives runtime state updates
  - [ ] works under remote-mode with passcode enforcement.
- [ ] `/api/terminal/io` and `/api/terminal/control`:
  - [ ] websocket upgrade works
  - [ ] terminal manager attached to workspace
  - [ ] sessions can be created/closed.
- [ ] Passcode endpoints:
  - [ ] `/api/passcode/status` returns enabled mode and session state.
  - [ ] `/api/passcode/verify` accepts valid token and rejects invalid.
- [ ] Optional cleanup routes:
  - [ ] keep legacy `/api/board*` only if App still depends during migration
  - [ ] add explicit removal criteria and date before deletion.

---

## 6) Integration smoke + manual UI validation

- [ ] Add/run command-level checks in a temporary script or test:
  - [ ] `npm run --workspace @changeyard/kanban run runtime:typecheck`
  - [ ] `npm run --workspace @changeyard/kanban run runtime:build`
  - [ ] `npm run --workspace @changeyard/kanban run build`
  - [ ] `npm run --workspace @changeyard/kanban run cli ui`
  - [ ] verify `/api/trpc` no longer returns `RUNTIME_STACK_NOT_YET_IMPLEMENTED`.
- [ ] Add one smoke test per transport path:
  - [ ] project switch + task create/open path
  - [ ] runtime state stream updates
  - [ ] terminal bridge opens, receives, sends input
  - [ ] review-ready/hook-update notifications appear in UI.
- [ ] Update docs:
  - [ ] `docs/release-notes.md` with runtime-stack landing note
  - [ ] `docs/live-forge-smoke.md` or a new runtime smoke checklist file with current commands.

---

## 7) Completion criteria (must all be true)

- [ ] `packages/kanban/src/server/index.js` is not serving legacy `/api/cards*` or `/api/board` by default.
- [ ] `npm run cli ui` opens upstream UI behavior in this repo (not legacy board-mode behavior).
- [ ] `/api/trpc`, `/api/runtime/ws`, `/api/terminal/io`, `/api/terminal/control` all respond with upstream protocol.
- [ ] Passcode gate works in remote host mode through `/api/passcode/status` and `/api/passcode/verify`.
- [ ] Runtime state and config are persisted via Changeyard-backed sources, not separate, disconnected state roots.
- [ ] PENDING entry is updated after each milestone so progress is visible.
