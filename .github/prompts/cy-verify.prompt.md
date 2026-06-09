---
name: Changeyard Verify
description: Verify the current directory is the expected Changeyard workspace.
---

Verify workspace context before making code changes.

1. Run `cy verify <id>` from inside the expected workspace checkout.
2. If verification fails, return to the workspace path printed by `cy start <id>`.
3. Only edit files inside the verified workspace.
