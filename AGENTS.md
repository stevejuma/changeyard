# Changeyard Agent Protocol

Commit often, complete rarely.

- A change slice is one user-requested behavior tweak, bug fix, visual adjustment, or cleanup increment.
- After each user-requested implementation increment, run focused validation and commit the slice with `cy slice commit <id> -m "<summary>"` before starting another requested increment.
- Slice commit subjects must start with the change id, for example `CY-0002: Fix planner drag preview padding`, and the generated body should read like a compact PR description.
- Do not accumulate multiple user-requested iterations in one mutable JJ `@` or Git worktree unless the user explicitly asks for an uncommitted working diff.
- After each slice commit, report what changed and stop unless the user already provided the next requested change.
- Do not run `cy complete` for "looks good", "continue", or "next". Only run it on clear wording like "complete the Changeyard change", "mark this ready", "ready for PR", or "complete and land".
- `cy complete <id> --no-pr` is local completion. Use `cy pr new <id>` only when the user explicitly wants provider PR creation.
- For PR-backed changes, run `cy pr checks <id>` after the PR opens. Do not approve, close, or land while supported remote checks are pending, failed, cancelled, or unknown.
- When supported remote checks fail, run `cy pr fix <id> --failed` to save logs and reopen repair work, then commit the fix as a new slice.
- The final completion commit must summarize all completed slices, validation evidence, files, and follow-up context. If landing reports missing final context, run `cy describe final <id>` before `cy land`.
- Slice commits are the normal unit of manual review; `cy complete` is only for explicitly ending the task.
- Failure example: accumulating UI iterations, date picker work, drag preview work, and final cleanup into one landed commit is not acceptable for iterative review-heavy work.
