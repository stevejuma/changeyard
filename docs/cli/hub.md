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
cy hub list [--project <path>] [--json]
cy hub kill <id|pid|stale|all> [--force] [--project <path>] [--json]
cy hub restart [--host <host>] [--port <port|auto>] [--project <path>] [--open|--no-open] [--json]
```

## Commands

- `start`: Start the shared hub process, or reuse the live global default instance.
- `status`: Show the active global hub process state.
- `list`: Show all known live and stale hub process records.
- `kill`: Terminate a known hub process by instance id or pid, or clean `stale` / `all` records.
- `restart`: Restart the active shared hub process.
- `stop`: Stop the active shared hub process.

## Options

- `--host <host>`: Bind host for the hub server.
- `--port <port|auto>`: Bind port or choose the next available port.
- `--project <path>`: Resolve Changeyard state from another repository path.
- `--open`: Open the matching browser client after start.
- `--no-open`: Start without opening a browser.
- `--force`: Use a forceful signal for `kill`.
- `--json`: Print machine-readable output.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Instance model

Changeyard tracks hub processes in app-global state under `CHANGEYARD_HOME` instead of under a project worktree. The default hub endpoint is a singleton: dashboard, Kanban, VCS, and TUI launches reuse the live active instance even when they are opened from different projects. Explicit alternate endpoints, such as `cy hub start --port 3490`, are recorded as separate instances.

`cy hub list` shows the active instance marker, pid, URL, start source, project root, start time, log path, and whether a record is live or stale. The dashboard exposes the same instance list and marks the process currently serving the page.

## Examples

```sh
cy hub start --no-open
cy hub status
cy hub list
cy hub kill stale
cy hub restart
cy hub stop
cy --dashboard
cy --kanban
cy --vcs
```
