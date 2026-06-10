---
name: Changeyard Validate
description: Validate a Changeyard change document and lifecycle gates.
---

Validate the active Changeyard change.

1. Identify the target change id from context or run `cy list`.
2. Run `cy validate <id>`.
3. If validation fails, **halt** — fix the markdown/frontmatter issues and re-run validation.
4. Do not start implementation, sync, or workspace work until validation passes.
