---
name: Changeyard Start
description: Create an isolated workspace and move the change to in_progress.
---

Start isolated work for a Changeyard change.

1. Ensure the change is ready/synced as required by project config.
2. For `agent-task` changes, replace the placeholder `# Agent Plan` with concrete steps before starting.
3. Run `cy start <id>`.
4. Follow the printed `cd` path into the workspace checkout.
5. Run `cy verify <id>` from that checkout before editing files.
6. If verify fails, **halt** — do not edit files in the main repo or workspace until verify passes.
