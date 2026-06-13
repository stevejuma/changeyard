# Branches And Workspace Redesign Tasks

## Operating Rule

- [x] Work directly on the current branch.
- [x] Do not use the Changeyard workflow.
- [x] Do not use Changeyard lifecycle commands.
- [x] Do not use Changeyard workspaces.

## Current Status

- [x] Root `PLAN.md` created for this redesign.
- [x] Root `TASKS.md` created for this redesign.
- [x] Milestone 1 implementation completed.
- [x] STOP: Verify Branches Stack Layout.
- [x] Milestone 2 implementation completed.
- [x] STOP: Verify Branches File/Diff Interaction.
- [x] Milestone 3 implementation completed.
- [x] STOP: Verify Workspace Page.
- [x] Milestone 4 implementation completed.
- [x] STOP: Verify Applied Workspace Stack Lanes.
- [x] Milestone 5 implementation completed.
- [ ] STOP: Verify Event-Driven VCS Cache.
- [x] Milestone 6 E2E harness and RTK adoption completed.
- [x] STOP: Verify VCS E2E Harness and RTK adoption.
- [x] Milestone 7 SPA routing completed.
- [x] STOP: Verify VCS SPA Routing.

## Milestone 0: Planning Files First

Status: completed

- [x] Create root `PLAN.md`.
- [x] Create root `TASKS.md`.
- [x] Document current-branch-only execution.
- [x] Document no-Changeyard-workflow execution.
- [x] Add explicit verification checkpoints.

Verification notes:

- Created these root planning files as the source of truth for this redesign.

## Milestone 1: Branches Page Stack Layout

Status: completed

- [x] Keep the current left branch/bookmark list and current workspace target.
- [x] Query or pass `vcs.jjState` so Branches can use `data.stacks`.
- [x] Remove the old commits lane and `workspace.getRepositoryLog` usage.
- [x] Add the new collapsible stack detail column.
- [x] Resolve selected branch/bookmark rows to the containing stack.
- [x] Render selected stack heads newest-to-oldest and show changes under each head.
- [x] Show a read-only empty state for remote-only refs, tags, and refs outside a stack.
- [x] Add focused helper tests for stack lookup/grouping.

### STOP: Verify Branches Stack Layout

- [x] Run focused tests for stack lookup/grouping.
- [x] Start the VCS UI locally.
- [x] Open `/vcs/jj/branches`.
- [x] Verify the branch list still works.
- [x] Verify the commits lane is gone.
- [x] Verify selecting a bookmark opens the stack detail column.
- [x] Verify the layout matches the intended GitButler-style structure.
- [x] Record verification notes below before continuing.

Verification notes:

- Automated checks passed:
  - `npm --workspace @changeyard/vcs run test -- branches-stack-model.test.ts`
  - `npm --workspace @changeyard/vcs run typecheck`
- VCS dev server is running at `http://127.0.0.1:4174/vcs/`.
- `/vcs/jj/branches` returned HTTP 200 from the local dev server.
- In-app browser was unavailable in this session, so visual checkpoint items remain pending user review.
- User approved the visual checkpoint and asked to continue.

## Milestone 2: Branches Files And Diff Flow

Status: implementation complete, stopped for checkpoint verification

- [x] Clicking a stack change selects its `commitId`.
- [x] Use `workspace.getRepositoryCommitDiff` for changed files.
- [x] Reuse `VcsInlineFileSection` for changed files.
- [x] Clicking a file opens the existing right-side `VcsFileDiffColumn`.
- [x] Preserve URL params: `ref`, `commit`, `file`.
- [x] Preserve collapse and resize behavior.

### STOP: Verify Branches File/Diff Interaction

- [x] Run focused VCS tests.
- [x] Open `/vcs/jj/branches`.
- [x] Select a stack, select a change, select a file.
- [x] Verify changed files render inline and the diff column opens correctly.
- [x] Record verification notes below before continuing.

Verification notes:

- Automated checks passed:
  - `npm --workspace @changeyard/vcs run test -- branches-stack-model.test.ts`
  - `npm --workspace @changeyard/vcs run typecheck`
