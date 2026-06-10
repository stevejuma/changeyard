---
name: /cy-guard
id: cy-guard
category: Changeyard
description: Install or inspect local publish guards.
---

Install or inspect Changeyard publish guards.

1. Run `cy guard status` to inspect the current guard mode and install state.
2. Run `cy guard install` to install the default guard for the active VCS.
3. Use `cy guard install --vcs git` for a managed Git `pre-push` hook.
4. Use `cy guard install --vcs jj` to install JJ-focused PATH shims under `.changeyard/bin/`.
5. In JJ repositories, add `.changeyard/bin` to `PATH` for agent sessions or the shim enforcement will not run.
