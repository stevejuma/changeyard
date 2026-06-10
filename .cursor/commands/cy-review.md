---
name: /cy-review
id: cy-review
category: Changeyard
description: "Start, write, and complete a markdown review for a change."
---

Review a completed Changeyard change.

1. Identify the change id from context or run `cy list`.
2. Run `cy review start <id>` to create `.changeyard/reviews/<id>/review-NNN.md`.
3. Edit the review file before completing:
   - **Summary** — what was reviewed, scope, risks, and decision rationale (replace the template placeholder).
   - **Required Changes** — resolve checklist items or write `None.`
   - **Inline Comments** — valid `path/to/file.ts:42: comment` bullets, or write `None.`
4. Run `cy review complete <id> --decision approve|request-changes|reject` only after all three sections are filled.
5. Report the decision and any follow-up actions.

Gate protocol (hard stop): do not run `cy review complete` while the review still contains placeholder Summary, Required Changes, or Inline Comments content — the CLI rejects incomplete review templates.
