# JJ Supported Functionality

This document is the current support matrix for JJ repositories in the VCS app. It covers what the UI exposes, the neutral operation shape, and the JJ behavior behind it.

## Capabilities

The JJ workspace engine advertises:

| Capability | Status | Notes |
| --- | --- | --- |
| Multi-applied workspace | Supported | Multiple stacks can participate in the Workspace view. Stack membership rewrites the working-copy change parents. |
| Broad hunk selection | Not supported | The broad capability remains off so unsupported hunk operations stay disabled. |
| Working-copy hunk restore/discard | Supported | Selected working-copy hunks are reverse-applied with a generated patch. |
| Committed hunk selection | Supported | Split, move, uncommit, and discard/restore selected committed hunks are supported through selected-patch flows. |
| Commit rewrite | Supported | Reword, amend, split, squash, and commit move are supported for exposed cases. |
| Move commit across stacks | Supported | Implemented with JJ rebase/reorder semantics. |
| Move changes across commits | Supported | File and hunk movement are supported for committed source changes. |
| Undo/redo | Supported | Uses JJ repository operation history. |
| Synthetic workspace merge refs | Not supported | The app does not create long-lived synthetic refs. It rewrites the working-copy change parents directly. |
| Create stack from selected changes | Not supported | Drop-to-new-stack is modeled but disabled for JJ until a provider flow is implemented. |
| Commit selected working-copy changes as a new stack commit | Not supported | `create_commit` is modeled but disabled for JJ. |

## Supported Actions

### Neutral Workspace Actions

| UI action | Neutral operation | JJ behavior |
| --- | --- | --- |
| Apply stack to Workspace | `apply_stack` | Resolve the stack head and run `jj rebase -r @ -o <existing-parent> -o <stack-head> ...` so `@` becomes a merge over applied parents. |
| Unapply stack from Workspace | `unapply_stack` | Resolve the stack head and run `jj rebase -r @ -o <remaining-parent> ...` to remove that parent from `@`. |
| Edit commit message | `reword_commit` | `jj describe -r <change> -m <message>`. |
| Amend commit with selected working-copy files | `amend_commit` | `jj absorb --from @ --into <target-change> -- <paths>`. The target must be an ancestor of the current working-copy change. |
| Split selected committed files | `split_commit` | `jj split -r <source-change> -m <message> -- <paths>`. |
| Split selected committed hunks | `split_commit` | Build selected patch from `jj diff -r <source>`, then run `jj split -r <source> -m <message> --tool <temporary-editor> <paths>`. |
| Squash one commit into another | `squash_commits` | `jj squash --from <source-change> --into <target-change>`. |
| Move commit onto another stack or position | `move_commit` | Resolves the target stack head when needed, then uses the JJ reorder/rebase preview path. |
| Move selected committed files into another commit | `move_changes` | `jj squash --from <source-change> --into <target-change> <paths>`. |
| Move selected committed hunks into another commit | `move_changes` | Build selected patch from `jj diff -r <source>`, then run `jj squash --from <source> --into <target> --interactive --tool <temporary-editor> <paths>`. |
| Uncommit selected committed files to working copy | `uncommit_changes` | `jj squash --from <source-change> --into @ <paths>`. |
| Uncommit selected committed hunks to working copy | `uncommit_changes` | Same selected-patch diff-editor flow as hunk movement, with `--into @`. |
| Restore/discard selected working-copy files | `restore_changes` / `discard_changes` | `jj restore -- <paths>`. These operations are equivalent for JJ working-copy file changes. |
| Restore/discard selected working-copy hunks | `restore_changes` / `discard_changes` | Build selected patch from `jj diff --git --color=never`, then apply it in reverse with `git apply --reverse --whitespace=nowarn -`. |
| Restore/discard selected committed hunks | `restore_changes` / `discard_changes` | Create a temporary sibling change from the source parent, squash only selected hunks into it with the diff editor, then `jj abandon` the temporary change. |
| Undo latest JJ operation | `undo` | `jj undo`. This is repository-scoped, not Changeyard-scoped. |
| Redo latest undone JJ operation | `redo` | `jj redo`. |

