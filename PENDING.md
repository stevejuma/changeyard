# Pending and Incomplete Work

This file tracks known work that remains after the current Changeyard prototype. The core local-first workflow exists, but the items below should be completed before treating Changeyard as production-ready.

## 1. Live forge validation

Automated provider tests use a mocked HTTP transport. Before release, run live checks against disposable Forgejo, GitHub, and GitLab repositories.

- [x] Automate the checklist in `docs/live-forge-smoke.md` against disposable repositories.
- [x] Verify exact minimum token scopes for Forgejo, GitHub, and GitLab.
- [x] Create and clean up real issues, branches, PRs/MRs, and review comments.
- [x] Record live-smoke results in release notes.

## 2. Provider-native inline reviews

Inline review comments are parsed from markdown and included in provider review summaries, but they are not yet mapped to provider-native diff-position APIs.

- [x] Add GitHub native PR review comments with commit SHA, file path, line, and side/position metadata.
- [x] Add GitLab native merge request discussions with position payloads.
- [x] Add Forgejo/Gitea native review comments where supported.
- [x] Validate that inline comments refer to changed files and valid diff lines.
- [x] Keep summary-comment fallback for providers without native inline review support.

## 3. Runtime schema validation hardening

Changeyard has a lightweight internal schema validator for the current config schema. It is intentionally small and should be hardened if config complexity grows.

- [x] Add targeted tests for every branch in `src/config/schema.ts`.
- [x] Improve schema error messages with clearer suggestions and paths.
- [x] Decide whether to keep the internal validator or adopt a full JSON Schema implementation.
- [x] Validate generated `.changeyard/schema.json` against the runtime validator in tests.

## 4. Doctor and recovery expansion

`cy doctor` and `cy recover` now handle workspace marker drift, but they do not yet reconcile all Changeyard state.

- [x] Detect provider-state drift and stale remote issue/PR URLs.
- [x] Detect stale branches/bookmarks and dirty/conflicted workspaces across all engines.
- [x] Validate hydration markers and check logs.
- [x] Add repair plans or a guarded `cy doctor --fix` flow.
- [x] Recover interrupted `sync`, `complete`, and review publication operations.

## 5. VCS integration depth

Git worktree integration is covered with a real temporary Git repository, and jj coverage runs when jj is installed.

- [x] Ensure jj is installed in CI so jj integration coverage is always active.
- [x] Add Git remote push tests against a local bare remote.
- [x] Add jj bookmark push tests against a local remote.
- [x] Test branch/bookmark collisions, missing binaries, dirty workspaces, and conflict states.

## 6. Release automation

Release smoke scripts exist, but release publishing is still manual.

- [x] Add CI workflows for build, test, package dry-run, and live-smoke prerequisite checks.
- [x] Add an npm publish workflow with provenance/signing if desired.
- [x] Add changelog/versioning policy.
- [x] Add install-from-tarball smoke tests for the generated package.

## 7. CLI and UX polish

The CLI has command-specific help and JSON wrapping, but richer ergonomics remain.

- [x] Add examples to each command help message.
- [x] Add `--dry-run` to mutating commands.
- [x] Add `--verbose` and `--quiet` modes.
- [x] Standardize exit codes and machine-readable error taxonomy.
- [x] Expand structured JSON output for all commands.
