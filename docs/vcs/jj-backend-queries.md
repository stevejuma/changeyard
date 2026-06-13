# JJ Backend Queries And Commands

This document lists the main JJ queries and commands used behind the VCS app. It is intended as a reference for agents and maintainers changing the JJ provider.

## Detection

The adapter starts from repository detection:

- `jj --version`
- `jj workspace root`
- `jj bookmark list --ignore-working-copy --at-op=@ -r @`
- `jj log --ignore-working-copy --at-op=@ -r @ --no-graph -T change_id.short()`

It also reads Git remote information for provider and default-target behavior:

- `git remote`
- `git remote get-url <remote>`
- `git symbolic-ref --quiet --short refs/remotes/<remote>/HEAD`

GitHub availability is checked for stack submission flows:

- `gh auth status --hostname github.com`

## Stack And Bookmark State

The JJ stack reader derives stacks from local bookmarks relative to the configured target.

### Bookmark Query

Command shape:

```sh
jj bookmark list \
  --ignore-working-copy \
  --at-op=@ \
  --revisions 'all() ~ ::<base-revset>' \
  --template 'name ++ "\t" ++ self.normal_target().change_id().shortest(12) ++ "\t" ++ self.normal_target().commit_id().shortest(12) ++ "\t" ++ if(self.synced(), "1", "0") ++ "\t" ++ if(self.tracked(), "1", "0") ++ "\n"'
```

Internal bookmark prefixes are filtered out:

- `changeyard/`
- `_changeyard/`
- `gitbutler/`
- `jjbutler/`
- `workspace/`
- `workspace-wip/`

### Stack Graph Query

For one bookmark:

```sh
jj log \
  --ignore-working-copy \
  --at-op=@ \
  --revisions '(::<bookmark>) ~ ::<base-revset>' \
  --no-graph \
  --template '<tab-separated change row>'
```

For multiple bookmarks:

```sh
jj log \
  --ignore-working-copy \
  --at-op=@ \
  --revisions '(::(<bookmark-a> | <bookmark-b> | ...)) ~ ::<base-revset>' \
  --no-graph \
  --template '<tab-separated change row>'
```

The template emits:

- short change id
- short commit id
- first description line
- author name
- author email
- parent change ids
- local bookmark names
- remote bookmark names
- current-working-copy flag

The graph builder turns those rows into neutral stacks and commits.

## Working Copy And Conflicts

Working-copy file state:

```sh
jj diff --summary -r @
```

Workspace conflict state:

```sh
jj log \
  --ignore-working-copy \
  --at-op=@ \
  --revisions 'conflicts()' \
  --no-graph \
  --template 'change_id.shortest(12) ++ "\t" ++ commit_id.shortest(12) ++ "\t" ++ description.first_line().replace("\\t", " ").replace("\\n", " ") ++ "\n"'
```

If conflicts are returned, the neutral workspace mode becomes `conflicted`, and conflicts are surfaced as `VcsWorkspaceConflict` records.

## Diffs

Current working-copy change diff:

```sh
jj show -r <current-change-id> --summary --color=never
jj show -r <current-change-id> --git --color=never
```

Working-copy hunk selection:

```sh
jj diff --git --color=never -- <paths>
```

Committed hunk selection:

```sh
jj diff --git --color=never -r <source-change-id> -- <paths>
```

The patch parser records file headers and hunk headers, including old/new start and length metadata. Hunk selections are matched by path and hunk coordinates.

## Workspace Stack Membership

Stack apply/unapply is modeled as parent changes on the current working-copy change `@`.

Read current parents:

```sh
jj log --no-graph -r @- -T 'change_id.short() ++ "\n"'
```

Apply stack:

```sh
jj rebase -r @ -o <existing-parent> -o <stack-head> ...
```

Unapply stack:

```sh
jj rebase -r @ -o <remaining-parent> ...
```

The provider blocks unapply if removing the stack would leave `@` with no parent.

## Workspace Mutations

All commands below are produced by preview/apply flows.

