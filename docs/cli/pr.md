---
name: pr
command: cy pr
summary: Inspect remote pull request checks and retrieve failed check logs.
---

# cy pr

```bash
cy pr checks CY-0001 [--json]
cy pr logs CY-0001 [--job <job-id> | --run <run-id> | --failed] [--output <path>]
cy pr fix CY-0001 [--job <job-id> | --failed] [--dry-run]
```

## Commands

- `checks`: Show normalized remote PR check status for providers that support it.
- `logs`: Retrieve one remote check log. `--failed` works only when exactly one failed loggable check exists.
- `fix`: Save a failed check log under `.changeyard/workspaces/<id>/logs/remote/` and reopen the change for repair.

## Notes

Supported providers gate review approval and landing until remote PR checks pass. Unsupported providers report that checks are unavailable and do not block the local workflow.

## Examples

```bash
cy pr checks CY-0001
cy pr logs CY-0001 --failed --output /tmp/check.log
cy pr fix CY-0001 --failed
```
