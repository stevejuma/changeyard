# Pending and Incomplete Work

This file tracks known work that remains after the current Changeyard prototype. The core local-first workflow exists, but the items below should be completed before treating Changeyard as production-ready.

## 1. Live forge validation

Automated provider tests use a mocked HTTP transport. Before release, run live checks against disposable Forgejo, GitHub, and GitLab repositories.

- [ ] Automate the checklist in `docs/live-forge-smoke.md` against disposable repositories.
- [ ] Verify exact minimum token scopes for Forgejo, GitHub, and GitLab.
- [ ] Create and clean up real issues, branches, PRs/MRs, and review comments.
- [ ] Record live-smoke results in release notes.

## 2. Provider-native inline reviews

Inline review comments are parsed from markdown and included in provider review summaries, but they are not yet mapped to provider-native diff-position APIs.

- [ ] Add GitHub native PR review comments with commit SHA, file path, line, and side/position metadata.
- [ ] Add GitLab native merge request discussions with position payloads.
- [ ] Add Forgejo/Gitea native review comments where supported.
- [ ] Validate that inline comments refer to changed files and valid diff lines.
- [ ] Keep summary-comment fallback for providers without native inline review support.

## 3. Runtime schema validation hardening

Changeyard has a lightweight internal schema validator for the current config schema. It is intentionally small and should be hardened if config complexity grows.

- [ ] Add targeted tests for every branch in `src/config/schema.ts`.
- [ ] Improve schema error messages with clearer suggestions and paths.
- [ ] Decide whether to keep the internal validator or adopt a full JSON Schema implementation.
- [ ] Validate generated `.changeyard/schema.json` against the runtime validator in tests.

## 4. Doctor and recovery expansion

`cy doctor` and `cy recover` now handle workspace marker drift, but they do not yet reconcile all Changeyard state.

- [ ] Detect provider-state drift and stale remote issue/PR URLs.
- [ ] Detect stale branches/bookmarks and dirty/conflicted workspaces across all engines.
- [ ] Validate hydration markers and check logs.
- [ ] Add repair plans or a guarded `cy doctor --fix` flow.
- [ ] Recover interrupted `sync`, `complete`, and review publication operations.

## 5. VCS integration depth

Git worktree integration is covered with a real temporary Git repository, and jj coverage runs when jj is installed.

- [ ] Ensure jj is installed in CI so jj integration coverage is always active.
- [ ] Add Git remote push tests against a local bare remote.
- [ ] Add jj bookmark push tests against a local remote.
- [ ] Test branch/bookmark collisions, missing binaries, dirty workspaces, and conflict states.

## 6. Release automation

Release smoke scripts exist, but release publishing is still manual.

- [ ] Add CI workflows for build, test, package dry-run, and live-smoke prerequisite checks.
- [ ] Add an npm publish workflow with provenance/signing if desired.
- [ ] Add changelog/versioning policy.
- [ ] Add install-from-tarball smoke tests for the generated package.

## 7. CLI and UX polish

The CLI has command-specific help and JSON wrapping, but richer ergonomics remain.

- [ ] Add examples to each command help message.
- [ ] Add `--dry-run` to mutating commands.
- [ ] Add `--verbose` and `--quiet` modes.
- [ ] Standardize exit codes and machine-readable error taxonomy.
- [ ] Expand structured JSON output for all commands.
