# Workspace Buttler Provider-Neutral Workspace Plan

## Operating Rule

- Work directly on the current branch for this VCS workspace work.
- Do not use the Changeyard lifecycle workflow, lifecycle commands, or Changeyard workspaces.
- This is a standalone plan. Do not edit `workspace-plan.md` or `workspace-tasks.md` as part of this plan unless requested separately.
- Keep the exact `buttler` spelling used by these planning files.

## Summary

Build the Workspace behavior inspired by JJButler while preserving Changeyard's VCS abstraction. The UI must not depend on JJ-specific concepts such as change IDs, revsets, internal merge bookmarks, or JJ workspace modes. The app-level model exposes neutral workspace, stack, commit, file, hunk, preview, and operation concepts. Provider-specific engines translate those operations to JJ or Git.

The target user experience is:

- apply and unapply stacks in the Workspace
- edit commit messages and commit contents
- move commits across stacks
- drag selected files or hunks across commits and stacks
- uncommit selected files or hunks back to the working copy
- restore or discard selected changes
- undo and redo where the provider supports it

Unsupported operations must be visibly disabled through provider capability flags. They must not appear to work and then fail through provider-specific errors.

## Provider-Neutral Model

Use these app-level concepts across Workspace, Branches, History, RTK Query, and drag/drop:

- `Workspace`: the current repository working context shown by the VCS app.
- `Stack`: a named sequence of commits or changes that can be shown as a lane. In Git, this is usually a local branch or inferred branch stack. In JJ, this is derived from bookmarks and changes.
- `Applied stack`: a stack currently participating in the Workspace view.
- `Commit`: a provider-neutral commit/change node identified by a stable `commitId` in the app contract. Providers may also expose display hashes or change IDs as metadata.
- `Working copy`: uncommitted file and hunk changes in the active repository context.
- `Change selection`: a file, folder, or hunk selection that can be moved, amended, uncommitted, restored, or discarded.
- `Operation preview`: a provider-produced summary of what an operation will change before it is applied.
- `Provider capability`: a boolean or enum that controls whether an operation is enabled for the current repository/provider.

The UI may show provider metadata for clarity, but it must call only neutral VCS workspace APIs for Workspace mutations.

## Public Interface Additions

Add the shared types in the VCS domain layer, then use them from runtime APIs and the VCS package.

```ts
export type VcsProviderKind = "jj" | "git";

export interface VcsWorkspaceCapabilities {
  supportsMultiAppliedWorkspace: boolean;
  supportsHunkSelection: boolean;
  supportsCommitRewrite: boolean;
  supportsMoveCommitAcrossStacks: boolean;
  supportsMoveChangesAcrossCommits: boolean;
  supportsUndoRedo: boolean;
  supportsSyntheticWorkspaceMerge: boolean;
  supportsWorkingCopyCommit: boolean;
}

export interface VcsWorkspaceState {
  projectId: string;
  provider: VcsProviderKind;
  targetRef: string;
  headId: string | null;
  mode: "normal" | "editing" | "conflicted" | "unsupported";
  capabilities: VcsWorkspaceCapabilities;
  stacks: VcsWorkspaceStack[];
  appliedStackIds: string[];
  workingCopy: VcsWorkingCopyState;
  conflicts: VcsWorkspaceConflict[];
}

export interface VcsChangeSelection {
  source: "working_copy" | "commit";
  commitId?: string;
  paths?: string[];
  hunks?: VcsHunkSelection[];
}

export type VcsWorkspaceOperation =
  | { kind: "apply_stack"; stackId: string }
  | { kind: "unapply_stack"; stackId: string }
  | { kind: "create_stack"; name: string; selection?: VcsChangeSelection }
  | { kind: "create_commit"; stackId: string; message: string; selection: VcsChangeSelection }
  | { kind: "reword_commit"; commitId: string; message: string }
  | { kind: "amend_commit"; commitId: string; selection: VcsChangeSelection }
  | { kind: "split_commit"; commitId: string; message: string; selection: VcsChangeSelection }
  | { kind: "squash_commits"; sourceCommitId: string; targetCommitId: string }
  | { kind: "move_commit"; commitId: string; targetStackId: string; position?: VcsCommitPosition }
  | { kind: "move_changes"; selection: VcsChangeSelection; targetCommitId: string }
  | { kind: "uncommit_changes"; selection: VcsChangeSelection; targetStackId?: string }
  | { kind: "restore_changes"; selection: VcsChangeSelection }
  | { kind: "discard_changes"; selection: VcsChangeSelection }
  | { kind: "undo" }
  | { kind: "redo" };
```

Add provider-neutral RTK Query endpoints in the VCS service layer:

- `getVcsWorkspaceState`
- `getVcsStacks`
- `getVcsDiff`
- `previewVcsOperation`
- `applyVcsOperation`

