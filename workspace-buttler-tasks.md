# Workspace Buttler Tasks

## Operating Rule

- [x] Work directly on the current branch.
- [x] Do not use the Changeyard workflow.
- [x] Do not use Changeyard lifecycle commands.
- [x] Do not use Changeyard workspaces.
- [x] Keep `workspace-plan.md` and `workspace-tasks.md` untouched for this documentation task.

## Current Status

- [x] Create `workspace-buttler.md`.
- [x] Create `workspace--buttler-tasks.md`.
- [ ] Milestone 1: Neutral VCS Workspace Contracts.
- [ ] Milestone 2: Provider-Neutral RTK Query Endpoints.
- [ ] Milestone 3: JJ Workspace Engine.
- [ ] Milestone 4: Git Workspace Engine Shared Subset.
- [ ] Milestone 5: Workspace And Branches UI Migration.
- [ ] Milestone 6: Drag/Drop Workspace Operations.
- [ ] Milestone 7: Preview, Apply, Invalidation, And Recovery.
- [ ] Milestone 8: Cross-Provider Test Coverage.
- [ ] Milestone 9: Manual Verification And Enablement.

## Milestone 1: Neutral VCS Workspace Contracts

Status: planned

- [ ] Add provider-neutral workspace types in the shared VCS domain layer.
- [ ] Define `VcsWorkspaceState`.
- [ ] Define `VcsWorkspaceOperation`.
- [ ] Define `VcsChangeSelection`.
- [ ] Define provider capability flags.
- [ ] Define provider-neutral preview and apply result types.
- [ ] Add operation validation helpers that check required fields and provider capabilities.
- [ ] Keep JJ-specific concepts out of the public workspace contract.

### STOP: Verify Neutral Contracts

- [ ] Run VCS typecheck.
- [ ] Add focused unit tests for operation validation.
- [ ] Verify no new UI code imports JJ-specific workspace mutation types.
- [ ] Record verification notes before continuing.

Verification notes:

- Pending.

## Milestone 2: Provider-Neutral RTK Query Endpoints

Status: planned

- [ ] Add `getVcsWorkspaceState` to the VCS RTK service layer.
- [ ] Add `getVcsStacks` if stack loading needs to be separate from workspace state.
- [ ] Add `getVcsDiff` for provider-neutral worktree and commit diffs.
- [ ] Add `previewVcsOperation`.
- [ ] Add `applyVcsOperation`.
- [ ] Route the endpoints through provider detection.
- [ ] Keep direct TRPC or runtime fetch helpers contained inside the RTK service layer.
- [ ] Use existing VCS RTK tag vocabulary where possible.
- [ ] Add new tags only if existing tags cannot represent workspace operation invalidation.

### STOP: Verify Neutral RTK Endpoints

- [ ] Run VCS service tests.
- [ ] Run VCS typecheck.
- [ ] Verify active Workspace reads refresh through RTK Query rather than component-owned event subscriptions.
- [ ] Verify existing JJ-specific reads still work during migration.
- [ ] Record verification notes before continuing.

Verification notes:

- Pending.

## Milestone 3: JJ Workspace Engine

Status: planned

- [ ] Implement a JJ `VcsWorkspaceEngine`.
- [ ] Map JJ stacks/bookmarks/changes to neutral stack and commit models.
- [ ] Implement `apply_stack` and `unapply_stack` through JJ workspace merge/WIP internals.
- [ ] Implement commit reword, amend, split, squash, and move operations through JJ-safe rewrite flows.
- [ ] Implement file and hunk movement through JJ patch splitting and hunk ownership behavior.
- [ ] Implement uncommit to working copy.
- [ ] Implement restore and discard for selected changes.
- [ ] Map JJ operation history to neutral undo and redo where available.
- [ ] Surface JJ conflicts as neutral workspace conflicts.
- [ ] Keep all JJ-specific mechanics behind the engine boundary.

### STOP: Verify JJ Engine

- [ ] Run focused JJ engine unit tests.
- [ ] Run existing JJ read/preview/apply tests.
- [ ] Verify a JJ fixture can apply and unapply stacks.
- [ ] Verify selected files and hunks can move across commits.
- [ ] Verify commit edits preserve unrelated working-copy changes.
- [ ] Verify conflicts surface in neutral state.
- [ ] Record verification notes before continuing.

Verification notes:

- Pending.

## Milestone 4: Git Workspace Engine Shared Subset

Status: planned

- [ ] Implement a Git `VcsWorkspaceEngine`.
- [ ] Map Git branches and linear branch ranges to neutral stacks.
- [ ] Set `supportsMultiAppliedWorkspace` to false for the first Git release.
- [ ] Set `supportsSyntheticWorkspaceMerge` to false until implemented safely.
- [ ] Implement single-stack `apply_stack` as safe checkout of a local branch.
- [ ] Implement `unapply_stack` as safe checkout of the configured target/base branch.
- [ ] Implement commit reword and amend for supported linear local branch stacks.
- [ ] Implement selected file movement through patch/index operations.
- [ ] Implement uncommit to working copy for supported selections.
- [ ] Implement restore and discard for selected working-copy changes.
- [ ] Add recovery refs or recovery instructions for rewrite failures.
- [ ] Keep all Git-specific mechanics behind the engine boundary.

