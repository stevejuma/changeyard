---
name: config
---

# Config

Project config lives under `.changeyard/config.jsonc`. Use `cy config --json` for machine-readable runtime config. Interactive config is available from the terminal UI with `cy --tui` and `/config`.

Scaffolded Changeyard files are ignored through the repository-local Git exclude file by default. Set `scaffold.trackGeneratedFiles` to `true` when those generated files should be tracked.
