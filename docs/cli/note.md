---
name: Note
command: cy note
summary: Update Completion Notes for a change.
---

## Usage

```text
cy note CY-0001 --message <text> [--replace] [--dry-run]
```

## Options

- `--message <text>`: Note text to append or write.
- `--replace`: Replace existing Completion Notes instead of appending.
- `--dry-run`: Show the write target without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy note CY-0001 --message "Checks run: pnpm test."
cy note CY-0001 --message "Tests passed: focused CLI suite."
cy note CY-0001 --message "No checks were run because this was documentation-only." --replace
```
