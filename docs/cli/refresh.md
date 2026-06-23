---
name: refresh
command: cy refresh
summary: Rebase a JJ workspace change onto the current target before landing.
---

# cy refresh

```bash
cy refresh CY-0001 [--target <ref>] [--dry-run]
```

## Options

- `--target <ref>`: Target branch or bookmark to refresh onto.
- `--dry-run`: Show the refresh action without writing.

## Examples

```bash
cy refresh CY-0001
cy refresh CY-0001 --target main --dry-run
```

Refresh is currently JJ-only. Run it when `cy land --dry-run` reports that the target moved.
