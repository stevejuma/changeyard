---
name: Sync
command: cy sync
summary: Sync change metadata to the configured provider.
---

## Usage

```text
cy sync CY-0001 [--dry-run]
```

## Options

- `--dry-run`: Show the provider action without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy sync CY-0001
cy sync CY-0001 --dry-run
```
