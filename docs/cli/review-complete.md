---
name: review complete
command: cy review complete
summary: Complete the latest review for a change.
---

## Usage

```text
cy review complete <id> --decision <decision> [--dry-run]
```

## Options

- `--decision <decision>`: Review decision. [possible values: approve, request-changes, reject, comment]
- `--dry-run`: Simulate without writing.

## Examples

```sh
cy review complete CY-0001 --decision approve
```

