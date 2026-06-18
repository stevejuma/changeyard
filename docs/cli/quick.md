---
name: quick
command: cy quick
summary: Create a low-risk quick change.
---

Quick changes are the primary lite workflow. They are only appropriate for small, low-risk work with no behavior, public API, storage/schema, provider/workspace lifecycle, UI workflow, or security-sensitive impact. They always use `planning.model: none`, regardless of the project default planning profile.

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