### STOP: Verify Git Engine

- [ ] Run focused Git engine unit tests.
- [ ] Verify normal Git repositories load neutral workspace state.
- [ ] Verify unsupported Git actions are disabled before mutation requests.
- [ ] Verify commit edits work on a linear local branch.
- [ ] Verify selected file changes can move or uncommit in the supported subset.
- [ ] Verify failed rewrites leave a recoverable state.
- [ ] Record verification notes before continuing.

Verification notes:

- Pending.

## Milestone 5: Workspace And Branches UI Migration

Status: planned

- [ ] Convert Workspace reads to `getVcsWorkspaceState`.
- [ ] Convert Branches apply/unapply actions to neutral operations.
- [ ] Keep existing column layout, collapse behavior, resize behavior, URL params, and right-side diff placement.
- [ ] Replace UI references to JJ-specific mutation concepts with neutral labels and state.
- [ ] Show provider metadata only as display metadata.
- [ ] Disable unsupported actions based on `state.capabilities`.
- [ ] Keep existing JJ UI behavior working while Git support is added.

### STOP: Verify UI Migration

- [ ] Run VCS unit tests.
- [ ] Run VCS typecheck.
- [ ] Open Workspace for a JJ repository.
- [ ] Open Workspace for a normal Git repository.
- [ ] Verify Branches can apply and unapply through neutral operations.
- [ ] Verify unsupported provider actions show disabled states rather than failing after click.
- [ ] Record verification notes before continuing.

Verification notes:

- Pending.

## Milestone 6: Drag/Drop Workspace Operations

Status: planned

- [ ] Add a neutral drag payload for stacks, commits, files, folders, and hunks.
- [ ] Add drop target capability checks before preview/apply.
- [ ] Dropping a stack onto Workspace emits `apply_stack`.
- [ ] Removing a stack lane emits `unapply_stack`.
- [ ] Dropping working-copy files or hunks onto a commit emits `amend_commit`.
- [ ] Dropping committed files or hunks onto another commit emits `move_changes`.
- [ ] Dropping committed files or hunks onto Working Copy emits `uncommit_changes`.
- [ ] Dropping a commit onto a stack emits `move_commit`.
- [ ] Dropping selected changes outside existing lanes emits `create_stack` when supported.
- [ ] Preserve selected file and right-side diff state after successful drag/drop operations where possible.

### STOP: Verify Drag/Drop Operations

- [ ] Run drag/drop unit tests.
- [ ] Run VCS E2E tests for Workspace drag/drop.
- [ ] Verify invalid drop targets are visibly disabled.
- [ ] Verify valid drop targets preview the correct neutral operation.
- [ ] Verify JJ drag/drop covers file and hunk movement.
- [ ] Verify Git drag/drop covers the supported shared subset.
- [ ] Record verification notes before continuing.

Verification notes:

- Pending.

## Milestone 7: Preview, Apply, Invalidation, And Recovery

Status: planned

- [ ] Ensure every mutation-capable UI path calls `previewVcsOperation` before risky changes.
- [ ] Define low-risk operations that may apply immediately after validation.
- [ ] Return affected stacks, commits, files, conflicts, and warnings from previews.
- [ ] Return recovery data or recovery instructions from failed apply operations.
- [ ] Invalidate Workspace, Branches, Diff, Worktree, and Commit RTK tags after apply.
- [ ] Integrate watcher/runtime events with neutral workspace cache invalidation.
- [ ] Preserve stale-reference handling in the data layer.

### STOP: Verify Preview And Apply

- [ ] Run preview/apply unit tests for both providers.
- [ ] Verify previews do not mutate repository state.
- [ ] Verify apply invalidates active Workspace and Branches views.
- [ ] Verify provider errors are normalized.
- [ ] Verify failed Git rewrites and JJ conflicts are recoverable or clearly surfaced.
- [ ] Record verification notes before continuing.

Verification notes:

- Pending.

## Milestone 8: Cross-Provider Test Coverage

Status: planned

- [ ] Extend deterministic fixture generation to cover both JJ and normal Git provider paths.
- [ ] Add capability-gated operation tests that run against both providers.
- [ ] Add JJ-specific tests for multi-applied workspace behavior and hunk ownership.
- [ ] Add Git-specific tests for the supported linear branch subset.
- [ ] Add Playwright E2E coverage for Workspace apply/unapply.
- [ ] Add Playwright E2E coverage for commit editing.
- [ ] Add Playwright E2E coverage for moving selected file changes.
- [ ] Add Playwright E2E coverage for disabled unsupported actions.

### STOP: Verify Cross-Provider Tests

- [ ] Run fixture generation for JJ.
- [ ] Run fixture generation for Git.
- [ ] Run `npm --workspace @changeyard/vcs run test`.
- [ ] Run `npm --workspace @changeyard/vcs run typecheck`.
- [ ] Run `npm --workspace @changeyard/vcs run e2e`.
- [ ] Run broader repository tests required by the touched packages.
- [ ] Record verification notes before continuing.

Verification notes:

- Pending.

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
