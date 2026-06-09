# PLAN: Native `packages/kanban` Migration

Date: 2026-06-09

## Objective

Make `packages/kanban` the canonical ChangeYard kanban package instead of treating `packages/kanban/upstream/cline-kanban` as an active upstream package. Finish the visible ChangeYard rebrand, then collapse the remaining Git-centric runtime flows onto ChangeYard's WorkspaceEngine model so the UI and runtime behave consistently for both Git and JJ repositories.

## Current State

- `packages/kanban` is already the active build and runtime package.
- The vendored upstream tree has been removed; provenance now lives in docs plus the copied upstream license.
- Visible UI branding has been partly reworked to `ChangeYard`, but some runtime-facing messages still say `Cline`.
- Root ChangeYard already has a real `WorkspaceEngine` abstraction in `src/workspace/`.
- `packages/kanban` still carries its own runtime-specific Git/JJ workspace orchestration in:
  - `packages/kanban/src/server/index.js`
  - `packages/kanban/src/runtime-stack/workspace/task-worktree.ts`
  - `packages/kanban/src/runtime-stack/workspace/git-sync.ts`
  - `packages/kanban/src/runtime-stack/workspace/get-workspace-changes.ts`
  - `packages/kanban/src/runtime-stack/workspace/git-history.ts`
- JJ detection and some JJ task-workspace handling already exist in the runtime, but the API surface is still Git-shaped and not yet driven by a shared WorkspaceEngine bridge.

## Design Direction

1. `packages/kanban` remains the only active package.
2. Upstream provenance lives as documentation and license material, not as a second active source tree.
3. Product branding shown to users becomes `ChangeYard`.
4. Compatibility identifiers that are part of the SDK/runtime contract stay in place for now:
   - `agentId: "cline"`
   - `@clinebot/*`
   - `cline-sdk`
   - `.cline` runtime storage paths until a storage migration is intentionally designed
5. Runtime workspace lifecycle should be driven by a shared bridge to ChangeYard's `WorkspaceEngine`, not by parallel Git/JJ implementations that drift apart.

## Workstreams

### 1) Package ownership and layout cleanup

- Audit any remaining references to the removed vendored tree in active code, docs, scripts, and planning files.
- Move any still-needed assets, docs, or reference snippets under native `packages/kanban` locations.
- Replace stale vendored-snapshot language in:
  - `packages/kanban/README.md`
  - `docs/kanban-integration.md`
  - `docs/kanban-upstream.md`
  - `.runtime-baseline.md`
  - `PLAN.md`
  - `PENDING.md`
- Keep the provenance note with upstream repo + pinned commit as the remaining record of origin.

### 2) Visible ChangeYard rebrand

- Finish the audit of user-facing strings in active UI and runtime responses.
- Update runtime-facing messages that still expose product branding as `Cline`, especially in:
  - `packages/kanban/src/runtime-stack/cline-sdk/cline-session-runtime.ts`
  - `packages/kanban/src/runtime-stack/cline-sdk/cline-task-session-service.ts`
- Keep internal type names and compatibility symbols unless changing them is required for behavior.
- Update tests that assert visible copy so they match the new branding.
- Re-run a manual shell smoke of `npm run cli ui` and check the rendered UI, manifest, and runtime dialogs for leftover visible `Cline` branding.

### 3) Shared WorkspaceEngine bridge

- Define a bridge module that makes the root `src/workspace/` engines consumable from `packages/kanban` runtime code.
- Export the bridge from the root package so kanban runtime code does not reimplement repository/workspace lifecycle rules.
- Resolve the interface mismatch explicitly:
  - root `WorkspaceEngine` APIs are synchronous and CLI-oriented
  - kanban runtime flows are async and need richer runtime responses
- Introduce an adapter layer that maps runtime operations onto WorkspaceEngine concepts:
  - detect workspace engine
  - create task workspace
  - verify task workspace
  - publish/push workspace state where applicable
  - describe unsupported operations cleanly per engine

### 4) Replace Git-centric runtime workflow with WorkspaceEngine-backed behavior

- Replace duplicate repository detection in `packages/kanban/src/server/index.js` with the shared bridge.
- Refactor task workspace lifecycle in `packages/kanban/src/runtime-stack/workspace/task-worktree.ts` so creation, verification, and disposal align with WorkspaceEngine behavior.
- Review whether task workspace naming and base-ref handling need a small runtime-specific wrapper on top of `WorkspaceEngine`.
- Move workspace-summary and sync behavior toward a VCS-neutral model:
  - `packages/kanban/src/runtime-stack/workspace/git-sync.ts`
  - `packages/kanban/src/runtime-stack/trpc/workspace-api.ts`
- Address the remaining Git-only read surfaces so JJ support is real in the UI, not only accepted at project load time:
  - `packages/kanban/src/runtime-stack/workspace/get-workspace-changes.ts`
  - `packages/kanban/src/runtime-stack/workspace/git-history.ts`
- Preserve explicit unsupported responses where a Git operation has no JJ equivalent yet, instead of silently failing or pretending parity.

### 5) Verification and deletion gate

- Command verification:
  - `npm --workspace @changeyard/kanban run typecheck`
  - `npm --workspace @changeyard/kanban run build`
  - `npm run build:cli`
- Runtime smoke:
  - `npm run cli ui`
  - Git-backed project loads and workspace actions still work
  - JJ-backed project loads and task workspace actions still work
  - rendered UI shows `ChangeYard` product branding
- Deletion gate before removing `packages/kanban/upstream/cline-kanban`:
  - no active imports or docs rely on it
  - no build step reads from it
  - provenance note exists elsewhere

## Implementation Order

1. Rewrite planning/docs so the migration target is unambiguous.
2. Finish the visible rebrand in active runtime/UI copy.
3. Add the shared WorkspaceEngine bridge and export surface.
4. Move task workspace lifecycle and runtime repo detection onto that bridge.
5. Refactor Git-only history/diff/sync paths into a VCS-aware runtime layer.
6. Finish the remaining runtime and branding cleanup now that the active package is self-contained.

## Exit Criteria

- `packages/kanban` is clearly the only active kanban package.
- User-visible branding says `ChangeYard`.
- The runtime no longer carries separate ad hoc Git/JJ workspace lifecycle logic when the root WorkspaceEngine can own it.
- JJ support works through the same runtime workflow model as Git where the feature maps cleanly.
- Upstream provenance is recorded without treating upstream source as a second package root.
