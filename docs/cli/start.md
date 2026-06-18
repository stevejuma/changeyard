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
