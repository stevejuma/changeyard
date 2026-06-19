# VCS App Spec

The VCS app is a provider-neutral UI for repository stacks, workspace state, diffs, previews, and safe mutations. JJ is the reference provider today. Git shares the neutral contract where supported, but provider-specific mechanics stay behind backend adapters.

The app is served by the same global hub as dashboard and Kanban. It uses the active project/workspace context and routes read and mutation requests through runtime APIs.

## Documents

- [VCS Core Workflow](core-workflow.md): inspect repository state, preview operations, apply changes, and submit stacks.
- [VCS Provider Model](provider-model.md): neutral operation contract and provider-specific boundaries.
- [JJ Supported Functionality](jj-supported-functionality.md): support matrix for JJ operations.
- [JJ UI Interactions](jj-ui-interactions.md): user-facing flows and neutral operation mapping.
- [JJ Backend Queries And Commands](jj-backend-queries.md): command and revset reference for the JJ provider.
- [VCS Troubleshooting](troubleshooting.md): common diagnostics and recovery paths.
- [Agent Notes For VCS Work](agent-notes.md): guardrails and checklists for future changes.
- [Legacy JJ VCS Overview](../vcs-jj.md): older overview retained for route and runtime context.

## Source Map

- Shared frontend contract: `packages/vcs/src/vcs-workspace-contracts.ts`
- Drag/drop operation builder: `packages/vcs/src/vcs-workspace-dnd.ts`
- Workspace UI: `packages/vcs/src/views/jj-board-view.tsx`
- Branches UI: `packages/vcs/src/views/branches-view.tsx`
- Runtime API bridge: `packages/vcs/src/runtime/vcs-api.ts`
- Backend adapter: `src/vcs/adapter.ts`
- Project config schema/defaults: `src/config/schema.ts`, `src/config/defaults.ts`
- JJ state reader: `src/vcs/jj/state.ts`
- JJ workspace engine: `src/vcs/jj/workspace.ts`
- JJ preview engine: `src/vcs/jj/preview.ts`
- JJ apply engine: `src/vcs/jj/apply.ts`

## Neutral Model

The UI must express mutations as neutral `VcsWorkspaceOperation` values:

- `apply_stack`
- `unapply_stack`
- `reword_commit`
- `amend_commit`
- `split_commit`
- `squash_commits`
- `move_commit`
- `move_changes`
- `uncommit_changes`
- `restore_changes`
- `discard_changes`
- `undo`
- `redo`

Provider-specific mechanics stay behind the backend provider engine. UI code may display provider metadata, but it should not construct JJ revsets, call JJ-specific mutation endpoints, or depend on JJ-only identifiers except where they are returned as neutral metadata.

## Preview Rule

Mutation-capable UI flows call `previewVcsOperation` before `applyVcsOperation`. The preview carries:

- validity and disabled reason
- human summary
- risk level
- warnings
- affected stack ids, commit ids, and paths
- conflicts and diagnostics

The Apply button is enabled only when the loaded preview still matches the pending operation.

## Remote Discovery Rule

Read paths must not run `jj git fetch`. Remote bookmark discovery is local-store only and defaults to `vcs.remoteBookmarks.mode = "local"`, which avoids `jj bookmark list --all-remotes`. Projects that need remote-only inventory can opt into `mode = "all"` or `mode = "tracked"` and should scope discovery with `remotes` and `prefixes`.

## Runtime Rule

The VCS app should not start a separate server. Open it through the shared hub:

```sh
cy --vcs
```

Use `cy hub list` or the dashboard to confirm which hub instance is serving the page.
