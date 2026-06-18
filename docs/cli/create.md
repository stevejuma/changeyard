---
name: create
command: cy create
summary: Create a new local markdown change.
---

## Usage

```text
cy create --template <name> --title <title> [options]
cy create --quick --title <title> [options]
```

## Options

- `--template <name>`: Template to use. [possible values: agent-task, feature, bug, refactor, review, quick]
- `--title <title>`: Change title.
- `--priority <priority>`: Change priority.
- `--label <label>`: Add a label. Can be repeated.
- `--author <name>`: Override author.
- `--planning <model>`: Planning model. [possible values: none, openspec-lite]
- `--strict`: Enable strict planning gates.
- `--no-planning`: Disable planning for this change.
- `--dry-run`: Show the target path without writing.
- `--json`: Print the created change plus `data.sessionAttach`, a machine-readable follow-up command for external agent session registration.

## Agent Guidance

For non-trivial agent work, create a strict planned change with `--planning openspec-lite --strict`.

Use `cy quick` or `--no-planning` only for small, low-risk changes with no behavior, public API, storage/schema, provider/workspace lifecycle, UI workflow, or security-sensitive impact.

## Examples

```sh
cy create --template agent-task --planning openspec-lite --strict --title "Add workspace verification"
cy create --quick --title "Fix typo"
cy create --template agent-task --planning openspec-lite --strict --title "Add workspace verification" --json
```
