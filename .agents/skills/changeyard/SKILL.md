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

During repository setup, `cy init` and `cy update` seed provider defaults from recognized Git or JJ remotes when confidence is high, but keep explicit provider configuration intact.

## Required workflow for non-trivial code changes

1. Create a change: `cy create --template agent-task --title "<title>"`
2. Fill in the generated markdown plan and acceptance criteria
3. Ask for the next action whenever state is unclear: `cy next <id>`
4. Validate: `cy validate <id>`
5. Sync if a provider is configured: `cy sync <id>`
6. Fill in a concrete `# Agent Plan` before starting any `agent-task`
7. Start an isolated workspace: `cy start <id>`
8. Verify workspace context before editing: `cy verify <id>`
9. Work only inside the verified workspace checkout
10. Complete Acceptance Criteria and update Completion Notes with checks or verification evidence
11. Validate completion when all acceptance tasks are checked: `cy validate <id> --gate complete`
12. Complete locally: `cy complete <id> --no-pr`
13. Land completed workspace work into the default workflow: `cy land <id>`
14. Review when needed: `cy review start <id>`, edit `.changeyard/reviews/<id>/review-NNN.md`, then `cy review complete <id> --decision <approve|request-changes|reject>`
15. Inspect or delete finished workspaces through `cy workspace status <id>` and `cy workspace delete <id>`

## Review gate (hard stop)

- Do not run `cy review complete` until the review file **Summary** is written (not the template placeholder)
- Update **Required Changes** — resolve checklist items or explicitly write `None.`
- **Inline Comments** must be filled with valid bullets or `None.`
- Use `/cy-review` when available for the full review workflow

## Gate protocol (hard stops)

Lifecycle commands are **gates**, not suggestions. If any gate fails, **halt all implementation work** until that gate passes.

| Step | Gate | On failure |
| --- | --- | --- |
| 4 | `cy validate <id>` | Fix the change markdown; do not write product code |
| 5 | `cy sync <id>` | Fix sync errors; do not start or edit in a workspace |
| 7 | `cy start <id>` | Do not enter a workspace; fill `# Agent Plan` and use `cy doctor` if needed |
| 8 | `cy verify <id>` | **Stop.** Do not edit files until verify passes from the workspace checkout |
| 12 | `cy complete <id>` | Fix reported blockers before completing |
| 13 | `cy land <id>` | Fix workspace or root cleanliness errors before landing |

When a gate fails:

- **Allowed:** diagnose and fix the gate itself, run `cy doctor`, report to the user and wait
- **Forbidden:** implementing in the main repo, working around a failed `cy verify`, or continuing because tests pass elsewhere

After `cy start`, all product edits belong **only** in the workspace checkout printed by start—not in the repository root where the change was created.

## Planning changes

- Planned changes use inline OpenSpec-lite sections in the same markdown file
- Check planning gates before `cy sync`, `cy start`, and `cy complete`
- Use `cy plan status <id>`, `cy plan prompt <id> <section>`, and strict-mode commands when planning is enabled
- Use frontmatter `scope.allowedPaths`, `scope.deniedPaths`, and change budgets when the task needs machine-checkable scope enforcement

## Rules

- Do not treat forge issues or PRs as canonical state
- **Do not bypass or ignore failed gates** — especially `cy verify`
- Do not bundle unrelated requests into the active change when scope or task boundaries say otherwise
- Do not run direct PR creation commands or push workspace branches outside Changeyard lifecycle commands
- Do not edit product code in the main repo after `cy start`; work only in the verified workspace checkout
- Use `cy land <id>` to move completed workspace work into the default branch/bookmark
- Use `cy workspace delete <id>` for cleanup rather than deleting workspace folders manually
- Prefer `cy doctor` when local Changeyard state looks inconsistent
- Use the `/cy-*` slash commands when available for the same workflows
