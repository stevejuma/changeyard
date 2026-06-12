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
- [ ] STOP: Verify Branches File/Diff Interaction.

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

Status: implementation complete, stopped for checkpoint verification

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
- [ ] Open `/vcs/jj/branches`.
- [ ] Select a stack, select a change, select a file.
- [ ] Verify changed files render inline and the diff column opens correctly.
- [ ] Record verification notes below before continuing.

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

## Milestone 3: Workspace Page UI Rename And Layout

Status: blocked on Milestone 2 checkpoint

- [ ] Rename user-facing "JJ Board" navigation/title to "Workspace".
- [ ] Keep `/vcs/jj` route behavior.
- [ ] Reframe existing `data.stacks` rendering as workspace stack lanes.
- [ ] Keep existing preview/apply/submit controls.
- [ ] Keep unassigned working-copy changes visible using `data.unassignedChanges`.

### STOP: Verify Workspace Page

- [ ] Run route/nav tests.
- [ ] Open `/vcs/jj`.
- [ ] Verify navigation says "Workspace".
- [ ] Verify stack lanes render correctly.
- [ ] Verify existing operation controls still appear.
- [ ] Verify unassigned work remains visible.
- [ ] Record verification notes below before continuing.

Verification notes:

- Pending.

## Milestone 4: Workspace Files And Diff Flow

Status: blocked on Milestone 3 checkpoint

- [ ] Add the same change-to-files-to-diff interaction used on Branches.
- [ ] Reuse existing file list/tree and diff components.
- [ ] Ensure selecting stack changes and files does not interfere with preview/apply flows.

### STOP: Verify Workspace File/Diff Interaction

- [ ] Run focused VCS tests.
- [ ] Open `/vcs/jj`.
- [ ] Select a stack change and file.
- [ ] Verify the file list and diff pane work while existing mutation preview controls still behave.
- [ ] Record verification notes below before continuing.

Verification notes:

- Pending.

## Final Verification

Status: pending

- [ ] Run focused JJ/VCS tests.
- [ ] Run `npm --workspace @changeyard/vcs run test`.
- [ ] Run `npm test`.
- [ ] Manually inspect `/vcs/jj/branches`.
- [ ] Manually inspect `/vcs/jj`.
- [ ] Record final verification results.

Verification notes:

- Pending.