- `/vcs/jj/branches` returned HTTP 200 from the local dev server.
- Visual interaction checkpoint remains pending user review.
- Follow-up fix after checkpoint review:
  - Removed the redundant `workspace.getRepositoryRefs` request that was sending `{}` to a nullable input schema and returning HTTP 400.
  - Added a current-working-copy fallback stack so selecting the unbookmarked current workspace target renders a one-change stack instead of an empty stack state.
  - Expanded the fallback to local/base bookmarks and local branches, so selecting `main` renders a read-only one-change branch stack instead of an empty stack state.
  - Added configurable VCS workspace target storage via `vcs.targetBranch`, editable from Settings as a remote-branch dropdown.
  - Changed JJ inventory to group local and remote bookmark rows by normalized branch name: local bookmarks are one row with `hasLocal=true` and `remotes=[...]`; remote-only bookmarks are one read-only row with `hasLocal=false`.
  - Removed raw Git ref merging from JJ branch inventory, so Git refs no longer duplicate JJ bookmark rows.
  - Filtered internal `workspace/` and `workspace-wip/` bookmarks from branch inventory and stack derivation.
  - Changed stack bookmark candidate filtering from `mine() ~ base` to `all() ~ base`, matching local bookmark visibility rather than author identity.
  - For configured remote targets such as `origin/trunk`, stack derivation now uses the JJ remote bookmark boundary (`trunk@origin`) and falls back to local `trunk` only if the remote boundary is unavailable.
  - Verified `/Users/stevejuma/code/jj-sample-repo` now returns 9 user-facing branch rows after internal filtering, with remotes grouped under local identities and `origin/trunk` resolved to remote commit `02df047e3d5d`.
  - Aligned default stack derivation with the default remote target, so an unsaved config still treats `origin/<default>` as the base boundary when a remote default branch is known.
  - Restarted the VCS UI dev server at `http://127.0.0.1:4174/vcs/`; `/vcs/jj/branches` and `/vcs/settings` both returned HTTP 200.
  - Runtime API check for workspace `jj-sample-repo` returned 9 branch rows and a workspace target of `origin/trunk`.
  - Made the current workspace target card selectable like branch rows:
    - clicking it now sets `ref` to the remote-shaped target such as `origin/trunk`
    - it receives the same selected marker styling as branch rows
    - it opens a read-only stack detail fallback for the target instead of being folded into an active stack through a shared base commit
  - Fixed Branches stack commit membership:
    - JJ graph reads now use `(::bookmark) ~ ::base` so the graph contains bookmark ancestry that is not integrated into the target/base history.
    - Stack dependency detection now follows the primary parent only, so merge side-parent bookmarks remain separate stacks instead of being absorbed into merge descendants.
    - The Branches detail panel scopes the visible commit list to the selected bookmark head when the selected branch is inside a multi-head stack.
    - Verified `feature/cloud-runner` in `/Users/stevejuma/code/jj-sample-repo` resolves through the containing `feature/cloud-observability` stack but displays only the two `feature/cloud-runner` commits: `add deployment preview command` and `prepare cloud deployment config`.
    - Verified `feature/query-filtering` remains a separate stack with its two commits instead of being grouped under `sj-branch-1`.
  - Additional automated checks passed:
    - `node --test --import tsx tests/vcs-jj-inventory.test.ts tests/vcs-jj-state.test.ts`
    - `node --test --import tsx tests/vcs-jj-read.test.ts tests/vcs-jj-apply.test.ts tests/vcs-jj-preview.test.ts tests/vcs-jj-inventory.test.ts tests/vcs-jj-state.test.ts`
    - `node --test --import tsx tests/ui-server.test.ts`
    - `node --test --import tsx tests/schema-validator.test.ts tests/vcs-detect.test.ts`
    - `npm --workspace @changeyard/kanban run typecheck`
    - `npm --workspace @changeyard/tui run typecheck`
    - `npm run build:cli`
    - `npm --workspace @changeyard/vcs run test -- branches-stack-model.test.ts`
    - `npm --workspace @changeyard/vcs run typecheck`
    - `/vcs/jj/branches?workspaceId=jj-sample-repo` returned HTTP 200
    - `node --test --import tsx tests/vcs-jj-read.test.ts tests/vcs-jj-state.test.ts tests/vcs-jj-graph.test.ts`
    - `node --test --import tsx tests/vcs-jj-read.test.ts tests/vcs-jj-apply.test.ts tests/vcs-jj-preview.test.ts tests/vcs-jj-inventory.test.ts tests/vcs-jj-state.test.ts tests/vcs-jj-graph.test.ts`
    - `npm --workspace @changeyard/kanban run typecheck`
  - Follow-up alignment with the stricter branch-page stack-row model:
    - Branch rows now attach stack metadata only when the row name matches the derived `stack.id`.
    - Inner stack bookmarks are detected as contained by the top stack, but no longer render as their own stack row.
    - The branch list shows a stack chip and ordered head names only on the derived stack id row.
    - JJ stack derivation no longer filters out a `trunk` bookmark when the configured base is a different bookmark such as `main`.
  - Additional automated checks passed:
    - `npm --workspace @changeyard/vcs run test -- branches-stack-model.test.ts`
    - `node --test --import tsx tests/vcs-jj-graph.test.ts`
    - `node --test --import tsx tests/vcs-jj-read.test.ts tests/vcs-jj-state.test.ts tests/vcs-jj-graph.test.ts tests/vcs-jj-inventory.test.ts`
    - `npm --workspace @changeyard/vcs run typecheck`
  - Branches visual cleanup:
    - Branch list rows are compact single rows separated by borders.
    - Branch rows now show branch name and target commit message only; metadata chips were removed.
    - Added a sticky `Today` group and sticky secondary-background group headers.
    - Removed stack chips from the branch list.
    - Stack detail column keeps an empty header shell with the collapse control.
    - Stack detail column typography was reduced to the compact branch-page scale.
    - Stack detail header summary was removed; local stack rows now show `Apply to workspace` and `Delete local` controls in the stack column header.
    - Contained branch selections now render the containing stack instead of a contained-state empty message; selecting `feature/cloud-runner` shows the `feature/cloud-observability` and `feature/cloud-runner` cards with their commits.
    - Inner branch selections now omit older parent commits from the selected branch card while still showing descendant branch cards; selecting `feature/cloud-runner` keeps `feature/cloud-observability` visible and removes `prepare cloud deployment config` from the `feature/cloud-runner` card.
    - Reduced the connector diamond and line weight in stack commit rows.
    - Integrated local branches with no active stack now render an empty branch card using the remote-qualified branch name when available, and the `Apply to workspace` action is disabled.
    - Selecting the current workspace target now renders a paginated commit history for that target instead of a one-commit fallback stack.
    - Workspace target history uses the configured remote target revset such as `trunk@origin` and loads more commits through the existing infinite-scroll repository log hook.
    - JJ repository log reads are bounded per page instead of asking JJ for the full target history before slicing.
    - JJ inventory now includes target commit title and timestamp for branch rows.
  - Additional automated checks passed:
    - `node --test --import tsx tests/vcs-jj-inventory.test.ts`
    - `npm --workspace @changeyard/vcs run test -- branches-stack-model.test.ts`
    - `npm --workspace @changeyard/vcs run typecheck`
    - `npm --workspace @changeyard/kanban run typecheck`
    - `npm --workspace @changeyard/tui run typecheck`
    - `/vcs/jj/branches?workspaceId=jj-sample-repo` returned HTTP 200
    - `/vcs/jj/branches?workspaceId=jj-sample-repo&ref=feature%2Fcloud-runner` returned HTTP 200
    - `/vcs/jj/branches?workspaceId=jj-sample-repo&ref=feature%2Freadme-polish` returned HTTP 200
    - `/vcs/jj/branches?workspaceId=jj-sample-repo&ref=origin%2Ftrunk` returned HTTP 200
    - After removing a stale, unowned `.git/project.lock`, restarted the VCS dev server at `http://127.0.0.1:4174/vcs/`.
    - `/vcs/jj/branches?workspaceId=jj-sample-repo&ref=origin%2Ftrunk` returned HTTP 200.
    - `workspace.getRepositoryLog` for `trunk@origin` returned page 1 with 5 commits out of 11 total.
    - `workspace.getRepositoryLog` for `trunk@origin` returned page 2 with 5 commits out of 11 total.
    - Added a `workspaceId` query fallback to workspace-scoped GET requests so the backend can resolve workspace scope even if a proxy drops custom headers; the header is still sent.
    - Excluded JJ `root()` from repository-log revsets so the paginated target history count matches visible commits.
    - After restarting the VCS dev server, the exact UI request for `trunk@origin` with `maxCount=50&skip=0` returned 10 visible commits out of 10 total.
    - `/vcs/jj/branches?workspaceId=jj-sample-repo&ref=origin%2Ftrunk` returned HTTP 200 after the restart.
    - Fixed repeated cancelled workspace-target log requests:
      - The Branches page now memoizes the workspace-target log input.
      - `usePaginatedRepositoryLog` now keys its request loader by serialized input rather than object identity, preventing render-driven abort/refetch loops.
      - The exact workspace-target log request returned HTTP 200 with 10 visible commits out of 10 total after the fix.
    - Branch rows now show non-expensive commit metadata from the existing JJ bookmark template:
      - target commit message remains visible
      - author name, author email, timestamp, and Gravatar URL are returned by the backend inventory
    - branch rows render the author avatar through a reusable Radix Avatar wrapper with initials fallback
    - relative time and author are displayed without adding per-branch diff/stat calls
  - User verified the History and Branches pages are now behaving as expected, including the final column resize/spacer behavior.

