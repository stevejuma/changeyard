---
name: Verify
command: cy verify
summary: Verify the current directory is the expected writable task workspace.
---

## Usage

```text
cy verify CY-0001
```

## Options

- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy verify CY-0001
```

For JJ workspaces, verify also checks that every commit in the landing stack has a non-empty description whose first line starts with the change id, for example `CY-0001: Add parser validation`.

If the workspace has `package.json` but no `node_modules`, verify prints a setup suggestion such as `pnpm install --offline`. Verification still succeeds when the workspace structure is valid.

Verification ends with the same context-aware recommendation as `cy next`: commit dirty slice work, review clean committed slices, complete fully reviewed work, or land work already marked ready.
