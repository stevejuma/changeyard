---
id: CY-0002
title: Add dev install and uninstall package scripts
type: agent-task
status: ready_for_pr
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-11T09:24:26.857Z
updatedAt: 2026-06-11T09:28:42.296Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0002
  path: .changeyard/workspaces/CY-0002/repo
branch:
  name: cy/CY-0002-add-build-and-install-cli-script
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
checks:
  profile: standard
  lastRun: 2026-06-11T09:28:42.296Z
  lastStatus: passed
---

# Summary

Add `cy:install` and `cy:uninstall` development scripts in `package.json` that wrap the existing CLI install commands.

# Motivation

The repo already has `cy install` and `cy uninstall`, but they are easy to miss from the package scripts surface. Adding dedicated development scripts makes local install and removal discoverable without introducing another installer path.

# Plan

- [x] Add `cy:install` and `cy:uninstall` scripts that call the existing development CLI commands.
- [x] Update docs/help text so local installation and removal are easy to discover from the repo root.
- [x] Run focused verification for the package script and touched docs surface.

# Acceptance Criteria

- [x] `package.json` exposes `cy:install` and `cy:uninstall` scripts for local development.
- [x] The new scripts reuse the existing `cy install` and `cy uninstall` behavior, including executable handling and safe refusal to overwrite unrelated commands.
- [x] The README makes the script-based install and uninstall flow discoverable.

# Scope Boundaries

## In scope

- `package.json`
- `README.md`
- Focused tests or smoke coverage for the install path if required

## Out of scope

- Unrelated requests, opportunistic refactors, and formatting-only edits outside touched files.

## New task triggers

- Create a new Changeyard change if the work expands into unrelated files or undeclared subsystems.

# Agent Plan

1. Reuse the existing `cy install` and `cy uninstall` commands rather than adding any new install plumbing.
2. Add `cy:install` and `cy:uninstall` scripts to `package.json` and document them in the README.
3. Run focused verification for the updated package scripts and any touched package metadata/docs.

# Completion Notes

Added `cy:install` and `cy:uninstall` to the root `package.json`, both delegating to the existing development CLI entrypoint so they reuse the current install and uninstall safety checks. Updated the README local development install section to document the new script flow and keep `npm link` as an alternative.

Checks run:
- `npm run cy:install -- --dry-run` (expected refusal against existing non-Changeyard `~/.local/bin/changeyard`)
- `CHANGEYARD_INSTALL_DIR="$(mktemp -d)" npm run cy:install -- --dry-run`
- `npm run cy:uninstall -- --dry-run`
- `npm run check`

Residual risk:
- The new scripts intentionally use the development CLI path (`cy:dev`) rather than forcing a built dist install, so they are aimed at local repo development convenience only.