## Milestone 3: Workspace Page UI Rename And Layout

Status: completed

- [x] Rename user-facing "JJ Board" navigation/title to "Workspace".
- [x] Keep `/vcs/jj` route behavior.
- [x] Reframe existing `data.stacks` rendering as workspace stack lanes.
- [x] Keep existing preview/apply/submit controls.
- [x] Keep unassigned working-copy changes visible using `data.unassignedChanges`.

### STOP: Verify Workspace Page

- [x] Run route/nav tests.
- [x] Open `/vcs/jj`.
- [x] Verify navigation says "Workspace".
- [x] Verify stack lanes render correctly.
- [x] Verify existing operation controls still appear.
- [x] Verify unassigned work remains visible.
- [x] Record verification notes below before continuing.
- [x] Wait for user confirmation that the page is looking okay before proceeding.
Verification notes:

- User-facing JJ Board labels were renamed to Workspace in the shared VCS shell navigation, Workspace page header, loading/error text, stack panel title, and overview entry point.
- The `/vcs/jj` route behavior was kept intact; internal route kind remains `jj-board`.
- Existing `data.stacks` rendering now presents as `Workspace stacks` without replacing the existing mutation controls.
- Existing preview/apply/submit controls remain visible in the Repository panel and each stack change card.
- Existing `data.unassignedChanges` rendering remains visible in the Details panel as the Working copy section.
- Automated checks passed:
  - `npm --workspace @changeyard/vcs run typecheck`
  - `npm --workspace @changeyard/vcs run test -- routes.test.ts branches-stack-model.test.ts`
