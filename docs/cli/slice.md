---
name: Slice
command: cy slice
summary: Commit one reviewable implementation slice from a workspace.
---

## Usage

```text
cy slice commit CY-0001 -m "<title>" [--body <text>] [--body-file <path>] [--check "<cmd>"]... [--dry-run]
```

## Options

- `-m, --message <title>`: Slice title. Changeyard writes the final subject as `CY-0001: <title>`.
- `--body <text>`: Append human-written context to the generated PR-style commit body.
- `--body-file <path>`: Append human-written context from a file to the generated PR-style commit body.
- `--check <cmd>`: Run and record a focused validation command before committing. Repeat for multiple checks.
- `--dry-run`: Show the slice commit action without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy slice commit CY-0001 -m "Fix drag preview padding" --check "pnpm test -- drag"
```

A slice is one user-requested behavior tweak, bug fix, visual adjustment, or cleanup increment. Commit each completed slice before starting another requested slice unless the user explicitly asks for an uncommitted working diff.

Slice commits use a PR-style message by default: subject, summary, slices, validation, files, and notes/follow-up. The generated body is also recorded in the `Change Slices` section for review commands.
