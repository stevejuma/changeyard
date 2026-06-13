# JJ UI Interactions

This document maps user interactions in the VCS app to neutral operations and JJ behavior.

## Navigation

The VCS app routes are available when the VCS surface is enabled:

- `/vcs`
- `/vcs/jj`
- `/vcs/jj/branches`
- `/vcs/jj/history`
- `/vcs/settings`

`/vcs/jj` is the Workspace view. `/vcs/jj/branches` is the Branches view. The routes are named JJ for historical reasons, but the core Workspace and Branches mutation model is provider-neutral.

## Branches View

Branches presents repository inventory and stack rows.

### Selecting A Stack

Clicking a stack row opens its commit list. Commit rows can be selected to show changed files and diffs.

### Applying A Stack

1. Click `Apply to workspace` on a stack.
2. The UI creates `{ kind: "apply_stack", stackId }`.
3. The UI calls `previewVcsOperation`.
4. The Workspace Operation dialog shows risk, summary, warnings, and affected ids.
5. Clicking `Apply operation` calls `applyVcsOperation`.
6. On success, project config `vcsAppliedStacks` is updated.

For JJ, apply rewrites the working-copy change `@` so the applied stack head becomes one of its parents.

### Unapplying A Stack

1. Click `Unapply from workspace`.
2. The UI creates `{ kind: "unapply_stack", stackId }`.
3. Preview and apply follow the same dialog flow as apply.
4. On success, project config removes the stack id.

For JJ, unapply rewrites the working-copy change `@` so the stack head is removed from its parent list. The operation is blocked if it would leave `@` with no parent.

### Branch-Oriented JJ Actions

Branches can also use the JJ operation preview/apply API for actions that are not expressed as neutral Workspace drag/drop operations:

- create a bookmark for a change
- create a change before or after another change
- move a bookmark to another change
- abandon a change
- submit a detected stack to GitHub PRs

These actions still preview before mutation. Stacked PR submission has a dedicated Submit Stacked PRs dialog because it may combine local pushes and GitHub API calls.

## Workspace View

Workspace is organized around:

- a working-copy column
- one column per applied stack
- commit cards inside each stack
- changed-file lists for selected commits
- a diff panel for selected files

### Working-Copy File Selection

Click a working-copy file to show its diff. The selection is stored in the URL as `workingCopyFile`.

### Commit And File Selection

Click a commit card to select the commit. The selected commit is stored in the URL as `commit`. The changed-file list loads for that commit. Click a file to show its diff; the selected path is stored as `file`.

### Editing A Commit Message

1. Click the edit button on a commit card.
2. Enter a new message.
3. Click `Preview changes`.
4. The UI creates `{ kind: "reword_commit", commitId, message }`.
5. Preview shows `jj describe -r <change> -m <message>`.
6. Apply rewrites the JJ change description.

### Dragging Working-Copy Files Onto Commits

Dragging a working-copy file onto a commit creates:

```ts
{ kind: "amend_commit", commitId, selection: { source: "working_copy", paths } }
```

For JJ, this maps to `jj absorb --from @ --into <target> -- <paths>`. The target must be an ancestor of the current working-copy change. Ambiguous hunks remain in the working-copy change according to JJ absorb behavior.

### Dragging Committed Files Onto Commits

Dragging a committed file from one commit to another creates:

```ts
{ kind: "move_changes", targetCommitId, selection: { source: "commit", commitId, paths } }
```

For JJ, this maps to path-qualified `jj squash --from <source> --into <target> <paths>`.

### Dragging Committed Files To Working Copy

Dragging a committed file onto Working Copy creates:

```ts
{ kind: "uncommit_changes", selection: { source: "commit", commitId, paths } }
```

For JJ, this maps to `jj squash --from <source> --into @ <paths>`.

### Dragging Hunks

The diff renderer exposes draggable hunk rows for supported cases.

| Source | Target | Neutral operation | JJ behavior |
| --- | --- | --- | --- |
| Working-copy hunk | Restore/discard action | `restore_changes` or `discard_changes` | Reverse-apply selected patch with `git apply --reverse`. |
| Committed hunk | Another commit | `move_changes` | `jj squash --interactive --tool <temporary-editor>`. |
| Committed hunk | Working Copy | `uncommit_changes` | `jj squash --interactive --tool <temporary-editor> --into @`. |
| Committed hunk | Split commit flow | `split_commit` | `jj split --tool <temporary-editor>`. |
| Committed hunk | Discard/restore action | `discard_changes` or `restore_changes` | Move selected hunks into a temporary sibling change, then abandon it. |

Invalid hunk drops are visibly marked and do not send mutation requests.

### Dragging Commits Across Stacks

Dragging or otherwise moving a commit creates:

```ts
{ kind: "move_commit", commitId, targetStackId, position }
```

For JJ, the provider resolves the target stack head when a precise relative commit is not supplied, then previews and applies through the JJ reorder/rebase path.

### Dropping Outside Existing Lanes

Dropping selected changes outside existing lanes maps to `create_stack` when the provider supports it. JJ currently does not support this operation, so the UI reports it as disabled.

## Preview Dialog

The Workspace Operation dialog is used for all repository mutations. It shows:

- operation title and summary
- risk level
- disabled reason when preview fails
- warnings
- conflicts
- affected stacks, commits, and paths
- diagnostics
- apply error if apply fails

The dialog prevents stale applies by comparing the loaded preview operation with the current pending operation.

## History View

History renders JJ operation history and operation details. Users can inspect operation diffs and commit graph context. Undo and redo are supported through the provider operation API, but they are repository-scoped JJ actions: if a command outside Changeyard ran most recently, JJ may undo or redo that operation.

## Settings View

Settings shows the project VCS configuration and inventory context. The most relevant fields for the JJ VCS app are:

- VCS engine and fallback engine
- target branch or base ref
- applied stack ids
- detected provider and remote information

Changing applied stack ids affects UI persistence; applying or unapplying through Workspace/Branches also mutates JJ by rebasing `@` parents.

## Post-Apply Focus

After successful operations, the Workspace tries to keep the user focused on the moved or changed path:

- `amend_commit`: focus the amended path in the target commit.
- `move_changes`: focus the moved path in the target commit.
- `uncommit_changes`: focus the path in Working Copy.
- Stack apply/unapply: update applied stack config and reload Workspace/Branches state.
