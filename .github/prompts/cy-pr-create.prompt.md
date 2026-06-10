---
name: Changeyard PR Create
description: Create a pull request explicitly after completion and review.
---

Create a pull request for a completed Changeyard change.

1. Identify the change id from context or run `cy list`.
2. Confirm the change is already completed locally with `cy complete <id>`.
3. Confirm the latest review is approved when review is required.
4. Run `cy pr create <id>`.
5. If PR creation is blocked, fix the reported policy or provider issue instead of creating the PR directly.
