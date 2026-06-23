---
name: Changeyard Start
description: Create an isolated workspace and move the change to in_progress.
---

Start isolated work for a Changeyard change.

1. Ensure the change is ready/synced as required by project config.
2. Run `cy start <id>`.
3. Follow the printed `cd` path into the workspace checkout.
4. Run `cy verify <id>` from that checkout before editing files.
5. After each user-requested implementation increment, run focused validation and commit the slice with `cy slice commit <id> -m "<summary>"`.
6. Do not accumulate multiple requested iterations in one mutable JJ `@` or Git worktree unless the user explicitly asks for an uncommitted diff.
6. If start or verify fails, **halt** — use `cy audit <id>`, `cy workspace status <id>`, or `cy recover <id>` as directed before editing files.
