# Changeyard Versioning Policy

## Scope

Changeyard follows [Semantic Versioning](https://semver.org/) for public behavior and
the packaged CLI/API compatibility guarantees:

- `MAJOR`: Breaking changes in config schema, generated change format, or CLI commands.
- `MINOR`: New provider/workflow capabilities and backward-compatible features.
- `PATCH`: Bugfixes, validation improvements, and internal refactors with no breaking behavior changes.

## Release Workflow

1. Merge provider and release-related changes into the mainline branch.
2. Ensure `npm test` and `npm run pack:check` pass in CI.
3. Record smoke check outcome and notable migration notes in `docs/release-notes.md`.
4. Cut a Git tag using SemVer (`vX.Y.Z`) and publish through the release workflow.

## Changelog Expectations

- Document notable behavior changes before bumping `MAJOR` or `MINOR`.
- Include any new minimum required provider permissions and config migration notes.
- Keep `CHANGELOG.md` as the canonical human-readable summary.

## JSON Schema Validation

- Continue using the internal lightweight validator for now.
- Reassess against the full JSON Schema implementation if `src/config/schema.ts` grows beyond simple branching and object checks.
