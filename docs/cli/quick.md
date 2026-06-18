---
name: quick
command: cy quick
summary: Create a low-risk quick change.
---

## Usage

```text
cy quick --title <title> [--priority <priority>] [--label <label>...] [--author <name>] [--dry-run]
```

## Options

- `--title <title>`: Change title.
- `--priority <priority>`: Change priority.
- `--label <label>`: Add a label. Can be repeated.
- `--author <name>`: Override author.
- `--dry-run`: Show the target path without writing.

## Examples

```sh
cy quick --title "Fix typo in README"
cy quick --dry-run --title "Tighten release note copy"
```

