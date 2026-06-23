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

1. Create a strict planned change: `cy create --template agent-task --planning openspec-lite --strict --title "<title>"`
2. Fill in Summary, Motivation, Plan, Acceptance Criteria, and the generated planning sections
3. Validate: `cy validate <id>`
4. Sync if a provider is configured: `cy sync <id>`
5. Start an isolated workspace: `cy start <id>`
6. Verify workspace context before editing: `cy verify <id>`
7. Work only inside the verified workspace checkout
8. After each user-requested implementation increment, run focused validation and commit the slice with `cy slice commit <id> -m "<summary>"`
9. Update Completion Notes in the change markdown with changed areas, checks run, and remaining risks or follow-ups
10. Complete locally only on explicit user completion wording: `cy complete <id> --no-pr`; planned changes stop here until the user explicitly confirms landing
11. Create a provider PR only when explicitly requested: `cy pr new <id>`
12. Review when needed: `cy review start <id>`, edit `.changeyard/reviews/<id>/review-NNN.md`, then `cy review complete <id> --decision <approve|request-changes|reject>`

## Review gate (hard stop)

- Do not run `cy review complete` until the review file **Summary** is written (not the template placeholder)
- Update **Required Changes** — check items off or explicitly mark none
- **Inline Comments** are optional; note findings or write `None.`
- Use `/cy-review` when available for the full review workflow

## Landing policy

- Commit often, complete rarely. Slice commits are the normal unit of manual review; `cy complete` is only for explicitly ending the task.
- Do not run `cy complete <id> --no-pr` for "looks good", "continue", or "next". Only run it on clear wording like "complete the Changeyard change", "mark this ready", "ready for PR", or "complete and land".
- `cy complete <id> --no-pr` is the explicit stopping point for planned/OpenSpec-lite changes; it writes the final PR-style JJ landing description, then agents report `ready_for_pr` and wait
- `cy pr new <id>` is the explicit provider PR creation step after local completion; do not rerun `cy complete` to create a PR
- For PR-backed changes, run `cy pr checks <id>` after the PR opens. Supported remote checks must pass before `cy review complete <id> --decision approve` or `cy land <id>`.
- If supported remote checks fail, run `cy pr fix <id> --failed` to save logs under `.changeyard/workspaces/<id>/logs/remote/`, reopen repair work, and commit the fix as a new slice.
- Do not run `cy land <id>` for planned/OpenSpec-lite or legacy unplanned changes unless the user explicitly confirms landing in the current conversation, for example "land it", "merge it", or "run cy land"
- Quick low-risk changes may land after successful checks when the user's task clearly asks for completion and no hold, review, or PR was requested
- When unsure, run `cy next <id>`, report its landing confirmation guidance, and wait

## Gate protocol (hard stops)

Lifecycle commands are **gates**, not suggestions. If any gate fails, **halt all implementation work** until that gate passes.

| Step | Gate | On failure |
| --- | --- | --- |
| 3 | `cy validate <id>` | Fix the change markdown; do not write product code |
| 4 | `cy sync <id>` | Fix sync errors; do not start or edit in a workspace |
| 5 | `cy start <id>` | Do not enter a workspace; use `cy doctor` |
| 6 | `cy verify <id>` | **Stop.** Do not edit files until verify passes from the workspace checkout |
| PR | `cy pr checks <id>` | Use `cy pr fix <id> --failed`; do not approve or land until supported checks pass |
| 9 | `cy complete <id>` | Fix reported blockers before completing |

When a gate fails:

- **Allowed:** diagnose and fix the gate itself, run `cy audit <id>`, `cy next <id>`, `cy workspace status <id>`, `cy recover <id>`, or `cy doctor` as directed, report to the user and wait
- **Forbidden:** implementing in the main repo, working around a failed `cy verify`, or continuing because tests pass elsewhere

After `cy start`, all product edits belong **only** in the workspace checkout printed by start—not in the repository root where the change was created.

## Change slices

- A change slice is one user-requested behavior tweak, bug fix, visual adjustment, or cleanup increment.
- Before starting a new requested slice, commit the previous completed slice if it changed code.
- Use `cy slice commit <id> -m "<summary>"` after focused validation. Slice subjects must start with the change id, for example `CY-0001: Add parser validation`, and the generated body should read like a compact PR description with summary, validation, files, and notes.
- The final completion commit must summarize all completed slices and validation evidence. If `cy land --dry-run` reports `finalDescriptionValid: false`, run `cy describe final <id>` before landing.
- Do not accumulate multiple user-requested iterations in one mutable JJ `@` or Git worktree unless the user explicitly asks for an uncommitted working diff.
- After each slice commit, report what changed and stop unless the user already provided the next requested change. Completion remains separate from committing.
- Failure example: accumulating UI iterations, date picker work, drag preview work, and final cleanup into one landed commit is not acceptable for iterative review-heavy work.

## Planning changes

- Non-trivial agent work must use strict OpenSpec-lite planning: `cy create --template agent-task --planning openspec-lite --strict --title "<title>"`
- Use `cy quick` or `--no-planning` only for small, low-risk changes with no behavior, public API, storage/schema, provider/workspace lifecycle, UI workflow, or security-sensitive impact
- Planned changes use inline OpenSpec-lite sections in the same markdown file
- Check planning gates before `cy sync`, `cy start`, and `cy complete`
- Use `cy plan status <id>` to find the next planning gate and `cy plan prompt <id> <section>` to draft missing sections
- Use `cy audit <id>` when a gate fails or the next recovery step is unclear
- Use `cy plan strict enable <id>` only when converting an existing normal planned change to strict planning
- Doctor cleanup flags such as `--delete-stale-completed-workspaces`, `--check-completed-acceptance-criteria`, `--waive-missing-jj-bookmarks`, and `--waive-stale-completed-reviews` are human-directed archive repairs. Agents must not use them unless the user explicitly names the flag or asks for that exact cleanup.

## Rules

- Do not treat forge issues or PRs as canonical state
- **Do not bypass or ignore failed gates** — especially `cy verify`
- Do not edit product code in the main repo after `cy start`; work only in the verified workspace checkout
- Prefer `cy doctor` when local Changeyard state looks inconsistent
- Use the `/cy-*` slash commands when available for the same workflows