### JJ Operation API Actions

These are exposed through the older JJ operation preview/apply API. Some are used by Branches, History, or supporting components rather than the neutral Workspace drag/drop path.

| Action | Operation kind | JJ behavior |
| --- | --- | --- |
| Create bookmark | `create_bookmark` | `jj bookmark create <name> -r <change>`. |
| Edit message | `edit_message` | `jj describe -r <change> -m <message>`. |
| Create change before/after another change | `create_change` | `jj new --insert-before <change> --no-edit -m <message>` or `jj new --insert-after <change> --no-edit -m <message>`. |
| Move bookmark | `move_bookmark` | `jj bookmark move <name> --to <change> --allow-backwards`. |
| Reorder change | `reorder_change` | JJ rebase/reorder command selected by preview validation. |
| Squash change | `squash_change` | `jj squash --from <source> --into <target> ...`. |
| Split change | `split_change` | `jj split -r <change> -m <message> -- <paths>`. |
| Absorb files | `absorb_file` | `jj absorb --from @ --into <target> -- <paths>`. |
| Restore files | `restore_file` | `jj restore -- <paths>`. |
| Abandon change | `abandon_change` | `jj abandon <change>`. |
| Undo/redo | `undo_last` / `redo_last` | `jj undo` / `jj redo`. |

### Stacked PR Submission

Stacked PR submission is supported for JJ stacks when the repository and Changeyard provider configuration resolve to GitHub.

Supported preview/apply behavior:

- detect the stack from JJ bookmarks
- find existing GitHub PRs for stack bookmarks
- decide whether each item needs push, PR creation, PR base update, or no action
- push unsynced bookmarks with `git push <remote> <bookmark>`
- create missing PRs through the GitHub REST API
- update PR base branches through the GitHub REST API
- create or update stack comments through the GitHub REST API

Submission is unavailable when:

- the repository is not JJ
- the remote provider is not GitHub
- Changeyard `provider.type` is not `github`
- the configured GitHub token environment variable is missing
- no usable remote, owner, repo, or target bookmark can be resolved

## Supported Read Views

| View | What it shows | Backing data |
| --- | --- | --- |
| Branches | Local stack rows, dependent stack rows, current target fallback, remote/provider inventory, selected commit list, commit diff panel. | JJ detection, bookmark inventory, stack graph, repository commit diff. |
| Workspace | Working copy files, applied stack lanes, commit cards, changed-file lists, selected file diff, operation preview dialog. | Neutral workspace state, neutral diff, repository commit diff, project config `vcsAppliedStacks`. |
| History | JJ operation log and operation diff/commit graph. | JJ operation history and operation diff readers. |
| Settings | Project config, target branch, VCS engine/fallback, applied stack ids, provider state. | Project config and VCS inventory APIs. |

## Unsupported Or Intentionally Disabled

- Creating a new stack from selected changes in JJ.
- Creating a new commit from selected working-copy changes in JJ.
- Broad hunk selection for arbitrary operations.
- Git-style index staging. JJ has no Git index in this flow; selected change operations are mapped to JJ changes and patches.
- Long-lived internal workspace merge refs. Current stack membership uses direct parent rebasing of `@`.
- Provider-specific JJ mutation calls from UI components. UI mutations should go through neutral preview/apply operations.

## Safety Behavior

- All mutations go through a preview dialog before apply.
- Preview and apply use argv arrays, not shell strings.
- Paths, change ids, revision ids, and bookmark names are validated before command construction.
- Failed apply results include diagnostics and recovery instructions.
- Cache invalidation covers Workspace, Branches, Diff, Commit, worktree, head/base/divergence, repository history, and operation history tags.
- Watcher/runtime events refresh active Workspace and Branches views.
