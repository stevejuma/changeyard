---
name: Changeyard Complete
description: Complete local work after checks and completion notes are ready.
---

Complete a Changeyard change locally only when the user explicitly asks to complete, mark ready, ready for PR, or complete and land.

1. Ensure Completion Notes in the change markdown are filled in.
   They must summarize changed areas, checks run or not run, and remaining risks or follow-ups.
2. Review recorded slices with `cy review slices <id>`.
3. Run `cy verify <id>` from the workspace.
4. Run `cy complete <id> --no-pr` unless the user explicitly wants PR creation.
5. If completion fails, run `cy audit <id>` and follow the Recovery section.
6. If a review is needed, use `/cy-review` — do not skip filling the review markdown.

Do not run `cy complete` for "looks good", "continue", or "next"; commit another slice or wait for explicit completion wording.
