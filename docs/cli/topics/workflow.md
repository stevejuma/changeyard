---
name: workflow
---

# Workflow

The normal local lifecycle is `cy create`, `cy validate`, `cy sync`, `cy start`, `cy verify`, implementation in the verified workspace, `cy complete --no-pr`, then either `cy pr new` for provider PR review or `cy land` for local landing.

For non-trivial agent work, create a strict planned change:

```sh
cy create --template agent-task --planning openspec-lite --strict --title "<title>"
```

Use `cy quick` or `--no-planning` only for small, low-risk lite changes with no behavior, public API, storage/schema, provider/workspace lifecycle, UI workflow, or security-sensitive impact.

A change slice is one user-requested behavior tweak, bug fix, visual adjustment, or cleanup increment. After each completed slice, run focused validation and commit it with `cy slice commit <id> -m "<summary>"` before starting another requested slice unless the user explicitly asks for an uncommitted diff.

Commit often, complete rarely. Slice commits are the normal unit of manual review; `cy complete` is only for explicit completion wording such as "complete the Changeyard change", "mark ready", "ready for PR", or "complete and land".

Use `cy next <id>` when unsure which command is currently valid. Use `cy audit <id>` when a gate fails or an agent needs the full workflow context, blockers, expected cwd, and recovery commands.
