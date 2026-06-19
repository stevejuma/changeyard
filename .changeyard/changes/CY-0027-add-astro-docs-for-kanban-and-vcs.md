---
id: CY-0027
title: Add Astro docs for Kanban and VCS
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-19T11:15:04.841Z
updatedAt: 2026-06-19T11:37:53.704Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0027
  path: .changeyard/workspaces/CY-0027/repo
branch:
  name: cy/CY-0027-add-astro-docs-for-kanban-and-vcs
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-19T11:37:06.645Z
  lastStatus: passed
planning:
  model: openspec-lite
  storage: inline
  schema: changeyard-openspec-lite@1
  strictness: strict
  phase: draft
  gates:
    proposal: pending
    specDeltas: pending
    design: pending
    tasks: pending
    verification: pending
    strictClarifications: pending
    strictChecklist: pending
    strictAnalysis: pending
mergedAt: 2026-06-19T11:37:53.699Z
---

# Summary

Add an Astro Starlight documentation workspace that publishes Changeyard docs for Kanban, VCS, CLI, hub, architecture, and troubleshooting while keeping the root `docs/` tree as the canonical authoring source.

# Motivation

Changeyard has accumulated useful Markdown docs, but they are not organized as a deployable documentation site. The Kanban and VCS surfaces now need the same stable onboarding and architecture treatment as the upstream Cline projects, plus Changeyard-specific documentation for lifecycle state, workspaces, global hub instances, and provider-neutral VCS workflows.

# Plan

- [x] Add a private `@changeyard/docs` workspace using Astro Starlight.
- [x] Add a docs sync step that copies curated Markdown from root `docs/` into Starlight content.
- [x] Add or revise canonical docs for Kanban, VCS, hub/runtime behavior, and troubleshooting.
- [x] Add root docs scripts and CI coverage for the static docs build.
- [x] Run docs build and repo checks, then record results.

<!-- cy:proposal:start -->
# Proposal

## Intent

Provide a deployable static documentation site that matches Changeyard's current Kanban, VCS, and hub behavior without moving canonical docs out of the root `docs/` directory.

## Scope

### In Scope

- [x] New `packages/docs` workspace with Astro Starlight.
- [x] Root package scripts for docs dev/build/preview.
- [x] Sync script that makes selected `docs/` Markdown available to Starlight.
- [x] Kanban, VCS, CLI/hub, architecture, and troubleshooting navigation.
- [x] CI docs build step.

### Out of Scope

- [x] Hosting-specific deployment configuration such as GitHub Pages, Cloudflare Pages, or Vercel.
- [x] Replacing the root Markdown docs as the canonical source.
- [x] Product behavior changes to Kanban, VCS, or hub runtime code.

## Approach

Use Astro Starlight as a small private workspace. Author docs in the root `docs/` tree, then copy curated files into `packages/docs/src/content/docs` before Astro commands run. Add a Starlight sidebar organized around getting started, Kanban, VCS, CLI/hub, architecture, troubleshooting, and reference. Reuse upstream Cline docs only as structural inspiration; all content should describe Changeyard behavior.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- The repository provides a private `@changeyard/docs` workspace that builds a static Astro Starlight site.
- Root docs scripts run the docs workspace commands without requiring callers to know the workspace path.
- The docs site includes curated Kanban, VCS, CLI/hub, architecture, troubleshooting, and reference navigation.
- Root `docs/` remains the canonical authoring location for Markdown pages used by the site.

## MODIFIED Requirements

- CI validates the docs site with `pnpm run docs:build`.

## REMOVED Requirements

None.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Create `packages/docs` with Astro, Starlight, a package-local sync script, and content/config files. Add canonical docs pages under `docs/` for the new sections, then have the sync script copy those pages into Starlight slugs with frontmatter. Configure sidebar navigation explicitly so docs remain stable even if more files are added later.

## Architecture Decisions

- Keep canonical docs in root `docs/` to preserve existing links and contributor workflow.
- Use Starlight instead of a custom Astro shell because it supplies docs navigation, search, Markdown rendering, and static output with little bespoke UI.
- Treat upstream Cline docs as reference material only; Changeyard docs must describe `.changeyard` state, strict planning, workspaces, global hub instances, and provider-neutral VCS behavior.

