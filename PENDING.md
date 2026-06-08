# PENDING: Vendored App.tsx + Full Upstream Runtime Stack Activation

Date: 2026-06-09  
Objective: Replace the Changeyard custom kanban server surface with the vendored upstream App runtime stack so `npm run cli ui` serves upstream UI + upstream transport protocol end-to-end.

---

## Progress Status
- [x] Not started
- [x] Plan authored
- [x] Runtime host cutover implemented
- [x] Runtime build/typecheck restored
- [x] CLI runtime smoke verified

---

## 1) Baseline & diff capture
- [x] Confirm source references for upstream runtime stack exist locally:
  - `packages/kanban/upstream/cline-kanban/web-ui/src/App.tsx`
  - `packages/kanban/upstream/cline-kanban/src/server/runtime-server.ts`
  - `packages/kanban/upstream/cline-kanban/src/server/runtime-state-hub.ts`
  - `packages/kanban/upstream/cline-kanban/src/server/workspace-registry.ts`
  - `packages/kanban/upstream/cline-kanban/src/projects/project-path.ts`
- [x] Compare current UI entrypoint against upstream expectations:
  - `packages/kanban/web-ui/src/main.tsx` mounts `App` and provider wrapper stack.
  - `packages/kanban/web-ui/src/runtime/trpc-client.ts` targets `/api/trpc`.
  - `packages/kanban/web-ui/src/runtime/use-runtime-state-stream.ts` targets `/api/runtime/ws`.
  - `packages/kanban/web-ui/src/terminal/persistent-terminal-manager.ts` targets `/api/terminal/io` and `/api/terminal/control`.
- [x] Confirm current server still exposes legacy paths on startup (`board`, `cards`, `events`) and stubbed `/api/trpc`:
  - documented in `.runtime-baseline.md` before cutover.
- [x] Add a short snapshot file (`.runtime-baseline.md`) documenting any intentional differences from upstream (if any).

---

## 2) Vendored `App.tsx` parity
- [x] Compare `packages/kanban/web-ui/src/App.tsx` with upstream App and align:
  - router wiring
  - hooks import surface
  - top-level route/modal/panel composition
  - passcode/error boundary wrapper expectations
- [x] If drift exists, patch `App.tsx` to match upstream behavior while preserving changeyard-specific branding/config points:
  - no drift remained after vendored parity audit; current `App.tsx` and `main.tsx` match upstream copies.
- [x] Verify `web-ui/src/main.tsx` imports and renders upstream-compatible `App` entry and providers.
- [x] Run focused UI checks:
  - `npm run --workspace @changeyard/kanban run check`
  - targeted web-ui unit tests for app composition + startup fallback paths.

---

## 3) Runtime host wiring in `packages/kanban/src/server/index.js`
- [x] Replace legacy Changeyard REST handler body with upstream runtime host composition:
  - instantiate/create `createWorkspaceRegistry`
  - instantiate/create `createRuntimeStateHub`
  - instantiate/create `createRuntimeServer`
- [x] Route host options into runtime endpoint setters:
  - bind runtime host/port to `setRuntimeApiHost`/`setRuntimeApiPort` (or equivalent upstream API).
- [x] Remove custom API handlers that conflict with upstream stack:
  - `/api/board*`
  - `/api/cards*`
  - `/api/events`
  - `/api/trpc` stub
- [x] Preserve required compatibility surfaces:
  - `/api/health` for external scripts
  - static asset serving + SPA fallback for `/`
  - existing CLI launch/open-browser flow and return contract `{ url, close }`.
- [x] Ensure `close()` triggers graceful runtime shutdown:
  - wired through `shutdownRuntimeServer(...)`, with CLI signal handling calling `server.close()` on `SIGINT`/`SIGTERM`.

---

## 4) Add missing Changeyard adapters required by vendored runtime
Create/adjust files so vendored modules can execute under changeyard ownership:

- [x] Add `packages/kanban/src/projects/project-path.ts` copied from upstream.
- [x] Implement missing terminal/process adapters:
  - `pickDirectoryPathFromSystemDialog`
  - `runCommand(command, cwd)`
  - optional timeout + output capture contract
