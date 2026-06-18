---
name: doctor
command: cy doctor
summary: Check Changeyard state, stale markers, provider drift, and workspace issues.
---

## Usage

```text
cy doctor [--json] [--fix] [--dry-run] [--verbose]
```

## Options

- `--json`: Print machine-readable output.
- `--fix`: Apply supported repairs.
- `--dry-run`: Report repairs without writing.
- `--verbose`: Include additional notes.

## Examples

```sh
cy doctor
cy doctor --fix
cy doctor --json
```

