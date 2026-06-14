---
name: changeyard
description: Use Changeyard lifecycle commands for structured local changes, workspaces, validation, and completion in this repository.
compatibility: Requires the cy CLI and a .changeyard/ project.
metadata:
  author: changeyard
  version: "1.0"
  generatedBy: "0.1.0"
---

# Changeyard Agent Protocol

Changeyard is the markdown-first local change workflow for this repository. Canonical state lives in `.changeyard/changes/*.md`.

## Required workflow for non-trivial code changes

1. Create a change: `cy create --template agent-task --title "<title>"`
2. Fill in the generated markdown plan and acceptance criteria
3. Validate: `cy validate <id>`
4. Sync if a provider is configured: `cy sync <id>`
5. Start an isolated workspace: `cy start <id>`
6. Verify workspace context before editing: `cy verify <id>`
7. Work only inside the verified workspace checkout
8. Update Completion Notes in the change markdown
9. Complete locally: `cy complete <id> --no-pr`
10. Review when needed: `cy review start <id>`, edit `.changeyard/reviews/<id>/review-NNN.md`, then `cy review complete <id> --decision <approve|request-changes|reject>`

## Review gate (hard stop)

- Do not run `cy review complete` until the review file **Summary** is written (not the template placeholder)
- Update **Required Changes** — check items off or explicitly mark none
- **Inline Comments** are optional; note findings or write `None.`
- Use `/cy-review` when available for the full review workflow

## Gate protocol (hard stops)

Lifecycle commands are **gates**, not suggestions. If any gate fails, **halt all implementation work** until that gate passes.

| Step | Gate | On failure |
| --- | --- | --- |
| 3 | `cy validate <id>` | Fix the change markdown; do not write product code |
| 4 | `cy sync <id>` | Fix sync errors; do not start or edit in a workspace |
| 5 | `cy start <id>` | Do not enter a workspace; use `cy doctor` |
| 6 | `cy verify <id>` | **Stop.** Do not edit files until verify passes from the workspace checkout |
| 9 | `cy complete <id>` | Fix reported blockers before completing |

When a gate fails:

- **Allowed:** diagnose and fix the gate itself, run `cy doctor`, report to the user and wait
- **Forbidden:** implementing in the main repo, working around a failed `cy verify`, or continuing because tests pass elsewhere

After `cy start`, all product edits belong **only** in the workspace checkout printed by start—not in the repository root where the change was created.

## Planning changes

- Planned changes use inline OpenSpec-lite sections in the same markdown file
- Check planning gates before `cy sync`, `cy start`, and `cy complete`
- Use `cy plan status <id>`, `cy plan prompt <id> <section>`, and strict-mode commands when planning is enabled

## Rules

- Do not treat forge issues or PRs as canonical state
- **Do not bypass or ignore failed gates** — especially `cy verify`
- Do not edit product code in the main repo after `cy start`; work only in the verified workspace checkout
- Prefer `cy doctor` when local Changeyard state looks inconsistent
- Use the `/cy-*` slash commands when available for the same workflows
