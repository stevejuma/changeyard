---
name: workspace
command: cy workspace
summary: Inspect or clean Changeyard task workspaces.
---

## Usage

```text
cy workspace status <id> [--json]
cy workspace list [--json]
cy workspace delete <id> [--dry-run] [--force]
```

## Commands

- `status`: Show workspace state and landability.
- `list`: List known workspaces.
- `delete`: Delete a workspace.

## Options

- `--json`: Print machine-readable output.
- `--dry-run`: Simulate deletion without writing.
- `--force`: Delete dirty unlanded workspaces.

## Examples

```sh
cy workspace status CY-0001
cy workspace list
cy workspace delete CY-0001 --dry-run
```

