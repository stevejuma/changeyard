---
name: Uninstall
command: cy uninstall
summary: Remove Changeyard CLI symlinks installed by `cy install`.
---

## Usage

```text
cy uninstall [--dir <path>] [--dry-run]
```

## Options

- `--dir <path>`: Install directory. Defaults to `~/.local/bin`.
- `--dry-run`: Show removal actions without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy uninstall
cy uninstall --dir ~/.local/bin
```
