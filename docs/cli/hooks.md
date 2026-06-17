---
name: hooks
command: cy hooks
summary: Forward terminal-agent hook events to the local Changeyard runtime.
---

## Usage

```text
cy hooks ingest --event <event> [--task-id <id>] [--workspace-id <id>] [--workspace-path <path>]
cy hooks notify --event <event> [--activity-text <text>]
cy hooks codex-hook --event <event> [--external-session]
```

## Commands

- `ingest`: Send an explicit hook event to the runtime.
- `notify`: Send a best-effort notification hook event.
- `codex-hook`: Read Codex hook payload JSON from stdin and forward it.

## Options

- `--event <event>`: Runtime hook event to forward. [possible values: to_review, to_in_progress, activity]
- `--task-id <id>`: Change/task id when not running inside a Changeyard workspace.
- `--workspace-id <id>`: Runtime workspace id for the task session.
- `--workspace-path <path>`: Workspace path to report to the runtime.
- `--source <name>`: Agent/tool source metadata.
- `--activity-text <text>`: Human activity text for activity events.
- `--hook-event-name <name>`: Native agent hook event name.
- `--notification-type <name>`: Native notification type.
- `--external-session`: Register an external Codex session from hook payloads when possible. Prefer `cy session attach` when the agent already knows its session id.

## Examples

```sh
cy hooks ingest --event to_review
cy hooks notify --event activity --activity-text "Waiting for input"
cy hooks codex-hook --event activity --source codex
cy session attach --task-id task-1 --provider codex --session-id "$CODEX_THREAD_ID" --workspace-path "$PWD" --source cli
```