| Neutral operation | JJ command shape |
| --- | --- |
| `reword_commit` | `jj describe -r <change> -m <message>` |
| `amend_commit` with working-copy files | `jj absorb --from @ --into <target-change> -- <paths>` |
| `split_commit` with files | `jj split -r <change> -m <message> -- <paths>` |
| `squash_commits` | `jj squash --from <source> --into <target>` |
| `move_commit` | JJ reorder/rebase command from preview engine. |
| `move_changes` with files | `jj squash --from <source> --into <target> <paths>` |
| `uncommit_changes` with files | `jj squash --from <source> --into @ <paths>` |
| `restore_changes` / `discard_changes` with working-copy files | `jj restore -- <paths>` |
| `undo` | `jj undo` |
| `redo` | `jj redo` |

## JJ Operation API Commands

The older operation API uses the same preview/apply safety model but returns JJ command metadata directly.

| Operation kind | Command shape |
| --- | --- |
| `create_bookmark` | `jj bookmark create <bookmark> -r <change>` |
| `edit_message` | `jj describe -r <change> -m <message>` |
| `create_change` before | `jj new --insert-before <anchor> --no-edit -m <message>` |
| `create_change` after | `jj new --insert-after <anchor> --no-edit -m <message>` |
| `move_bookmark` | `jj bookmark move <bookmark> --to <target> --allow-backwards` |
| `squash_change` | `jj squash --from <source> --into <target> ...` |
| `split_change` | `jj split -r <change> -m <message> -- <paths>` |
| `absorb_file` | `jj absorb --from @ --into <target> -- <paths>` |
| `restore_file` | `jj restore -- <paths>` |
| `abandon_change` | `jj abandon <change>` |
| `undo_last` | `jj undo` |
| `redo_last` | `jj redo` |

`reorder_change` is previewed through JJ rebase semantics and validates source/target relationships before returning the concrete command.

## Selected Hunk Mutations

For selected committed hunks, the provider builds a minimal selected patch and writes a temporary diff-editor script.

The script receives JJ's left and right tree directories, replaces the right tree with the left tree, and applies the selected patch:

```sh
git -C "$right" apply --whitespace=nowarn <selected.patch>
```

Command shapes:

| Operation | Command shape |
| --- | --- |
| Split committed hunks | `jj split -r <source> -m <message> --tool <editor> <paths>` |
| Move committed hunks | `jj squash --from <source> --into <target> --interactive --tool <editor> <paths>` |
| Uncommit committed hunks | `jj squash --from <source> --into @ --interactive --tool <editor> <paths>` |

Committed hunk discard/restore uses a temporary sibling change:

1. Resolve source parent:
   ```sh
   jj log --no-graph -r <source>- -T change_id.short()
   ```
2. Create temporary sibling:
   ```sh
   jj new --no-edit <parent> -m "changeyard discard selected hunks"
   ```
3. Move selected hunks into temporary sibling:
   ```sh
   jj squash --from <source> --into <temporary> --interactive --tool <editor> <paths>
   ```
4. Remove them:
   ```sh
   jj abandon <temporary>
   ```

Working-copy hunk restore/discard builds a selected patch from `jj diff --git --color=never` and applies it in reverse:

```sh
git apply --reverse --whitespace=nowarn -
```

## Operation History

The History view reads JJ operation history and selected operation details. It powers operation log, operation diff, and commit graph views. Undo/redo use repository-scoped JJ operation history, so the preview warns that JJ may undo or redo a command that was not initiated by Changeyard.

## Stacked PR Submission

Stacked PR submission combines JJ state, Git remote state, and GitHub API calls.

Preview checks:

- repository kind is JJ
- remote provider is GitHub
- Changeyard `provider.type` is `github`
- configured token environment variable is present
- target bookmark belongs to a detected stack
- every stack bookmark has enough information to derive a PR base

Local push command shape:

```sh
git push <remote> <bookmark>
```

GitHub API actions:

- search for existing PRs by stack bookmark
- create PRs for bookmarks with no existing PR
- update PR base branches when the stack relationship changes
- create or update stack comments

The submit result records completed items, generated commands, resulting PR summaries, and diagnostics.

## Validation Rules

- Change ids and revision ids are restricted to safe JJ id characters.
- Bookmark names are validated before revset construction.
- Repository paths must be relative, must not begin with `-`, must not contain NUL, and must not traverse with `..`.
- Hunk selections must not overlap whole-file selections for the same path.
- Committed hunk discard requires exactly one source parent.
- Working-copy file amend requires the target change to be an ancestor of the current working-copy change.
