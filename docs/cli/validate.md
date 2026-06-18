---
name: Validate
command: cy validate
summary: Validate one change against templates, metadata, planning gates, and lifecycle rules.
---

## Usage

```text
cy validate CY-0001 [--gate document|sync|start|complete]
```

## Options

- `--gate <gate>`: Run validation for a lifecycle gate. [possible values: document, sync, start, complete]
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy validate CY-0001
cy validate CY-0001 --gate complete
```
