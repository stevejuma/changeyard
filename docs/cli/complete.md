---
name: Complete
command: cy complete
summary: Run completion checks and mark a workspace change ready to land or review.
---

## Usage

```text
cy complete CY-0001 [--profile <name>] [--no-pr] [--no-code-change] [--single-commit-ok] [--dry-run]
```

## Options

- `--profile <name>`: Run a named completion profile.
- `--no-pr`: Complete locally without opening a provider pull request.
- `--no-code-change`: Allow completion when no code diff is expected.
- `--single-commit-ok`: Allow a large code-changing workspace to complete with one recorded slice.
- `--dry-run`: Show the completion action without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy complete CY-0001 --no-pr
cy complete CY-0001 --profile full
```

Completion requires explicit user completion wording, verified workspace context, completed or deferred acceptance criteria, non-placeholder Completion Notes, reviewable slice history, and passing checks. `cy complete <id> --no-pr` marks the local work `ready_for_pr`; create the provider PR later with `cy pr new <id>`. For JJ workspaces, `cy complete` also writes a final PR-style landing description to the recorded workspace change so repository history keeps the full context after landing. If completion fails, run `cy audit <id>` for the expected cwd, blockers, and recovery commands.
