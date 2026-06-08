# Live forge smoke checks

Changeyard's automated provider tests use a mocked HTTP transport. Before a release that changes provider behavior, run a live smoke check against disposable Forgejo, GitHub, and GitLab repositories.

## Safety rules

- Use a disposable repository.
- Use a token with the smallest practical scope for creating issues, branches, pull requests / merge requests, and comments.
- Delete the test repository or test issue/PR artifacts after the run.
- Do not run this checklist against a production repository unless the repository owner explicitly approves it.

## Prerequisite helper

```bash
npm run smoke:forge -- github
npm run smoke:forge -- gitlab
npm run smoke:forge -- forgejo
```

The helper is intentionally non-destructive. It verifies that live-smoke mode is enabled and that the provider-specific environment variables are present.

## Enable live-smoke mode

```bash
export CHANGEYARD_LIVE_SMOKE=1
```

Provider variables:

- Forgejo: `FORGEJO_BASE_URL`, `FORGEJO_OWNER`, `FORGEJO_REPO`, `FORGE_TOKEN`
- GitHub: `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_TOKEN`
- GitLab: `GITLAB_OWNER`, `GITLAB_REPO`, `GITLAB_TOKEN`

## Manual checklist

1. Initialize a disposable local repository and run `cy init`.
2. Configure the target provider in `.changeyard/config.local.jsonc`.
3. Create and validate a change with `cy create` and `cy validate`.
4. Run `cy sync <id>` and verify the remote issue exists.
5. Run `cy start <id>`, edit inside the workspace, fill completion notes, and run `cy complete <id>`.
6. Verify the remote PR/MR exists and links back to the local change metadata.
7. Run `cy review start <id>`, add a summary and optional `# Inline Comments` bullets, then run `cy review complete <id> --decision approve`.
8. Verify the provider received the review summary / comment payload.
