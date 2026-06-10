---
name: Changeyard Complete
description: Complete local work after checks and completion notes are ready.
---

Complete a Changeyard change locally.

1. Ensure Acceptance Criteria are completed or explicitly marked `Deferred: <reason>`.
2. Ensure Completion Notes are filled in and mention the checks or verification that ran.
3. Run `cy verify <id>` from the workspace.
4. Run `cy scope check <id>` when the change declares scope restrictions.
5. Run `cy complete <id>`. This is local-only and leaves the change at `ready_for_pr`.
6. If a review is needed, use `/cy-review` and fill Summary, Required Changes, and Inline Comments before approval.
7. Use `/cy-pr-create` only after review and only when pull request policy allows it.
