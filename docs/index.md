# Changeyard Documentation

This directory is the canonical documentation source for Changeyard. The deployable docs site in `packages/docs` renders selected pages from this tree with Astro Starlight.

The docs are split between stable onboarding material, architecture references, and command-specific references. Task plans, reviews, and completion notes still live in `.changeyard/`.

## Getting Started

- [Getting Started](getting-started.md): install, build, and open the local Changeyard surfaces.
- [System Architecture](architecture.md): ownership boundaries between Markdown state, CLI lifecycle, hub runtime, Kanban, VCS, workspaces, and providers.

## Kanban

- [Kanban Overview](kanban/overview.md): how Changeyard uses Kanban as an embedded UI/runtime surface.
- [Kanban Core Workflow](kanban/core-workflow.md): task lifecycle from change creation to review and completion.
- [Kanban Architecture](kanban/architecture.md): runtime layers, state ownership, and execution boundaries.
- [Kanban Remote Access](kanban/remote-access.md): safe ways to expose the local hub when remote access is required.
- [Kanban Upstream Provenance](kanban/upstream.md): Cline Kanban lineage and Changeyard-specific differences.
- [Kanban Integration](kanban-integration.md): older integration reference retained for existing links.
- [Kanban Upstream](kanban-upstream.md): older upstream reference retained for existing links.

## VCS

- [VCS App Spec](vcs/index.md): provider-neutral VCS app architecture and support matrix.
- [VCS Core Workflow](vcs/core-workflow.md): inspect repository state, preview operations, apply changes, and submit stacks.
- [VCS Provider Model](vcs/provider-model.md): neutral operation contract and provider-specific boundaries.
- [JJ Supported Functionality](vcs/jj-supported-functionality.md): current JJ capabilities, supported operations, unsupported operations, and safety behavior.
- [JJ UI Interactions](vcs/jj-ui-interactions.md): how Branches, Workspace, History, Settings, previews, and drag/drop map to neutral operations.
- [JJ Backend Queries And Commands](vcs/jj-backend-queries.md): JJ queries, revsets, templates, and mutation command shapes used behind the UI.
- [VCS Troubleshooting](vcs/troubleshooting.md): diagnostics and recovery paths for VCS app issues.
- [Agent Notes For VCS Work](vcs/agent-notes.md): implementation boundaries and checklists for future agents.
- [Legacy JJ VCS Overview](vcs-jj.md): earlier high-level JJ VCS route and runtime notes.

## CLI And Hub

- [Hub](hub.md): global hub instance model, dashboard controls, and remote-access cautions.
- [CLI Root Reference](cli/root.md): root command reference.
- [Hub Command Reference](cli/hub.md): `cy hub` command reference.

## Other References

- [Desktop App Onboarding](desktop.md)
- [Inline Planning ADR](adr-inline-planning.md)
- [Planning Profiles](planning-profiles.md)
- [Troubleshooting](troubleshooting.md)
- [Live Forge Smoke](live-forge-smoke.md)
- [Release Notes](release-notes.md)
- [Versioning Policy](versioning-policy.md)
