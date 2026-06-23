---
name: check
command: cy check
summary: Record manual validation evidence for a workspace change.
---

# cy check

```bash
cy check record CY-0001 --command "<cmd>" --status passed|failed [--exit-code <n>] [--cwd <path>] [--log-file <path>] [--dry-run]
```

## Options

- `--command <cmd>`: Command that was run manually.
- `--status passed|failed`: Manual check result.
- `--exit-code <n>`: Exit code from the command.
- `--cwd <path>`: Directory where the command ran.
- `--log-file <path>`: Existing output file to append to the Changeyard check log.
- `--dry-run`: Show the record action without writing.

## Examples

```bash
cy check record CY-0001 --command "pnpm test" --status passed --exit-code 0
```
