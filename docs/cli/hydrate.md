---
name: Hydrate
command: cy hydrate
summary: Copy configured workspace support files and optionally run setup.
---

## Usage

```text
cy hydrate CY-0001 [--dry-run] [--warmup]
```

## Options

- `--dry-run`: Show the hydration action without writing.
- `--warmup`: Run `workspace.hydrate.warmupCommand`. Falls back to `workspace.hydrate.installCommand` when no warmup command is configured.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy hydrate CY-0001
cy hydrate CY-0001 --warmup
```