- Browser verification passed at `/vcs/jj?workspaceId=jj-sample-but`:
  - navigation link and page heading show `Workspace`
  - `Workspace stacks` renders stack lanes from `data.stacks`
  - Repository panel still shows submit preview controls
  - stack change cards still show Bookmark, Insert, Message, Move ref, Squash, Abandon, and Move controls
  - Details panel still shows Working copy from `data.unassignedChanges`

## Milestone 4: Applied Workspace Stack Lanes

Status: completed

- [x] Add durable `vcsAppliedStacks` project config backed by local `vcs.appliedStacks`.
- [x] Wire Branches `Apply to workspace` to persist the selected branch's containing derived stack id.
- [x] Allow applied stacks to be unapplied without mutating JJ repository state.
- [x] Replace the Workspace page with a focused Working Copy column plus only applied stack lanes.
- [x] Remove old Workspace stats, repository, preview/apply/submit, mutation-control, details, and current-diff panels.
- [x] Reuse shared UI primitives for buttons, status, avatars, copy values, file status glyphs, and stack cards.

### STOP: Verify Applied Workspace Stack Lanes

- [x] Run focused config, branch, and Workspace tests.
- [x] Open `/vcs/jj/branches`.
- [x] Apply one stack.
- [x] Open `/vcs/jj`.
- [x] Verify only the applied stack appears in Workspace.
- [x] Unapply the stack.
- [x] Verify the Workspace empty state returns.
- [x] Verify the Working Copy column renders working-copy changes.
- [x] Record verification notes below before continuing.

Verification notes:

- Added `vcsAppliedStacks` to the project config API and persisted it in local config as `vcs.appliedStacks`.
- Added applied-stack helper coverage for canonical containing-stack selection, apply dedupe/order, unapply, and render-order filtering.
- Branches now loads project config, resolves selected inner bookmarks to their containing stack id, and toggles Apply/Unapply against `vcsAppliedStacks`.
- Branch rows show a `Workspace` chip when their canonical stack id is applied.
- Workspace now renders a focused `Working Copy` column plus only applied stack lanes, using the existing stack derivation output.
- Old Workspace stats, repository panel, preview/apply/submit controls, mutation controls, details panel, and current diff panel were removed from the Workspace route.
- Automated checks passed:
  - `npm --workspace @changeyard/vcs run test -- branches-stack-model.test.ts routes.test.ts`
  - `npm --workspace @changeyard/vcs run typecheck`

## Milestone 5: Event-Driven VCS Cache And Watcher Abstraction

Status: implementation complete, stopped for checkpoint verification

- [x] Add backend `VcsProjectWatcher` abstraction.
- [x] Implement first watcher backend with Chokidar.
- [x] Keep the watcher abstraction open for a future Watchman backend.
- [x] Watch targeted JJ metadata:
  - `.jj/repo/op_heads`
  - `.jj/working_copy`
- [x] Watch normal project files for working-copy changes.
- [x] Ignore `.git` except fetch/remote-ref metadata, most of `.jj`, `node_modules`, and common build/cache outputs.
- [x] Debounce and coalesce watcher events into semantic project events.
- [x] Emit VCS project events over the existing runtime WebSocket stream.
- [x] Start watchers only when runtime WebSocket clients are active for a project.
- [x] Stop watchers when the last client disconnects or the project is removed.
- [x] Install and wire RTK Query behind a VCS data service layer.
- [x] Spike shared Workspace/Branches data through RTK Query:
  - `getJjState`
  - `getJjInventory`
  - `getJjDiff`
  - `getRepositoryCommitDiff`
- [x] Keep event subscriptions in RTK service-level `onCacheEntryAdded` handlers.
- [x] Keep components reading query results rather than subscribing to events directly.
- [x] Add RTK invalidation tags for stack, branch, worktree, head, base, divergent-bookmark, diff, and commit-change data.
- [x] Audit JJ read commands and add non-snapshot flags to metadata/history/branch/stack/base reads where supported.
- [x] Leave working-copy diff/status reads snapshot-capable.

### STOP: Verify Event-Driven VCS Cache

- [x] Run watcher tests.
- [x] Run focused JJ/VCS tests.
- [x] Run `npm --workspace @changeyard/vcs run test`.
- [x] Run VCS and runtime typechecks.
- [x] Run full `npm test`.
- [x] Start the VCS UI locally.
- [ ] Open `/vcs/jj/branches`.
- [ ] Open `/vcs/jj`.
- [ ] Edit a normal project file externally and verify Working Copy updates without manual refresh.
- [ ] Move or create a JJ commit externally and verify Branches/Workspace refresh through VCS activity/head events.
- [ ] Verify repeated navigation does not create duplicate visible active requests.
- [ ] Record manual verification notes below before continuing.

