# Changeyard

Changeyard is a generic, markdown-first local change workflow manager for developers and coding agents working in local repositories.

Every non-trivial change starts as a structured markdown change document, can later move into an isolated workspace, and should only become a pull request after local verification and completion checks pass.

## Product thesis

Changeyard owns the local transition from intent to implementation artifact:

```text
intent → structured local change/spec → isolated workspace → verified work → checks → PR/review artifact
```

The local markdown change remains the canonical source of truth. Forge issues, pull requests, and reviews are sync targets rather than the primary data model.

## Current prototype

This repository currently implements a local-first end-to-end prototype slice:

- `cy init` creates `.changeyard/` storage, default config, a JSON Schema for config validation, and templates.
- `cy create` creates a structured markdown change from a template.
- `cy validate` validates frontmatter, sections, checkbox tasks, and lifecycle status values.
- `cy sync` syncs a validated change through the provider interface, with `noop` and `local-folder` providers available.
- `cy start` creates a tool-owned workspace and moves a ready/synced change to `in_progress`.
- `cy verify` fails unless it is run inside the expected Changeyard workspace for an in-progress change.
- `cy hydrate` copies explicitly allowlisted local files into the verified workspace while respecting the denylist.
- `cy complete --no-pr` verifies the workspace, requires completion notes, detects workspace changes, runs configured checks, and moves the change to `ready_for_pr`.
- `cy review start` and `cy review complete` create markdown reviews and update review/change status.
- `cy doctor` validates core local configuration, provider/workspace support, and change documents.
- `cy recover` recreates missing workspace markers from saved workspace metadata.
- `cy list` lists local changes.
- `cy status` prints a single local change summary.

The provider layer now has a mockable HTTP transport with automated coverage for Forgejo, GitHub, and GitLab issue sync, PR/MR creation, and review-comment publication. Live forge smoke tests, richer inline review APIs, and release packaging are intentionally left for later milestones.

## Planning profiles

Changeyard now supports two workflow shapes over the same canonical markdown change file:

- unplanned changes for lightweight local work
- planned changes with inline `openspec-lite` sections and lifecycle gates

Planning stays in `.changeyard/changes/*.md`. The UI, CLI, and provider projection paths all read and write that same markdown file.

Key planning capabilities:

- `openspec-lite` is the default planning profile
- strict planning is optional and can be enabled at create time or later on an existing planned change
- the UI can create planned changes, edit planning sections inline, validate planning gates, and run `sync` / `start`
- OpenSpec and Spec Kit exports live under `.changeyard/cache/planning/` as non-canonical mirrors only

See [docs/planning-profiles.md](docs/planning-profiles.md) for the current planning model and [docs/adr-inline-planning.md](docs/adr-inline-planning.md) for the architecture decision.

## Install for local development

```bash
npm install
npm run build
npm run pack:check
npm run cy:install
npm link
```

Changeyard now requires Node.js 22 or newer.

`npm run cy:install` installs `cy` and `changeyard` into `~/.local/bin` by default using the existing safe installer. Remove them again with:

```bash
npm run cy:uninstall
```

`npm link` remains available as an alternative development flow.

After installing or linking, both command names are available:

```bash
changeyard init
cy init
```

## Usage

Initialize Changeyard in a repository:

```bash
cy init
```

`cy init` creates `.changeyard/` storage and also installs a canonical agent skill at `.agents/skills/changeyard/`. When agent tool directories already exist in the repo (for example `.cursor/`, `.claude/`, or `.cline/`), Changeyard also installs matching skills and `/cy-*` slash commands for those tools. Use `cy init --tools cursor,claude`, `--tools all`, or `--tools none` to control delivery.

Refresh bundled templates, skills, and agent slash commands after upgrading Changeyard:

```bash
cy update
```

Create a change:

```bash
cy create --template agent-task --title "Add workspace verification command"
```

Create a planned change:

```bash
cy create --template feature --title "Add plugin permissions UI" --planning openspec-lite
cy create --template feature --title "Tighten spec flow" --planning openspec-lite --strict
```

Validate, list, and inspect changes:

```bash
cy validate CY-0001
cy sync CY-0001
cy start CY-0001
cd .changeyard/workspaces/CY-0001/repo
cy verify CY-0001
cy hydrate CY-0001
# edit files and fill Completion Notes in the root change file
cy complete CY-0001 --no-pr
cy review start CY-0001
cy review complete CY-0001 --decision approve
cy doctor
cy list
cy status CY-0001
cy ui --no-open
```

Planning-specific commands:

```bash
cy plan status CY-0001
cy plan prompt CY-0001 proposal
cy plan strict enable CY-0001
cy plan strict disable CY-0001
cy plan export CY-0001 --format openspec
cy plan import CY-0001 --format speckit
```

## Default repository layout

```text
.changeyard/
  config.jsonc
  schema.json
  templates/
    agent-task.md
    feature.md
    bug.md
    refactor.md
    review.md
  changes/
  reviews/
.agents/skills/changeyard/SKILL.md
.cursor/commands/cy-*.md            # when Cursor is present or selected
.claude/commands/cy/*.md             # when Claude Code is present or selected
.clinerules/workflows/cy-*.md       # when Cline/ChangeYard is present or selected
```

