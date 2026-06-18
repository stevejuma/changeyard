---
name: workflow
---

# Workflow

The normal local lifecycle is `cy create`, `cy validate`, `cy sync`, `cy start`, `cy verify`, implementation in the verified workspace, `cy complete --no-pr`, and `cy land`.

For non-trivial agent work, create a strict planned change:

```sh
cy create --template agent-task --planning openspec-lite --strict --title "<title>"
```

Use `cy quick` or `--no-planning` only for small, low-risk changes with no behavior, public API, storage/schema, provider/workspace lifecycle, UI workflow, or security-sensitive impact.

Use `cy next <id>` when unsure which command is currently valid.
