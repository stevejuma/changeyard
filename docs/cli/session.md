---
name: session
command: cy session
summary: Register external agent session metadata with the local runtime.
---

## Usage

```text
cy session attach --task-id <id> --provider <name> [options]
```

## Commands

- `attach`: Attach a provider session id, transcript path, resume command, and workspace metadata to a task session.

## Options

- `--task-id <id>`: Task id to associate with the external session.
- `--provider <name>`: External agent provider name, such as `codex`.
- `--session-id <id>`: Provider session/thread id. Optional.
- `--workspace-id <id>`: Runtime workspace id.
- `--workspace-path <path>`: Workspace path. Defaults to the current working directory.
- `--source <name>`: Source of the registration event, such as `cli`.
- `--json`: Print machine-readable output.

## Examples

```sh
cy session attach --task-id task-1 --provider codex --session-id "$CODEX_THREAD_ID" --workspace-path "$PWD" --source cli
cy session attach --task-id task-1 --provider other-agent --workspace-path "$PWD" --source cli
```
