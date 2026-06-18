---
name: planning
---

# Planning

Changeyard can store OpenSpec-lite planning sections inline in the change markdown.

For non-trivial agent work, use strict OpenSpec-lite planning:

```sh
cy create --template agent-task --planning openspec-lite --strict --title "<title>"
```

Use `cy plan status <id>` to inspect planning gates and find the next required planning action. Use `cy plan prompt <id> <section>` to generate focused planning prompts for missing or placeholder sections.

Use `cy plan strict enable <id>` only when converting an existing normal planned change to strict planning.

Use `cy audit <id>` when planning gates block sync, start, or completion; the audit output includes the exact marker section to edit and the follow-up validation command.
