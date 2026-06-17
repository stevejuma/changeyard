---
name: hooks
---

# Hooks

Runtime hooks connect terminal agents back to the Changeyard runtime. Static agent commands, skills, and supported project hook files are installed by `cy init` and `cy update`. Cursor projects get `.cursor/hooks.json` plus `kanban-*` hook scripts, and Copilot projects get `.github/hooks/kanban.json`.

Task-session launchers can still inject extra environment when a session starts, but scaffolded project hooks use `cy hooks notify` so they can infer the task from the Changeyard workspace marker.

Hooks are no longer the only way to identify an external agent session. When an agent already knows its session id, register it directly:

```sh
cy session attach --task-id <task_id> --provider codex --session-id "$CODEX_THREAD_ID" --workspace-path "$PWD" --source cli
```

`cy hooks codex-hook --external-session` remains a fallback for Codex hook payloads and for transcript enrichment.

Use `cy hooks ingest --event <event>` for explicit hook forwarding. Available events are `to_review`, `to_in_progress`, and `activity`.
