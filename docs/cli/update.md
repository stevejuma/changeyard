---
name: update
command: cy update
summary: Refresh bundled templates, skills, schemas, and static agent command artifacts.
---

## Usage

```text
cy update [--dry-run] [--tools all|none|<tool-id>[,<tool-id>...]]
```

## Options

- `--tools <selection>`: Agent tools to update. [possible values: cursor, claude, cline, codex, copilot, opencode, gemini, kiro, droid, all, none]
- `--dry-run`: Show what would be updated without writing.

## Examples

```sh
cy update
cy update --tools cursor,codex
cy update --tools all --dry-run
```

`cy update` installs static scaffold artifacts. Runtime task-session hooks are generated when a session starts because they need the current task and workspace environment.

