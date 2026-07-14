# Dependency Security

Run `pnpm run audit:dependencies` before merging dependency changes. It runs the
raw pnpm audit report and fails for every advisory except the explicitly recorded
upstream exception below.

## Recorded upstream exception

`@ai-sdk/provider-utils` advisory `1119676` remains only through
`@clinebot/core` → `dify-ai-provider`. The advisory has no patched release and
no compatible upstream upgrade is available. The audit script pins the exception
to that exact dependency path and advisory ID; it fails if any other advisory is
reported or when this exception disappears, prompting its removal.
