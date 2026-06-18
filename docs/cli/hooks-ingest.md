---
name: hooks ingest
command: cy hooks ingest
summary: Send an explicit terminal-agent hook event to the local runtime.
---

## Usage

```text
cy hooks ingest --event <event> [--task-id <id>] [--workspace-id <id>] [--workspace-path <path>]
```

## Options

- `--event <event>`: Runtime hook event to forward. [possible values: to_review, to_in_progress, activity]
- `--task-id <id>`: Change/task id when not running inside a Changeyard workspace.
- `--workspace-id <id>`: Runtime workspace id for the task session.
- `--workspace-path <path>`: Workspace path to report to the runtime.
- `--source <name>`: Agent/tool source metadata.

## Examples

```sh
cy hooks ingest --event to_review --task-id CY-0001
cy hooks ingest --event to_in_progress
```

