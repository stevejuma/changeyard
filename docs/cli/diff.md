---
name: Diff
command: cy diff
summary: Show focused Changeyard diffs.
---

## Usage

```text
cy diff slice <commit-or-change-id>
```

## Examples

```sh
cy diff slice abc123
```

`cy diff slice` shows the patch for one recorded Git commit or JJ change.