Verification notes:

- Added `packages/kanban/src/runtime-stack/server/vcs-project-watcher.ts`.
- Added deterministic watcher tests for path classification and ignore behavior.
- Fixed JJ activity watching for the real `.jj/repo/op_heads/heads/*` layout so external JJ operations such as `jj status` can invalidate VCS caches.
- Added runtime stream message type `vcs_project_event`.
- Runtime WebSocket clients now start and stop project VCS watchers.
- Added RTK Query dependencies and a contained VCS service layer in `packages/vcs/src/runtime/vcs-api.ts`.
- Added a shared VCS runtime WebSocket subscription helper in `packages/vcs/src/runtime/vcs-events.ts`.
- Shared Workspace/Branches JJ state, inventory, diff, and commit-diff reads now go through RTK Query.
- Added a Playwright regression that opens Workspace, edits a JJ fixture file externally, and verifies the Working Copy list updates without a page reload.
- Automated checks passed:
  - `node --import tsx --test packages/kanban/src/runtime-stack/server/vcs-project-watcher.test.ts`
  - `node --import tsx --test tests/vcs-detect.test.ts tests/vcs-jj-state.test.ts tests/vcs-jj-preview.test.ts tests/vcs-jj-apply.test.ts tests/vcs-jj-diff.test.ts tests/vcs-jj-read.test.ts tests/vcs-jj-inventory.test.ts`
  - `npm --workspace @changeyard/vcs run test`
  - `npm --workspace @changeyard/vcs run typecheck`
  - `npm --workspace @changeyard/kanban run runtime:typecheck`
  - `npm --workspace @changeyard/vcs run e2e`
- `npm test` passed all 187 tests when rerun outside the sandbox; the first sandboxed run built successfully but failed runtime/JJ integration tests because it could not bind runtime ports or access JJ secure config under `~/.config/jj/repos`.
- VCS dev server is running at `http://127.0.0.1:4374/vcs/` for manual verification. Ports `4174` and `4274` were already occupied by existing node listeners that did not respond to HTTP.
  - `npm --workspace @changeyard/kanban run typecheck`
  - `npm run build:cli`
  - `npm --workspace @changeyard/kanban run build`
