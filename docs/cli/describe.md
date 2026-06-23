---
name: Describe
command: cy describe
summary: Generate or preview rich Changeyard commit descriptions.
---

## Usage

```text
cy describe final CY-0001 [--dry-run] [--target <ref>]
```

## Options

- `--dry-run`: Print the generated final description without writing it.
- `--target <ref>`: Use a specific JJ target when computing landing files.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy describe final CY-0001 --dry-run
cy describe final CY-0001
```

`cy complete` writes the final JJ landing description automatically. Use `cy describe final` to preview or repair the final description before `cy land` when history context has drifted.
