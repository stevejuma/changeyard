---
id: CY-0019
title: Provider-backed VCS PR operations
type: agent-task
status: merged
priority: medium
labels:
  - agent-ready
author: stevejuma
createdAt: 2026-06-17T13:13:56.185Z
updatedAt: 2026-06-18T15:50:57.745Z
base:
  vcs: unknown
  revision: main
workspace:
  engine: jj
  name: cy-CY-0019
  path: .changeyard/workspaces/CY-0019/repo
branch:
  name: cy/CY-0019-provider-backed-vcs-pr-operations
remote:
  provider: noop
  issueNumber: null
  issueUrl: null
  pullRequestNumber: null
  pullRequestUrl: null
  mergedLocally: true
checks:
  profile: standard
  lastRun: 2026-06-17T13:34:58.968Z
  lastStatus: passed
planning:
  model: openspec-lite
  storage: inline
  schema: changeyard-openspec-lite@1
  strictness: normal
  phase: draft
  gates:
    proposal: pass
    specDeltas: pass
    design: pass
    tasks: pass
    verification: pass
    strictClarifications: skipped
    strictChecklist: skipped
    strictAnalysis: skipped
mergedAt: 2026-06-17T13:36:11.747Z
review:
  required: false
  waivedAt: 2026-06-18T15:50:57.745Z
  waivedBy: cy doctor
  waiverReason: Stale completed merged change older than 0 days had no review artifact.
---

# Summary

Refactor VCS stacked pull request submission to use Changeyard's provider abstraction instead of direct GitHub calls, and add local PR association caching for branch/bookmark inventory.

# Motivation

The VCS app currently hard-codes GitHub API calls for stacked PR preview and submission even though Changeyard already has forge providers. This duplicates provider logic, blocks Forgejo/GitLab support, and forces branch inventory to fetch remotely before it can know about active PRs.

# Plan

- [x] Extend provider interfaces with branch-level PR lookup, creation, base update, and managed comment APIs.
- [x] Implement those APIs for GitHub, Forgejo, GitLab, and local-folder.
- [x] Add a local VCS PR cache under `.changeyard/cache`.
- [x] Refactor JJ stack submit to use provider APIs and update cache entries.
- [x] Populate branch/bookmark inventory PR metadata from the local cache.
- [x] Cover provider operations, stack submit behavior, and cache-backed inventory with tests.

<!-- cy:proposal:start -->
# Proposal

## Intent

Make VCS PR functionality provider-backed and locally cacheable so stacked PR workflows work through Changeyard's forge abstraction and branch inventory can show known active PRs without provider fetches.

## Scope

### In Scope

- [x] Provider interface additions for branch-head PR operations and managed PR comments.
- [x] Provider implementations for GitHub, Forgejo, GitLab, and local-folder.
- [x] VCS PR cache read/write helpers.
- [x] JJ stacked PR preview/submit refactor.
- [x] Inventory PR hydration from cache.
- [x] Unit/integration tests for provider calls, cache behavior, and stacked submit.

### Out of Scope

- [ ] Embedding PR metadata in Git/JJ commit descriptions.
- [ ] Changing normal `cy complete` lifecycle semantics beyond delegating provider PR creation internally.
- [ ] Live remote refreshes during ordinary branch inventory reads.

## Approach

Keep stack derivation and bookmark push behavior in VCS code, but move all forge-specific PR and comment operations into `ChangeProvider`. Use `.changeyard/cache/vcs-prs.json` as a local hint store keyed by provider/repository/head. Use provider lookup during stack submit preview only when the cache lacks an open association, then persist any discovered or created PR.
<!-- cy:proposal:end -->

<!-- cy:spec-deltas:start -->
# Specification Deltas

## ADDED Requirements

- Providers that support PRs SHALL expose branch-head PR lookup, branch PR creation, PR base updates, and managed PR comments.
- VCS stack submit preview SHALL consult a local PR cache before performing provider lookup.
- VCS branch/bookmark inventory SHALL populate PR metadata from local cache without remote fetches.
- VCS stack submit SHALL update local PR cache entries after discovering, creating, or updating PRs.

## MODIFIED Requirements

- JJ stacked PR submit SHALL use the configured Changeyard provider instead of direct GitHub API calls.
- Existing `createPullRequest` provider behavior SHALL remain available for the change workflow.

## REMOVED Requirements

- Direct GitHub-only PR lookup/create/update/comment calls from the VCS stack submit path.
<!-- cy:spec-deltas:end -->