- `node --test --import tsx tests/ui-server.test.ts` failed in the sandbox before config assertions because runtime port allocation was unavailable and JJ config access under `~/.config/jj` was blocked.
- Retried the targeted `changes project config` test unsandboxed after rebuilding dist; it hung in the runtime server test harness and was stopped after roughly two minutes.
- Browser verification used the VCS dev server at `http://127.0.0.1:4274/vcs/` because stale listeners occupied lower ports.
  - Browser verification passed:
    - `/vcs/jj` initially showed the `Unstaged` column and `No stacks applied`.
    - `/vcs/jj/branches` applied `feature/cloud-observability`; the row showed the `Workspace` chip and the header button changed to `Unapply from workspace`.
    - `/vcs/jj` then showed only the `feature/cloud-observability` applied lane.
    - Unapplying from the Workspace lane returned `/vcs/jj` to the `No stacks applied` empty state.
    - The `Unstaged` column remained visible throughout.
  - Follow-up Workspace file/diff interaction:
    - Workspace stack commit rows now select like Branches stack rows.
    - Selecting a Workspace stack commit renders the inline `Changed files` section.
    - Selecting a changed file opens the shared diff column.
    - Workspace preserves `commit` and `file` URL params for the selected change/file.
    - Browser verification passed at `/vcs/jj?workspaceId=jj-sample-but&commit=51b8a2b97d56&file=src%2Foutput.rs`.
    - Diff columns now render immediately after the selected stack lane, so with multiple applied stacks the diff appears between stack columns instead of after all stacks.
    - Browser verification confirmed the order: `feature/cloud-observability`, `src/output.rs` diff column, then `feature/export-json`.
    - Workspace stack lanes now use the shared resizable/collapsible VCS column shell.
    - Unstaged files now use the shared changed-files section with list/folder view toggles and row hover behavior.
    - Workspace loading now uses a page-shaped skeleton instead of the generic loading panel.
    - Browser verification confirmed:
      - Unstaged shows `Show files as list` and `Show files as folders`.
      - Applied stack lanes expose collapse controls and resize separators.
      - Collapsing and expanding `feature/cloud-observability` works.
    - Follow-up Unstaged column refinement:
      - Replaced the inline changed-files wrapper with a custom Unstaged file-list component.
      - The Unstaged header owns the count and list/folder view actions.
      - The Unstaged body now renders only the file tree/list rows.
      - The Unstaged column is resizable and collapsible through the shared VCS column shell.
      - Selecting an unstaged file opens the shared diff column immediately to the right of Unstaged.
      - Browser verification confirmed `.changeyard/config.local.jsonc` opens between the Unstaged column and applied stack lanes.
    - Follow-up stack author avatars:
      - JJ stack graph reads now include author name and email in the bounded template output.
      - Stack changes expose `authorName`, `authorEmail`, and `authorAvatarUrl`.
      - Workspace stack rows use the shared Gravatar-backed `Avatar` component instead of the placeholder `A`.
      - Browser verification confirmed the `add json report mode` row renders an image avatar for Steve Juma with a Gravatar URL and no placeholder `A`.
    - Follow-up Working Copy rename, diff, and fold persistence:
      - User-facing `Unstaged` labels on the Workspace page were renamed to `Working Copy`.
      - The Workspace working-copy URL param now writes `workingCopyFile` while still reading legacy `unstagedFile` links.
      - Selecting a Working Copy file clears selected stack commit/file URL state so the active diff is unambiguous.
      - `vcs.jjDiff` now requests `jj show --git`, allowing the Workspace Working Copy file parser to return per-file patches for added/modified files.
      - Collapse state is persisted as browser UI preferences in `vcs-ui-preferences`, not project config:
        - project picker
        - Branches refs and stack columns
        - History operations and commits columns
        - Workspace Working Copy column
        - Workspace stack columns by stack id
      - Browser verification passed at `/vcs/jj?workspaceId=jj-sample-but&workingCopyFile=.changeyard%2Fconfig.local.jsonc`:
        - the column header shows `Working Copy`
        - `.changeyard/config.local.jsonc` renders a real diff/file body rather than an empty/no-diff state
        - collapsing Working Copy persisted after reload
        - Working Copy was expanded again after verification for continued review
      - Follow-up event-driven refresh fix:
        - Confirmed `vcs.jjState` for `jj-sample-but` returned the current working copy state with only `README.md` modified after the repo ignore file was corrected.
        - Confirmed the open Workspace page was stale before the active event path refreshed.
        - Added deterministic Chokidar startup readiness so runtime watcher setup resolves only after the initial scan is ready.
        - Runtime watcher startup failures now write a diagnostic to stderr instead of being silently swallowed.
        - Added a frontend VCS event-service fallback that treats existing `workspace_metadata_updated` runtime messages as worktree cache invalidations. This covers active dev runtimes that emit metadata updates before the newer semantic `vcs_project_event` stream is available.
        - Verified the active Workspace page at `http://127.0.0.1:4274/vcs/jj?workspaceId=jj-sample-but&workingCopyFile=.changeyard%2Fconfig.local.jsonc` updated without a manual browser reload and now shows `README.md` as the Working Copy entry.
        - Rechecked the live runtime stream after a README change was not reflected immediately:
          - a local WebSocket probe received `workspace_metadata_updated` events
          - the active page refreshed from that event path and showed `Modified README.md` without a browser reload
          - the dedicated Chokidar watcher path was separately reproduced failing with `EMFILE: too many open files, watch`
        - Added Chokidar native-watcher fallback to polling for `EMFILE`/`ENOSPC`, while keeping the watcher abstraction open for a later Watchman backend.
        - Added watcher coverage for semantic worktree, JJ activity, and JJ head events after startup.
      - Automated checks passed:
        - `node --test --import tsx tests/vcs-jj-diff.test.ts`
        - `npm --workspace @changeyard/vcs run typecheck`
        - `npm run build:cli`
        - `node --import tsx --test packages/kanban/src/runtime-stack/server/vcs-project-watcher.test.ts`
        - `npm --workspace @changeyard/kanban run runtime:typecheck`
        - `npm --workspace @changeyard/vcs run test -- branches-stack-model.test.ts routes.test.ts`

## Milestone 6: Deterministic VCS E2E Harness And RTK Adoption

Status: completed

- [x] Treat the RTK Query spike as successful and document RTK Query as the VCS data boundary.
- [x] Add deterministic JJ fixture generator script.
- [x] Fixture creates a real JJ/Git repository from scratch at a caller-provided path.
- [x] Fixture creates a file-backed Git remote.
- [x] Fixture creates a configured target/base of `origin/main`.
- [x] Fixture creates independent local stacks.
- [x] Fixture creates a dependent multi-head stack.
- [x] Fixture creates a remote-only branch.
- [x] Fixture can leave a dirty working-copy `README.md` for Working Copy coverage.
- [x] Wire fixture generation into root package scripts for npm and pnpm usage.
- [x] Add VCS-local Playwright config.
- [x] Add initial fixture-backed E2E coverage for Branches.
- [x] Add initial fixture-backed E2E coverage for Workspace apply/files/diff flow.
- [x] Add initial fixture-backed E2E coverage for History.
- [x] Add stable shared file-row test selectors to `VcsInlineFileSection`.
- [x] Add `packages/vcs/AGENTS.md` with RTK Query and shared UI guidance.
- [x] Continue migrating remaining VCS reads to RTK Query component by component.
- [x] Continue migrating VCS mutations to RTK Query mutations with explicit invalidation tags.
- [x] Add/update E2E coverage for each migration step before moving to the next component.
- [x] Remove obsolete manual refresh props and legacy query hooks once equivalent RTK coverage exists.

### STOP: Verify VCS E2E Harness

