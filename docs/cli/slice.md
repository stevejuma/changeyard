---
name: Slice
command: cy slice
summary: Commit one reviewable implementation slice from a workspace.
---

## Usage

```text
cy slice commit CY-0001 -m "<title>" [--check "<cmd>"]... [--dry-run]
```

## Options

- `-m, --message <title>`: Slice title or full commit message.
- `--check <cmd>`: Run and record a focused validation command before committing. Repeat for multiple checks.
- `--dry-run`: Show the slice commit action without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy slice commit CY-0001 -m "Fix drag preview padding" --check "pnpm test -- drag"
```

A slice is one user-requested behavior tweak, bug fix, visual adjustment, or cleanup increment. Commit each completed slice before starting another requested slice unless the user explicitly asks for an uncommitted working diff.
