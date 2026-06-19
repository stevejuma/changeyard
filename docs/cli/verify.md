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