Existing JJ-specific endpoints can remain during migration, but new Workspace mutation UI must not call them directly.

## Provider Engine Boundary

Add a backend engine contract with one implementation per provider:

```ts
export interface VcsWorkspaceEngine {
  provider: VcsProviderKind;
  getCapabilities(): VcsWorkspaceCapabilities;
  getWorkspaceState(input: VcsWorkspaceStateInput): Promise<VcsWorkspaceState>;
  getDiff(input: VcsDiffInput): Promise<VcsDiffResult>;
  previewOperation(input: VcsWorkspaceOperationInput): Promise<VcsOperationPreview>;
  applyOperation(input: VcsWorkspaceOperationInput): Promise<VcsOperationResult>;
}
```

The engine layer owns provider-specific validation, previewing, mutation safety, conflicts, and recovery data. The UI and RTK layer own neutral request shapes, loading states, disabled states, and cache invalidation.

## JJ Engine Behavior

The JJ engine maps the neutral contract to JJ internals:

- stack and commit identity can use JJ changes internally, but the public contract still returns neutral `stackId` and `commitId`
- applied workspace behavior can use internal workspace merge and WIP refs
- commit editing can use JJ edit-mode mechanics where needed
- moving files or hunks can use JJ patch splitting and hunk ownership metadata
- undo and redo can use JJ operation history
- conflicts from workspace merges or rewritten changes must surface as neutral `VcsWorkspaceConflict` records

JJ-only implementation details must stay inside `src/vcs/jj/*` or another provider-specific JJ module.

## Git Engine Behavior

The Git engine implements the shared subset first:

- one applied stack is supported in v1, represented by the active branch/worktree
- `supportsMultiAppliedWorkspace` and `supportsSyntheticWorkspaceMerge` are false until a safe synthetic merge/worktree model is implemented
- `apply_stack` checks out the target local branch when the worktree is clean or the operation can preserve changes safely
- `unapply_stack` returns to the configured target/base branch when safe
- commit reword/amend/split/squash and move-change operations are supported only for linear local branch stacks in v1
- non-HEAD commit edits rebuild the branch through a safe temporary-ref rewrite flow
- selected file and hunk movement uses generated patches, the Git index, and a temporary rebuild path rather than ad hoc working-tree edits
- provider failures must leave a recovery ref or clear recovery instructions in the operation result

Git-only implementation details must stay inside `src/vcs/git/*` or another provider-specific Git module.

## UI And Drag/Drop Behavior

Workspace and Branches UI emits neutral operations only:

- dropping a stack onto the Workspace emits `apply_stack`
- removing a stack lane emits `unapply_stack`
- dropping a working-copy file or hunk onto a commit emits `amend_commit`
- dropping a committed file or hunk onto another commit emits `move_changes`
- dropping a committed file or hunk onto Working Copy emits `uncommit_changes`
- dropping a commit onto another stack emits `move_commit`
- dropping selected changes outside an existing lane emits `create_stack` when the provider supports it
- editing commit text emits `reword_commit`
- undo and redo controls emit `undo` and `redo`

The UI must read provider capabilities from `VcsWorkspaceState` and disable unsupported drop targets before a mutation request is sent.

## Data Flow

1. UI reads `getVcsWorkspaceState`.
2. UI derives enabled actions and drop targets from `state.capabilities`.
3. User gesture creates a `VcsWorkspaceOperation`.
4. UI calls `previewVcsOperation`.
5. Preview returns a neutral summary, warnings, conflicts, affected stacks, affected commits, and disabled reason if validation fails.
6. User confirms or the UI applies directly for low-risk operations.
7. UI calls `applyVcsOperation`.
8. Provider engine performs the mutation through a safe transaction or recovery-ref flow.
9. RTK Query invalidates Workspace, Branches, Diff, Worktree, and Commit tags.
10. Watcher/runtime events refresh active Workspace and Branches views.

## Migration Strategy

- Add the neutral contract before adding new Workspace mutations.
- Keep current JJ read APIs working while neutral APIs are introduced.
- Convert Workspace to neutral state first, then Branches stack actions, then drag/drop mutations.
- Implement JJ behind the neutral contract before broad Git mutation support.
- Implement the Git shared subset with capability gating instead of trying to match all JJ workspace behavior immediately.
- Add cross-provider tests for every operation that is exposed in the UI.

## Verification Strategy

- Typecheck the VCS package after adding shared contracts and RTK endpoints.
- Unit test operation validation and provider capability gating.
- Add JJ fixture tests for applied stacks, commit editing, moving changes, hunk selection, and undo/redo.
- Add Git fixture tests for branch workspace state, amend/reword, selected file movement, uncommit, restore, and discard.
- Add Playwright coverage for Workspace drag/drop flows against deterministic VCS fixtures.
- Manually verify one JJ repository and one normal Git repository before enabling mutation-heavy controls by default.
