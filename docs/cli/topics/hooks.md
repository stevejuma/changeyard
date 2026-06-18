---
name: hooks
---

# Hooks

Runtime hooks connect terminal agents back to the Changeyard runtime. Static agent commands and skills are installed by `cy init` and `cy update`; task-session hooks are generated when a session starts so they can include the current task id, workspace id, and runtime connection details.

Use `cy hooks ingest --event <event>` for explicit hook forwarding. Available events are `to_review`, `to_in_progress`, and `activity`.

