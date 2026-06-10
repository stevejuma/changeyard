---
name: Changeyard Review
description: Start, write, and complete a markdown review for a change.
---

Review a completed Changeyard change.

1. Identify the change id from context or run `cy list`.
2. Run `cy review start <id>` to create `.changeyard/reviews/<id>/review-NNN.md`.
3. Edit the review file before completing:
   - **Summary** — what was reviewed, scope, risks, and decision rationale (replace the template placeholder).
   - **Required Changes** — check off items or mark none (e.g. `- [x] None`).
   - **Inline Comments** — optional `path/to/file.ts:42: comment` bullets, or write `None.`
4. Run `cy review complete <id> --decision approve|request-changes|reject` only after Summary is filled in.
5. Report the decision and any follow-up actions.

Gate protocol (hard stop): do not run `cy review complete` while Summary still says "Review the change here." — the CLI rejects empty template reviews.
