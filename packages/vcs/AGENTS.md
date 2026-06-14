# VCS Package Agent Guide

## Operating Rules

- Work directly on the current branch for VCS UI work unless the user says otherwise.
- Do not use the Changeyard lifecycle workflow for VCS UI implementation.
- Prefer small, focused changes that preserve the current Branches, Workspace, and History interaction model.

## Data Fetching Boundary

- RTK Query is the VCS server-state boundary going forward.
- Add new VCS reads to `src/runtime/vcs-api.ts` instead of adding one-off `useTrpcQuery` calls in components.
- Components should read query hook results and render. They should not subscribe directly to runtime WebSocket events or file watchers.
- Runtime event handling belongs in the data service layer through `onCacheEntryAdded`, shared event helpers, and RTK Query tag invalidation.
- Mutations should declare the tags they invalidate. Keep stale reference handling in the data layer where possible.
- Use the existing TRPC client helpers only inside the data service layer or for mutations that have not been migrated yet.

## Query Tags

Use the established tag vocabulary before adding a new tag:

- `Stacks`
- `StackDetails`
- `WorktreeChanges`
- `BranchListing`
- `BranchDetails`
- `HeadSha`
- `BaseBranchData`
- `DivergentBookmarks`
- `Diff`
- `CommitChanges`

## Shared UI Primitives

Do not recreate controls that already exist:

- Use `Button` from `src/components/ui/button.tsx`.
- Use `Avatar` from `src/components/ui/avatar.tsx` for people and commit authors. It is Radix-backed and supports Gravatar URLs with initials fallback.
- Use `CopyValueButton` from `src/components/ui/copy-value-button.tsx` for copyable change IDs, commit IDs, hashes, and refs.
- Use `StatusChip` and `FileStatusGlyph` from `src/components/ui/status-chip.tsx` for labels and file state.
- Use `VcsColumnShell`, `VcsFileDiffColumn`, and `VcsInlineFileSection` from `src/components/vcs-file-columns.tsx` for collapsible/resizable columns, file lists, and diffs.
- Use Radix primitives through the existing `src/components/ui/*` wrappers when adding dialogs, tooltips, selects, avatars, or other standard controls.
- Use skeleton placeholders for data-loading UI. Prefer `kb-skeleton` rows, cards, or panels that match the final layout instead of progress bars or "Loading..." text.

## Page Patterns

- Branches, Workspace, and History are column-based views. Preserve collapse, resize, URL params, hover states, selected-row accents, and right-side diff placement.
- Stack change rows should keep the existing connector treatment, hover state, selected left accent, author avatar, copy buttons, and inline changed-files behavior.
- Working-copy file lists should behave like changed-files lists: list/folder toggle, row hover, selected state, and adjacent diff column.
- Avoid landing-page or explanatory UI. The VCS app should open into operational views.

## E2E Fixture

- Use `pnpm run vcs:fixture -- <path> --force` or `pnpm vcs:fixture -- <path> --force` to create a deterministic JJ/Git repository for manual or automated UI testing.
- The fixture includes:
  - target/base `origin/main`
  - independent stacks
  - a dependent multi-head stack
  - a remote-only branch
  - an optional dirty working-copy `README.md`
- Prefer this fixture over hand-maintained local sample repositories for new VCS E2E coverage.
