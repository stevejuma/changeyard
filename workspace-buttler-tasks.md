# Workspace Buttler Tasks

## Operating Rule

- [x] Work directly on the current branch.
- [x] Do not use the Changeyard workflow.
- [x] Do not use Changeyard lifecycle commands.
- [x] Do not use Changeyard workspaces.
- [x] Keep `workspace-plan.md` and `workspace-tasks.md` untouched for this documentation task.

## Current Status

- [x] Create `workspace-buttler.md`.
- [x] Create `workspace-buttler-tasks.md`.
- [x] Create implementation plan and progress tracker.
- [x] Milestone 1: Neutral VCS Workspace Contracts.
- [x] Milestone 2: Provider-Neutral RTK Query Endpoints.
- [x] Milestone 3: JJ Workspace Engine. Verified.
- [ ] Milestone 4: Git Workspace Engine Shared Subset. Partially implemented.
- [x] Milestone 5: Workspace And Branches UI Migration. Verified.
- [ ] Milestone 6: Drag/Drop Workspace Operations. Partially implemented.
- [x] Milestone 7: Preview, Apply, Invalidation, And Recovery.
- [x] Milestone 8: Cross-Provider Test Coverage.
- [ ] Milestone 9: Manual Verification And Enablement.

## Progress Tracking Rules

- Update this file at the start and end of every implementation session.
- Mark exactly one milestone as `in progress` while active.
- Keep future milestones as `planned` until work starts.
- Mark a milestone `blocked` only when a concrete dependency prevents progress.
- Do not start implementation tasks after a STOP checkpoint until its verification notes are recorded.
- Add dated notes under the relevant milestone whenever behavior, scope, or test strategy changes.
- Keep `workspace-buttler.md` as the proposal source of truth; use this file for execution state.
- Keep `workspace-plan.md` and `workspace-tasks.md` untouched unless requested separately.

Status values:

- `planned`: not started.
- `in progress`: active implementation work is underway.
- `partially implemented`: some tasks are complete, but the milestone is not the active implementation focus.
- `blocked`: waiting on a concrete dependency or decision.
- `verified`: implementation and checkpoint verification are complete.

## Implementation Plan

The work should proceed in dependency order, keeping provider-specific behavior behind a neutral engine boundary before enabling mutation-heavy UI paths.

1. Add neutral contracts and validation helpers.
2. Add neutral service/runtime endpoints without removing existing JJ-specific reads.
3. Implement the JJ engine behind the new contract.
4. Implement the Git shared subset behind the same contract.
5. Migrate Workspace and Branches reads/actions to neutral state and operations.
6. Add neutral drag/drop payloads and operation emission.
7. Wire preview, apply, cache invalidation, recovery, and watcher refresh.
8. Add cross-provider unit, fixture, and Playwright coverage.
9. Manually verify JJ and Git repositories before enabling mutation-heavy controls by default.

Cross-cutting constraints:

- UI mutation code must emit `VcsWorkspaceOperation` values only.
- Provider capability flags must gate controls before preview/apply calls.
- JJ-specific details must stay inside JJ provider modules.
- Git-specific details must stay inside Git provider modules.
- Operation previews must not mutate repository state.
- Failed mutation results must include normalized errors and recovery data or recovery instructions.
- Existing JJ read paths should remain usable during migration.

## Session Log

- 2026-06-13: Created this implementation plan in the current working copy without using the Changeyard workflow.
- 2026-06-13: Started Milestone 1 implementation in the current working copy.
- 2026-06-13: Completed Milestone 1 contracts, validation helpers, engine boundary types, and focused tests.
- 2026-06-13: Started Milestone 2 implementation in the current working copy.
- 2026-06-13: Completed Milestone 2 neutral RTK hooks, tRPC procedures, runtime schemas, and CLI/UI adapter wiring.
- 2026-06-13: Started Milestone 3 JJ workspace engine implementation in the current working copy.
- 2026-06-14: Added focused JJ workspace adapter tests and started Milestone 4 Git workspace engine state/diff work.
- 2026-06-14: Added Git neutral workspace state/diff reader and focused provider tests for JJ and Git adapters.
- 2026-06-14: Migrated Workspace reads to neutral state/diff and routed Workspace/Branches stack membership actions through neutral operations.
- 2026-06-14: Started Milestone 6 neutral drag/drop operation modeling in the current working copy.
- 2026-06-14: Wired neutral Workspace/Branches drag payloads into DOM handlers and added a Workspace operation preview dialog for drops.

## Milestone 1: Neutral VCS Workspace Contracts

Status: verified

- [x] Add provider-neutral workspace types in the shared VCS domain layer.
- [x] Define `VcsWorkspaceState`.
- [x] Define `VcsWorkspaceOperation`.
- [x] Define `VcsChangeSelection`.
- [x] Define provider capability flags.
- [x] Define provider-neutral preview and apply result types.
- [x] Add operation validation helpers that check required fields and provider capabilities.
- [x] Keep JJ-specific concepts out of the public workspace contract.

### STOP: Verify Neutral Contracts

- [x] Run VCS typecheck.
- [x] Add focused unit tests for operation validation.
- [x] Verify no new UI code imports JJ-specific workspace mutation types.
- [x] Record verification notes before continuing.

Verification notes:

- 2026-06-13: Added `packages/vcs/src/vcs-workspace-contracts.ts` with neutral workspace, stack, commit, selection, operation, preview, apply result, diff, and engine boundary types.
- 2026-06-13: Added capability-aware validation helpers and focused tests in `packages/vcs/src/vcs-workspace-contracts.test.ts`.
- 2026-06-13: `pnpm --filter @changeyard/vcs run test` passed with 35 tests.
- 2026-06-13: `pnpm --filter @changeyard/vcs run typecheck` passed.
- 2026-06-13: Searched `packages/vcs/src/views`, `packages/vcs/src/components`, and `packages/vcs/src/App.tsx` for JJ-specific mutation imports; no new UI code was added in this milestone.

## Milestone 2: Provider-Neutral RTK Query Endpoints

Status: verified

- [x] Add `getVcsWorkspaceState` to the VCS RTK service layer.
- [x] Add `getVcsStacks` if stack loading needs to be separate from workspace state.
- [x] Add `getVcsDiff` for provider-neutral worktree and commit diffs.
- [x] Add `previewVcsOperation`.
- [x] Add `applyVcsOperation`.
- [x] Route the endpoints through provider detection.
- [x] Keep direct TRPC or runtime fetch helpers contained inside the RTK service layer.
- [x] Use existing VCS RTK tag vocabulary where possible.
- [x] Add new tags only if existing tags cannot represent workspace operation invalidation.

### STOP: Verify Neutral RTK Endpoints

- [x] Run VCS service tests.
- [x] Run VCS typecheck.
- [x] Verify active Workspace reads refresh through RTK Query rather than component-owned event subscriptions.
- [x] Verify existing JJ-specific reads still work during migration.
- [x] Record verification notes before continuing.

Verification notes:

