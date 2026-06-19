# VCS Core Workflow

The VCS app gives a safe visual workflow for inspecting repository state, previewing mutations, and applying provider-backed operations.

## 1. Open VCS From The Active Hub

```sh
cy --vcs
```

The page uses the active project/workspace context served by the global hub. If the app reports that no active workspace is available, start or verify a workspace through Kanban or the CLI first.

## 2. Inspect Repository State

The workspace view shows provider-derived stacks, commits, paths, and working-copy state. JJ is the most complete provider today and supplies the reference stack model.

The UI can display provider metadata, but shared UI code should still send neutral operations to the backend.

## 3. Build A Neutral Operation

User actions produce a `VcsWorkspaceOperation`, such as:

- move a commit
- move file changes
- squash commits
- split a commit
- amend a commit
- restore or discard changes
- undo or redo
- apply or unapply a stack

Drag and drop should also produce neutral operations. UI code should not construct JJ revsets directly.

## 4. Preview Before Apply

Every mutation-capable flow must call `previewVcsOperation` before `applyVcsOperation`.

The preview reports:

- whether the operation is valid
- disabled reason
- summary
- risk level
- warnings
- affected stacks, commits, and paths
- conflicts and diagnostics

The Apply button is enabled only when the loaded preview still matches the pending operation.

## 5. Apply And Refresh

Apply sends the same neutral operation to the backend provider adapter. After apply, refresh repository state from the provider instead of assuming the old UI state is still valid.

## 6. Submit Or Publish

Provider-backed submit flows build on the same neutral state model. The UI should show provider-specific status only after it is returned by the backend or provider integration.
