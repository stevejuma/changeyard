---
name: /cy-workspace-delete
id: cy-workspace-delete
category: Changeyard
description: Delete a Changeyard workspace after the task no longer needs it.
---

Delete a Changeyard workspace through the CLI.

1. Identify the change id from context or run `cy list`.
2. Confirm the change is no longer actively being edited.
3. Run `cy workspace delete <id>`.
4. Use `--force` only when the workspace is still marked `in_progress` and you intend to discard it.
