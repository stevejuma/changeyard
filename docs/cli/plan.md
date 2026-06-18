---
name: plan
command: cy plan
summary: Inspect planning status, generate prompts, toggle strict mode, or manage adapter mirrors.
---

## Usage

```text
cy plan status <id> [--json]
cy plan prompt <id> <section> [--json]
cy plan strict enable <id> [--dry-run]
cy plan strict disable <id> [--dry-run]
cy plan export <id> --format <format> [--dry-run]
cy plan import <id> --format <format> [--dry-run]
```

## Commands

- `status`: Print planning status for a change.
- `prompt`: Generate a section-specific planning prompt.
- `strict`: Enable or disable strict planning.
- `export`: Export a planning mirror.
- `import`: Import a planning mirror.

## Options

- `--format <format>`: Planning adapter format. [possible values: openspec, speckit]
- `--json`: Print machine-readable output.
- `--dry-run`: Simulate mutating commands without writing.

## Examples

```sh
cy plan status CY-0001
cy plan prompt CY-0001 proposal
cy plan export CY-0001 --format openspec
```

