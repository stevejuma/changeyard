# Live forge smoke checks

Run the automated provider checks against disposable repos before releases and before merging any provider-path changes.

## Required environment

```bash
export CHANGEYARD_LIVE_SMOKE=1
```

Optional scope diagnostics:

```bash
export CHANGEYARD_LIVE_SMOKE_SCOPE_CHECK=1
```

Provider variables:

- GitHub
  - `GITHUB_OWNER`
  - `GITHUB_REPO`
  - `GITHUB_TOKEN`
- GitLab
  - `GITLAB_OWNER`
  - `GITLAB_REPO`
  - `GITLAB_TOKEN`
- Forgejo
  - `FORGEJO_BASE_URL`
  - `FORGEJO_OWNER`
  - `FORGEJO_REPO`
  - `FORGE_TOKEN`

Run one provider:

```bash
node scripts/live-forge-smoke.mjs github
node scripts/live-forge-smoke.mjs gitlab
node scripts/live-forge-smoke.mjs forgejo
```

Each run:

1. Initializes a disposable local git repo.
2. Initializes changeyard and writes a provider-local config.
3. Creates a changeyard issue/change path and syncs it.
4. Starts a workspace and marks completion.
5. Starts and completes a review.
6. Verifies remote issue/PR/MR/review artifacts are reachable.
7. Checks review comments landed and records a pass/fail line in `docs/release-notes.md`.

## Token scope guidance

Use the following minimum scopes to satisfy the automated smoke checks:

- GitHub: `repo`, `read:user`, `user:email` (or equivalent fine-grained token capabilities for code + issues + pull requests).
- GitLab: `api` scope.
- Forgejo: repository write access plus write permissions for issues and pull requests.

## Cleanup

Set `CHANGEYARD_KEEP_LIVE_ARTIFACTS=1` to keep remote branches for manual inspection.
Without it, branches and remote artifacts are best-effort cleaned up and temporary directories are removed.

## Exit criteria

- Exit code `0` only when remote issue/PR/MR/review assets are reachable and the change lifecycle completes end-to-end.
- Failures append a detail line to `docs/release-notes.md`.
