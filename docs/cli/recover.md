---
name: Recover
command: cy recover
summary: Recreate missing workspace markers and repair recoverable workspace drift.
---

## Usage

```text
cy recover CY-0001 [--dry-run]
cy recover all [--dry-run]
```

## Options

- `--dry-run`: Show recovery actions without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy recover CY-0001
cy recover all --dry-run
```
