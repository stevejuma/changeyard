# Hub

The Changeyard hub is the shared local runtime for dashboard, Kanban, VCS, and TUI clients. It is global by default: one active instance serves all projects unless a command explicitly starts another endpoint.

## Instance Model

`cy hub start` starts the default hub or reuses the live active instance. The default endpoint is `127.0.0.1:3484`.

Changeyard stores the hub registry in app-global state under `CHANGEYARD_HOME`, not inside a single project. Each record includes:

- instance id
- process id
- URL, host, and port
- active/current markers
- start source
- project root that started it
- start time
- log path
- live or stale status

Dashboard, Kanban, VCS, and TUI launchers reuse the active default instance. Commands with explicit endpoint options, such as `cy hub start --port 3490`, are recorded as separate instances.

## CLI Controls

```sh
cy hub start --no-open
cy hub status
cy hub list
cy hub kill <id|pid|stale|all>
cy hub restart
cy hub stop
```

Use `cy hub list` to see every known live and stale process. Use `cy hub kill stale` to clean registry records for dead processes. Use `cy hub kill <id>` or `cy hub kill <pid>` to stop a specific live process.

## Dashboard Controls

The dashboard lists hub instances known to the registry. It marks:

- the active default instance
- the current instance serving the page
- live and stale records
- what started the process
- project root and log path

The dashboard can kill known instances through the same runtime API used by `cy hub kill`. Killing the current instance terminates the process serving the page, so expect the page connection to drop.

## Remote Access

The hub binds to localhost by default. Exposing it to a network gives remote users access to repository state and runtime actions. Only bind to another host when you understand that risk.

For local network access:

```sh
cy hub start --host 0.0.0.0 --port 3484
```

Prefer authenticated private networking, such as an SSH tunnel or Tailscale, over a public unauthenticated tunnel. If a public tunnel is unavoidable, keep it short-lived and kill the hub instance when finished.

```sh
cy hub list
cy hub kill <id>
```
