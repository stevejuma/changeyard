---
name: Changeyard Sync
description: Sync a validated change through the configured provider.
---

Sync a Changeyard change to its provider target.

1. Ensure the change is validated with `cy validate <id>`.
2. Run `cy sync <id>`.
3. If sync fails, **halt** — use the printed Recovery section or run `cy audit <id>`, fix the reported issue, and re-run sync before `cy start`.
4. Report provider output and updated change status.
