---
name: init
command: cy init
summary: Create `.changeyard`, templates, skills, static agent commands, and supported project hook files.
---

## Usage

```text
cy init [--dry-run] [--tools all|none|<tool-id>[,<tool-id>...]]
```

## Options

- `--tools <selection>`: Agent tools to initialize. [possible values: cursor, claude, cline, codex, copilot, opencode, gemini, kiro, droid, all, none]
- `--dry-run`: Show what would be created without writing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy init
cy init --tools cursor,codex
cy init --tools all --dry-run
```

`cy init` creates Changeyard storage, bundled templates, agent skills, static commands, schemas, and supported project hook files. Cursor projects get `.cursor/hooks.json` plus `kanban-*` hook scripts, and Copilot projects get `.github/hooks/kanban.json`.

When the project is a Git repository, `cy init` also maintains a managed block in `.git/info/exclude` for Changeyard-generated files such as `.changeyard/`, `.agents/skills/changeyard/`, agent skills, static commands, and supported hook files. This keeps generated scaffold files out of normal project status by default without modifying the shared `.gitignore`.

Set `scaffold.trackGeneratedFiles` to `true` in `.changeyard/config.jsonc` to opt in to tracking those files. The next `cy update` removes the managed exclude block and legacy Changeyard hook exclude lines.
