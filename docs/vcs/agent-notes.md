# Agent Notes For VCS Work

Use this checklist when modifying the VCS app, especially the JJ provider.

## Boundaries

- UI code emits neutral operations from `packages/vcs/src/vcs-workspace-contracts.ts`.
- UI code should not construct JJ commands or revsets.
- Provider mechanics belong under `src/vcs/jj/*` or another provider-specific backend module.
- Drag/drop translation belongs in `packages/vcs/src/vcs-workspace-dnd.ts`.
- Runtime schemas must be updated when shared VCS contracts change.
- Project config `vcsAppliedStacks` is UI/persistence state. JJ repository membership is implemented by rebasing `@` parents.

## Add Or Change A JJ Operation

1. Add or adjust the neutral operation type if needed.
2. Add capability gating in the shared contract.
3. Add UI construction in the relevant interaction path.
4. Add preview support in the JJ workspace engine.
5. Add apply support in the JJ workspace engine.
6. Return affected stack ids, commit ids, and paths.
7. Add backend unit tests with mocked command runners.
8. Add disposable JJ repository integration tests for destructive rewrites.
9. Add or update Playwright fixture coverage when UI behavior changes.
10. Update these docs.

## Required Safety Checks

- Preview must not mutate repository state.
- Apply must reject unsupported selections before running commands.
- File and hunk selections must preserve unrelated hunks and files.
- Temporary files and temporary JJ changes must be cleaned up.
- Stale previews must not apply.
- Failed applies must return diagnostics and recovery instructions.
- Do not broaden `supportsHunkSelection` unless every hunk operation is implemented or explicitly gated.

## Test Commands

Useful focused commands:

```sh
pnpm run build:cli
node --test dist/tests/vcs-jj-workspace.test.js
node --test dist/tests/vcs-jj-preview.test.js dist/tests/vcs-jj-apply.test.js
node --test --test-name-pattern "workspace stack membership|committed hunk discard" dist/tests/vcs-jj-integration.test.js
pnpm --filter @changeyard/vcs run test
pnpm --filter @changeyard/vcs run typecheck
pnpm --filter @changeyard/vcs run e2e -- --grep "Workspace applies and unapplies"
pnpm --filter @changeyard/kanban run typecheck
git diff --check
```

Run broader E2E when changing shared helpers like `ensureStackApplied`, preview policy, drag/drop payloads, or Workspace selection behavior:

```sh
pnpm --filter @changeyard/vcs run e2e
```

## Common Pitfalls

- The Workspace commit card often uses display commit hashes for diff loading, while neutral operations usually need JJ change ids.
- `undo` and `redo` are repository-scoped JJ operations, not Changeyard-scoped operations.
- Applying a stack is not only UI state. The JJ provider rebases `@` parents, so it must be previewed.
- Committed hunk discard is destructive and should stay high-risk in previews.
- Git and JJ may share neutral operations but do not share provider semantics.
- Loading states should use skeleton placeholders that approximate the final layout. Avoid progress bars or visible "Loading..." rows for ordinary VCS data loads.
