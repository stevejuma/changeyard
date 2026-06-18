---
name: audit
command: cy audit
summary: Audit one change against workflow gates and print recovery guidance.
---

## Usage

```text
cy audit <id> [--json]
```

## Options

- `--json`: Print machine-readable audit output.

## Examples

```sh
cy audit CY-0001
cy audit CY-0001 --json
```
