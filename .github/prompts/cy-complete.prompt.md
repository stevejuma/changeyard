---
name: Changeyard Complete
description: Complete local work after checks and completion notes are ready.
---

Complete a Changeyard change locally.

1. Ensure Completion Notes in the change markdown are filled in.
2. Run `cy verify <id>` from the workspace.
3. Run `cy complete <id> --no-pr` unless the user explicitly wants PR creation.
4. If a review is needed, use `/cy-review` — do not skip filling the review markdown.
