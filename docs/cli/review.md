---
name: review
command: cy review
summary: Manage markdown and provider review artifacts.
---

## Usage

```text
cy review start <id> [--dry-run]
cy review complete <id> --decision <decision> [--dry-run]
```

## Commands

- `start`: Create or open the next review artifact.
- `complete`: Complete the latest review with a decision.

## Options

- `--decision <decision>`: Review decision. [possible values: approve, request-changes, reject, comment]
- `--dry-run`: Simulate mutating commands without writing.

## Examples

```sh
cy review start CY-0001
cy review complete CY-0001 --decision request-changes
```