- 2026-06-13: Added neutral RTK hooks in `packages/vcs/src/runtime/vcs-api.ts`: `getVcsWorkspaceState`, `getVcsStacks`, `getVcsDiff`, `previewVcsOperation`, and `applyVcsOperation`.
- 2026-06-13: Added neutral runtime schemas and tRPC procedures: `vcs.workspaceState`, `vcs.workspaceStacks`, `vcs.diff`, `vcs.previewWorkspaceOperation`, and `vcs.applyWorkspaceOperation`.
- 2026-06-13: Wired the CLI/UI adapter to return detected-provider neutral workspace state with unsupported capabilities until provider engines land.
- 2026-06-13: Neutral RTK endpoints use `onCacheEntryAdded` workspace event subscriptions and existing RTK tags. Migrating the Workspace component to consume these hooks remains Milestone 5.
- 2026-06-13: Existing JJ-specific reads and procedures remain in place during migration.
- 2026-06-13: `pnpm --filter @changeyard/vcs run test` passed with 35 tests.
- 2026-06-13: `pnpm --filter @changeyard/vcs run typecheck` passed.
- 2026-06-13: `pnpm --filter @changeyard/kanban run typecheck` passed.
- 2026-06-13: `pnpm run build:cli` passed.

## Milestone 3: JJ Workspace Engine

Status: verified

- [x] Implement a JJ `VcsWorkspaceEngine`.
- [x] Map JJ stacks/bookmarks/changes to neutral stack and commit models.
- [x] Implement `apply_stack` and `unapply_stack` through JJ workspace merge/WIP internals. Stack membership rebases the working-copy change `@` onto the adjusted parent set, preserving the working-copy change id and WIP diff.
- [x] Implement commit reword, amend, split, squash, and move operations through JJ-safe rewrite flows. Reword, working-copy file amend, selected-file and selected-hunk split, squash, committed-file move, committed-hunk move, and commit move through JJ rebase are bridged.
- [x] Implement file and hunk movement through JJ patch splitting and hunk ownership behavior. Committed file movement is bridged through path-qualified JJ squash; committed hunk movement is bridged through JJ's diff-editor selection flow.
- [x] Implement uncommit to working copy. Selected committed file uncommit and selected committed hunk uncommit are bridged through JJ squash into `@`.
- [x] Implement restore and discard for selected changes. Working-copy file and working-copy hunk restore/discard are bridged; committed hunk discard/restore is bridged for selected hunks through a temporary JJ change that is abandoned after hunk selection.
- [x] Map JJ operation history to neutral undo and redo where available.
- [x] Surface JJ conflicts as neutral workspace conflicts.
- [x] Keep all JJ-specific mechanics behind the engine boundary.

### STOP: Verify JJ Engine

- [x] Run focused JJ engine unit tests.
- [x] Run existing JJ read/preview/apply tests.
- [x] Verify a JJ fixture can apply and unapply stacks.
- [x] Verify selected files and hunks can move across commits.
- [x] Verify commit edits preserve unrelated working-copy changes.
- [x] Verify conflicts surface in neutral state.
- [x] Record verification notes before continuing.

Verification notes:

