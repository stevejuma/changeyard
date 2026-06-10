---
name: /cy-verify
id: cy-verify
category: Changeyard
description: Verify the current directory is the expected Changeyard workspace.
---

Verify workspace context before making code changes.

1. Run `cy verify <id>` from inside the expected workspace checkout.
2. If verification fails, **halt all implementation work.** Do not edit files in the main repo or workspace.
3. Diagnose with `cy doctor` or fix the workspace/CLI issue, then re-run verify from the path printed by `cy start <id>`.
4. Only edit files inside the verified workspace after verify passes.