- [x] Run fixture generation with a temp path.
- [x] Run `npm --workspace @changeyard/vcs run test`.
- [x] Run `npm --workspace @changeyard/vcs run typecheck`.
- [x] Run `npm --workspace @changeyard/vcs run e2e`.
- [x] Record verification notes below before continuing deeper RTK migration.

Verification notes:

- Added `scripts/create-vcs-jj-fixture.ts`.
- Root script added:
  - `npm run vcs:fixture -- <path> --force`
  - `pnpm vcs:fixture -- <path> --force`
- The fixture generator was verified at `/private/tmp/changeyard-vcs-fixture-script-check`.
- Added `packages/vcs/playwright.config.ts`.
- Added `packages/vcs/tests/vcs-jj-fixture.spec.ts`.
- Added `@playwright/test` to the VCS workspace.
- Added shared `data-testid="vcs-file-row"` and `data-file-path` attributes to `VcsInlineFileSection` file rows for stable E2E selectors.
- Added `packages/vcs/AGENTS.md` documenting:
  - RTK Query as the VCS server-state boundary
  - service-layer runtime event subscriptions
  - existing query tag vocabulary
  - required shared UI primitives such as `Avatar`, `CopyValueButton`, `StatusChip`, `Button`, `VcsColumnShell`, and `VcsInlineFileSection`
- First follow-up RTK migration after the initial harness:
  - Added `getProjectConfig` and `updateProjectConfig` endpoints to `packages/vcs/src/runtime/vcs-api.ts`.
  - Added a `ProjectConfig` RTK tag and invalidation from project-config mutations.
  - Project-config queries now subscribe to VCS project events so worktree changes to config files can invalidate active config caches.
  - Branches now applies/unapplies stacks through the RTK project-config mutation.
  - Workspace now unapplies stacks through the RTK project-config mutation.
  - Settings now reads project config and JJ inventory through RTK Query.
  - Removed component-local `changes.getProjectConfig`, `changes.updateProjectConfig`, and Settings `vcs.jjInventory` query usage.
  - Added fixture-backed E2E coverage that opens Settings and verifies the target branch inventory/config path.
  - Second follow-up RTK migration:
    - Added `getVcsDetect` to `packages/vcs/src/runtime/vcs-api.ts`.
    - Added a `VcsDetection` RTK tag and event invalidation for worktree, head, activity, and fetch events.
    - `App.tsx` now reads `vcs.detect` through RTK Query instead of the legacy `useTrpcQuery` hook.
    - Existing fixture-backed Settings E2E covers the RTK-backed detection/config/inventory path.
  - Third follow-up RTK migration:
    - Added `getJjOperations` and `getJjOperationDiff` to `packages/vcs/src/runtime/vcs-api.ts`.
    - Added `OperationHistory` and `OperationDetails` tags with VCS activity/worktree invalidation.
    - Added `packages/vcs/src/runtime/history-api.ts` with RTK-backed pagination wrappers matching the previous History hook contract.
    - `HistoryView` now reads JJ operation history and operation commit graphs through RTK Query instead of the legacy paginated TRPC hooks.
    - Existing fixture-backed History E2E covers the RTK-backed operations and operation-diff path.
  - Fourth follow-up RTK migration:
    - Added `getRepositoryLog` to `packages/vcs/src/runtime/vcs-api.ts`.
    - Added a `RepositoryLog` tag with worktree/activity invalidation.
    - Added `packages/vcs/src/runtime/repository-log-api.ts` with an RTK-backed pagination wrapper matching the previous repository-log contract.
    - Branches now reads workspace-target commit history through RTK Query instead of the legacy paginated repository-log hook.
    - Extended fixture-backed Branches E2E to open `ref=origin/main` and verify target-history commits render.
  - Fifth follow-up RTK migration:
    - Added `getProjectDirectoryContents` to `packages/vcs/src/runtime/vcs-api.ts`.
    - `DirectoryAutocomplete` now uses an RTK lazy query instead of direct TRPC fetches.
    - `AddProjectDialog` now uses RTK lazy directory browsing plus the RTK `addProject` mutation for path, git-init, and clone flows.
    - `App.tsx` now opens the path dialog in automated browsers instead of trying to use the native directory picker, keeping the native picker path for normal localhost use.
    - Extended fixture-backed E2E to create a second deterministic JJ fixture and add it through the visible Add Project dialog/autocomplete flow.
  - Sixth follow-up RTK migration:
    - Added `startShellSession` and `stopTaskSession` mutations to `packages/vcs/src/runtime/vcs-api.ts`.
    - `VcsConsolePanel` now starts the console shell through RTK Query instead of direct TRPC mutation calls.
    - `usePersistentTerminalSession` now owns the RTK stop mutation and injects it into the persistent terminal manager.
    - `PersistentTerminal` no longer imports TRPC helpers directly; it keeps WebSocket control and delegates backend stop to the caller.
    - Removed obsolete legacy query/mutation hooks from `packages/vcs/src/runtime/trpc-client.ts`; that file is now only the low-level RTK transport helper boundary.
    - Extended fixture-backed E2E to open the console, wait for the runtime shell session, stop it, and close the console panel.