<!-- cy:design:start -->
# Design

## Technical Approach

Add provider input/result types in `ChangeProvider.ts`. Implement the methods in remote providers using existing `curlJson` conventions and keep token/config validation in each provider. Add a VCS PR cache module under the provider or VCS area, with helpers to read, write, upsert, and look up active PRs by provider/repository/head. Refactor `stack-submit.ts` to create the configured provider, resolve stack items, read cached PRs, perform provider lookup on cache miss, and call provider create/update/comment operations during submit. Pass cache-derived PR metadata into JJ inventory rows.

## Architecture Decisions

- Local cache plus managed provider comments is the persistence model.
- Cache entries are fast local hints, not canonical remote truth.
- Provider lookup is acceptable during stack submit preview to prevent duplicate PRs, but not during ordinary inventory reads.
- Commit/JJ description markers are avoided because they rewrite commit IDs.

## Data / State Impact

Add `.changeyard/cache/vcs-prs.json`, ignored by git through the existing cache ignore rule. Store provider, repo identity, head, base, PR number, PR URL, state, and updated timestamp. Existing change frontmatter remains unchanged.

## Workspace / Provider Impact

GitHub, Forgejo, GitLab, and local-folder providers gain new optional PR operation methods. Noop remains unsupported. VCS stack submit becomes provider-neutral at the abstraction boundary but still depends on JJ bookmark pushes for JJ stacks.

## Risks

- Provider API differences may diverge in edge cases; tests should assert request shapes for each provider.
- Cache can become stale; submit preview refreshes cache misses and submit updates cache after mutations.
- Local-folder simulation may not perfectly model remote providers; keep it deterministic and contract-focused.
<!-- cy:design:end -->

<!-- cy:tasks:start -->
# Tasks

## 1. Planning

- [x] Confirm behavior and constraints

## 2. Implementation

- [x] Extend provider PR operation interface and provider implementations
- [x] Add local VCS PR cache helpers
- [x] Refactor stack submit to use provider operations and cache
- [x] Hydrate branch inventory PR metadata from cache

## 3. Verification

- [x] Run focused provider and VCS stack submit tests
- [x] Run CLI build
- [x] Record verification results
<!-- cy:tasks:end -->

<!-- cy:verification:start -->
# Verification

## Expected Checks

- `pnpm run build:cli`
- `node --test --test-force-exit dist/tests/vcs-jj-stack-submit.test.js dist/tests/changeyard.test.js`
- `pnpm test` if time permits

## Manual Scenarios

- Preview stacked PR submit with cached PR data and confirm no duplicate remote lookup for that head.
- Preview stacked PR submit with no cached PR and confirm provider lookup writes cache.
- Open branches inventory after cache write and confirm PR metadata renders from cache.

## Result

Passed:

- `pnpm run build:cli`
- `node --test --test-force-exit dist/tests/vcs-jj-stack-submit.test.js dist/tests/changeyard.test.js`

Also attempted `pnpm test`; it is blocked in the existing `@changeyard/merge` package build by missing `@radix-ui/react-dropdown-menu` types and existing implicit-any errors in `packages/merge/src/react/index.tsx`.
<!-- cy:verification:end -->

# Acceptance Criteria
- [x] VCS stacked PR submit has no direct GitHub API calls.
- [x] Provider interface supports branch PR lookup, creation, base update, and managed comments.
- [x] GitHub, Forgejo, GitLab, and local-folder implement the new provider operations.
- [x] `.changeyard/cache/vcs-prs.json` records active PR associations.
- [x] Branch/bookmark inventory uses cache-backed PR metadata without remote calls.
- [x] Focused build/tests pass or failures are documented.

# Agent Plan

1. Add provider-level branch PR operation types and implementations.
2. Add cache helper for active VCS PR associations.
3. Refactor JJ stack submit to use provider operations and cache.
4. Wire cache PR metadata into JJ and Git branch inventory.
5. Update tests for provider contracts, stack submit, and cache-backed inventory.
6. Run focused verification and record results.

# Completion Notes

Implemented provider-backed VCS PR operations and moved JJ stack submit off direct GitHub calls. Added `.changeyard/cache/vcs-prs.json` helpers, cache-backed inventory hydration, provider contract tests, stack-submit cache tests, and local-folder simulated PR/comment storage. Focused build and tests pass. Broader `pnpm test` is currently blocked by unrelated `@changeyard/merge` build errors.
