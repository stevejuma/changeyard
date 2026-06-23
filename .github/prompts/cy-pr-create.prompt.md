---
name: Changeyard PR Create
description: Create a pull request explicitly after completion and review.
---

Create a pull request for a completed Changeyard change.

1. Identify the change id from context or run `cy list`.
2. Confirm the change is already completed locally and has status `ready_for_pr`.
3. Confirm the latest review is approved when review is required.
4. If the user wants provider PR creation, run `cy pr new <id>` from the repository root.
5. If the project is using the local landing flow, run `cy land <id>` from the repository root.
6. If PR or landing is blocked, run `cy audit <id>` and fix the reported policy, provider, or workspace issue instead of creating the PR directly.