- 2026-06-13: Added `src/vcs/jj/workspace.ts` as the provider-specific JJ neutral workspace adapter.
- 2026-06-13: `loadJjWorkspaceState` maps existing JJ stacks, changes, bookmarks, unassigned changes, and metadata into neutral workspace state.
- 2026-06-13: Neutral JJ preview/apply now bridges supported existing JJ operations: `reword_commit`, working-copy path `amend_commit`, `squash_commits`, working-copy path `restore_changes`, `undo`, and `redo`.
- 2026-06-13: Unsupported neutral JJ operations return disabled preview/apply results without attempting repository mutation.
- 2026-06-13: Remaining JJ work: apply/unapply stacks, split, move commit, move changes, hunk movement, uncommit, discard semantics, and conflict mapping.
- 2026-06-14: Added `tests/vcs-jj-workspace.test.ts` covering neutral JJ state mapping, neutral reword preview translation, and unsupported operation gating.
- 2026-06-14: Neutral JJ commit mapping now preserves parent change ids from the full JJ state read.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed after `pnpm run build:cli`.
- 2026-06-14: Added JJ workspace tests for multiple applied stacks and hunk-selection ownership gating.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-jj-workspace.test.js` passed with 8 JJ workspace tests.
- 2026-06-14: `node --test dist/tests/vcs-jj-*.test.js` passed with 66 compiled JJ backend tests across read, state, preview, apply, diff, operations, workspace, and stack submit coverage.
- 2026-06-14: Added fixture-backed Workspace commit-message editing coverage through neutral `reword_commit`; the same full E2E run kept the existing README working-copy change available for later drag/drop tests after the commit edit.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "commit message edit"` passed.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e` passed with 12 fixture-backed tests after adding commit-edit coverage.
- 2026-06-14: JJ Workspace state now surfaces `conflicts()` as neutral conflict records, sets `mode: "conflicted"`, and marks `workingCopy.hasConflicts`.
- 2026-06-14: Added focused JJ workspace test coverage for neutral conflict surfacing.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-cross-provider-capabilities.test.js` passed with 10 backend tests after JJ conflict mapping.
- 2026-06-14: `node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 27 backend workspace tests after JJ conflict mapping.
- 2026-06-14: Neutral JJ `discard_changes` for selected working-copy files now bridges to the existing JJ `restore_file` preview/apply path.
- 2026-06-14: Verified in a disposable JJ repository that `jj squash --from <source> --into @ <path>` moves a selected committed file into the current working-copy revision.
- 2026-06-14: Neutral JJ `uncommit_changes` for selected committed files now bridges to path-qualified `jj squash --from <source> --into @ <paths>`.
- 2026-06-14: Added focused JJ workspace preview/apply coverage for selected committed file uncommit.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-jj-preview.test.js dist/tests/vcs-jj-apply.test.js` passed with 47 JJ backend preview/apply/workspace tests.
- 2026-06-14: `node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 33 backend workspace/capability tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 49 tests after selected committed file uncommit support.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after selected committed file uncommit support.
- 2026-06-14: Added focused JJ workspace preview coverage for working-copy file discard.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-jj-workspace.test.js` passed with 10 JJ workspace tests after discard bridging.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 35 tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed.
- 2026-06-14: `pnpm run build:cli` passed.
- 2026-06-14: Neutral JJ `move_changes` for selected committed files now bridges to path-qualified `jj squash --from <source> --into <target> <paths>`.
- 2026-06-14: Added focused JJ workspace preview/apply coverage for committed file movement and updated cross-provider capability expectations so Git still rejects file movement before provider commands.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-cross-provider-capabilities.test.js` passed with 14 backend workspace/capability tests after JJ file movement bridging.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 47 tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed.
- 2026-06-14: `node --test dist/tests/vcs-jj-preview.test.js dist/tests/vcs-jj-apply.test.js dist/tests/vcs-git-workspace.test.js` passed with 50 backend preview/apply/Git workspace tests.
- 2026-06-14: Neutral JJ `move_commit` now bridges to the existing JJ reorder flow and applies through `jj rebase -s <source> -d <target>`.
- 2026-06-14: Added focused JJ workspace preview/apply coverage for neutral commit movement through JJ rebase.
- 2026-06-14: `pnpm run build:cli` passed after JJ move-commit support.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after JJ move-commit support.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after JJ move-commit support.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-cross-provider-capabilities.test.js` passed with 18 focused JJ/capability tests after JJ move-commit support.
- 2026-06-14: Added JJ `split_change` preview/apply support through non-interactive `jj split -r <change> -m <message> -- <paths>`.
- 2026-06-14: Neutral JJ `split_commit` now supports selected committed files from the source commit; hunk-level split remains blocked by the hunk ownership gate.
- 2026-06-14: Added focused JJ apply and workspace preview/apply coverage for selected-file commit split.
- 2026-06-14: `pnpm run build:cli` passed after JJ selected-file split support.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after JJ selected-file split support.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after JJ selected-file split support.
- 2026-06-14: `node --test dist/tests/vcs-jj-preview.test.js dist/tests/vcs-jj-apply.test.js dist/tests/vcs-jj-workspace.test.js` passed with 52 JJ preview/apply/workspace tests after selected-file split support.
- 2026-06-14: `node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 42 backend workspace/capability tests after selected-file split support.
- 2026-06-14: Neutral JJ working-copy hunk restore/discard now matches selected hunks against `jj diff --git --color=never` and applies the selected reverse patch with `git apply --reverse --whitespace=nowarn -`.
- 2026-06-14: JJ now advertises `supportsHunkRestoreDiscard` while keeping broad `supportsHunkSelection` disabled; committed hunk movement, committed hunk uncommit, and hunk-level split were enabled later through a narrower committed-hunk capability.
- 2026-06-14: Added focused JJ workspace/capability tests for working-copy hunk restore preview and reverse-patch apply.
- 2026-06-14: Added disposable JJ repository coverage proving selected working-copy hunk restore reverts only the selected hunk and preserves a separate hunk in the same file.
- 2026-06-14: `pnpm run build:cli` passed after JJ working-copy hunk restore/discard support.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after JJ working-copy hunk restore/discard support.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after JJ working-copy hunk restore/discard support.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-cross-provider-capabilities.test.js` passed with 22 focused JJ/capability tests after JJ working-copy hunk restore/discard support.
- 2026-06-14: `node --test dist/tests/vcs-jj-preview.test.js dist/tests/vcs-jj-apply.test.js dist/tests/vcs-jj-workspace.test.js` passed with 54 JJ preview/apply/workspace tests after JJ working-copy hunk restore/discard support.
- 2026-06-14: `node --test --test-name-pattern "workspace hunk restore" dist/tests/vcs-jj-integration.test.js` passed for the real disposable JJ repository hunk restore path.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 49 tests after JJ working-copy hunk restore/discard support.
- 2026-06-14: `git diff --check` passed after JJ working-copy hunk restore/discard support.
- 2026-06-14: Added neutral `supportsCommittedHunkSelection` capability so JJ can enable committed hunk split/move/uncommit without enabling broad hunk selection or Git committed-hunk operations.
- 2026-06-14: Neutral JJ committed-hunk split, move, and uncommit now build selected patches from `jj diff --git --color=never -r <source>` and run `jj split` or `jj squash --interactive` with a temporary provider-local diff editor that selects only those hunks.
- 2026-06-14: Added focused JJ workspace tests for committed-hunk move, uncommit, and split through the diff-editor patch flow.
- 2026-06-14: Added VCS contract and drag/drop validation coverage proving committed hunk movement is enabled only with `supportsCommittedHunkSelection`.
- 2026-06-14: Added disposable JJ repository coverage proving committed-hunk move transfers only the selected hunk and leaves another hunk in the source change.
- 2026-06-14: `pnpm run build:cli` passed after JJ committed-hunk split/move/uncommit support.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after adding the committed-hunk capability.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after adding the committed-hunk capability to the runtime schema.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 50 tests after committed-hunk capability validation.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-cross-provider-capabilities.test.js` passed with 26 focused JJ/capability tests after committed-hunk support.
- 2026-06-14: `node --test dist/tests/vcs-jj-preview.test.js dist/tests/vcs-jj-apply.test.js dist/tests/vcs-jj-workspace.test.js` passed with 58 JJ preview/apply/workspace tests after committed-hunk support.
- 2026-06-14: `node --test --test-name-pattern "committed hunk move" dist/tests/vcs-jj-integration.test.js` passed for the real disposable JJ repository committed-hunk move path.
- 2026-06-14: `git diff --check` passed after committed-hunk support.
- 2026-06-14: Neutral JJ committed-hunk discard/restore now resolves the source parent, creates a temporary sibling change, uses the same selected-patch diff-editor flow to squash only chosen hunks into that temporary change, and abandons it to remove those hunks from the source change.
- 2026-06-14: Added focused JJ workspace preview/apply coverage for committed-hunk discard, including parent lookup, temporary change creation, interactive squash, and exactly one temporary `jj abandon`.
- 2026-06-14: Added VCS contract coverage proving committed-hunk restore/discard is gated by `supportsCommittedHunkSelection`, not by working-copy hunk restore/discard capability.
- 2026-06-14: Added disposable JJ repository coverage proving committed-hunk discard removes only the selected hunk and leaves another hunk in the source change.
- 2026-06-14: `pnpm run build:cli` passed after JJ committed-hunk discard/restore support.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js` passed with 26 JJ workspace tests after committed-hunk discard/restore support.
- 2026-06-14: `node --test --test-name-pattern "committed hunk discard" dist/tests/vcs-jj-integration.test.js` passed for the real disposable JJ repository committed-hunk discard path.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 50 tests after committed-hunk discard/restore capability coverage.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after committed-hunk discard/restore support.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-jj-preview.test.js dist/tests/vcs-jj-apply.test.js` passed with 60 JJ backend preview/apply/workspace tests after committed-hunk discard/restore support.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after committed-hunk discard/restore support.
- 2026-06-14: `git diff --check` passed after committed-hunk discard/restore support.
- 2026-06-14: Neutral JJ `apply_stack` and `unapply_stack` now resolve stack heads and rebase the working-copy change `@` onto the adjusted parent set, preserving the working-copy change id while adding or removing applied stack content from the workspace merge.
- 2026-06-14: Stack membership previews are no longer classified as immediate low-risk operations because they now perform repository parent rewrites through JJ.
- 2026-06-14: Added focused JJ workspace preview/apply coverage for stack application and removal through `jj rebase -r @ -o ...`.
- 2026-06-14: Added disposable JJ repository coverage proving stack apply/unapply adds and removes stack file content while preserving local WIP and the working-copy change id.
- 2026-06-14: Updated fixture E2E stack application/removal to confirm the Workspace Operation preview dialog before applying.
- 2026-06-14: `pnpm run build:cli` passed after JJ stack parent-rebase support.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js` passed with 27 JJ workspace tests after JJ stack parent-rebase support.
- 2026-06-14: `node --test --test-name-pattern "workspace stack membership" dist/tests/vcs-jj-integration.test.js` passed for the real disposable JJ repository stack apply/unapply path.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 50 tests after stack membership preview-policy changes.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after stack membership preview-policy changes.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-jj-preview.test.js dist/tests/vcs-jj-apply.test.js` passed with 61 JJ backend preview/apply/workspace tests after stack parent-rebase support.
- 2026-06-14: `node --test --test-name-pattern "workspace stack membership|committed hunk discard" dist/tests/vcs-jj-integration.test.js` passed for the real disposable JJ repository stack membership and hunk discard paths.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after stack membership preview-policy changes.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "Workspace applies and unapplies"` passed after preview-confirmed JJ stack membership.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e` passed with 16 fixture-backed tests after preview-confirmed JJ stack membership.
- 2026-06-13: `pnpm --filter @changeyard/vcs run typecheck` passed.
- 2026-06-13: `pnpm --filter @changeyard/vcs run test` passed with 35 tests.
- 2026-06-13: `pnpm --filter @changeyard/kanban run typecheck` passed.
- 2026-06-13: `pnpm run build:cli` passed after simplifying the non-JJ fallback provider path.

## Milestone 4: Git Workspace Engine Shared Subset

Status: partially implemented

- [x] Implement a Git `VcsWorkspaceEngine`.
- [x] Map Git branches and linear branch ranges to neutral stacks.
- [x] Set `supportsMultiAppliedWorkspace` to false for the first Git release.
- [x] Set `supportsSyntheticWorkspaceMerge` to false until implemented safely.
- [x] Implement single-stack `apply_stack` as safe checkout of a local branch.
- [x] Implement `unapply_stack` as safe checkout of the configured target/base branch.
- [ ] Implement commit reword and amend for supported linear local branch stacks. Current branch HEAD reword and selected-path amend are implemented and capability-advertised; non-HEAD branch rewrite remains open.
- [x] Implement selected file movement through patch/index operations. Current branch HEAD-to-direct-parent selected-file movement is implemented with a recovery ref; broader non-HEAD branch rebuilds remain open under the rewrite-flow tasks.
- [ ] Implement uncommit to working copy for supported selections. Current branch HEAD selected-path uncommit is implemented; non-HEAD uncommit remains open.
- [x] Implement restore and discard for selected working-copy changes. Tracked working-copy paths, untracked-file discard, and unstaged working-copy hunk restore/discard are implemented; untracked restore remains intentionally unsupported.
- [x] Add recovery refs or recovery instructions for rewrite failures.
- [x] Keep all Git-specific mechanics behind the engine boundary.

### STOP: Verify Git Engine

- [x] Run focused Git engine unit tests.
- [x] Verify normal Git repositories load neutral workspace state.
- [x] Verify unsupported Git actions are disabled before mutation requests.
- [x] Verify commit edits work on a linear local branch. Verified for current branch HEAD reword in a real normal Git fixture.
- [x] Verify selected file changes can move or uncommit in the supported subset. Verified current branch HEAD selected-path uncommit in a real normal Git fixture.
- [x] Verify failed rewrites leave a recoverable state.
- [x] Record verification notes before continuing.

Verification notes:

- 2026-06-14: Added `src/vcs/git/workspace.ts` as the provider-specific Git neutral workspace adapter.
- 2026-06-14: `loadGitWorkspaceState` maps local branches, linear branch ranges, current branch, HEAD, and working-copy status into neutral workspace state.
- 2026-06-14: `loadGitWorkspaceDiff` maps Git working-copy patch and name-status output into neutral diff state.
- 2026-06-14: Git capabilities intentionally disable multi-applied workspaces, synthetic workspace merge, broad hunk selection, move-commit, undo/redo, and selected working-copy commit until safe mutation flows land; commit rewrite, selected-file movement, and hunk restore/discard were enabled later for supported subsets.
- 2026-06-14: Added `tests/vcs-git-workspace.test.ts` covering neutral Git branch stack mapping and diff mapping.
- 2026-06-14: Remaining Git work: non-HEAD reword/amend, selected file movement, non-HEAD uncommit, and broader safe rewrite flows.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed after `pnpm run build:cli`.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 35 tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed.
- 2026-06-14: Added provider-neutral backend operation types in `src/vcs/workspace-types.ts` so Git and JJ engines no longer share request types through the JJ module.
- 2026-06-14: Added Git `previewGitWorkspaceOperation` and `applyGitWorkspaceOperation` for clean-worktree `apply_stack` and `unapply_stack` via safe `git switch`.
- 2026-06-14: Git `apply_stack` now requires a local branch; Git `unapply_stack` resolves `origin/main`-style target refs back to an available local branch such as `main`.
- 2026-06-14: Git stack checkout operations return normalized unsupported results with recovery instructions when the worktree is dirty, the target branch is missing, or `git switch` fails.
- 2026-06-14: Added focused Git provider tests for dirty-worktree preview blocking, clean apply checkout, and unapply checkout to the local target branch.
- 2026-06-14: Added Git `restore_changes` and `discard_changes` support for selected tracked working-copy paths through `git restore --staged --worktree -- <paths>`.
- 2026-06-14: Git restore/discard preview refuses non-working-copy selections, empty selections, and untracked-file restore; hunk-level restore/discard support was added later for unstaged working-copy hunks.
- 2026-06-14: Added focused Git provider tests for tracked path restore and untracked-file discard blocking.
- 2026-06-14: `pnpm run build:cli` passed after Git operation wiring.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 9 tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after UI capability-gating adjustments.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 35 tests.
- 2026-06-14: `pnpm run build:cli` passed after Git restore/discard support.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 11 tests.
- 2026-06-14: Fixed the deterministic Git fixture config to use the existing `git-worktree` VCS engine id while still exercising normal Git provider detection.
- 2026-06-14: Added fixture-backed Playwright coverage that opens a normal Git repository in Workspace and verifies unsupported commit-edit controls are disabled before any mutation request can be sent.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "normal Git"` passed.
- 2026-06-14: Git provider mechanics remain isolated in `src/vcs/git/workspace.ts`; UI and RTK paths call only neutral workspace operations.
- 2026-06-14: `node --test dist/tests/vcs-git-workspace.test.js` coverage is included in the 19-test backend workspace command recorded under Milestone 8.
- 2026-06-14: Added Git HEAD-only `reword_commit` and selected working-copy path `amend_commit` support behind the Git provider boundary; non-HEAD safe branch rewrites remain open.
- 2026-06-14: Git hunk selections for rewrite/move operations are rejected before provider command execution even though file-level HEAD amend is now supported.
- 2026-06-14: Added focused Git provider tests for HEAD reword preview/apply, selected-path HEAD amend, and non-HEAD edit blocking.
- 2026-06-14: Extended the real normal Git fixture test to reword the current branch HEAD and reload neutral state with the updated title.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-git-workspace.test.js` passed with 14 Git workspace tests.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 23 backend workspace tests.
- 2026-06-14: Added Git reword failure coverage asserting failed `git commit --amend` returns a normalized failed operation with recovery instructions.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-git-workspace.test.js` passed with 15 Git workspace tests.
- 2026-06-14: `node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 24 backend workspace tests.
- 2026-06-14: Added Git untracked-file discard support through `git clean -f -- <paths>` while keeping untracked restore and hunk-level restore/discard blocked.
- 2026-06-14: Added focused Git provider tests for untracked restore rejection and untracked discard apply.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-git-workspace.test.js` passed with 16 Git workspace tests.
- 2026-06-14: `node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 25 backend workspace tests.
- 2026-06-14: Added Git HEAD selected-path `uncommit_changes` support using a clean-worktree soft reset, unstaging selected paths back to the working copy, and recommitting remaining staged changes when needed.
- 2026-06-14: Added mock and real normal Git fixture coverage for selected-path uncommit from the current branch HEAD.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-git-workspace.test.js` passed with 17 Git workspace tests.
- 2026-06-14: `node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 26 backend workspace tests.
- 2026-06-14: Added neutral `supportsHunkRestoreDiscard` capability so providers can allow working-copy hunk restore/discard without enabling hunk movement or hunk commit rewrites.
- 2026-06-14: Extended backend hunk selections to preserve diff coordinates through the runtime/engine boundary.
- 2026-06-14: Added Git unstaged working-copy hunk restore/discard support by matching selected hunk coordinates against `git diff --patch` output and applying the selected patch in reverse.
- 2026-06-14: Extended the VCS command runner with optional stdin so provider engines can pass generated patches to commands without temporary patch files.
- 2026-06-14: Added focused Git provider tests for working-copy hunk restore preview and reverse-patch discard apply.
- 2026-06-14: Added real disposable Git repository coverage proving hunk discard restores only the selected working-copy hunk while preserving a separate hunk in the same file.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after Git hunk restore/discard support.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after adding `supportsHunkRestoreDiscard` to the runtime VCS schema.
- 2026-06-14: `pnpm run build:cli` passed after Git hunk restore/discard support.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 49 tests after hunk capability validation.
- 2026-06-14: `node --test dist/tests/vcs-git-workspace.test.js dist/tests/vcs-cross-provider-capabilities.test.js` passed with 21 backend Git/capability tests after Git hunk restore/discard support.
- 2026-06-14: `node --test dist/tests/vcs-git-workspace.test.js` passed with 20 Git workspace tests after adding real hunk discard coverage.
- 2026-06-14: Git `move_changes` now supports moving selected file paths from the current branch HEAD commit into its direct parent on a clean worktree.
- 2026-06-14: Git selected-file movement creates `refs/changeyard/recovery/<head>` before rewriting, soft-resets the source commit, amends the target with selected paths, and recommits remaining source paths.
- 2026-06-14: Added focused Git preview/apply coverage for selected HEAD-to-parent file movement and updated cross-provider coverage so unsupported Git moves can run read-only validation but no mutation commands.
- 2026-06-14: `pnpm run build:cli` passed after Git selected-file movement support.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after Git selected-file movement support.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after Git selected-file movement support.
- 2026-06-14: `node --test dist/tests/vcs-git-workspace.test.js dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js` passed with 40 backend workspace/capability tests after Git selected-file movement support.

## Milestone 5: Workspace And Branches UI Migration

Status: verified

- [x] Convert Workspace reads to `getVcsWorkspaceState`.
- [x] Convert Branches apply/unapply actions to neutral operations.
- [x] Keep existing column layout, collapse behavior, resize behavior, URL params, and right-side diff placement.
- [x] Replace UI references to JJ-specific mutation concepts with neutral labels and state.
- [x] Show provider metadata only as display metadata. Branches labels provider-specific change ids as provider IDs; legacy provider field names remain internal compatibility aliases.
- [x] Disable unsupported actions based on `state.capabilities`.
- [x] Keep existing JJ UI behavior working while Git support is added.

### STOP: Verify UI Migration

- [x] Run VCS unit tests.
- [x] Run VCS typecheck.
- [x] Open Workspace for a JJ repository.
- [x] Open Workspace for a normal Git repository.
- [x] Verify Branches can apply and unapply through neutral operations.
- [x] Verify unsupported provider actions show disabled states rather than failing after click.
- [x] Record verification notes before continuing.

Verification notes:

- 2026-06-14: `App.tsx` now uses `useGetVcsWorkspaceStateQuery` and `useGetVcsDiffQuery` for the Workspace view instead of `useGetJjStateQuery` and `useGetJjDiffQuery`.
- 2026-06-14: `JjBoardView` now accepts neutral `VcsWorkspaceState` and `VcsDiffResult`, adapting neutral stacks into the existing lane/card row model to preserve layout and selection behavior.
- 2026-06-14: Branches apply/unapply and Workspace lane removal now call `applyVcsOperation` with `apply_stack`/`unapply_stack` before updating persisted `vcsAppliedStacks`.
- 2026-06-14: JJ neutral provider treats `apply_stack` and `unapply_stack` as low-risk app-level Workspace membership operations with no repository mutation.
- 2026-06-14: Remaining UI migration work: Branches inventory still uses JJ-specific data and provider metadata labeling needs cleanup.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 35 tests.
- 2026-06-14: `pnpm run build:cli` passed.
- 2026-06-14: `node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 6 tests.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed.
- 2026-06-14: Added neutral workspace capability gating to Branches apply/unapply controls.
- 2026-06-14: Adjusted stack membership gating so `supportsMultiAppliedWorkspace: false` means one stack at a time rather than no stack checkout support.
- 2026-06-14: Browser smoke on fresh VCS dev server at `http://127.0.0.1:4375/vcs/` loaded neutral Workspace state for the `changeyard` JJ repository.
- 2026-06-14: Browser smoke on `vcs-jj-fixture` applied `feature/cloud-observability` from Branches through `applyVcsOperation`, then removed it from Workspace through `unapply_stack`.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after capability gating changes.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 35 tests after capability gating changes.
- 2026-06-14: Added a normal Git fixture Playwright test that opens Workspace and verifies commit rewrite controls render disabled from provider capabilities.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "normal Git"` passed.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e` passed with 13 fixture-backed tests.
- 2026-06-14: Renamed the exported Workspace view component away from `JjBoardView` and changed the neutral Workspace commit id copy label from `Change` to `Commit`; Branches inventory remains JJ-specific pending the broader Branches migration.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after Workspace naming cleanup.
- 2026-06-14: Normal Git now advertises `supportsCommitRewrite` for its current-HEAD rewrite subset; Workspace keeps Git edit controls disabled for non-current commits.
- 2026-06-14: Fixed Git porcelain status path parsing so modified paths such as `M README.md` do not lose their first character in neutral working-copy state.
- 2026-06-14: Extended the JJ fixture E2E stack test to apply `feature/export-json`, open its changed-file diff, unapply the stack from Workspace, and verify the empty Workspace state returns.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "applies and unapplies"` passed.
- 2026-06-14: Neutralized visible Branches copy from JJ/bookmark/change wording to refs, commits, stacks, and provider IDs while preserving provider identifiers as copyable metadata.
- 2026-06-14: Normal Git Branches data now projects from neutral Git workspace state through the backend adapter so the Branches screen renders Git branches and stack details instead of empty JJ-only inventory.
- 2026-06-14: Branches applied-stack state now falls back to provider-reported `appliedStackIds` when no project config override exists, matching Workspace behavior for normal Git.
- 2026-06-14: Extended normal Git fixture E2E to open Branches, select `feature/export-json`, verify commit rows, and verify the current branch shows `Unapply from workspace`.
- 2026-06-14: `pnpm run build:cli` passed after adding the Git Branches projection.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after Branches label and applied-state cleanup.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "normal Git"` passed with Workspace and Branches normal Git coverage.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 49 tests after Git Branches projection and label cleanup.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-git-workspace.test.js dist/tests/vcs-cross-provider-capabilities.test.js` passed with 19 backend Git/capability tests after Git Branches projection.
- 2026-06-14: `git diff --check` passed after Git Branches projection and label cleanup.
- 2026-06-14: Fixed the VCS console Stop button so it stays disabled after a shell session stops, unblocking the full fixture E2E run.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "Console opens"` passed after the console stop-state fix.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e` passed with 16 fixture-backed JJ and Git tests after Git Branches projection and console stop-state fix.
- 2026-06-14: Added neutral `vcs.branchesData`, `getVcsBranchesData`, `useGetVcsBranchesDataQuery`, and `VcsBranchesDataResponse` aliases while retaining the old JJ-named route/hook for compatibility.
- 2026-06-14: Branches now reads through the neutral VCS Branches data hook instead of `useGetJjBranchesDataQuery`.
- 2026-06-14: `pnpm run build:cli` passed after adding the neutral Branches data backend path.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after adding `vcs.branchesData` to the runtime router.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after switching Branches to the neutral hook/type.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "Branches"` passed with JJ and normal Git Branches coverage through the neutral route.
- 2026-06-14: Branches now disables the unsupported `Delete local` control until a provider-neutral local-ref delete operation exists.
- 2026-06-14: Extended normal Git Branches fixture coverage to assert unsupported local delete is visibly disabled.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after Branches unsupported-control gating.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after Branches unsupported-control gating.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "Branches"` passed after Branches unsupported-control gating.

## Milestone 6: Drag/Drop Workspace Operations

Status: partially implemented

- [x] Add a neutral drag payload for stacks, commits, files, folders, and hunks.
- [x] Add drop target capability checks before preview/apply in the neutral operation model.
- [x] Dropping a stack onto Workspace emits `apply_stack`.
- [x] Removing a stack lane emits `unapply_stack`.
- [x] Dropping working-copy files or hunks onto a commit emits `amend_commit`.
- [x] Dropping committed files or hunks onto another commit emits `move_changes`.
- [x] Dropping committed files or hunks onto Working Copy emits `uncommit_changes`.
- [x] Dropping a commit onto a stack emits `move_commit`.
- [x] Dropping selected changes outside existing lanes emits `create_stack` when supported.
- [x] Wire neutral drag/drop payloads into Workspace and Branches DOM handlers.
- [x] Preserve selected file and right-side diff state after successful drag/drop operations where possible.

### STOP: Verify Drag/Drop Operations

- [x] Run drag/drop unit tests.
- [x] Run VCS E2E tests for Workspace drag/drop.
- [x] Verify invalid drop targets are visibly disabled.
- [x] Verify valid drop targets preview the correct neutral operation.
- [x] Verify JJ drag/drop covers file and hunk movement. Working-copy file-to-commit, committed file-to-commit, committed file-to-working-copy, and committed hunk-to-commit drag previews are covered.
- [x] Verify Git drag/drop covers the supported shared subset. Normal Git fixture coverage covers stack checkout/unapply preview and working-copy file-to-current-HEAD amend preview.
- [x] Record verification notes before continuing.

Verification notes:

- 2026-06-14: Added `packages/vcs/src/vcs-workspace-dnd.ts` with neutral drag payloads, MIME type, parsing, and drop-to-operation construction.
- 2026-06-14: Added `packages/vcs/src/vcs-workspace-dnd.test.ts` covering stack-to-workspace `apply_stack`, commit-to-stack `move_commit`, working-copy file-to-commit `amend_commit`, committed hunk-to-commit `move_changes`, and committed hunk-to-working-copy `uncommit_changes`.
- 2026-06-14: Added `createValidatedVcsWorkspaceOperationFromDrop` so drop targets can reject unsupported provider operations through `validateVcsWorkspaceOperation` before preview/apply.
- 2026-06-14: Existing Workspace lane removal was already routed through neutral `unapply_stack` in Milestone 5.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 40 tests after adding the neutral drag/drop model.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after adding the neutral drag/drop model.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 41 tests after adding capability-aware drop validation.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after adding capability-aware drop validation.
- 2026-06-14: Wired `VcsInlineFileSection`, Workspace working-copy rows, Workspace stack commit cards, and Branches stack rows to serialize neutral drag payloads.
- 2026-06-14: Workspace drop targets now preview neutral operations through `previewVcsOperation`; confirmed working-copy file-to-commit drag opens the Workspace Operation dialog with backend preview content.
- 2026-06-14: Fixed browser drag behavior by using MIME-type checks during `dragover` and stopping drop propagation so parent drop targets do not add stale invalid-drop errors.
- 2026-06-14: Branches rows now expose draggable stack payloads for local applicable stacks. Cross-route stack dragging still needs product-level UX coverage because Branches and Workspace are separate screens.
- 2026-06-14: Playwright smoke on a disposable JJ fixture applied `feature/export-json`, dragged `README.md` onto a Workspace commit, and verified the neutral preview dialog rendered the backend preview result.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after DOM drag/drop wiring.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 41 tests after DOM drag/drop wiring.
- 2026-06-14: Added fixture-backed Playwright coverage for working-copy file drag/drop preview from Workspace into a commit card.
- 2026-06-14: Added stable Workspace drag/drop selectors: `vcs-working-copy-file-row`, `vcs-working-copy-directory-row`, and `vcs-workspace-commit-card`.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "Workspace drag and drop previews"` passed.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e` passed with 9 fixture-backed tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after adding E2E selectors and coverage.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 41 tests after adding E2E selectors and coverage.
- 2026-06-14: Added neutral drop-target feedback via `describeVcsWorkspaceDropTarget` so valid/invalid visuals use the same provider capability checks as drop execution.
- 2026-06-14: Workspace drop targets now expose `data-drop-target-state` and render valid/invalid focus rings while local neutral drags are active.
- 2026-06-14: Added fixture-backed Playwright coverage that drags a working-copy file over the Working Copy target and verifies the invalid target state.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after invalid drop-target visual state.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 42 tests after invalid drop-target visual state.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "Workspace .*drag|invalid drop"` passed with 2 tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e` passed with 10 fixture-backed tests.
- 2026-06-14: Added `parsePatchToHunks` so diff rendering can expose stable hunk metadata without changing existing row rendering.
- 2026-06-14: Workspace diff hunks now render draggable neutral hunk payloads from working-copy and committed-file diff panes.
- 2026-06-14: Added fixture-backed Playwright coverage that initially dragged a working-copy hunk onto a commit and verified the provider capability gate marked the target invalid without opening a preview dialog; later replaced with enabled committed-hunk movement coverage after JJ committed-hunk support landed.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after hunk drag-source wiring.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 43 tests after hunk diff parser coverage.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "Workspace .*drag|invalid drop|hunk drag"` passed with 3 tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e` passed with 11 fixture-backed tests.
- 2026-06-14: Fixed nested Workspace drag starts so committed file drags stop propagation before ancestor commit cards can overwrite the drag payload.
- 2026-06-14: Added fixture-backed Playwright coverage that drags committed `Cargo.toml` from `add serde task serialization` onto `add json report mode` and verifies the neutral `move_changes` preview.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "committed file-to-commit"` passed.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "Workspace (drag|hunk|visibly marks invalid drop)"` passed with 4 drag-focused tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after committed-file drag/drop coverage.
- 2026-06-14: `git diff --check` passed.
- 2026-06-14: Added normal Git fixture coverage that writes a README working-copy change, drags it onto the current HEAD commit, and verifies the neutral Git amend preview.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "normal Git"` passed after Git drag/drop coverage.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-git-workspace.test.js dist/tests/vcs-jj-workspace.test.js` passed with 31 backend workspace/capability tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 47 tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after Git drag/drop coverage.
- 2026-06-14: Added neutral `supportsCreateStack` capability gating and defaulted current JJ/Git/unsupported providers to disabled until provider stack creation is implemented.
- 2026-06-14: Workspace drag/drop operation construction now emits `create_stack` for selected file/folder/hunk payloads dropped on the Workspace area; provider validation blocks it unless `supportsCreateStack` is true.
- 2026-06-14: Added unit coverage for stack-creation capability validation, selected-change-to-Workspace `create_stack` emission, and valid feedback when a provider advertises stack creation.
- 2026-06-14: Added cross-provider backend coverage proving current JJ and Git reject neutral `create_stack` previews before provider commands.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 49 tests after create-stack drop modeling.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after create-stack drop modeling.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-git-workspace.test.js dist/tests/vcs-jj-workspace.test.js` passed with 31 backend workspace/capability tests.
- 2026-06-14: `pnpm --filter @changeyard/kanban run typecheck` passed after adding `supportsCreateStack` to the runtime VCS schema.
- 2026-06-14: Added fixture-backed Playwright coverage for committed file-to-working-copy drag/drop preview through neutral `uncommit_changes`.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "committed file-to-working-copy"` passed.
- 2026-06-14: Workspace apply now keeps the right-side diff focused on the moved path after supported `amend_commit`, `move_changes`, and `uncommit_changes` drag/drop operations.
- 2026-06-14: Git apply results now report rewritten commit ids after amend/reword so post-apply UI focus can target the refreshed commit instead of the stale pre-rewrite hash.
- 2026-06-14: Extended normal Git fixture E2E to apply a working-copy file drag into the current HEAD commit and verify the README diff remains selected after apply.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after post-apply diff preservation.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-git-workspace.test.js` passed with 17 Git workspace tests after rewritten affected commit ids.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "normal Git"` passed after post-apply diff preservation coverage.
- 2026-06-14: Extended the deterministic JJ fixture so `add serde task serialization` modifies `src/tasks.rs`, giving committed hunk drag/drop E2E a stable modified-file hunk rather than an added-file-only diff.
- 2026-06-14: Fixed committed hunk drag payloads to send the neutral change id instead of the display commit hash while preserving commit-hash based diff loading.
- 2026-06-14: Replaced the stale unsupported hunk drag E2E with fixture-backed coverage that drags a committed `src/tasks.rs` hunk onto `add json report mode` and verifies the enabled neutral `move_changes` preview.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after committed-hunk drag/drop E2E coverage.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "committed hunk-to-commit"` passed after committed-hunk drag/drop E2E coverage.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "Workspace (drag|hunk|visibly marks invalid drop)"` passed with 5 drag-focused tests after committed-hunk drag/drop E2E coverage.
- 2026-06-14: `git diff --check` passed after committed-hunk drag/drop E2E coverage.

## Milestone 7: Preview, Apply, Invalidation, And Recovery

Status: verified

- [x] Ensure every mutation-capable UI path calls `previewVcsOperation` before risky changes.
- [x] Define low-risk operations that may apply immediately after validation.
- [x] Return affected stacks, commits, files, conflicts, and warnings from previews.
- [x] Return recovery data or recovery instructions from failed apply operations.
- [x] Invalidate Workspace, Branches, Diff, Worktree, and Commit RTK tags after apply.
- [x] Integrate watcher/runtime events with neutral workspace cache invalidation.
- [x] Preserve stale-reference handling in the data layer.

### STOP: Verify Preview And Apply

- [x] Run preview/apply unit tests for both providers.
- [x] Verify previews do not mutate repository state.
- [x] Verify apply invalidates active Workspace and Branches views.
- [x] Verify provider errors are normalized.
- [x] Verify failed Git rewrites and JJ conflicts are recoverable or clearly surfaced.
- [x] Record verification notes before continuing.

Verification notes:

- 2026-06-14: Workspace drag/drop operations now open a provider-neutral preview dialog before apply.
- 2026-06-14: The preview dialog displays risk, summary, disabled reason, affected stacks, commits, paths, warnings, and apply errors.
- 2026-06-14: Applying a previewed `apply_stack` or `unapply_stack` updates persisted `vcsAppliedStacks` after the neutral apply succeeds.
- 2026-06-14: Broader mutation preview coverage, normalized recovery display, and full invalidation verification remain open.
- 2026-06-14: Added `VCS_WORKSPACE_OPERATION_INVALIDATION_TAGS` and wired neutral operation apply invalidation through that shared tag set.
- 2026-06-14: Added a unit test asserting neutral operation apply invalidates Workspace stack/detail tags, Branches listing/detail tags, worktree/diff/commit tags, head/base/divergence tags, and operation/repository history tags.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after explicit invalidation tagging.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 44 tests after invalidation coverage.
- 2026-06-14: Added JJ neutral apply tests for low-risk stack membership operations and unsupported-operation recovery instructions.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 14 backend provider tests.
- 2026-06-14: Added Git neutral apply coverage for failed branch switch recovery instructions.
- 2026-06-14: Verified Git and JJ failed apply paths return normalized operation results with `ok: false`, affected ids/paths arrays, diagnostics, and recovery instructions.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 15 backend provider tests.
- 2026-06-14: Added Git preview coverage that validates a clean branch checkout preview without issuing mutating commands such as `git switch` or `git restore`; JJ membership preview already asserts no commands are run.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 16 backend provider tests.
- 2026-06-14: Strengthened the commit-edit fixture E2E to verify that applying a neutral `reword_commit` refreshes the active Workspace title, removes the old title, and shows the edited title in Branches.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "commit message edit"` passed after Workspace and Branches refresh assertions.
- 2026-06-14: Failed Git `reword_commit` apply now returns recovery instructions; JJ conflict recovery/surfacing still needs implementation and fixture verification.
- 2026-06-14: Added `isLowRiskVcsWorkspaceOperation` so only JJ stack membership operations can apply immediately without preview; Git stack unapply now opens the neutral preview because it switches branches.
- 2026-06-14: Git and JJ unsupported preview/apply responses now preserve affected stack ids, commit ids, and selected paths so blocked operations still carry context for dialogs and cache follow-up.
- 2026-06-14: Added unit coverage for provider-aware low-risk operation classification and provider tests for affected ids on unsupported Git/JJ previews and applies.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 45 tests after preview-policy coverage.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after Workspace lane-removal preview gating.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 26 backend workspace tests.
- 2026-06-14: Extended normal Git fixture E2E to verify lane removal opens a medium-risk Workspace Operation preview instead of immediately switching branches.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "normal Git"` passed.
- 2026-06-14: Exported `tagsForVcsEvent` and added coverage proving worktree, head, activity, and fetch watcher events invalidate the neutral Workspace, Branches, Diff, Commit, detection, and history tag sets.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 46 tests after watcher invalidation coverage.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after exporting the watcher tag mapper.
- 2026-06-14: Added `areVcsWorkspaceOperationsEqual` and guarded Workspace apply so a loaded preview must match the current pending operation before the Apply button enables or mutation runs.
- 2026-06-14: Added unit coverage for stale preview operation detection.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 47 tests after stale-preview coverage.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after stale-preview apply gating.
- 2026-06-14: Added a Branches Workspace Operation preview dialog so Branches stack apply/unapply only runs directly for low-risk JJ membership changes; non-low-risk providers preview before applying.
- 2026-06-14: Audited `applyVcsOperation` call sites: remaining direct calls are guarded by `isLowRiskVcsWorkspaceOperation`, and preview dialog applies validate that the loaded preview matches the pending operation.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after Branches preview gating.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 47 tests after Branches preview gating.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "Workspace applies a stack"` passed after preserving the JJ low-risk Branches apply flow.
- 2026-06-14: JJ Workspace state now reads the `conflicts()` revset and maps conflicted changes into neutral `VcsWorkspaceConflict` records, `mode: "conflicted"`, and `workingCopy.hasConflicts`.
- 2026-06-14: Added focused JJ workspace coverage for neutral conflict surfacing.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-cross-provider-capabilities.test.js` passed with 10 backend tests after JJ conflict mapping.
- 2026-06-14: `node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 27 backend workspace tests after JJ conflict mapping.

