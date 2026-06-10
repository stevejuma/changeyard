---
name: /cy-scope
id: cy-scope
category: Changeyard
description: Check workspace changes against declared scope policy.
---

Check whether workspace changes stay inside the declared task scope.

1. Identify the change id from context or run `cy list`.
2. Run `cy scope check <id>` from inside the workspace checkout.
3. If scope check fails, stop bundling the unrelated work and create a new Changeyard change instead of forcing completion.
