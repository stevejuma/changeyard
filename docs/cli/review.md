---
name: review
command: cy review
summary: Manage markdown and provider review artifacts.
---

## Usage

```text
cy review start <id> [--dry-run]
cy review complete <id> --decision <decision> [--dry-run]
cy review slices <id> [--decision <decision> (--slice <slice-id> | --all-pending)] [--note <text>] [--dry-run]
```

## Commands

- `start`: Create or open the next review artifact.
- `complete`: Complete the latest review with a decision.
- `slices`: List recorded implementation slices or record explicit slice decisions.

## Options

- `--decision <decision>`: Review decision. [possible values: approve, request-changes, reject, comment]
- `--slice <slice-id>`: Select one recorded slice by its slice or commit id.
- `--all-pending`: Select every pending slice explicitly.
- `--note <text>`: Record review context; required for `request-changes`.
- `--dry-run`: Simulate mutating commands without writing.

## Examples

```sh
cy review start CY-0001
cy review complete CY-0001 --decision request-changes
cy review slices CY-0001
cy review slices CY-0001 --decision approve --slice abc123
cy review slices CY-0001 --decision request-changes --slice abc123 --note "Add a regression test."
cy review slices CY-0001 --decision approve --all-pending --dry-run
```
