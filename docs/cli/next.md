---
name: next
command: cy next
summary: Show the next actionable Changeyard workflow command.
---

## Usage

```text
cy next <id> [--json]
```

## Options

- `--json`: Print machine-readable output.

## Examples

```sh
cy next CY-0001
```

For in-progress work, dirty workspaces are reported as a slice boundary: commit the current slice with `cy slice commit <id> -m "<title>"` or explicitly keep working uncommitted. Clean workspaces with recorded slices point to slice review instead of treating `cy complete` as a routine continuation step.
