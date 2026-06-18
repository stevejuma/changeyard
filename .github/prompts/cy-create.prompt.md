---
name: Changeyard Create
description: Create a structured Changeyard change before implementation work.
---

Create a new strict planned Changeyard change for non-trivial work.

1. Ask for a concise title if the user did not provide one.
2. Run `cy create --template agent-task --planning openspec-lite --strict --title "<title>"` from the repository root.
3. Use `cy quick` or `--no-planning` only for small, low-risk changes with no behavior, public API, storage/schema, provider/workspace lifecycle, UI workflow, or security-sensitive impact.
4. Open the generated markdown file under `.changeyard/changes/`.
5. Fill in Summary, Motivation, Plan, Acceptance Criteria, and the generated planning sections before editing code.
6. Run `cy plan status <id>` and use `cy plan prompt <id> <section>` when a planning section needs drafting.
7. Run `cy audit <id>` if any gate is unclear or fails.
8. Tell the user the change id and next steps (`cy validate`, `cy sync`, `cy start`).
