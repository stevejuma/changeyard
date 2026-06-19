# Kanban Remote Access

Changeyard binds the hub to localhost by default. This is intentional. The hub can read repository state, start local processes, and expose dashboard, Kanban, VCS, and TUI runtime APIs.

## Default Local Access

```sh
cy hub start
```

The default endpoint is `127.0.0.1:3484`. Opening Kanban through `cy --kanban` reuses the active default hub.

## Local Network Access

Only bind to all interfaces when the machine is on a trusted network:

```sh
cy hub start --host 0.0.0.0 --port 3484
```

Use `cy hub list` to confirm which process is active and which URL it serves.

## Preferred Remote Patterns

Prefer private, authenticated transport:

- SSH tunnel to `127.0.0.1:3484`.
- Tailscale or another private mesh network.
- Short-lived, access-controlled tunnel for a single review session.

Avoid long-running public unauthenticated tunnels. If you use one, kill the hub when finished:

```sh
cy hub list
cy hub kill <id>
```

## Dashboard Safety

The dashboard shows which instance is serving the page and can kill any known instance. Killing the current instance will stop the server that is serving the dashboard, so the page will disconnect.
