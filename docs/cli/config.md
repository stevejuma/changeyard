---
name: Config
command: cy config
summary: Print runtime config as JSON.
---

## Usage

```text
cy config --json [--project <path>]
```

## Options

- `--json`: Print machine-readable output.
- `--project <path>`: Resolve Changeyard state from another repository path.

## Examples

```sh
cy config --json
cy config --json --project /path/to/repo
```

## Scaffold Tracking

`cy init` writes Changeyard storage, bundled templates, agent skills, static commands, and supported project hook files. By default, Changeyard adds those generated paths to the repository-local Git exclude file at `.git/info/exclude`, so generated agent files do not appear as project changes.

Set `scaffold.trackGeneratedFiles` to `true` in `.changeyard/config.jsonc` when you want those generated files to be tracked by the repository:

```json
{
  "scaffold": {
    "trackGeneratedFiles": true
  }
}
```

The next `cy update` removes Changeyard's managed local exclude block. The setting is off by default.
