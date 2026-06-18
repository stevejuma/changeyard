---
name: Install
command: cy install
summary: Symlink `cy` and `changeyard` into a local bin directory.
---

## Usage

```text
cy install [--dir <path>] [--dry-run]
```

## Options

- `--dir <path>`: Install directory. Defaults to `~/.local/bin`.
- `--dry-run`: Show symlink actions without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy install
cy install --dir ~/.local/bin --dry-run
```
