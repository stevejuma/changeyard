---
name: Changeyard Doctor
description: Check local Changeyard configuration and change health.
---

Run Changeyard diagnostics for the repository.

1. Run `cy doctor` from the repository root.
2. Summarize warnings/issues and suggest fixes.
3. Use `cy doctor --fix` only when the user asks to apply supported repairs.
4. Use stale cleanup flags only when explicitly requested: `--delete-stale-completed-workspaces` for clean merged workspaces, `--waive-stale-completed-reviews` for completed changes missing review artifacts, and `--stale-completed-days <days>` to override the default age threshold.
