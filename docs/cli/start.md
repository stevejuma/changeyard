---
name: Start
command: cy start
summary: Create a task workspace and move the change into progress.
---

## Usage

```text
cy start CY-0001 [--dry-run]
```

## Options

- `--dry-run`: Show the workspace action without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy start CY-0001
cy start CY-0001 --dry-run
```

For JJ workspaces, `cy start` describes the workspace working-copy commit as `CY-0001: <change title>`. Keep every later workspace commit message prefixed with the same change id.
