---
name: help
command: cy help
summary: Print command help or markdown-backed help topics.
---

## Usage

```text
cy help [command] [subcommand]
cy help -k <topic>
cy <command> --help
```

## Options

- `-k <topic>`: Show a markdown-backed help topic. [possible values: hooks, workflow, planning, tools, color, config]
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy help hooks
cy hooks ingest --help
cy help -k color
```

