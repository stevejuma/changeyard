---
change: CY-0001
review: 1
reviewer: stevejuma
status: approved
createdAt: 2026-06-10T00:28:55.479Z
commitBased: false
completedAt: 2026-06-10T00:29:00.560Z
---

# Summary

Reviewed Cursor Agent CLI integration in the kanban runtime stack. The change adds `cursor` as a first-class runtime agent (binary `agent`) following the existing adapter pattern: catalog/contract updates, `cursorAdapter` with workspace/autonomous/plan/resume flags, `.cursor/hooks.json` lifecycle wiring with cleanup, settings/onboarding surfacing, and Linear MCP guidance in append-system-prompt.

Unit tests cover catalog launch support and adapter argument mapping (`agent-catalog.test.ts`, `agent-session-adapters.cursor.test.ts`). Checks passed from the CY-0001 workspace (`cy verify`, typecheck, vitest). Existing agents and scaffold artifacts are unaffected.

Deferred items are documented and acceptable: output transition heuristics (hooks cover primary lifecycle) and manual `cy ui` smoke. Approved for merge.

# Required Changes

- [x] None blocking merge — deferred smoke test and output heuristics noted in change Completion Notes.

# Inline Comments

None.
