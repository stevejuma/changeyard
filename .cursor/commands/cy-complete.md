---
name: /cy-complete
id: cy-complete
category: Changeyard
description: Complete local work after checks and completion notes are ready.
---

Complete a Changeyard change locally.

1. Ensure Completion Notes in the change markdown are filled in.
2. Run `cy verify <id>` from the workspace.
3. Run `cy complete <id> --no-pr` unless the user explicitly wants PR creation.
4. Summarize checks, risks, and follow-up review steps.
