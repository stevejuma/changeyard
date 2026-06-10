# AGENTS.md

Instructions for coding agents working in the **Changeyard** repository.

## Project overview

Changeyard is a markdown-first local change workflow manager: CLI, board UI (`cy ui`), and terminal UI (`cy tui`). Canonical runtime state lives in `.changeyard/changes/*.md` — forge issues and pull requests are sync targets, not the source of truth.

Monorepo layout:

| Path | Purpose |
| --- | --- |
| `src/` | Node CLI — commands, providers, workspace engines, scaffold |
| `packages/kanban/` | Board/runtime server (`cy ui`, `cy server`) |
| `packages/tui/` | OpenTUI terminal client (`cy tui`; requires Bun) |
| `tests/` | Integration tests (run against built `dist/`) |
| `dist/` | **Generated** TypeScript build output — do not edit |

Requires **Node.js >= 22**. This repo uses **Jujutsu (`jj`)** as its VCS engine.

## Change workflow

For any non-trivial product change, follow the full gate protocol in [.agents/skills/changeyard/SKILL.md](.agents/skills/changeyard/SKILL.md) or use `/cy-*` slash commands when available.

Essential hard stops:

1. `cy create` → `cy validate` → `cy sync` → `cy start` → `cy verify` before editing
2. After `cy start`, edit **only** in the workspace checkout printed by start
3. If `cy verify` fails, halt implementation until it passes
4. Update **Completion Notes** in the change markdown before `cy complete --no-pr`

## Setup

```bash
npm install
npm run build
npm link          # optional: global cy / changeyard CLI
```

Dev CLI without rebuilding on every change:

```bash
npm run cy:dev -- <command>
```

## Verification

Run before finishing work:

```bash
npm run check       # typecheck CLI + kanban
npm test            # build + run dist/tests/*.test.js
npm run check:tui   # TUI typecheck, endpoints, interaction tests (requires Bun)
npm run pack:check  # pre-release packaging dry-run
```

`npm test` always rebuilds first. TUI build and tests require **Bun**; the rest of the repo does not.

## Code conventions

- **ESM + NodeNext** — use `.js` extensions in imports (e.g. `from "./cli.js"`)
- **Strict TypeScript** — sources in `src/` and `tests/` compile to `dist/`
- **Tests** — `node:test` with `node:assert/strict`
- **Scope** — minimal, focused diffs; match surrounding code style
- **Commits and PRs** — only when explicitly requested

## Boundaries

Do not edit:

- `dist/` — generated; change `src/` and rebuild
- `node_modules/` and `.changeyard/workspaces/` checkouts you are not assigned to
- Vendored kanban paths without reading [docs/kanban-upstream.md](docs/kanban-upstream.md)

Agent skill content is generated from [src/scaffold/skill-generation.ts](src/scaffold/skill-generation.ts). If you change the Changeyard agent protocol, update the generator and refresh installed copies (`.agents/`, `.cursor/`, etc.) via `cy update`.

## Architecture

- UI and TUI are **client layers** — they must not introduce a second source of truth
- Workspace engines: `jj` (default here), `git-worktree`, `plain-copy` — see `.changeyard/config.jsonc`
- Providers (`noop`, `local-folder`, GitHub, GitLab, Forgejo) sync change metadata outward

## Key docs

- [README.md](README.md) — full CLI usage and lifecycle
- [docs/planning-profiles.md](docs/planning-profiles.md) — planning model
- [docs/adr-inline-planning.md](docs/adr-inline-planning.md) — planning architecture decision
- [PLAN.md](PLAN.md) — active TUI redesign tracker (when relevant)
