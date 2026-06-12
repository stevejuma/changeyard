# TASKS: VCS UI Review Repair

Date: 2026-06-12

Objective: Repair the JJ VCS frontend so it uses copied Kanban UI primitives and shell conventions while keeping VCS behavior isolated in `packages/vcs`.

## Tracker Rules

- Do not mutate `plan-jjbuttler.md` or `tasks-jjbuttler.md`.
- Keep `packages/kanban` independent from `packages/vcs`.
- Copy UI primitives into `packages/vcs`; do not create a shared UI package in this pass.
- Keep backend changes limited to concrete review gaps.

## Current Status

- [x] Review findings recorded.
- [x] Repair implementation started.
- [x] Kanban UI foundation copied into `packages/vcs`.
- [x] VCS app refactored away from the custom shell.
- [x] Final full verification completed.

## M1: Review Records

Status: `completed`

- [x] Create `plan-review-jjbuttler.md`.
- [x] Create `tasks-review-jjbuttler.md`.
- [x] Record operations/restore endpoint decision.

## M2: Copy Kanban UI Foundation

Status: `completed`

- [x] Copy local `components/ui` primitives into `packages/vcs`.
- [x] Copy Kanban app error boundary into `packages/vcs`.
- [x] Copy Kanban theme globals into `packages/vcs`.
- [x] Add VCS package dependencies for copied Radix/Tailwind primitives.
- [x] Add Vite and TypeScript alias support for `@/*`.

## M3: Replace Custom Shell

Status: `completed`

- [x] Delete custom `styles.css`.
- [x] Add Kanban-style VCS shell with sidebar, top bar, and mobile nav.
- [x] Add shared dense panel, stat, key/value, diagnostics, loading, and empty states.
- [x] Wrap the app in copied error boundary and tooltip provider.

## M4: Split VCS App Modules

Status: `completed`

- [x] Move route resolution to `src/routes.ts`.
- [x] Move runtime response types to `src/runtime/types.ts`.
- [x] Move tRPC fetch/query/mutation hooks to `src/runtime/trpc-client.ts`.
- [x] Move operation helpers to `src/vcs-operations.ts`.
- [x] Move preview and submit dialogs to dedicated components.
- [x] Move landing, JJ board, branches, history, and settings views into dedicated modules.

## M5: Verification

Status: `in_progress`

- [x] `npm --workspace @changeyard/vcs run typecheck`
- [x] `npm --workspace @changeyard/vcs run test`
- [x] `npm --workspace @changeyard/vcs run build`
- [x] `npm run build`
- [x] Focused VCS runtime/UI server tests
- [x] Browser QA for flagged VCS routes

Verification notes:

- `npm --workspace @changeyard/vcs run typecheck` passed.
- `npm --workspace @changeyard/vcs run test` passed.
- `npm --workspace @changeyard/vcs run build` passed.
- `npm run build` passed.
- `node --test --test-force-exit dist/tests/ui-server.test.js --test-name-pattern='ui server serves the standalone VCS shell when CHANGEYARD_VCS=1 is enabled|ui server exposes vcs\\.'` passed.
- `npm test` passed: 177 tests, 0 failures.
- Browser QA loaded `/vcs/`, `/vcs/jj`, `/vcs/jj/branches`, `/vcs/jj/history`, and `/vcs/settings` against `http://127.0.0.1:4174` with screenshots in `/tmp/vcs-review-*.png`.
