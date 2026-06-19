---
name: doctor
command: cy doctor
summary: Check Changeyard state, stale markers, provider drift, and workspace issues.
---

## Usage

```text
cy doctor [--json] [--fix] [--dry-run] [--verbose] [--delete-stale-completed-workspaces] [--check-completed-acceptance-criteria] [--waive-missing-jj-bookmarks] [--waive-stale-completed-reviews] [--stale-completed-days <days>]
```

## Options

- `--json`: Print machine-readable output.
- `--fix`: Apply supported repairs.
- `--dry-run`: Report repairs without writing.
- `--verbose`: Include additional notes.
- `--delete-stale-completed-workspaces`: With `--fix`, delete eligible clean workspaces for stale merged changes.
- `--check-completed-acceptance-criteria`: With `--fix`, check unresolved, non-deferred Acceptance Criteria items on completed changes.
- `--waive-missing-jj-bookmarks`: With `--fix`, record that completed or no-PR-needed JJ changes no longer require their missing bookmark.
- `--waive-stale-completed-reviews`: With `--fix`, mark stale completed changes without review artifacts as not requiring a review.
- `--stale-completed-days <days>`: Override `doctor.staleCompletedDays` for this run. Defaults to `3`.

Cleanup flags such as `--delete-stale-completed-workspaces`, `--check-completed-acceptance-criteria`, `--waive-missing-jj-bookmarks`, and `--waive-stale-completed-reviews` are human-directed archive repairs. Agents should not use them unless the user explicitly names the flag or asks for that exact cleanup.

## Examples

```sh
cy doctor
cy doctor --fix
cy doctor --fix --check-completed-acceptance-criteria --waive-missing-jj-bookmarks
cy doctor --fix --delete-stale-completed-workspaces --waive-stale-completed-reviews
cy doctor --fix --dry-run --delete-stale-completed-workspaces --stale-completed-days 7
cy doctor --json
```
