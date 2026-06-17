---
name: session attach
command: cy session attach
summary: Attach external agent session metadata to a task session.
---

## Usage

```text
cy session attach --task-id <id> --provider <name> [--session-id <id>] [--workspace-path <path>]
```

## Options

- `--task-id <id>`: Required task id to update.
- `--provider <name>`: Required external agent provider name. Use `codex` for Codex.
- `--session-id <id>`: Optional provider session/thread id.
- `--transcript-path <path>`: Optional transcript file path for the external session.
- `--resume-command <command>`: Optional command used to resume the external session.
- `--workspace-id <id>`: Runtime workspace id. Used before `--workspace-path` when both are provided.
- `--workspace-path <path>`: Runtime workspace path. Defaults to the current working directory.
- `--source <name>`: Source of this registration event, such as `cli`.
- `--json`: Print machine-readable output.

## Behavior

The command records `externalSession` directly through the runtime API. For Codex, when `--session-id` is provided and `--resume-command` is omitted, Changeyard stores `codex resume <session-id>` as the resume command.

`--session-id` is optional so agents can still record provider and source metadata when no stable id is available.

## Examples

```sh
cy session attach --task-id task-1 --provider codex --session-id "$CODEX_THREAD_ID" --workspace-path "$PWD" --source cli
cy session attach --task-id task-1 --provider codex --workspace-id workspace-1 --json
```
