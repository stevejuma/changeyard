---
name: Repair
command: cy repair
summary: Repair recoverable Changeyard workspace state.
---

## Usage

```text
cy repair CY-0001 --workspace [--dry-run]
```

## Options

- `--workspace`: Repair workspace marker and workspace change-file state.
- `--dry-run`: Show repair actions without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy repair CY-0001 --workspace
cy repair CY-0001 --workspace --dry-run
```
