---
change: CY-0002
review: 1
reviewer: stevejuma
status: approved
createdAt: 2026-06-10T00:21:15.878Z
commitBased: false
completedAt: 2026-06-10T00:21:23.897Z
---

# Summary

Reviewed the tooling fix that makes `cy verify` work when invoked via the global `cy` launcher from inside an active workspace checkout.

Scope is narrow and well targeted: `scripts/cy.mjs` now preserves the caller's cwd instead of forcing the repo root, and workspace boundary checks use comparable real paths so macOS `/var` vs `/private/var` symlinks no longer fail verify. A regression test covers launcher cwd preservation; existing plain-copy verify tests still pass.

Risk is low — no product API, storage, or UI behavior changes. Acceptance criteria are met. Approved with no follow-up code changes required.

# Required Changes

- [x] None — change meets acceptance criteria as implemented.

# Inline Comments

None.

# Quick Change Context

- Mode: quick
- Planning: none
- Risk: low
- Checks profile: minimal
- Canonical local file: `.changeyard/changes/CY-0002-fix-cy-verify-cwd-and-workspace-path-comparison.md`
