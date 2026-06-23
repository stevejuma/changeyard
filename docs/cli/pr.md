---
name: pr
command: cy pr
summary: Create and manage provider pull requests, checks, and failed check logs.
---

# cy pr

```bash
cy pr new CY-0001 [-m "<title>\n\n<body>" | -F <file>] [--draft|--ready] [--target <ref>] [--dry-run]
cy pr set-draft CY-0001 [--dry-run]
cy pr set-ready CY-0001 [--dry-run]
cy pr auto-merge CY-0001 [--off] [--dry-run]
cy pr template [<template-path>] [--dry-run]
cy pr checks CY-0001 [--json]
cy pr logs CY-0001 [--job <job-id> | --run <run-id> | --failed] [--output <path>]
cy pr fix CY-0001 [--job <job-id> | --failed] [--dry-run]
```

## Commands

- `new`: Publish the recorded workspace branch/bookmark and create a provider PR/MR for a locally completed `ready_for_pr` change.
- `set-draft`: Convert the provider PR/MR back to draft when supported.
- `set-ready`: Mark the provider PR/MR ready for review when supported.
- `auto-merge`: Enable provider auto-merge. Pass `--off` to disable when supported.
- `template`: List detected repository PR templates or select one for future `cy pr new` runs.
- `checks`: Show normalized remote PR check status for providers that support it.
- `logs`: Retrieve one remote check log. `--failed` works only when exactly one failed loggable check exists.
- `fix`: Save a failed check log under `.changeyard/workspaces/<id>/logs/remote/` and reopen the change for repair.

## Notes

`cy complete <id> --no-pr` is the local completion boundary. `cy pr new <id>` is the explicit provider PR creation boundary. If `-m` is provided, the first line is the PR title and the remaining lines are the body. If `-F` is provided, the file follows the same format. Without either flag, Changeyard uses the selected template plus the generated final description, or the generated final description alone.

Supported providers gate review approval and landing until remote PR checks pass. Unsupported providers report that checks are unavailable and do not block the local workflow.

## Examples

```bash
cy pr template
cy pr new CY-0001 --draft
cy pr set-ready CY-0001
cy pr auto-merge CY-0001
cy pr checks CY-0001
cy pr logs CY-0001 --failed --output /tmp/check.log
cy pr fix CY-0001 --failed
```
