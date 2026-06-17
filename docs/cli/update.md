---
name: update
command: cy update
summary: Refresh bundled templates, skills, schemas, static agent commands, and supported project hook files.
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

`cy update` installs static scaffold artifacts. For file-backed agents, it also refreshes supported project hook files such as Cursor `.cursor/hooks.json` plus hook scripts and Copilot `.github/hooks/kanban.json`. Runtime-launched sessions can still inject extra task/session environment when needed.
