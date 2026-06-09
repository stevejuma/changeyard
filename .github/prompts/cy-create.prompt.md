---
name: Changeyard Create
description: Create a structured Changeyard change before implementation work.
---

Create a new Changeyard change for non-trivial work.

1. Ask for a concise title if the user did not provide one.
2. Run `cy create --template agent-task --title "<title>"` from the repository root.
3. Open the generated markdown file under `.changeyard/changes/`.
4. Fill in Summary, Motivation, Plan, and Acceptance Criteria before editing code.
5. Tell the user the change id and next steps (`cy validate`, `cy sync`, `cy start`).
