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
3. Validate: `cy validate <id>`
4. Sync if a provider is configured: `cy sync <id>`
5. Fill in a concrete `# Agent Plan` before starting any `agent-task`
6. Start an isolated workspace: `cy start <id>`
7. Run `cy scope check <id>` when scope restrictions are configured
8. Verify workspace context before editing: `cy verify <id>`
9. Work only inside the verified workspace checkout
10. Complete Acceptance Criteria and update Completion Notes with checks or verification evidence
11. Complete locally: `cy complete <id>`
12. Review when needed: `cy review start <id>`, edit `.changeyard/reviews/<id>/review-NNN.md`, then `cy review complete <id> --decision <approve|request-changes|reject>`
13. Create a PR only through `cy pr create <id>` when pull request policy allows it
14. Delete finished workspaces through `cy workspace delete <id>` when cleanup is desired
15. Run `cy audit <id>` when you need a protocol-level status check
16. Install publish guards with `cy guard install` when the repo wants local enforcement of sanctioned publish paths

## Review gate (hard stop)

- Do not run `cy review complete` until the review file **Summary** is written (not the template placeholder)
- Update **Required Changes** — resolve checklist items or explicitly write `None.`
- **Inline Comments** must be filled with valid bullets or `None.`
- Use `/cy-review` when available for the full review workflow

## Gate protocol (hard stops)

Lifecycle commands are **gates**, not suggestions. If any gate fails, **halt all implementation work** until that gate passes.

| Step | Gate | On failure |
| --- | --- | --- |
| 3 | `cy validate <id>` | Fix the change markdown; do not write product code |
| 4 | `cy sync <id>` | Fix sync errors; do not start or edit in a workspace |
| 6 | `cy start <id>` | Do not enter a workspace; fill `# Agent Plan` and use `cy doctor` if needed |
| 8 | `cy verify <id>` | **Stop.** Do not edit files until verify passes from the workspace checkout |
| 11 | `cy complete <id>` | Fix reported blockers before completing |

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
- In JJ repositories, remember that local publish enforcement is best-effort and depends on the `.changeyard/bin` PATH shims from `cy guard install`
- Do not edit product code in the main repo after `cy start`; work only in the verified workspace checkout
- Prefer `cy doctor` when local Changeyard state looks inconsistent
- Use the `/cy-*` slash commands when available for the same workflows
