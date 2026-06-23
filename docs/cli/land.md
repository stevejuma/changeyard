---
name: Land
command: cy land
summary: Land ready workspace work into the local repository workflow.
---

## Usage

```text
cy land CY-0001 [--target <ref>] [--dry-run] [--keep-workspace]
```

## Options

- `--target <ref>`: Target branch or bookmark to land onto.
- `--dry-run`: Show the land action without writing.
- `--keep-workspace`: Keep the task workspace after landing.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy land CY-0001
cy land CY-0001 --target main --dry-run
```

For JJ workspaces, landing requires the recorded workspace change to have a rich final description with summary, slices, validation, files, and notes/follow-up sections. If `cy land --dry-run` reports `finalDescriptionValid: false`, run `cy describe final CY-0001` before landing.