- [x] Implement missing path/git adapters:
  - `resolveInteractiveShellCommand`
  - `resolveProjectInputPath`
  - `assertPathIsDirectory`
  - `hasGitRepository`
- [x] Implement workspace cleanup hooks:
  - `collectProjectWorktreeTaskIdsForRemoval`
  - `disposeWorkspace`
  - ensure terminal-manager disposal hooks are called.
- [x] Implement runtime update hooks if referenced by runtime stack:
  - `getUpdateStatus`
  - `runUpdateNow`
- [x] Wire above adapters into `createRuntimeServer`/`createWorkspaceRegistry` callsites.

---

## 5) Build/packaging integration
- [x] Ensure runtime compile is part of normal package build:
  - `runtime:build` runs before/with `build`
  - `runtime:typecheck` available in CI/manual validation.
- [x] Fix packaging script to preserve runtime output:
  - avoid deleting `dist/runtime-stack` after runtime compilation
  - preserve `dist/projects` emitted from vendored host helpers
  - copy/retain `dist/runtime-stack` in final packaged output
  - keep `dist/web-ui` copy behavior intact.
- [x] Verify `dist/server/index.js` imports resolve to compiled runtime files.
- [x] Add/update any required exports in `packages/kanban/package.json` if build/runtime entrypoints changed.

---

## 6) Validation and smoke checks
- [x] `npm --workspace @changeyard/kanban run runtime:typecheck`
- [x] `npm --workspace @changeyard/kanban run runtime:build`
- [x] `npm --workspace @changeyard/kanban run build`
- [x] Root CLI rebuilt and validated with `node dist/src/cli.js ui --host 127.0.0.1 --port 3490 --no-open`
- [x] Runtime endpoint verification:
  - `POST /api/trpc/projects.list`
  - websocket upgrade for `/api/runtime/ws`
  - websocket upgrade for `/api/terminal/io` and `/api/terminal/control`
  - `/api/passcode/status` and `/api/passcode/verify`
- [x] Confirm legacy API surface (`/api/board`, `/api/cards*`, `/api/events`) is no longer in main startup path unless explicitly retained for migration.
- [x] Record manual validation log in PENDING as each stage is completed.

Manual validation log:
- `npm --workspace @changeyard/kanban run runtime:typecheck` passed.
- `npm --workspace @changeyard/kanban run typecheck` passed.
- `npm --workspace @changeyard/kanban run build` passed.
- `npm run build:cli` passed.
- `node dist/src/cli.js ui --host 127.0.0.1 --port 3490 --no-open` served `http://127.0.0.1:3490/changeyard`.
- `GET /api/health` returned `{"ok":true}`.
- `GET /api/passcode/status` returned `{"required":false,"authenticated":true}` in localhost mode.
- `GET /api/trpc/projects.list` returned a real project payload for the current workspace instead of `RUNTIME_STACK_NOT_YET_IMPLEMENTED`.
- WebSocket smoke script confirmed:
  - `/api/runtime/ws?workspaceId=changeyard` opened and emitted a `snapshot`.
  - `/api/terminal/io` upgrade succeeded.
  - `/api/terminal/control` upgrade succeeded.
- `GET /api/board` now returns `404`.
- `GET /changeyard` serves the built SPA HTML shell.
- Root CLI signal shutdown path exits cleanly on `Ctrl+C` with the new `server.close()` hook.

---

## 7) Completion definition
- [x] Upstream `App.tsx` is the rendered CLI UI shell.
- [x] Upstream runtime transport is active and functional:
  - `/api/trpc`, `/api/runtime/ws`, `/api/terminal/io`, `/api/terminal/control`.
- [x] Changeyard CLI still retains expected persistence and project lifecycle behavior.
- [x] Shutdown lifecycle is deterministic and does not leak terminal/runtime resources.
- [x] Build outputs include both `dist/web-ui` and `dist/runtime-stack`.
- [x] `PENDING.md` updated continuously as each checkbox is completed.
