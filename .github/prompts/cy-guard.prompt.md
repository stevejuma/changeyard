---
name: Changeyard Guardrails
description: Inspect local workflow guardrails with implemented commands.
---

Inspect Changeyard workflow guardrails.

1. Identify the change id from context or run `cy list`.
2. Run `cy audit <id>` to inspect gates, blockers, expected cwd, and recovery commands.
3. Run `cy doctor` for repository-level configuration or workspace-state issues.
4. Run `cy workspace status <id>` when workspace or landing state is involved.
5. Do not use unpublished guard commands; follow the concrete Recovery entries printed by the implemented commands.
