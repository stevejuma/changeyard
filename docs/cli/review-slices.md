---
name: review slices
command: cy review slices
summary: List implementation slices or record explicit slice-review decisions.
---

## Usage

```text
cy review slices <id>
cy review slices <id> --decision <decision> (--slice <slice-id> | --all-pending) [--note <text>] [--dry-run]
```

## Options

- `--decision <decision>`: Slice-review decision. [possible values: approve, request-changes]
- `--slice <slice-id>`: Select one recorded slice by slice id or commit id.
- `--all-pending`: Select all slices whose review state is pending.
- `--note <text>`: Record review context; required for `request-changes`.
- `--dry-run`: Preview decisions without changing slice records.

## Examples

```sh
cy review slices CY-0001
cy review slices CY-0001 --decision approve --slice abc123
cy review slices CY-0001 --decision request-changes --slice abc123 --note "Add a regression test."
cy review slices CY-0001 --decision approve --all-pending
```

Approval maps to the existing `reviewed` slice state. Completion remains blocked while any recorded slice is `pending` or `changes_requested`.