## Milestone 8: Cross-Provider Test Coverage

Status: verified

- [x] Extend deterministic fixture generation to cover both JJ and normal Git provider paths.
- [x] Add capability-gated operation tests that run against both providers.
- [x] Add JJ-specific tests for multi-applied workspace behavior and hunk ownership.
- [x] Add Git-specific tests for the supported linear branch subset.
- [x] Add Playwright E2E coverage for Workspace apply/unapply.
- [x] Add Playwright E2E coverage for commit editing.
- [x] Add Playwright E2E coverage for moving selected file changes.
- [x] Add Playwright E2E coverage for disabled unsupported actions.

### STOP: Verify Cross-Provider Tests

- [x] Run fixture generation for JJ.
- [x] Run fixture generation for Git.
- [x] Run `pnpm --filter @changeyard/vcs run test`.
- [x] Run `pnpm --filter @changeyard/vcs run typecheck`.
- [x] Run `pnpm --filter @changeyard/vcs run e2e`.
- [x] Run broader repository tests required by the touched packages.
- [x] Record verification notes before continuing.

Verification notes:

- 2026-06-14: Existing fixture E2E covers Workspace stack apply and changed-file diff navigation.
- 2026-06-14: Added fixture E2E for dragging a working-copy file onto a commit card and verifying the provider-neutral Workspace Operation preview.
- 2026-06-14: Added fixture E2E coverage for invalid Workspace drop-target state during drag.
- 2026-06-14: Added `scripts/create-vcs-git-fixture.ts` and `pnpm run vcs:git-fixture` for deterministic normal Git provider fixtures.
- 2026-06-14: Verified Git fixture generation with `pnpm run vcs:git-fixture -- <tmp>/repo --force --json`.
- 2026-06-14: Fixed VCS detection to trim `jj workspace root` and `git rev-parse --show-toplevel` output before using roots as cwd values.
- 2026-06-14: Added a detect regression assertion for newline-terminated repository roots.
- 2026-06-14: Added real normal Git fixture coverage for neutral Git workspace state, dirty-worktree apply blocking, clean `apply_stack`, and clean `unapply_stack`.
- 2026-06-14: `pnpm run build:cli` passed after adding the Git fixture and detect fix.
- 2026-06-14: `node --test dist/tests/vcs-detect.test.js dist/tests/vcs-git-workspace.test.js` passed with 11 tests.
- 2026-06-14: Added fixture E2E coverage for disabled unsupported hunk drag/drop behavior through the neutral capability gate.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 43 tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 44 tests after RTK invalidation coverage.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e` passed with 11 fixture-backed tests.
- 2026-06-14: `pnpm run build:cli` passed.
- 2026-06-14: `node --test dist/tests/vcs-detect.test.js dist/tests/vcs-git-workspace.test.js` passed with 11 tests.
- 2026-06-14: Added `tests/vcs-cross-provider-capabilities.test.ts` to load mocked JJ and Git neutral workspace states, assert capability flags, and verify hunk amend, move-changes, and selected working-copy commit previews are rejected without provider commands.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-cross-provider-capabilities.test.js` passed.
- 2026-06-14: `node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 17 backend workspace tests.
- 2026-06-14: Added JJ-specific backend tests for multiple applied Workspace stacks and hunk-selection ownership gating that preserves selected hunk paths while blocking unsupported hunk movement before provider commands.
- 2026-06-14: `pnpm run build:cli && node --test dist/tests/vcs-jj-workspace.test.js` passed with 8 JJ workspace tests.
- 2026-06-14: `node --test dist/tests/vcs-cross-provider-capabilities.test.js dist/tests/vcs-jj-workspace.test.js dist/tests/vcs-git-workspace.test.js` passed with 19 backend workspace tests.
- 2026-06-14: Verified JJ fixture generation with `pnpm run vcs:fixture -- <tmp>/repo --force --json`; output included expected cloud-observability, export-json, and query-filtering stacks plus the README working-copy file.
- 2026-06-14: Added Playwright E2E coverage for neutral Workspace commit-message editing through the preview/apply dialog.
- 2026-06-14: `pnpm --filter @changeyard/vcs run typecheck` passed after commit-edit UI wiring.
- 2026-06-14: `pnpm --filter @changeyard/vcs run test` passed with 44 tests after commit-edit UI wiring.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e -- --grep "commit message edit"` passed.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e` passed with 12 fixture-backed tests.
- 2026-06-14: `pnpm --filter @changeyard/vcs run e2e` passed with 13 fixture-backed tests after adding normal Git Workspace coverage.
- 2026-06-14: Added fixture-backed Playwright coverage for committed-file movement preview through neutral Workspace drag/drop.
- 2026-06-14: Extended normal Git fixture E2E to cover working-copy file drag/drop into the current HEAD commit and preview the supported Git amend subset.

## Milestone 9: Manual Verification And Enablement

Status: planned

- [ ] Manually verify Workspace in a JJ repository.
- [ ] Manually verify Branches in a JJ repository.
- [ ] Manually verify Workspace in a normal Git repository.
- [ ] Manually verify Branches in a normal Git repository.
- [ ] Verify apply/unapply stack behavior.
- [ ] Verify commit editing behavior.
- [ ] Verify dragging selected changes across commits and stacks.
- [ ] Verify uncommit to working copy.
- [ ] Verify restore and discard behavior.
- [ ] Verify undo and redo where supported.
- [ ] Verify unsupported provider operations remain disabled with clear status text.
- [ ] Update final verification notes.

### STOP: Final Verification

- [ ] Run final focused VCS tests.
- [ ] Run final VCS E2E tests.
- [ ] Run final VCS typecheck.
- [ ] Confirm no UI path depends on JJ-specific actions for provider-neutral Workspace mutations.
- [ ] Confirm normal Git repositories keep working without JJ installed.
- [ ] Record final outcome.

Verification notes:

- Pending.
