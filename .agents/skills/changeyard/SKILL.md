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
10. Start and complete a markdown review when needed

## Planning changes

- Planned changes use inline OpenSpec-lite sections in the same markdown file
- Check planning gates before `cy sync`, `cy start`, and `cy complete`
- Use `cy plan status <id>`, `cy plan prompt <id> <section>`, and strict-mode commands when planning is enabled

## Rules

- Do not treat forge issues or PRs as canonical state
- Do not bypass `cy verify` before editing in a workspace
- Prefer `cy doctor` when local Changeyard state looks inconsistent
- Use the `/cy-*` slash commands when available for the same workflows