## Lifecycle target

The intended full lifecycle is:

```text
Draft → Ready → Synced → In Progress → Ready For PR → PR Open → In Review → Approved/Merged
```

This prototype supports creating local `ready` changes, syncing them to `synced` through the provider abstraction, starting and hydrating plain-copy or git-worktree workspaces, verifying `in_progress` workspace context, completing local work to `ready_for_pr` or local `pr_open`, recovering workspace markers, and recording markdown review decisions.

## Local provider sync

The default provider is `noop`, which updates the local change metadata without writing a remote artifact. Set `provider.type` to `local-folder` in `.changeyard/config.local.jsonc` or `.changeyard/config.jsonc` to write remote-like issue and pull-request files under `.changeyard/cache/local-folder/` and record deterministic numbers in `.changeyard/cache/provider-state.json`. Forgejo, GitHub, and GitLab providers support issue create/update, PR/MR creation, and summary review-comment publication when owner/repo config and the relevant token environment variable are present. Remote HTTP failures surface the provider status code and message where available, and invalid provider JSON is reported as a provider request failure.

## Workspace start and verify

The default workspace engine is `plain-copy`. `cy start <id>` copies the repository into `.changeyard/workspaces/<id>/repo`, excluding VCS data, Changeyard runtime state, and configured `neverCopy` patterns. Changeyard also includes `jj` and `git-worktree` engines: set `vcs.engine` to `jj` to run `jj workspace add --name <workspace> <path>`, or `git-worktree` to run `git worktree add -b <branch> <path>`. Start writes workspace metadata next to the checkout, hydrates explicitly allowlisted files, updates the change to `in_progress`, and prints the next `cd` and `cy verify` commands. `cy verify <id>` must be run from inside that workspace and checks both the workspace marker and the engine-specific workspace status before allowing work to proceed.

`cy ui` starts a local board UI backed by the same markdown and workspace metadata. The current UI reads all changes, shows provider/workspace details, creates planned changes, edits planning sections inline with conflict-safe writes, validates planning gates, and can trigger `sync` and `start` actions without creating any separate Kanban state files.

## Doctor, recovery, JSON, and errors

`cy doctor` checks the local storage root, validates that the configured provider and workspace engine are supported, and validates existing change documents. `cy recover <id>` recreates a missing `.changeyard-workspace.json` marker from saved workspace metadata. `cy completions` prints a bash completion snippet. `cy <command> --help` prints command-specific usage. `cy list --json`, `cy status <id> --json`, and `cy doctor --json` return structured data in `{ ok, output }`; other CLI commands return their normal text output inside `{ ok, output }`. Failures return `{ ok, error: { code, message } }`.

## Completion and review

`cy complete <id> --no-pr` implements the local completion gate. It runs `cy verify`, requires non-placeholder Completion Notes in the change markdown, requires detected workspace changes unless `--no-code-change` is passed, runs the configured check profile inside the workspace, writes check logs under `.changeyard/workspaces/<id>/logs/checks.log`, and updates the change to `ready_for_pr`. Without `--no-pr`, completion asks the workspace engine to publish the branch/bookmark, then asks the configured provider to create a pull request and updates the change to `pr_open` when supported. Provider PR/MR creation uses the change base revision when present, otherwise `project.defaultBase`.

`cy review start <id>` creates `.changeyard/reviews/<id>/review-001.md`. `cy review complete <id> --decision approve|request-changes|reject` updates the latest review, mirrors the decision to the change status, and publishes the review through providers that support review/comment publication. Review bodies can include an `# Inline Comments` section with bullets like `- src/file.ts:42: Comment text`; providers include those inline-comment payloads in the published review summary until provider-native diff-position APIs are fully implemented.

## Agent protocol target

For any non-trivial future code change, agents should eventually follow this protocol:

1. Create a change with `cy create --template agent-task --title "<title>"`.
2. Fill in the generated markdown plan.
3. Sync if a provider is configured.
4. Start an isolated workspace.
5. Run `cy verify <id>` before editing.
6. Work only inside the verified workspace.
7. Update completion notes.
8. Run `cy complete <id> --no-pr`.
9. Start and complete a markdown review if needed.

For planned changes, the workflow extends this with inline planning sections and planning gate checks before `sync`, `start`, and `complete`. Existing planned changes can opt into or out of strict mode with `cy plan strict enable <id>` and `cy plan strict disable <id>`. Existing unplanned changes remain supported as-is; planning opt-in for those changes is still a create-time choice today. See [docs/planning-profiles.md](docs/planning-profiles.md) for the current model and adapter flow, and [docs/adr-inline-planning.md](docs/adr-inline-planning.md) for the architecture decision.

## Development

```bash
npm run check
npm test
```

## Release smoke checks

Before publishing, run:

```bash
npm run check
npm test
npm run pack:check
npm run smoke:forge -- github
```

`npm run pack:check` rebuilds the package and runs `npm pack --dry-run` so the packaged `dist/` output, README, and binary metadata can be inspected before release. `npm run smoke:forge -- <provider>` is a non-destructive prerequisite check for the live forge checklist in `docs/live-forge-smoke.md`; set `CHANGEYARD_LIVE_SMOKE=1` and provider-specific environment variables before using it for release validation.