- Automated checks passed:
  - `npm run vcs:fixture -- /private/tmp/changeyard-vcs-fixture-script-check --force --json`
  - `npm run vcs:fixture -- /private/tmp/changeyard-vcs-npm-check --force --clean --json`
  - `pnpm vcs:fixture -- /private/tmp/changeyard-vcs-pnpm-check --force --clean --json`
  - `npm --workspace @changeyard/vcs run e2e -- --list`
  - `npm --workspace @changeyard/vcs run e2e`
  - `npm --workspace @changeyard/vcs run test`
  - `npm --workspace @changeyard/vcs run typecheck`
  - `npm --workspace @changeyard/vcs run e2e` (7 fixture-backed tests, including console start/stop)
  - Final RTK adoption check:
    - `rg` found no VCS component imports of legacy TRPC hooks or direct TRPC mutations.
    - `packages/vcs/src/runtime/trpc-client.ts` now only exports low-level fetch/post helpers used by the RTK service layer.
    - Obsolete Workspace `refreshState` / `refreshDiff` props were removed.
    - `npm --workspace @changeyard/vcs run typecheck` passed.
    - `npm --workspace @changeyard/vcs run test` passed.
    - `npm --workspace @changeyard/vcs run e2e` passed with 7 fixture-backed tests.
  - `npm --workspace @changeyard/vcs run typecheck`
  - `npm --workspace @changeyard/vcs run test -- branches-stack-model.test.ts routes.test.ts`
- E2E sandbox note:
  - The sandboxed E2E run failed before tests because the runtime could not bind a local port.
  - The same suite passed outside the sandbox, where the runtime server and Chromium could start normally.
- `pnpm install` completed outside the sandbox with `CI=true`; the pnpm lockfile was already up to date.
- `npm install` was rerun afterward to restore the npm workspace `node_modules` layout used by the repository's npm scripts.

## Milestone 7: VCS SPA Routing

Status: completed

- [x] Add a lightweight internal VCS router.
- [x] Track browser `pathname`, `search`, and `hash` in React state.
- [x] Expose client-side navigation backed by `pushState`, `replaceState`, and `popstate`.
- [x] Keep the Redux provider and RTK Query store mounted across VCS route changes.
- [x] Replace top-level VCS page anchors with client-side navigation.
- [x] Preserve `workspaceId` across Workspace, Branches, History, and Overview navigation.
- [x] Open Settings as a dialog without changing or replacing the current route URL.
- [x] Move Workspace, Branches, and History selection URL params onto router-backed query updates.
- [x] Keep `commit`, `file`, `operation`, `ref`, and `workingCopyFile` URL params addressable without full document reloads.

### STOP: Verify VCS SPA Routing

- [x] Run VCS unit tests.
- [x] Run VCS typecheck.
- [x] Run fixture-backed VCS E2E.
- [x] Verify top-level navigation keeps the same browser document alive.
- [x] Verify browser back returns to the previous VCS route.
- [x] Record verification notes below.

Verification notes:

- Added `packages/vcs/src/utils/vcs-router.tsx`.
- `App.tsx` now derives the active route from router state instead of reading `window.location.pathname` once.
- `VcsShell`, Overview, and Settings now navigate with the internal router instead of document-level navigation.
- Workspace, Branches, and History still write their selection URL params, but those writes now flow through the router helper.
- Settings now opens as a dialog from the current VCS page instead of navigating to a separate Settings page.
- Added unit coverage for URL resolution and query-param preservation.
- Added fixture-backed E2E coverage that sets a browser-document probe, navigates Workspace -> Branches -> History -> Settings, and verifies the probe survives route changes and browser back.
- Updated fixture-backed E2E coverage so Settings opens over History without changing the URL.
- Automated checks passed:
  - `npm --workspace @changeyard/vcs run test`
  - `npm --workspace @changeyard/vcs run typecheck`
  - `npm --workspace @changeyard/vcs run e2e` outside the sandbox, with 8 fixture-backed tests
- The sandboxed E2E run failed before tests because local runtime port binding is restricted; the escalated run passed.
- In-app browser was connected and showed the VCS app, but browser-control clicking timed out in the extension. The same route-switch behavior passed in the Playwright E2E browser.
- Follow-up in-app browser verification passed on `http://127.0.0.1:4274/vcs/jj/branches?workspaceId=jj-sample-but&ref=origin%2Ftrunk`: clicking the Settings button opened the Settings dialog and left the URL unchanged.

## Final Verification

Status: pending

- [ ] Run focused JJ/VCS tests.
- [ ] Run `npm --workspace @changeyard/vcs run test`.
- [ ] Run `npm --workspace @changeyard/vcs run e2e`.
- [ ] Run `npm test`.
- [ ] Manually inspect `/vcs/jj/branches`.
- [ ] Manually inspect `/vcs/jj`.
- [ ] Record final verification results.

Verification notes:

- Pending.
