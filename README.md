# Changeyard

Changeyard is a local, markdown-first change workflow manager for developers and coding agents. It turns an idea into a structured change document, gives the implementation an isolated workspace, records reviewable slices and validation evidence, and carries that context through review, pull request creation, and landing.

```text
intent -> local change/spec -> isolated workspace -> implementation slices
       -> validation -> review/PR -> landing
```

The repository remains the source of truth throughout that workflow. Changes, plans, reviews, and workspace metadata are ordinary files under `.changeyard/`; the CLI, Kanban board, VCS app, TUI, desktop shell, and provider integrations are different views and actions over the same state.

Changeyard is currently at version `0.1.0` and under active development. The installation path documented here builds the project from source.

## Contents

- [Why Changeyard](#why-changeyard)
- [What is included](#what-is-included)
- [Requirements](#requirements)
- [Install from source](#install-from-source)
- [Quick start](#quick-start)
- [The change lifecycle](#the-change-lifecycle)
- [Planning profiles](#planning-profiles)
- [Workspaces and VCS engines](#workspaces-and-vcs-engines)
- [Providers, pull requests, and reviews](#providers-pull-requests-and-reviews)
- [Agent integration](#agent-integration)
- [Runtime and application surfaces](#runtime-and-application-surfaces)
- [Configuration](#configuration)
- [Repository state](#repository-state)
- [CLI command map](#cli-command-map)
- [Development](#development)
- [Troubleshooting and safety](#troubleshooting-and-safety)
- [Further documentation](#further-documentation)

## Why Changeyard

Issue trackers and pull requests are useful collaboration endpoints, but they are a poor place to keep all of the local context an implementation needs. Changeyard owns the work between intent and a reviewable artifact:

- **Markdown is canonical.** Plans and reviews can be read, edited, diffed, and archived without a service or proprietary database.
- **Implementation is isolated.** Work starts in a verified `plain-copy`, Git worktree, or Jujutsu workspace instead of accumulating in the main checkout.
- **Workflow gates are explicit.** Validation, planning, workspace verification, checks, review, and provider state are visible and recoverable.
- **Small commits are normal.** Each requested implementation increment can be recorded as a reviewable slice with its own validation evidence.
- **Humans and agents share one protocol.** Generated skills, commands, and hooks teach supported coding tools the same lifecycle used by the CLI and UI.
- **Remote systems are integrations, not truth.** GitHub, GitLab, Forgejo, and local provider artifacts mirror and publish local state without replacing it.

## What is included

| Surface | Purpose |
| --- | --- |
| `cy` / `changeyard` CLI | Creates, validates, starts, verifies, reviews, completes, publishes, repairs, and lands changes. |
| Dashboard | Shows projects and shared hub processes. |
| Kanban | Renders the canonical change lifecycle, planning state, workspaces, reviews, and agent sessions. |
| VCS app | Inspects stacks, commits, diffs, and workspace state; previews and applies safe provider-neutral mutations. Jujutsu is the reference backend today. |
| TUI | Provides a terminal-first view of the same runtime and workflow. |
| Desktop app | Wraps the local runtime and web UI in an Electron shell for development and packaging. |
| Merge editor | Supplies conflict and merge-resolution UI used by VCS workflows. |
| Astro documentation site | Builds the detailed material in [`docs/`](docs/index.md) as a Starlight site. |

The web applications and TUI reuse one shared local hub. They do not create a second task database.

## Requirements

- Node.js 22 or newer.
- Corepack and pnpm `10.32.1`.
- Git for Git repositories and the `git-worktree` engine.
- [Jujutsu](https://github.com/jj-vcs/jj) when using the `jj` workspace engine or the full JJ VCS experience.
- Bun for TUI-specific build and validation commands.

The CLI can operate with the default `plain-copy` engine without Jujutsu.

## Install from source

From a Changeyard source checkout:

```sh
corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install
pnpm run build
pnpm run cy:install
```

`pnpm run cy:install` installs symlinks for both `cy` and `changeyard` into `~/.local/bin` by default. Make sure that directory is on `PATH`. To preview or select another directory, use the CLI directly from the checkout:

```sh
pnpm run cy install --dry-run
pnpm run cy install --dir /your/bin/directory
```

An alternative development flow is:

```sh
pnpm link --global
```

Remove the local CLI symlinks with:

```sh
pnpm run cy:uninstall
```

You can also run any command without installing the binaries:

```sh
pnpm run cy list
pnpm run cy hub start --no-open
```

## Quick start

### 1. Initialize a repository

Run this from the root of the project you want Changeyard to manage:

```sh
cy init
```

Initialization creates `.changeyard/`, its config and schema, change templates, the canonical Changeyard agent skill, and commands or hooks for detected coding tools. Select integrations explicitly when needed:

```sh
cy init --tools cursor,codex
cy init --tools all
cy init --tools none
```

After upgrading Changeyard, refresh generated templates, schemas, skills, commands, and hooks with:

```sh
cy update
```

Generated scaffolding is added to the repository-local `.git/info/exclude` by default. Set `scaffold.trackGeneratedFiles` to `true` if the project should commit those files.

### 2. Open an application surface

```sh
cy --dashboard
cy --kanban
cy --vcs
cy --tui
```

These commands start or reuse the shared hub. Its default endpoint is `http://127.0.0.1:3484`.

### 3. Create a planned change

Use a strict planned change for non-trivial agent work:

```sh
cy create \
  --template agent-task \
  --planning openspec-lite \
  --strict \
  --title "Add workspace verification"
```

Edit the generated `.changeyard/changes/CY-0001-*.md` file to fill its summary, motivation, plan, acceptance criteria, and planning sections. Then run the gates:

```sh
cy validate CY-0001
cy sync CY-0001
cy start CY-0001
cd .changeyard/workspaces/CY-0001/repo
cy verify CY-0001
```

All implementation work now belongs in that verified workspace.

### 4. Implement one reviewable slice

Run focused checks and commit the finished increment:

```sh
cy slice commit CY-0001 \
  -m "Add workspace marker validation" \
  --check "pnpm run check"
```

Changeyard prefixes the commit subject with the change ID and records a compact PR-style summary, validation evidence, files, and notes in the change document.

Use `cy next CY-0001` whenever you are unsure which action is valid. Use `cy audit CY-0001` for gate details, blockers, the expected working directory, and recovery commands.

### 5. Prepare for review or landing

Update Completion Notes and, only when the work is explicitly ready to finish, run the completion gate:

```sh
cy note CY-0001 --message "Implemented marker validation. Checks run: pnpm test -- workspace."
cy complete CY-0001 --no-pr
```

Local completion moves the change to `ready_for_pr`. From there, explicitly choose a provider PR or local landing path:

```sh
cy pr new CY-0001 --draft
# or
cy land CY-0001
```

JJ landing advances the target bookmark without rebasing or updating root `@`. Both dry-run and actual output report the landed commit and files, whether root displays the target, and an opt-in rebase hint when it does not.

## The change lifecycle

The main lifecycle is:

```text
Draft -> Ready -> Synced -> In Progress -> Ready For PR
      -> PR Open -> In Review -> Approved -> Merged
```

`Blocked`, `Changes Requested`, and `Abandoned` cover non-linear outcomes. Kanban groups these statuses into Backlog, Ready, In Progress, Blocked, Review / PR, Done, and Abandoned columns.

A typical planned workflow is:

1. `cy create` writes the canonical change document.
2. Planning content and acceptance criteria define the intended result.
3. `cy validate` checks frontmatter, required sections, checkboxes, lifecycle values, and planning gates.
4. `cy sync` mirrors the change to the configured provider or advances it locally with `noop`.
5. `cy start` creates an isolated workspace and records its base and metadata.
6. `cy verify` proves the current directory is the expected writable workspace.
7. `cy slice commit` records each requested implementation increment and its focused checks.
8. `cy review` stores an auditable markdown review and may publish it through the provider.
9. `cy complete --no-pr` runs completion checks and prepares a final landing description.
10. `cy pr new` publishes for remote review, or `cy land` integrates the work locally.

Changeyard follows a **commit often, complete rarely** policy. Slice commits are the normal review boundary. Completion is reserved for explicit end-of-change intent, not routine iteration.

### Quick changes

Use the lite workflow only for small, low-risk work with no behavior, public API, storage/schema, provider/workspace lifecycle, UI workflow, or security-sensitive impact:

```sh
cy quick --title "Fix typo in setup guide"
```

Quick changes use `planning.model: none` and include a scope checklist. Project configuration decides whether they still require an isolated workspace and which check profile they run.

## Planning profiles

Planning stays inline in the same `.changeyard/changes/*.md` file as lifecycle metadata and completion notes.

| Mode | Intended use | Managed sections |
| --- | --- | --- |
| Unplanned | Existing lightweight workflows and deliberately small changes. | Standard change template sections only. |
| `openspec-lite` | Everyday features, fixes, and refactors that benefit from a structured proposal. | Proposal, Specification Deltas, Design, Tasks, and Verification. |
| `openspec-lite --strict` | Non-trivial agent work or teams that want stronger pre-implementation gates. | Adds Clarifications, Requirements Checklist, and Consistency Analysis. |

Planning sections use stable marker pairs so the CLI and Kanban can update one section without rewriting unrelated content. Useful commands include:

```sh
cy plan status CY-0001
cy plan prompt CY-0001 proposal
cy plan strict enable CY-0001
cy plan strict disable CY-0001
cy plan export CY-0001 --format openspec
cy plan import CY-0001 --format speckit
```

OpenSpec and Spec Kit exports under `.changeyard/cache/planning/` are interoperability mirrors. They never replace the canonical change file. See [Planning Profiles](docs/planning-profiles.md) and the [Inline Planning ADR](docs/adr-inline-planning.md).

## Workspaces and VCS engines

Changeyard isolates implementation behind a common workspace interface:

| Engine | Behavior | Best fit |
| --- | --- | --- |
| `plain-copy` | Copies the repository without VCS data or Changeyard runtime state and applies configured exclusions. | Portable fallback and non-VCS experiments. |
| `git-worktree` | Creates a Git worktree and task branch. | Git-native repositories and branch workflows. |
| `jj` | Creates a named JJ workspace and a change whose description starts with the Changeyard ID. | Jujutsu repositories, stack workflows, and the most complete VCS app experience. |

`cy start` writes workspace metadata next to the checkout, hydrates allowlisted support files, and prints the exact directory to enter. `cy verify` validates the marker, lifecycle state, engine-specific workspace identity, and—in JJ workspaces—change descriptions.

Hydration is intentionally explicit. Configure files to copy or link, a warmup command, and `neverCopy` patterns under `workspace.hydrate`. Secrets such as `.env`, databases, dependencies, build output, and coverage are denied by default. Changeyard does not automatically install workspace dependencies; use the setup command printed by `cy start` or configure a warmup:

```sh
cy start CY-0001 --warmup
cy hydrate CY-0001 --warmup
cy workspace status CY-0001
```

The VCS app exposes a provider-neutral operation model for apply/unapply, move, amend, split, squash, restore, discard, undo, and redo flows. Mutating operations are previewed before apply and return risk, warnings, affected commits and paths, conflicts, and recovery diagnostics. See the [VCS documentation](docs/vcs/index.md) for the current JJ and Git support boundaries.

## Providers, pull requests, and reviews

Set `provider.type` in `.changeyard/config.jsonc` or the local override file:

| Provider | Purpose | Default credential variable |
| --- | --- | --- |
| `noop` | Keeps the lifecycle entirely local. | None. |
| `local-folder` | Writes deterministic issue and PR-like artifacts under `.changeyard/cache/local-folder/`. | None. |
| `github` | Syncs issues, creates and updates pull requests, publishes reviews, and reads checks/logs. | `GITHUB_TOKEN` |
| `gitlab` | Syncs issues, creates and updates merge requests, publishes reviews, and reads supported check state. | `GITLAB_TOKEN` |
| `forgejo` | Syncs issues, pull requests, and review summaries against a configured Forgejo base URL. | `FORGE_TOKEN` |

Remote providers require `owner` and `repo`; Forgejo also requires `baseUrl`. `provider.auth.tokenEnv` can name a different environment variable. Store the token in the environment, not in repository configuration.

The publication boundary is deliberate:

```sh
cy complete CY-0001 --no-pr
cy pr new CY-0001 --draft
cy pr checks CY-0001
cy pr logs CY-0001 --failed
cy pr fix CY-0001 --failed
```

`cy pr fix --failed` saves available failed-check logs under the change workspace and reopens repair work. Supported pending, failed, cancelled, or unknown remote checks block approval and landing.

Reviews remain local markdown artifacts under `.changeyard/reviews/<id>/` and can include a summary, required changes, and inline file comments:

```sh
cy review start CY-0001
cy review complete CY-0001 --decision request-changes
cy review slices CY-0001
cy review slices CY-0001 --decision approve --slice <slice-id>
cy review slices CY-0001 --decision request-changes --slice <slice-id> --note "Add a regression test."
```

Recorded slices must be explicitly reviewed before completion. Use `--all-pending` for deliberate bulk approval of existing pending slices; dry-run previews decisions without changing records.

Where provider APIs support it, review results are published remotely while the markdown file remains authoritative.

## Agent integration

`cy init` and `cy update` can scaffold skills, commands, prompts, and supported hooks for Cursor, Claude Code, Cline, Codex, GitHub Copilot, OpenCode, Gemini CLI, Kiro, and Factory Droid. The canonical skill is always installed at `.agents/skills/changeyard/SKILL.md`.

The generated protocol tells agents to:

1. create a strict planned change for non-trivial work;
2. pass validation, sync, start, and verify gates before implementation;
3. edit only inside the verified workspace;
4. commit each user-requested increment as a slice with focused validation;
5. update Completion Notes and stop after the slice unless another increment was already requested;
6. complete, publish, or land only when explicitly authorized.

The hub can also associate terminal-agent activity with changes. Runtime-launched sessions and external sessions can appear on the board; `cy hooks` forwards activity and state events, while `cy session attach` records an external session ID, provider, workspace, and resume metadata.

## Runtime and application surfaces

### Shared hub

The hub owns live process state, WebSocket and API traffic, project registration, workspace summaries, agent sessions, and application assets. It is global by default, so one active instance can serve multiple project launches.

```sh
cy hub start --no-open
cy hub status
cy hub list
cy hub restart
cy hub kill stale
cy hub stop
```

Explicit endpoints such as `cy hub start --port 3490` are tracked as separate instances. Registry, PID, state, and log files live under `CHANGEYARD_HOME` or the platform app-state directory:

- macOS: `~/Library/Application Support/Changeyard`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/changeyard`
- Windows: `%LOCALAPPDATA%/Changeyard`

### Dashboard and Kanban

The dashboard shows registered projects and hub processes. Kanban reads `.changeyard` state to provide change creation, lifecycle columns, planning badges and editing, gate summaries, provider/workspace details, reviews, diffs, file browsing, and agent-session controls.

Because the board is derived from repository files and runtime snapshots, it must not create `.kanban/`, `kanban.json`, or another parallel card store.

### VCS app

The VCS app shows the active project or workspace, stacks, commits, bookmarks/branches, working-copy changes, diffs, previews, conflicts, and operation history. Shared UI code emits neutral operations; Git and JJ mechanics stay behind adapters. JJ currently has the deepest support.

### TUI and desktop

Run `cy --tui` (or `cy -i`) for the OpenTUI client. The Electron package is currently a development and packaging shell around the same local runtime:

```sh
pnpm run dev:desktop
pnpm run dev:desktop:vite
pnpm --filter @changeyard/desktop run build
```

See [Desktop App Onboarding](docs/desktop.md) for staged CLI and port details.

## Configuration

`cy init` creates `.changeyard/config.jsonc` and `.changeyard/schema.json`. Configuration is merged in this order:

1. built-in defaults;
2. `.changeyard/config.jsonc`;
3. optional `.changeyard/config.local.jsonc`;
4. supported environment overrides such as `CHANGEYARD_STORAGE_ROOT` and `CHANGEYARD_PROVIDER`.

Print the fully resolved configuration with:

```sh
cy config --json
```

For example, a machine-local provider and workspace override can live in `.changeyard/config.local.jsonc`:

```json
{
  "provider": {
    "type": "github",
    "owner": "example-org",
    "repo": "example-repo",
    "auth": {
      "tokenEnv": "GITHUB_TOKEN"
    }
  },
  "vcs": {
    "engine": "jj",
    "fallback": "jj"
  }
}
```

The main configuration groups are:

| Group | Controls |
| --- | --- |
| `project` | Change ID prefix and default landing base. |
| `storage` | Paths for changes, workspaces, and reviews. |
| `provider` | Local or forge integration, repository identity, API URL, and token environment name. |
| `vcs` | Workspace engine, fallback engine, target branch, applied stacks, and remote bookmark discovery. |
| `workspace` | Path/name patterns plus copy, link, deny, install, and warmup rules. |
| `checks` | Named command profiles such as `minimal`, `standard`, and `full`. |
| `planning` | Default profile and strictness, quick-change policy, gates, adapter cache, and UI behavior. |
| `pullRequests` / `review` | PR defaults and review requirements. |
| `ui` | Host, port, browser opening, passcode requirement, and theme. |
| `scaffold` / `doctor` | Generated-file tracking and maintenance thresholds. |

The generated JSON Schema rejects unknown keys and validates supported values. Keep machine-local provider choices or other overrides in `config.local.jsonc` when they should not be shared.

## Repository state

A typical initialized project looks like this:

```text
.changeyard/
  config.jsonc
  config.local.jsonc              # optional machine-local overrides
  schema.json
  templates/
    agent-task.md
    feature.md
    bug.md
    refactor.md
    review.md
    quick.md
  changes/
    CY-0001-*.md                  # canonical change, plan, and completion notes
  reviews/
    CY-0001/
      review-001.md               # canonical review artifact
  workspaces/
    CY-0001/
      metadata.json
      repo/                       # isolated implementation checkout
      logs/                       # local and remote check evidence
  cache/
    provider-state.json           # provider mirror metadata
    local-folder/                 # local provider artifacts
    planning/                     # generated planning mirrors
.agents/skills/changeyard/SKILL.md
```

Depending on `cy init --tools`, Changeyard can also generate tool-specific skills, commands, prompts, and hooks under `.cursor/`, `.claude/`, `.cline/`, `.codex/`, `.github/`, `.opencode/`, `.gemini/`, `.kiro/`, and `.factory/`.

The browser UI keeps only ephemeral display state. Canonical planned work never moves out of the repository.

## CLI command map

Use `cy --help`, `cy <command> --help`, or the markdown-backed topics such as `cy help -k workflow` for exact syntax.

| Area | Commands |
| --- | --- |
| Setup | `init`, `update`, `install`, `uninstall`, `version` |
| Change creation and inspection | `create`, `quick`, `validate`, `list`, `status`, `plan`, `config` |
| Lifecycle and workspaces | `sync`, `start`, `verify`, `hydrate`, `next`, `audit`, `workspace` |
| Implementation evidence | `slice`, `check record`, `diff`, `summarize`, `note`, `describe` |
| Completion and collaboration | `complete`, `review`, `pr`, `refresh`, `land` |
| Recovery and maintenance | `doctor`, `recover`, `repair`, `mark-in-progress` |
| Runtime and agents | `hub`, `hooks`, `session` |

Most inspection commands support `--json`, and mutating commands commonly support `--dry-run`. Machine-readable results use an `{ ok, output }` or `{ ok, error }` envelope.

The command-by-command reference lives in [`docs/cli/`](docs/cli/root.md).

## Development

Install dependencies and build the main CLI and runtime surfaces:

```sh
pnpm install
pnpm run build
```

Common validation commands:

```sh
pnpm run check
pnpm test
pnpm run check:tui
pnpm run docs:build
pnpm run pack:check
```

Focused development entry points:

```sh
pnpm run ui:dev          # dashboard/Kanban plus runtime restarts
pnpm run ui:vcs:dev      # VCS frontend plus runtime restarts
pnpm run docs:dev        # Astro Starlight documentation
pnpm run dev:desktop     # built web assets inside Electron
pnpm run dev:desktop:vite
```

Useful smoke and fixture commands include:

```sh
pnpm run smoke:tui
pnpm run smoke:install
pnpm run vcs:fixture
pnpm run vcs:jj-scenarios
pnpm run kanban:scenarios
pnpm run smoke:forge -- github
```

`pnpm run pack:check` builds the package and runs `pnpm pack --dry-run`. Live forge smoke tests require explicit opt-in and disposable provider repositories; see [Live Forge Smoke](docs/live-forge-smoke.md).

### Monorepo layout

```text
src/                       CLI, lifecycle, planning, providers, workspaces, VCS adapters
packages/kanban/           shared hub runtime and Kanban web application
packages/vcs/              provider-neutral VCS frontend
packages/merge/            merge editor and React bindings
packages/tui/              OpenTUI client
packages/web-ui/           shared React UI primitives
packages/desktop/          Electron shell and packaging
packages/docs/             Astro Starlight site
docs/                      canonical detailed documentation and CLI reference
tests/                     CLI, provider, workspace, runtime, and VCS tests
scripts/                   launchers, installers, fixtures, smoke checks, and release helpers
```

## Troubleshooting and safety

- Run `cy next <id>` for the expected next action and `cy audit <id>` for a complete gate report.
- Run `cy doctor` for configuration, provider, change-document, and workspace health. Use `cy doctor --fix --dry-run` before applying supported repairs.
- Use `cy repair <id> --workspace` after a partial start, or `cy recover <id>` when saved workspace metadata exists but markers drifted.
- If a workspace has no dependencies, run the setup command printed by `cy start` or `cy verify` from inside that workspace.
- If the hub has stale records, inspect `cy hub list` and remove only dead records with `cy hub kill stale`.
- The hub binds to localhost by default and can inspect repositories or start local processes. Treat any non-local bind as a security decision; prefer an authenticated SSH or private-network tunnel and stop the instance afterward.
- Provider tokens belong in environment variables. Configuration stores only the environment variable name.
- Destructive workspace cleanup, VCS operations, provider publication, and landing are explicit. Preview with `--dry-run` where available and do not bypass a failed lifecycle gate.

See [Troubleshooting](docs/troubleshooting.md), [Hub Remote Access](docs/kanban/remote-access.md), and [VCS Troubleshooting](docs/vcs/troubleshooting.md) for detailed recovery guidance.

## Further documentation

- [Documentation index](docs/index.md)
- [Getting Started](docs/getting-started.md)
- [System Architecture](docs/architecture.md)
- [Kanban Overview](docs/kanban/overview.md)
- [Kanban Core Workflow](docs/kanban/core-workflow.md)
- [VCS App and support model](docs/vcs/index.md)
- [Hub](docs/hub.md)
- [Planning Profiles](docs/planning-profiles.md)
- [Desktop App Onboarding](docs/desktop.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Versioning Policy](docs/versioning-policy.md)
- [CLI reference](docs/cli/root.md)
