---
name: Complete
command: cy complete
summary: Run completion checks and mark a workspace change ready to land or review.
---

## Usage

```text
cy complete CY-0001 [--profile <name>] [--no-pr] [--no-code-change] [--dry-run]
```

## Options

- `--profile <name>`: Run a named completion profile.
- `--no-pr`: Complete locally without opening a provider pull request.
- `--no-code-change`: Allow completion when no code diff is expected.
- `--dry-run`: Show the completion action without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy complete CY-0001 --no-pr
cy complete CY-0001 --profile full
```

Completion requires verified workspace context, completed or deferred acceptance criteria, non-placeholder Completion Notes, and passing checks. If completion fails, run `cy audit <id>` for the expected cwd, blockers, and recovery commands.
