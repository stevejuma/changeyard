---
name: Changeyard Audit
description: Audit a change against workflow gates and recovery guidance.
---

Audit one Changeyard change against the enforced workflow guardrails.

1. Identify the change id from context or run `cy list`.
2. Run `cy audit <id>`.
3. Review workflow mode, canonical path, expected cwd, next command, failed checks, blockers, and Recovery entries.
4. Treat failed checks as hard stops. Fix the canonical change document, workspace state, or completion context as directed.
5. Re-run `cy audit <id>` or `cy next <id>` after fixes to confirm the next valid command.
