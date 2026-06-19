---
name: Changeyard Doctor
description: Check local Changeyard configuration and change health.
---

Run Changeyard diagnostics for the repository.

1. Run `cy doctor` from the repository root.
2. Summarize warnings/issues and suggest fixes.
3. Use `cy doctor --fix` only when the user asks to apply supported repairs.
4. Do not use cleanup flags unless the user explicitly names the flag or asks for that exact cleanup. Human-directed cleanup flags include `--delete-stale-completed-workspaces`, `--check-completed-acceptance-criteria`, `--waive-missing-jj-bookmarks`, `--waive-stale-completed-reviews`, and `--stale-completed-days <days>`.
