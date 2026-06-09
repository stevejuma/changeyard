---
id: CY-0002
title: Fix cy verify cwd and workspace path comparison
type: quick
status: approved
priority: low
labels:
  - quick
  - low-risk
author: stevejuma
createdAt: 2026-06-10T00:17:20.343Z
updatedAt: 2026-06-10T00:21:23.898Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0002
  path: .changeyard/workspaces/CY-0002/repo
branch:
  name: cy/CY-0002-fix-cy-verify-cwd-and-workspace-path-comparison
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: minimal
  lastRun: 2026-06-10T00:18:27.364Z
  lastStatus: passed
planning:
  model: none
workflow:
  mode: quick
  risk: low
  requiresWorkspace: true
---

# Summary

Fix `cy verify` so it works when run from inside a Changeyard workspace checkout via the installed `cy` launcher.

# Scope

- [x] Small, low-risk change
- [ ] No behavior change
- [ ] No public API change
- [ ] No storage/schema change
- [ ] No provider/workspace lifecycle change
- [ ] No UI workflow change
- [ ] No security-sensitive change

# Acceptance Criteria

- [x] `scripts/cy.mjs` preserves the caller's cwd when spawning the CLI
- [x] Workspace engines compare real paths so macOS `/var` vs `/private/var` does not fail verify
- [x] Regression test covers launcher cwd preservation
- [x] `cy verify <id>` succeeds from an active workspace using the global `cy` command

# Completion Notes

Checks ran: `npm run build:cli`; `node --test` for `cy launcher preserves caller cwd` and plain-copy verify tests; manually verified `cy verify CY-0001` from workspace using global `cy`.

Changes landed on main repo root (not workspace-isolated product code):

- `scripts/cy.mjs`: spawn CLI with `process.cwd()` instead of repo root
- `src/workspace/patterns.ts`: add `resolveComparablePath` / `pathInsideComparable`
- Workspace engines use comparable paths for verify boundary checks
- Added `cy launcher preserves caller cwd for verify inside a workspace` test

Completed with `--no-code-change` because this tooling fix intentionally lands on the repo root so the installed `cy` launcher works globally.