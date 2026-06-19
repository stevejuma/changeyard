---
name: Start
command: cy start
summary: Create a task workspace and move the change into progress.
---

## Usage

```text
cy start CY-0001 [--dry-run] [--warmup]
```

## Options

- `--dry-run`: Show the workspace action without writing.
- `--warmup`: Run `workspace.hydrate.warmupCommand` after hydration. Falls back to `workspace.hydrate.installCommand` when no warmup command is configured.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy start CY-0001
cy start CY-0001 --warmup
cy start CY-0001 --dry-run
```

For JJ workspaces, `cy start` describes the workspace working-copy commit as `CY-0001: <change title>`. Keep every later workspace commit message prefixed with the same change id.

If workspace creation fails after creating partial state, `cy start` removes the incomplete workspace when it can do so safely. If an existing workspace needs inspection, run `cy repair CY-0001 --workspace`.

When a workspace contains `package.json` but no `node_modules`, start prints setup guidance instead of installing dependencies automatically.
