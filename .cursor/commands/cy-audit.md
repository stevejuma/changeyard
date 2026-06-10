---
name: /cy-audit
id: cy-audit
category: Changeyard
description: Inspect a change against workflow guardrails.
---

Audit one Changeyard change against the enforced workflow guardrails.

1. Identify the change id from context or run `cy list`.
2. Run `cy audit <id>`.
3. Expect audit to check plan readiness, completion notes, acceptance criteria, recorded verification, scope, review state, and PR policy.
4. Expect audit and doctor to call out stale publish tokens or missing sanctioned publish metadata when PR state exists.
5. Treat any reported failure as a real protocol gap and fix that gap through the canonical change, review, or workspace flow.
