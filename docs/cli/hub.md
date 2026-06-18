---
name: Hub
command: cy hub
summary: Manage the shared Changeyard UI/runtime hub used by dashboard, Kanban, VCS, and TUI clients.
---

## Usage

```text
cy hub start [--host <host>] [--port <port|auto>] [--project <path>] [--open|--no-open] [--json]
cy hub stop [--project <path>] [--json]
cy hub status [--project <path>] [--json]
cy hub restart [--host <host>] [--port <port|auto>] [--project <path>] [--open|--no-open] [--json]
```

## Commands

- `start`: Start the shared hub process.
- `status`: Show recorded hub process state.
- `restart`: Restart the shared hub process.
- `stop`: Stop the shared hub process.

## Options

- `--host <host>`: Bind host for the hub server.
- `--port <port|auto>`: Bind port or choose the next available port.
- `--project <path>`: Resolve Changeyard state from another repository path.
- `--open`: Open the matching browser client after start.
- `--no-open`: Start without opening a browser.
- `--json`: Print machine-readable output.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy hub start --no-open
cy hub status
cy hub restart
cy hub stop
cy --dashboard
cy --kanban
cy --vcs
```
