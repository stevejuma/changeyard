---
name: Mark In Progress
command: cy mark-in-progress
summary: Mark a recoverable change in progress.
---

## Usage

```text
cy mark-in-progress CY-0001 [--dry-run]
```

## Options

- `--dry-run`: Show the status update without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy mark-in-progress CY-0001
```
