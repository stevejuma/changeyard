---
name: Config
command: cy config
summary: Print runtime config as JSON.
---

## Usage

```text
cy config --json [--project <path>]
```

## Options

- `--json`: Print machine-readable output.
- `--project <path>`: Resolve Changeyard state from another repository path.

## Examples

```sh
cy config --json
cy config --json --project /path/to/repo
```
