---
name: workflow
---

# Workflow

The normal local lifecycle is `cy create`, `cy validate`, `cy sync`, `cy start`, `cy verify`, implementation in the verified workspace, `cy complete --no-pr`, and `cy land`.

For non-trivial agent work, create a strict planned change:

```sh
cy create --template agent-task --planning openspec-lite --strict --title "<title>"
```

Use `cy quick` or `--no-planning` only for small, low-risk lite changes with no behavior, public API, storage/schema, provider/workspace lifecycle, UI workflow, or security-sensitive impact.

For large or multi-step changes, make multiple logical commits inside the verified workspace so review can happen in smaller pieces. Every workspace commit message must start with the change id, for example `CY-0001: Add parser validation`.

Use `cy next <id>` when unsure which command is currently valid. Use `cy audit <id>` when a gate fails or an agent needs the full workflow context, blockers, expected cwd, and recovery commands.
