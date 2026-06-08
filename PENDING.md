# Pending: Kanban UI Integration

This file tracks implementation of the Changeyard + Kanban UI integration. Changeyard markdown, workspace metadata, reviews, and provider state remain the only authoritative state.

## 1. Runtime version alignment

- [x] Update root `package.json` `engines.node` to `>=22.0.0`.
- [x] Update `package-lock.json` workspace metadata for the new workspace layout.
- [x] Update CI, release, and live-smoke workflows to run Node 22.
- [x] Update docs to state Node 22 is the minimum supported runtime.
- [x] Verify `npm ci`, `npm run check`, `npm test`, and `npm run pack:check` pass on Node 22.

## 2. Internal package setup

- [x] Add root npm workspaces for `packages/kanban`.
- [x] Create private package `@changeyard/kanban`.
- [x] Add an internal kanban server/UI baseline under `packages/kanban`.
- [x] Keep the integration internal; do not expose a standalone `kanban` binary.
- [x] Vendor upstream `cline/kanban` at a pinned commit and record provenance.
- [x] Copy upstream license/notice files once vendoring is in place.
- [x] Disable or remove unused upstream telemetry/update behavior after vendoring.
- [x] Ensure root `npm install` and workspace builds are stable from a clean checkout.

## 3. Changeyard core API and board model

- [x] Add `src/index.ts` exporting supported programmatic APIs.
- [x] Add board DTO/types and status-to-column mapping.
- [x] Implement markdown-backed board read service.
- [x] Include workspace metadata from `.changeyard/workspaces/**/metadata.json`.
- [x] Include provider references from existing change frontmatter.
- [x] Add structured create/update helpers for UI write paths.
- [x] Add file-locking/atomic mutation helpers for concurrent UI and CLI writes.

## 4. `cy ui` command

- [x] Add `src/commands/ui.ts`.
- [x] Add CLI help for `cy ui`.
- [x] Support `--host`, `--port`, `--open`, and `--no-open`.
- [x] Start the internal kanban server with the discovered Changeyard repo root.
- [x] Add a tested install-from-tarball smoke for `cy ui`.

## 5. Read-only board UI

- [x] Add board and card API endpoints backed by Changeyard state.
- [x] Render columns from Changeyard statuses.
- [x] Render every `.changeyard/changes/*.md` file exactly once.
- [x] Add a card detail view backed by Changeyard markdown.
- [x] Show provider and workspace metadata, including engine type.
- [x] Verify the UI does not create Kanban state files.

## 6. Initial UI actions

- [x] Add UI start action via `runStart`.
- [x] Add UI sync action via `runSync`.
- [x] Refresh the board after mutations.
- [x] Add UI create action.
- [x] Add guarded frontmatter edit actions.
- [x] Add guarded markdown section edit actions.
- [x] Add completion/review actions.

## 7. Full workspace engine support

- [x] Replace Kanban worktree assumptions with Changeyard workspace metadata.
- [x] Support `plain-copy`, `git-worktree`, and `jj` in the UI data model.
- [x] Surface engine-specific workspace verification state in the UI.
- [x] Add engine-specific diff and terminal tabs.
- [x] Route publish/completion actions through `runComplete`.
- [x] Add tests covering UI workspace behavior across all three engines.

## 8. Live updates and richer integration

- [x] Watch `.changeyard/changes/**/*.md`.
- [x] Watch `.changeyard/reviews/**/*.md`.
- [x] Watch `.changeyard/workspaces/**/metadata.json`.
- [x] Push invalidation events to the web UI and refetch automatically.
- [x] Surface provider review and PR flows through existing Changeyard providers.

## 9. Tests and packaging

- [x] Add focused board service tests.
- [x] Add server/API tests for `cy ui` startup and board/card endpoints.
- [x] Add integration tests proving UI start actions produce the same metadata as CLI start.
- [x] Ensure `npm run pack:check` includes the server and built UI assets.
- [x] Ensure installed package runtime can resolve `packages/kanban/dist` correctly.

## 10. Documentation

- [x] Add README usage for `cy ui`.
- [x] Add `docs/kanban-integration.md`.
- [x] Document the one-source-of-truth invariant for the UI.
- [x] Document workspace-engine behavior for `plain-copy`, `git-worktree`, and `jj`.
- [x] Document how to vendor/update from upstream `cline/kanban` later.