## Data / State Impact

No runtime data or schema changes. The implementation adds documentation source files, a generated docs content directory ignored by git, package metadata, and lockfile dependency entries.

## Workspace / Provider Impact

Adds a package workspace and CI check. No provider sync behavior changes.

## Risks

- Docs sync could drift from Starlight expectations; mitigate with `pnpm run docs:build` in CI.
- Added dependencies could slow installs; keep them isolated to the private docs workspace.
- Remote-access docs can imply unsafe exposure; include explicit warnings and only document verified Changeyard commands.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Add docs package and scripts
- [x] Add canonical docs pages and sync mapping
- [x] Add CI docs build step

## 3. Verification

- [x] Run checks and record results
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm install --frozen-lockfile`
- `pnpm run docs:build`
- `pnpm run check`

## Manual Scenarios

- Inspect generated Starlight sidebar coverage for Kanban, VCS, CLI/hub, architecture, troubleshooting, and reference.
- Confirm canonical root docs still resolve at their existing paths.

## Result

- Passed: `pnpm install --frozen-lockfile`.
- Passed: `pnpm run docs:build`.
- Passed: direct docs build smoke with `node packages/docs/scripts/sync-docs.mjs` and `./node_modules/.bin/astro build` from `packages/docs`.
- Passed: `pnpm run check:node`.
- Blocked: `pnpm run check` fails in `check:package-manager` on pre-existing legacy package-manager references unrelated to this docs change, including `CY-0026`, `.github/workflows/release.yml`, and desktop package-lock/runtime files.
<!-- cy:verification:end -->

<!-- cy:clarifications:start -->
# Clarifications

## Session YYYY-MM-DD

- Q: Where should the Astro docs app live?
  A: Use the default from the implementation plan: `packages/docs`.
- Q: What is the canonical source for docs content?
  A: Use the default from the implementation plan: root `docs/`.
<!-- cy:clarifications:end -->

<!-- cy:requirements-checklist:start -->
# Requirements Checklist

- [x] Requirements are testable.
- [x] Success criteria are measurable.
- [x] Edge cases are documented.
- [x] Scope boundaries are explicit.
- [x] Implementation details are not mixed into behavior requirements.
<!-- cy:requirements-checklist:end -->

<!-- cy:analysis:start -->
# Consistency Analysis

## Findings

| ID | Severity | Summary | Recommendation | Status |
|----|----------|---------|----------------|--------|
| CY-0027-001 | Low | Docs sync introduces generated content under the docs package. | Keep generated content ignored and validate via docs build. | Accepted |

## Gate Result

Pass.
<!-- cy:analysis:end -->

# Acceptance Criteria
- [x] `packages/docs` builds a static Astro Starlight docs site.
- [x] Root scripts expose docs dev/build/preview commands.
- [x] Docs content covers Kanban, VCS, CLI/hub, architecture, troubleshooting, and references.
- [x] Existing root docs remain canonical and are not replaced by generated content.
- [x] CI runs `pnpm run docs:build`.

# Agent Plan

Validate and sync CY-0027, start the verified workspace, implement the docs package and canonical docs content, update dependencies and CI, run docs build plus repo checks, update completion notes, and complete locally with `--no-pr`.

# Completion Notes

Added `packages/docs` as a private Astro Starlight workspace with an explicit sidebar and a sync script that copies selected canonical Markdown from root `docs/` into generated Starlight content. Added new canonical docs for getting started, system architecture, hub behavior, Kanban overview/workflow/architecture/remote access/upstream provenance, VCS workflow/provider model/troubleshooting, and general troubleshooting. Updated the docs index and retained compatibility notes in existing Kanban integration/upstream pages. Added root docs scripts, docs dependencies, lockfile updates, and a CI docs build step.

Checks passed: `pnpm install --frozen-lockfile`, `pnpm run docs:build`, direct sync plus Astro build smoke, and `pnpm run check:node`.

Remaining risk: `pnpm run check` is blocked by existing `check:package-manager` findings outside this change. Astro build also warns that sitemap generation is skipped because no deploy `site` URL is configured yet; that should be set with the eventual hosting target.
