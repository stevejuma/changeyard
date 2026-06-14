# Changeyard VCS JJ Screen: GitButler-Inspired Product Spec and Agent Implementation Plan

**Date:** 2026-06-11  
**Primary goal:** Add a GitButler-like VCS screen to Changeyard that supports **Jujutsu (`jj`) first**, with an intentionally separate VCS package that can later support Git.  
**Proposed initial route:** `/vcs/jj`  
**Primary implementation constraint:** Do not break, regress, or reshape the current Changeyard Kanban / Markdown workflow.

---

## 1. Executive summary

Changeyard already has the right foundation for this feature: it is a local-first app with a CLI/UI surface, markdown-backed workflows, workspace engines, and existing support for `vcs.engine` values such as `jj` and `git-worktree`. The proposed work adds a new VCS feature area, isolated from the existing `kanban` package, that presents a GitButler-style stack/workspace UI for JJ repositories.

The implementation should start as a **feature-flagged, read-only JJ stack viewer**, then grow into safe mutating workflows:

1. Detect whether the selected workspace is a JJ repository.
2. Render bookmarks, commits/changes, unassigned working-copy changes, and stacked PR metadata.
3. Let users preview drag-and-drop operations before mutation.
4. Add confirmed JJ operations for reordering, squashing, absorbing, and moving commits/bookmarks.
5. Integrate `jj-stack` (`jst`) for stacked PR creation/update.
6. Add operation history and undo/restore affordances.
7. Only then consider Git parity, UI consolidation, or app splitting.

This should be implemented as a new VCS package/module boundary, not as a rewrite of the Kanban package.

---

## 2. Important assumptions and design decisions

### 2.1 Assumptions

- Changeyard should remain a **markdown-first project/change workflow tool**.
- The current Kanban UI and CLI commands must continue to work exactly as they do today.
- It is acceptable to duplicate UI primitives initially to avoid coupling VCS delivery to a larger UI refactor.
- JJ support should use JJ concepts directly: **changes, commit IDs, bookmarks, ancestry, operation log**.
- Git support should be designed for later through an adapter interface, not implemented first.
- The implementation agent should perform a live repository analysis before coding because this spec was prepared from public repository/docs inspection rather than a local clone of the target repos.

### 2.2 Key decisions

| Decision | Rationale |
|---|---|
| Create `packages/vcs` | Keeps the new feature independent from `packages/kanban`. |
| Add `/vcs/jj` as the first VCS screen | Makes JJ the first-class implementation path while leaving `/vcs/git` open. |
| Add a shared backend adapter boundary | Prevents UI code from depending directly on `jj` command details. |
| Use read-only UI first | Reduces risk of corrupting user history or breaking existing Changeyard flows. |
| Gate mutations behind preview + confirmation | Drag-and-drop VCS mutations are powerful and potentially destructive. |
| Use `jj-stack` for stacked PR publishing initially | It already solves the JJ-to-GitHub stacked PR workflow. |
| Duplicate UI components at first | Avoids destabilising the Kanban package; consolidation can be a later milestone. |
| Use Radix/shadcn-style primitives | Good fit for dialogs, menus, tabs, popovers, scroll areas, tooltips, and accessible interactions. |
| Do not copy GitButler code/assets | The goal is a compatible/inspired workflow, not a source or asset copy. |

---

## 3. Source findings

### 3.1 GitButler workflow model

GitButler’s public documentation and README describe a desktop workflow built around:

- **Parallel branches**: multiple branches can be applied to the workspace at once.
- **Target branch**: the integration branch GitButler tracks and compares against.
- **Branch lanes/cards**: a workspace view where branches and commits are visually organised.
- **Stacked branches/PRs**: ordered dependent branches that can be turned into dependent pull requests.
- **Drag-and-drop commit editing**: changes can be dragged into commits; commits can be moved, squashed, split, or edited.
- **Branch movement**: branch headers can be moved between stacks or torn off into new independent stacks.
- **Operation history/undo**: destructive or complex changes should be recoverable.

For Changeyard, the goal is not to reproduce GitButler implementation internals. The useful product pattern is:

> A visual workspace that shows the current repo state as movable units, lets the user restructure those units safely, and keeps PRs aligned with the local stacked history.

### 3.2 Changeyard repository model

The current public Changeyard repository indicates:

- A Node-based TypeScript project.
- Workspaces including `packages/kanban` and `packages/tui`.
- A markdown-backed workflow where the UI reads canonical markdown files rather than maintaining a separate Kanban state store.
- Workspace execution engines including `plain-copy`, `jj`, and `git-worktree`.
- Existing provider concepts for GitHub/GitLab/Forgejo.

This suggests the VCS feature should not attempt to become the new canonical Changeyard workflow state. Instead, it should be a **repository/workspace companion view** that can participate in the existing project execution workflow.

### 3.3 JJ and jj-stack model

Jujutsu differs from Git in ways that should shape the UI:

- JJ has **changes** with stable change IDs, while commit IDs can evolve after rewrites.
- JJ uses **bookmarks** for Git-compatible branch pointers.
- JJ has an **operation log**, making undo/restore an important first-class affordance.
- JJ history rewriting is a normal workflow, not an exceptional advanced action.
- `jj-stack` can create and update stacked PRs by analysing JJ bookmarks/log output, constructing a dependency graph, pushing bookmarks, and creating/updating PRs.

Therefore, the UI should show both:

- a human-oriented stable **change ID**, and
- a Git/GitHub-oriented **commit ID/bookmark/PR** representation.

---

## 4. Product goals and non-goals

### 4.1 Goals

1. Add a `/vcs/jj` screen that renders a JJ repository as stack lanes and commit/change cards.
2. Show unassigned working-copy changes and let the user assign or absorb them into existing commits.
3. Show bookmarks as branch/stack segments and commit ancestry between them.
4. Support safe drag-and-drop for commit movement, squash/absorb workflows, and bookmark/branch movement.
5. Integrate stacked PR creation/update through `jj-stack` first.
6. Keep the VCS package separate from the Kanban package.
7. Preserve current Changeyard behaviour and tests.
8. Leave room for later Git support through an adapter interface.
9. Leave room for later package/app splitting.

### 4.2 Non-goals for the first implementation

- Full GitButler parity.
- Replacing the current Kanban board.
- Replacing Changeyard markdown files as the canonical project workflow state.
- Implementing a full Git adapter in the first version.
- Copying GitButler source code, styles, screenshots, or branded assets.
- Building a bespoke GitHub PR system before trying `jj-stack` integration.
- Removing or restructuring existing modules unless required for the route/build integration.

---

## 5. Information architecture

### 5.1 Proposed routes

| Route | Purpose | Phase |
|---|---|---|
| `/vcs` | VCS landing/detection page. Shows repo engine, health, and entry points. | M1 |
| `/vcs/jj` | Main JJ workspace and stack board. | M3 |
| `/vcs/jj/branches` | Bookmark/branch inventory and target branch view. | M7 |
| `/vcs/jj/history` | JJ operation log, undo/restore affordances. | M7 |
| `/vcs/settings` | VCS settings, command paths, provider config, safety preferences. | M7 |
| `/vcs/git` | Placeholder route for future Git adapter. | Later |

### 5.2 Navigation model

Add a VCS entry point without disrupting the existing app. Possible options, in order of safety:

1. Add a feature-flagged VCS link in the current local UI shell.
2. Add a direct route only, hidden from the primary nav until stable.
3. Add a separate command such as `cy vcs ui` only if integrating into `cy ui` is risky.

The default recommendation is:

```text
cy ui --vcs
```

or an environment flag:

```text
CHANGEYARD_VCS=1 cy ui
```

Then expose `/vcs` and `/vcs/jj`.

---

## 6. GitButler-inspired screen spec mapped to Changeyard

## 6.1 `/vcs` landing screen

### Purpose

Detect the current repository/workspace and route the user to the correct VCS experience.

### Layout

```text
┌────────────────────────────────────────────────────────────────────┐
│ Changeyard / VCS                                                   │
├────────────────────────────────────────────────────────────────────┤
│ Repository health card                                             │
│ - Path: /path/to/repo                                              │
│ - Engine detected: jj | git | none                                 │
│ - JJ version                                                       │
│ - Git remote                                                       │
│ - Provider: GitHub/GitLab/Forgejo/none                             │
│ - Base/trunk: main/master/trunk/custom                             │
│                                                                    │
│ [Open JJ Stack View] [Configure] [Refresh]                         │
│                                                                    │
│ Setup checklist                                                    │
│ ✓ jj installed                                                     │
│ ✓ repository root detected                                         │
│ ✓ git remote detected                                              │
│ ? jj-stack installed                                               │
└────────────────────────────────────────────────────────────────────┘
```

### States

| State | UX |
|---|---|
| Not a repo | Explain that VCS requires a Git/JJ workspace. Do not error. |
| Git repo only | Show “Git support coming later” and optional “Initialise JJ?” guidance, but do not mutate. |
| JJ repo | Show “Open JJ Stack View”. |
| JJ missing | Show command/path diagnostic. |
| `jst` missing | Allow read-only mode; mark PR publishing unavailable. |

### Initial API

```http
GET /api/vcs/detect
```

Example response:

```json
{
  "ok": true,
  "path": "/repo",
  "engine": "jj",
  "jj": {
    "available": true,
    "version": "0.30.0",
    "root": "/repo"
  },
  "git": {
    "available": true,
    "remote": "origin",
    "defaultBranch": "main"
  },
  "provider": {
    "kind": "github",
    "repo": "owner/name"
  },
  "jjStack": {
    "available": true,
    "version": "x.y.z"
  }
}
```

---

## 6.2 `/vcs/jj` main stack workspace

### Purpose

Replicate the core GitButler-style workflow for JJ:

- See all local stack branches/bookmarks.
- See commits/changes in each stack.
- See unassigned working-copy changes.
- See PR state for each branch/bookmark.
- Drag changes/commits/bookmarks to restructure the stack.
- Preview and apply safe JJ operations.
- Submit/update stacked PRs.

### High-level layout

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ VCS / JJ      repo-name      Base: main      [Fetch] [Refresh] [Submit Stack]│
├─────────────────────────────────────────────────────────────────────────────┤
│ Left rail / filters       │ Main stack board                         │ Drawer │
│                           │                                          │        │
│ Repo health               │ ┌───────────────┐ ┌───────────────┐      │ Diff   │
│ Current change            │ │ Stack A       │ │ Stack B       │      │ Commit │
│ Unassigned changes        │ │ bookmark/top  │ │ bookmark/top  │      │ PR     │
│ PR status filters         │ │               │ │               │      │ Ops    │
│                           │ │ Branch seg 2  │ │ Branch seg 1  │      │        │
│                           │ │ Commit cards  │ │ Commit cards  │      │        │
│                           │ │ Branch seg 1  │ │               │      │        │
│                           │ │ Commit cards  │ │               │      │        │
│                           │ └───────────────┘ └───────────────┘      │        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Primary components

#### Top toolbar

Fields/actions:

- Repository name/path.
- Engine badge: `JJ`.
- Base/trunk selector.
- Current operation status.
- `Fetch` button.
- `Refresh` button.
- `Submit stack` button.
- `Dry run` toggle for PR operations.
- Conflict/rebase warning indicator.
- Settings menu.

#### Left rail

Sections:

1. **Repository status**
   - root path
   - current revision/change
   - base/trunk
   - upstream sync state

2. **Unassigned changes**
   - file list from working copy/current change
   - staged/unstaged terminology should be avoided for JJ unless needed for Git adapter later
   - each file draggable into a commit/branch target

3. **Filters**
   - show only stacks with PRs
   - show only changed stacks
   - show conflicts
   - show hidden/archived bookmarks

4. **Actions**
   - new stack
   - new bookmark
   - submit selected stack
   - operation history

#### Stack lane

A stack lane represents a chain of dependent JJ bookmarks/branch segments.

Display:

- Stack name, usually the top bookmark name.
- Parent/base branch.
- Number of branch segments.
- Number of commits/changes.
- PR status summary.
- Push status.
- Conflict status.

Example:

```text
┌───────────────────────────────┐
│ feature/top-of-stack          │
│ 3 branches · 8 changes · 2 PRs │
├───────────────────────────────┤
│ Branch: feature/api           │
│ PR #124 · open · checks ✓      │
│                               │
│ [change card]                 │
│ [change card]                 │
├───────────────────────────────┤
│ Branch: feature/model         │
│ PR #123 · review requested     │
│                               │
│ [change card]                 │
│ [change card]                 │
└───────────────────────────────┘
```

#### Branch segment card

A branch segment corresponds to a JJ bookmark and the commits/changes reachable from that bookmark until the next lower bookmark/base.

Fields:

- bookmark name
- remote bookmark name, if any
- parent bookmark/base
- PR number/title/status, if known
- ahead/behind or needs-push status
- check status, if available
- review status, if available
- action menu

Actions:

- Create/update PR.
- Rename bookmark.
- Push bookmark.
- Rebase segment.
- Move branch to stack.
- Tear off into new stack.
- Copy branch/PR link.
- Hide/archive in UI.

#### Commit/change card

A card represents a JJ change/revision.

Fields:

- change title/description first line
- stable JJ change ID
- current commit ID
- author/time
- file count
- insertions/deletions, if available
- conflict indicator
- immutable/public indicator, if applicable
- PR/branch membership

Actions:

- View diff.
- Edit message.
- New change before.
- New change after.
- Reorder before/after another change.
- Squash into parent.
- Squash into target.
- Absorb selected unassigned changes.
- Split selected files into a new change.
- Abandon change.
- Copy change ID/commit ID.

#### Detail drawer

The right drawer changes based on selection:

| Selection | Drawer contents |
|---|---|
| File | Diff, target commit candidates, restore action. |
| Commit/change | Message, metadata, file list, diff, operations. |
| Branch segment | Bookmark details, PR details, stack relation, push status. |
| Stack | Stack graph, PR chain, submit/update plan. |
| Operation | Command preview, stdout/stderr, undo action. |

---

## 6.3 Drag-and-drop interaction matrix

All mutating drag/drop actions must follow this flow:

1. User drags an item.
2. UI highlights valid drop targets.
3. User drops.
4. UI opens a preview dialog.
5. Backend returns planned JJ command(s), affected revisions, and risk level.
6. User confirms.
7. Backend executes commands using argv arrays, not shell interpolation.
8. UI refreshes state.
9. UI shows operation result and undo affordance.

### Drag/drop operations

| Drag item | Drop target | Intended action | Candidate JJ operation |
|---|---|---|---|
| Working-copy file change | Commit card | Absorb file into that commit/change | `jj absorb --from @ --into <rev> <fileset>` or `jj squash --from @ --into <rev> <fileset>` |
| Working-copy file change | Branch segment top | Commit/squash file into the top change of that branch | Preview exact target, then absorb/squash |
| Commit/change card | Another commit/change card | Squash source into target | `jj squash --from <source> --into <target>` |
| Commit/change card | Before another card | Reorder before target | `jj rebase -r <source> -B <target>` |
| Commit/change card | After another card | Reorder after target | `jj rebase -r <source> -A <target>` |
| Commit/change card | Empty area in stack | Move change onto stack top | `jj rebase -r <source> -A <stackTop>` |
| Branch/bookmark header | Another stack | Move branch segment/branch subtree | `jj rebase -b <bookmark> -o <destination>` |
| Branch/bookmark header | Tear-off zone | Make independent stack based on trunk | `jj rebase -b <bookmark> -o <trunk>` |
| Commit/change file subset | New change dropzone | Split selected files into a new change | Phase 2: create new change + squash selected files, or drive `jj split` when safe |

### Drop validation rules

The UI must prevent or warn for:

- Moving a change into one of its descendants.
- Moving immutable/public changes unless explicit override is enabled.
- Squashing changes with conflicts.
- Rewriting already-pushed PR history without warning.
- Branch movement that would cross unrelated roots without confirmation.
- Operations while another mutation is in progress.

### Preview dialog

```text
Move change

Source:        qpvuntsm  "Add API client"
Destination:   after yxkqzpmv "Add domain model"
Operation:     Reorder change
Risk:          Rewrites local history for bookmark feature/api

Commands:
  jj rebase -r qpvuntsm -A yxkqzpmv

Affected branches:
  feature/api
  feature/top

[Cancel] [Apply]
```

---

## 6.4 `/vcs/jj/branches` branch/bookmark screen

### Purpose

Provide a branch/bookmark inventory similar to GitButler’s branches view, adapted for JJ.

### Layout

```text
┌───────────────────────────────────────────────────────────────┐
│ VCS / JJ / Branches                                           │
├───────────────────────────────────────────────────────────────┤
│ [Search bookmarks] [Show remote] [Show hidden] [Create]       │
│                                                               │
│ Local bookmarks                    Target/base log            │
│ ┌─────────────────────────────┐    ┌───────────────────────┐ │
│ │ feature/api   top of stack  │    │ main                  │ │
│ │ feature/model parent: main  │    │ recent upstream commits│ │
│ │ fix/login     has PR #88    │    │ ...                   │ │
│ └─────────────────────────────┘    └───────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### Actions

- Create bookmark.
- Rename bookmark.
- Delete local bookmark after confirmation.
- Track remote bookmark.
- Push bookmark.
- Pull/fetch remote bookmarks.
- Convert bookmark chain into visible stack.
- Open stack in `/vcs/jj`.

---

## 6.5 `/vcs/jj/history` operation history screen

### Purpose

Expose JJ’s operation log as a safety layer, equivalent in spirit to GitButler’s undo/history capability.

### Layout

```text
┌───────────────────────────────────────────────────────────────┐
│ VCS / JJ / Operation History                                  │
├───────────────────────────────────────────────────────────────┤
│ Operation list                         Operation details       │
│ ┌─────────────────────────────┐        ┌────────────────────┐ │
│ │ op abc123  rebase           │        │ command preview     │ │
│ │ op def456  squash           │        │ stdout/stderr       │ │
│ │ op ghi789  describe         │        │ affected revisions  │ │
│ └─────────────────────────────┘        │ [Restore] [Copy]    │ │
│                                        └────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### Actions

- View operation metadata.
- Copy operation ID.
- Restore/revert to operation after confirmation.
- Show command result logs for Changeyard-initiated operations.

---

## 6.6 `/vcs/settings` settings screen

### Sections

1. **Engine**
   - selected engine: `jj`
   - path to `jj`
   - path to `jst`
   - repository root

2. **Base/trunk**
   - default base branch/bookmark
   - auto-detect strategy
   - manual override

3. **Provider**
   - GitHub/GitLab/Forgejo detection
   - auth status
   - remote URL mapping

4. **Safety**
   - require preview for all drag/drop mutations
   - allow rewriting pushed changes
   - require clean working copy before stack submit
   - auto-refresh after operation

5. **Experimental**
   - enable PR submit
   - enable branch movement
   - enable file-level absorb
   - enable Git adapter placeholder

---

## 7. GitButler-to-Changeyard concept mapping

| GitButler concept | Changeyard VCS/JJ concept | Notes |
|---|---|---|
| Target branch | Base/trunk bookmark resolver | Use `main`, `master`, `trunk`, config, or JJ revsets. |
| Virtual branch | Stack lane / bookmark segment | JJ uses bookmarks, not Git-style current branches. |
| Branch lane/card | `VcsStack` lane | A visual grouping of dependent bookmarks. |
| Stacked branches | Chain of dependent JJ bookmarks | PR targets should follow parent bookmark. |
| Commit card | `VcsCommit` / JJ change card | Show both stable change ID and current commit ID. |
| Uncommitted changes | Working-copy/current change file changes | Avoid Git staged/unstaged assumptions. |
| Apply/unapply branch | Phase 2 workspace visibility/archive | JJ does not map 1:1 to GitButler virtual branch application. |
| Drag change into commit | `absorb` or `squash` operation | Must preview command first. |
| Move commit | `jj rebase -r ... -A/-B ...` | Rewrites history safely through JJ. |
| Move branch between stacks | `jj rebase -b <bookmark> -o <dest>` | Validate ancestry and PR consequences. |
| Split commit | `jj split` or controlled new-change workflow | Implement later after file-selection UX is solid. |
| Create PR stack | `jst submit` | Use `jj-stack` initially. |
| Update PR footers/base branches | `jj-stack` first, provider layer later | Avoid duplicating `jj-stack` too early. |
| Operation log/undo | JJ operation log + Changeyard command log | Surface operation IDs and restore affordances. |

---

## 8. Technical architecture

## 8.1 Package layout

Recommended initial layout:

```text
changeyard/
  packages/
    kanban/                 # existing, unchanged
    tui/                    # existing, unchanged
    vcs/                    # new package
      package.json
      src/
        app/
          VcsApp.tsx
          routes/
            VcsLanding.tsx
            JjStackBoard.tsx
            JjBranches.tsx
            JjHistory.tsx
            VcsSettings.tsx
        components/
          layout/
          stack/
          commit/
          diff/
          pr/
          operation/
          ui/               # duplicated Radix/shadcn-style primitives initially
        hooks/
        lib/
        types/
      vite.config.ts
      tsconfig.json
  src/
    vcs/                    # backend/core VCS module
      index.ts
      adapter.ts
      detect.ts
      process.ts
      jj/
        adapter.ts
        commands.ts
        parse.ts
        graph.ts
        operations.ts
        jjStack.ts
      git/
        adapter.ts          # placeholder only
      api.ts
      types.ts
  tests/
    vcs/
      fixtures/
      jj-parse.test.ts
      jj-graph.test.ts
      jj-operations.test.ts
```

Alternative if the existing server architecture strongly prefers packages:

```text
packages/
  vcs/
    src/
      server/
      client/
      shared/
```

The implementation agent should choose the shape that fits the actual repository after analysis, but the boundary must remain clear:

- `packages/kanban` must not import `packages/vcs`.
- `packages/vcs` may temporarily duplicate UI primitives from `packages/kanban`.
- Shared code extraction should be a later milestone, not a blocker.

## 8.2 VCS adapter interface

```ts
export type VcsKind = "jj" | "git";

export interface VcsContext {
  repoPath: string;
  baseRef?: string;
  provider?: VcsProviderConfig;
  dryRun?: boolean;
}

export interface VcsAdapter {
  kind: VcsKind;

  detect(ctx: Pick<VcsContext, "repoPath">): Promise<VcsDetection>;
  getState(ctx: VcsContext): Promise<VcsRepositoryState>;
  getDiff(ctx: VcsContext, request: VcsDiffRequest): Promise<VcsDiff>;

  previewOperation(
    ctx: VcsContext,
    operation: VcsOperationRequest
  ): Promise<VcsOperationPreview>;

  applyOperation(
    ctx: VcsContext,
    operation: VcsOperationRequest
  ): Promise<VcsOperationResult>;

  getOperations(ctx: VcsContext): Promise<VcsOperationLog>;
  restoreOperation(ctx: VcsContext, operationId: string): Promise<VcsOperationResult>;

  submitStack(
    ctx: VcsContext,
    request: VcsSubmitStackRequest
  ): Promise<VcsSubmitStackResult>;
}
```

## 8.3 Shared domain models

```ts
export interface VcsRepositoryState {
  engine: "jj" | "git";
  repoPath: string;
  rootPath: string;
  baseRef: string;
  currentChange?: VcsCommit;
  stacks: VcsStack[];
  unassignedChanges: VcsFileChange[];
  operations?: VcsOperationSummary[];
  provider?: VcsProviderState;
  diagnostics: VcsDiagnostic[];
  refreshedAt: string;
}

export interface VcsStack {
  id: string;
  name: string;
  baseRef: string;
  topBookmark?: string;
  branchSegments: VcsBranchSegment[];
  status: "clean" | "dirty" | "conflicted" | "needs-push" | "unknown";
}

export interface VcsBranchSegment {
  id: string;
  bookmark: string;
  remoteBookmark?: string;
  parentRef: string;
  topRevision: string;
  commits: VcsCommit[];
  pullRequest?: VcsPullRequest;
  ahead?: number;
  behind?: number;
  isMutable: boolean;
  warnings: VcsDiagnostic[];
}

export interface VcsCommit {
  id: string;              // current commit ID
  changeId?: string;       // stable JJ change ID
  title: string;
  description?: string;
  author?: string;
  timestamp?: string;
  parents: string[];
  fileStats?: VcsFileStats;
  files?: VcsFileChange[];
  mutable: boolean;
  conflicted: boolean;
  bookmarks: string[];
}

export interface VcsFileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "conflicted" | "unknown";
  oldPath?: string;
  insertions?: number;
  deletions?: number;
}

export interface VcsPullRequest {
  provider: "github" | "gitlab" | "forgejo";
  number: number;
  title: string;
  url: string;
  state: "draft" | "open" | "merged" | "closed" | "unknown";
  baseRef: string;
  headRef: string;
  reviewStatus?: "approved" | "changes-requested" | "review-required" | "unknown";
  checkStatus?: "success" | "failure" | "pending" | "unknown";
}

export interface VcsOperationRequest {
  type:
    | "absorb-file"
    | "squash-change"
    | "reorder-change"
    | "move-branch"
    | "create-bookmark"
    | "edit-message"
    | "abandon-change"
    | "restore-file";
  source?: string;
  target?: string;
  placement?: "before" | "after" | "onto";
  bookmark?: string;
  files?: string[];
  message?: string;
}
```

## 8.4 HTTP API

```http
GET    /api/vcs/detect
GET    /api/vcs/jj/state
GET    /api/vcs/jj/diff?rev=<rev>&file=<path>
POST   /api/vcs/jj/preview
POST   /api/vcs/jj/apply
POST   /api/vcs/jj/submit-stack
GET    /api/vcs/jj/operations
POST   /api/vcs/jj/operations/:operationId/restore
```

### `POST /api/vcs/jj/preview`

Request:

```json
{
  "type": "reorder-change",
  "source": "qpvuntsm",
  "target": "yxkqzpmv",
  "placement": "after"
}
```

Response:

```json
{
  "ok": true,
  "operation": "reorder-change",
  "risk": "medium",
  "summary": "Move change qpvuntsm after yxkqzpmv",
  "commands": [
    ["jj", "rebase", "-r", "qpvuntsm", "-A", "yxkqzpmv"]
  ],
  "affectedRefs": ["feature/api", "feature/top"],
  "warnings": [
    "This rewrites local history for a branch with an open PR."
  ]
}
```

## 8.5 Process execution safety

All JJ commands must be run through a safe process wrapper:

```ts
export async function runCommand(
  cwd: string,
  command: string,
  args: string[],
  options?: { timeoutMs?: number }
): Promise<CommandResult> {
  // Use child_process.spawn/execFile with argv arrays.
  // Never pass a concatenated shell string.
  // Capture stdout, stderr, exit code, duration.
  // Add timeout and cancellation.
}
```

Safety rules:

- Never shell-interpolate file names, bookmarks, or revision IDs.
- Treat all paths from the UI as untrusted.
- Validate file paths are inside repo root.
- Validate revision/bookmark identifiers against the latest parsed state.
- Log command argv and results, but avoid logging tokens.
- Prefer explicit preview endpoints before mutation.
- Return structured diagnostics, not raw unhandled stack traces.

---

## 9. JJ stack graph design

## 9.1 Detection

The JJ adapter should detect:

1. repo root
2. JJ version
3. Git remote
4. provider type
5. base/trunk ref
6. available bookmarks
7. current working-copy change
8. operation log availability
9. `jst` availability

Candidate commands:

```bash
jj root
jj version
jj git remote list
jj bookmark list
jj status
jj log --no-graph --limit 200 --template '<template>'
jj operation log --limit 20
jst --version
```

The exact templates should be locked in during implementation after confirming the installed JJ version.

## 9.2 Base/trunk resolution

Base resolution order:

1. Explicit Changeyard VCS config.
2. Existing project/workspace config, if present.
3. JJ revset alias such as `trunk()`, if configured and available.
4. Remote default branch from GitHub/Git remote metadata.
5. Fallback names: `main`, `master`, `trunk`.
6. Prompt/configure state in UI if none can be resolved.

## 9.3 Stack construction algorithm

Input:

- bookmark list
- revision graph
- base/trunk ref
- remote PR metadata if available

Algorithm:

1. Resolve every local bookmark to a revision/change.
2. Exclude bookmarks that point at the base/trunk unless explicitly requested.
3. For each bookmark, walk ancestors until:
   - another bookmark is reached,
   - the base/trunk is reached,
   - or an unknown/divergent root is reached.
4. Create a `VcsBranchSegment` for each bookmark.
5. Link branch segments by parent bookmark/base.
6. Group linked segments into `VcsStack` objects.
7. Sort each stack bottom-to-top by ancestry.
8. Render with a clear label explaining merge order.
9. Attach PR metadata by bookmark/head ref.
10. Emit diagnostics for ambiguous/divergent bookmarks.

## 9.4 Ambiguity handling

The UI must represent ambiguous state rather than hiding it:

| Condition | UI treatment |
|---|---|
| Bookmark has no ancestry relation to base | Show as detached/unknown stack. |
| Multiple bookmarks point to same commit | Show grouped bookmark badges on same branch segment. |
| Remote bookmark diverged | Show warning and disable submit until resolved. |
| Commit has conflicts | Show conflict badge and disable drag mutations. |
| PR base does not match detected parent bookmark | Show PR mismatch warning. |

---

## 10. JJ operation mapping

The exact commands should be verified during M2/M5 against the JJ version used by the project. The commands below are the intended mapping based on current JJ CLI behaviour.

## 10.1 Read operations

| UI action | Command |
|---|---|
| detect root | `jj root` |
| detect version | `jj version` |
| show status | `jj status` |
| list bookmarks | `jj bookmark list` |
| get graph | `jj log --no-graph --template <template>` |
| get diff | `jj diff -r <rev>` or `jj diff --from <from> --to <to>` |
| show operation log | `jj operation log` |

## 10.2 Mutating operations

| UI action | Candidate command |
|---|---|
| Create change after target | `jj new <target> -m <message>` |
| Create bookmark | `jj bookmark create <name> -r <rev>` |
| Edit message | `jj describe -r <rev> -m <message>` |
| Reorder change after target | `jj rebase -r <source> -A <target>` |
| Reorder change before target | `jj rebase -r <source> -B <target>` |
| Move branch/bookmark onto destination | `jj rebase -b <bookmark> -o <destination>` |
| Squash source into target | `jj squash --from <source> --into <target>` |
| Absorb working-copy changes into target | `jj absorb --from @ --into <target> <fileset>` |
| Abandon change | `jj abandon <rev>` |
| Restore file | `jj restore --changes-in <rev> <fileset>` |
| Undo last operation | `jj undo` or operation restore flow |

## 10.3 PR operations through jj-stack

Initial implementation should prefer `jj-stack`:

| UI action | Candidate command |
|---|---|
| Check `jst` availability | `jst --version` |
| Preview submit | `jst submit <bookmark> --dry-run` if supported; otherwise custom dry-run wrapper |
| Submit/update stack | `jst submit <bookmark>` |
| Show PR plan | Parse `jst` output plus provider API/cache |

If `jst` does not expose a stable machine-readable dry-run format, the implementation should wrap it as follows:

1. Build the local stack graph from JJ.
2. Show the intended ordered PR chain in Changeyard.
3. Require explicit confirmation.
4. Run `jst submit`.
5. Refresh provider PR metadata.
6. Show the result and any errors.

---

## 11. UI component plan

## 11.1 Dependencies

Prefer minimal additions. Candidate dependencies:

```json
{
  "@radix-ui/react-dialog": "latest-compatible",
  "@radix-ui/react-dropdown-menu": "latest-compatible",
  "@radix-ui/react-popover": "latest-compatible",
  "@radix-ui/react-scroll-area": "latest-compatible",
  "@radix-ui/react-tabs": "latest-compatible",
  "@radix-ui/react-tooltip": "latest-compatible",
  "@dnd-kit/core": "latest-compatible",
  "@dnd-kit/sortable": "latest-compatible",
  "lucide-react": "latest-compatible"
}
```

If shadcn is already present or easily introduced, use shadcn-style components inside `packages/vcs/src/components/ui`:

- Button
- Card
- Dialog
- DropdownMenu
- Tabs
- Tooltip
- Badge
- ScrollArea
- Separator
- Sheet/Drawer
- Command palette later

Do not force a whole-app shadcn migration as part of this feature.

## 11.2 Initial component tree

```text
VcsApp
  VcsShell
    VcsTopBar
    VcsSidebar
    RouteOutlet

JjStackBoard
  RepositoryHealthBanner
  UnassignedChangesPanel
    FileChangeRow
  StackBoard
    StackLane
      StackHeader
      BranchSegmentCard
        BranchSegmentHeader
        CommitCardList
          CommitCard
  VcsDetailDrawer
    DiffPanel
    CommitDetails
    BranchDetails
    StackSubmitPlan
  OperationPreviewDialog
```

## 11.3 Accessibility requirements

- Every drag/drop operation must have a keyboard/menu equivalent.
- Commit card actions must be accessible from a dropdown menu.
- Dialogs must trap focus and have clear titles/descriptions.
- Error/warning states must not rely only on colour.
- DnD targets must have visible focus/hover states.
- Reduced-motion users should not require animated drag interactions.

---

## 12. Non-regression guardrails

The current Changeyard app functionality must not be affected. Enforce this with technical guardrails:

1. VCS routes are feature-flagged until stable.
2. Existing CLI command behaviour must remain unchanged.
3. Existing markdown schemas and project files must not be migrated for VCS.
4. `packages/kanban` must not import VCS code.
5. VCS state should be derived from repo/JJ, not written into existing Kanban markdown.
6. Any cache should live under a clearly named VCS cache path, for example:

```text
.changeyard/cache/vcs/jj/
```

7. Mutating JJ operations require preview/confirm.
8. Every milestone must run existing tests/builds before landing.

Recommended verification commands for every implementation PR:

```bash
pnpm install
pnpm run build
pnpm test
pnpm run lint --if-present
pnpm run typecheck --if-present
node ./dist/cli.js --help || true
```

The agent should adjust these commands based on actual package scripts discovered in M0.

---

## 13. Milestone plan

## M0 — Live repo analysis and design lock

**Goal:** Ground this plan in the actual current Changeyard codebase before implementation.

**Tasks:**

- [ ] Clone `stevejuma/changeyard` locally.
- [ ] Record Node/pnpm/pnpm/yarn expectations.
- [ ] Read root `package.json` and workspace package scripts.
- [ ] Inspect `packages/kanban` build/runtime structure.
- [ ] Inspect `packages/tui` for CLI patterns or shared types.
- [ ] Inspect `src` for CLI/server/router/api conventions.
- [ ] Search for AIDEV/agent instructions and obey them.
- [ ] Run existing build/test commands before modifying anything.
- [ ] Identify how static UI routes are served.
- [ ] Identify where workspace engines are implemented.
- [ ] Identify current provider abstractions.
- [ ] Decide whether `/vcs` is served by the existing UI server or by a separate command.
- [ ] Update this plan with exact file paths and scripts.

**Suggested commands:**

```bash
git clone https://github.com/stevejuma/changeyard.git
cd changeyard
node --version
pnpm --version
find . -name 'AIDEV*' -o -name 'AGENTS.md' -o -name 'CLAUDE.md'
cat package.json
find packages -maxdepth 3 -type f | sort | sed -n '1,200p'
find src -maxdepth 3 -type f | sort | sed -n '1,200p'
grep -R "vcs.engine\|git-worktree\|jj\|provider\|ui" -n src packages tests || true
pnpm install
pnpm run build
pnpm test
```

**Deliverables:**

- Repo analysis notes committed as `docs/vcs-jj/repo-analysis.md` or similar.
- Confirmed implementation file map.
- Confirmed build/test commands.
- Confirmed feature flag strategy.

**Acceptance criteria:**

- Existing app builds/tests before any VCS change.
- The implementation path is adjusted to actual code structure.
- No VCS code has landed yet except documentation, if desired.

---

## M1 — Feature-flagged VCS package shell

**Goal:** Add a separate VCS frontend package and route without changing existing app behaviour.

**Tasks:**

- [ ] Create `packages/vcs`.
- [ ] Add TypeScript/Vite/React config matching the existing frontend approach.
- [ ] Add basic VCS shell components.
- [ ] Add `/vcs` route behind a feature flag.
- [ ] Add `/vcs/jj` placeholder route.
- [ ] Add a minimal static “VCS coming online” UI.
- [ ] Add package scripts for build/typecheck.
- [ ] Ensure root build either includes VCS safely or has an explicit `build:vcs` script.
- [ ] Verify existing Kanban route still loads.

**Deliverables:**

- `packages/vcs` package.
- `/vcs` and `/vcs/jj` static pages.
- Feature flag documented.

**Acceptance criteria:**

- Existing UI still works without the feature flag.
- With the feature flag, `/vcs` renders.
- No backend JJ commands are executed yet.
- Existing tests/build pass.

---

## M2 — Backend VCS adapter foundation

**Goal:** Add a safe backend/core VCS layer that can detect JJ without mutating anything.

**Tasks:**

- [ ] Add `src/vcs/types.ts` domain models.
- [ ] Add `src/vcs/adapter.ts` interface.
- [ ] Add `src/vcs/process.ts` safe command runner.
- [ ] Add `src/vcs/detect.ts`.
- [ ] Add `src/vcs/jj/adapter.ts` read-only skeleton.
- [ ] Add `GET /api/vcs/detect`.
- [ ] Add tests for command runner argument handling.
- [ ] Add tests for detection fallback states.
- [ ] Add UI integration on `/vcs` landing page.

**Deliverables:**

- Read-only detection endpoint.
- Landing page shows repo/JJ health.

**Acceptance criteria:**

- Non-JJ repos show a friendly state.
- JJ repos show root/version/base diagnostics.
- No mutation commands exist yet.
- Existing build/test pass.

---

## M3 — JJ read model and stack graph

**Goal:** Build and render real JJ repository state as stack lanes.

**Tasks:**

- [ ] Add JJ command wrappers for `root`, `version`, `status`, `bookmark list`, `log`, and operation log read.
- [ ] Design a stable `jj log` template for parser-friendly output.
- [ ] Add parser fixtures for representative JJ outputs.
- [ ] Implement bookmark-to-stack graph builder.
- [ ] Implement base/trunk resolution.
- [ ] Add `GET /api/vcs/jj/state`.
- [ ] Add `GET /api/vcs/jj/diff`.
- [ ] Render read-only stack lanes in `/vcs/jj`.
- [ ] Render unassigned working-copy changes.
- [ ] Render commit/change cards.
- [ ] Render diagnostics for ambiguous state.

**Deliverables:**

- Read-only `/vcs/jj` stack board.
- Parser/graph tests.
- Diff drawer.

**Acceptance criteria:**

- In a sample JJ repo, bookmarks appear as stack segments.
- Commits/changes show title, change ID, commit ID, files, and warnings.
- Unassigned changes appear in the left rail.
- No drag/drop mutations are enabled yet.
- Existing Changeyard flows pass tests/build.

---

## M4 — GitButler-style main screen UX with disabled/preview-only operations

**Goal:** Add the full interaction surface while still preventing accidental mutation.

**Tasks:**

- [ ] Add Radix/shadcn-style components needed by VCS.
- [ ] Add stack lane component.
- [ ] Add branch segment component.
- [ ] Add commit/change card component.
- [ ] Add detail drawer.
- [ ] Add operation preview dialog.
- [ ] Add DnD affordances using `@dnd-kit` or existing library.
- [ ] Add valid/invalid drop target highlighting.
- [ ] Add keyboard alternatives for each DnD action.
- [ ] Add `POST /api/vcs/jj/preview` returning command plans without execution.
- [ ] Wire drag/drop to preview dialog only.

**Deliverables:**

- Interactive but preview-only `/vcs/jj` board.
- Operation preview API.
- Accessibility baseline.

**Acceptance criteria:**

- User can drag commits/files/bookmark headers and see a safe preview.
- No preview operation mutates repo state.
- Invalid drops are clearly rejected.
- Keyboard/menu equivalents exist for core actions.
- Existing app still works.

---

## M5 — Mutating JJ operations

**Goal:** Implement confirmed JJ mutations safely.

**Tasks:**

- [ ] Add `POST /api/vcs/jj/apply`.
- [ ] Implement edit message.
- [ ] Implement create bookmark.
- [ ] Implement create new change before/after.
- [ ] Implement reorder change before/after.
- [ ] Implement squash source into target.
- [ ] Implement absorb selected files into target.
- [ ] Implement move branch/bookmark to another stack.
- [ ] Implement tear-off branch to base/trunk.
- [ ] Implement abandon change with confirmation.
- [ ] Implement restore file with confirmation.
- [ ] Capture operation ID/result after each mutation.
- [ ] Refresh state after each mutation.
- [ ] Add undo affordance.
- [ ] Add integration tests using temporary JJ repos.

**Deliverables:**

- Safe confirmed mutations.
- Operation result/undo UI.
- Integration tests.

**Acceptance criteria:**

- Every mutating UI action previews commands first.
- Confirmed operations execute successfully in fixture repos.
- Failed operations show useful stderr and do not crash UI.
- Undo/operation restore path is visible.
- Pushed/open-PR rewrite warnings are shown before mutation.
- Existing Changeyard functionality remains unaffected.

---

## M6 — Stacked PR publishing through jj-stack

**Goal:** Support stacked PR creation/update using `jj-stack` first.

**Tasks:**

- [ ] Add `src/vcs/jj/jjStack.ts` wrapper.
- [ ] Detect `jst` availability/version.
- [ ] Add `POST /api/vcs/jj/submit-stack`.
- [ ] Add dry-run/preview mode if supported or emulate preview from local graph.
- [ ] Add submit stack dialog.
- [ ] Show ordered PR plan bottom-to-top.
- [ ] Run `jst submit <bookmark>` after confirmation.
- [ ] Refresh PR metadata after submit.
- [ ] Attach PR cards to branch segments.
- [ ] Display PR state, base/head, and links.
- [ ] Handle missing auth/provider states gracefully.

**Deliverables:**

- Submit/update stack UX.
- `jj-stack` integration wrapper.
- PR cards in stack lanes.

**Acceptance criteria:**

- Without `jst`, `/vcs/jj` remains usable in read/mutation mode but PR submit is disabled.
- With `jst`, user can preview and submit/update a stack.
- Stack order and PR base relationships are shown before submit.
- Errors from `jst` are visible and actionable.
- Existing tests/build pass.

---

## M7 — Branches, history, and settings screens

**Goal:** Complete the supporting VCS surfaces.

**Tasks:**

- [ ] Implement `/vcs/jj/branches`.
- [ ] Implement bookmark search/filtering.
- [ ] Implement bookmark action menu.
- [ ] Implement `/vcs/jj/history`.
- [ ] Show JJ operation log.
- [ ] Add restore/revert confirmation UX.
- [ ] Implement `/vcs/settings`.
- [ ] Add command path diagnostics.
- [ ] Add base/trunk configuration.
- [ ] Add safety preferences.
- [ ] Add experimental flags for risky operations.

**Deliverables:**

- Branch/bookmark screen.
- Operation history screen.
- VCS settings screen.

**Acceptance criteria:**

- User can inspect bookmarks outside the main board.
- User can inspect JJ operations and restore from a selected operation after confirmation.
- Settings persist in the appropriate Changeyard config location without touching Kanban markdown state.
- Existing app remains stable.

---

## M8 — Hardening, docs, and non-regression pass

**Goal:** Make the feature safe enough to land behind the feature flag or as an experimental route.

**Tasks:**

- [ ] Add docs: `docs/vcs-jj.md`.
- [ ] Add troubleshooting guide.
- [ ] Add sample JJ repository fixture script.
- [ ] Add UI empty states.
- [ ] Add loading and error boundaries.
- [ ] Add conflict-state handling.
- [ ] Add accessibility pass.
- [ ] Add no-JJ/no-remote/no-provider test states.
- [ ] Run full test/build matrix.
- [ ] Manual smoke test existing Kanban UI.
- [ ] Manual smoke test `/vcs` disabled/enabled.

**Deliverables:**

- Documentation.
- Hardening fixes.
- Final non-regression report.

**Acceptance criteria:**

- Feature can land without impacting default Changeyard usage.
- `/vcs/jj` is discoverable only when enabled.
- Errors are clear and recoverable.
- Full test/build suite passes.

---

## M9 — Later consolidation and split-app options

**Goal:** Reduce duplication and prepare for future scale after JJ support proves useful.

**Possible tasks:**

- [ ] Extract shared UI primitives to `packages/ui`.
- [ ] Extract shared API client utilities.
- [ ] Add Git adapter interface implementation.
- [ ] Add `/vcs/git` screen.
- [ ] Split VCS into a separate app package if bundle/runtime coupling becomes a problem.
- [ ] Integrate VCS state into Changeyard task/change workflows where useful.
- [ ] Add provider-native PR creation as an alternative to `jj-stack`.

**Acceptance criteria:**

- Consolidation is based on proven duplication, not done speculatively.
- Kanban and VCS can still be developed independently.

---

## 14. Implementation task breakdown for the agent

This section is written as executable backlog items.

### Epic A — Repo analysis

- [ ] Run M0 analysis commands.
- [ ] Document actual file paths and package scripts.
- [ ] Identify existing route/server/static asset mechanism.
- [ ] Identify current config persistence mechanism.
- [ ] Identify provider abstractions.
- [ ] Identify existing process execution helpers.
- [ ] Confirm package manager and lockfile expectations.

### Epic B — VCS package shell

- [ ] Create `packages/vcs`.
- [ ] Add build/typecheck scripts.
- [ ] Add shell layout.
- [ ] Add `/vcs` static route.
- [ ] Add feature flag.
- [ ] Add route smoke tests if existing app has route tests.

### Epic C — VCS backend foundation

- [ ] Define shared types.
- [ ] Implement safe process runner.
- [ ] Implement adapter interface.
- [ ] Implement detection.
- [ ] Add `/api/vcs/detect`.
- [ ] Wire landing page.

### Epic D — JJ read model

- [ ] Implement command wrappers.
- [ ] Implement parser fixtures.
- [ ] Implement graph builder.
- [ ] Implement state endpoint.
- [ ] Implement diff endpoint.
- [ ] Render read-only board.

### Epic E — UX interaction surface

- [ ] Add board/lane/cards.
- [ ] Add drawer.
- [ ] Add DnD primitives.
- [ ] Add operation preview dialog.
- [ ] Add preview endpoint.
- [ ] Add keyboard actions.

### Epic F — JJ mutations

- [ ] Implement `applyOperation`.
- [ ] Add command preview-to-apply validation.
- [ ] Add mutation commands.
- [ ] Add operation result logs.
- [ ] Add undo/restore affordance.
- [ ] Add integration tests.

### Epic G — Stacked PRs

- [ ] Add `jst` detection.
- [ ] Add stack submit preview.
- [ ] Add stack submit execution.
- [ ] Add PR metadata mapping.
- [ ] Add PR cards.
- [ ] Add provider/auth diagnostics.

### Epic H — Supporting screens

- [ ] Branches screen.
- [ ] History screen.
- [ ] Settings screen.
- [ ] Documentation.
- [ ] Non-regression pass.

---

## 15. Agent execution protocol

The implementation agent should use this workflow:

1. **Analyse first.** Do not start by creating files.
2. **Run existing tests before changes.** Capture the baseline.
3. **Land small milestones.** Prefer one milestone per PR/commit group.
4. **Keep VCS isolated.** Do not make Kanban import VCS.
5. **Use feature flags.** Default behaviour must remain unchanged.
6. **Add tests with every backend operation.** Especially parser and graph tests.
7. **Use previews for mutations.** No drag/drop operation should mutate immediately.
8. **Run full verification after each milestone.**
9. **Document deviations.** If the real repo structure differs, update this spec.
10. **Prefer duplication now, consolidation later.**

### Agent kickoff prompt

```text
You are implementing the Changeyard VCS JJ feature described in docs/vcs-jj-plan.md.

Start with M0 only:
1. Clone/open the current repo.
2. Read all repo-specific agent instructions.
3. Inspect package scripts, workspaces, server routes, frontend build setup, VCS engine code, provider code, and config persistence.
4. Run the existing test/build baseline.
5. Produce repo-analysis notes with the exact file map and the safest integration plan.
6. Do not implement the feature until the analysis is committed or clearly reported.

After M0, proceed milestone by milestone:
- Keep packages/vcs separate from packages/kanban.
- Add /vcs and /vcs/jj behind a feature flag.
- Start read-only.
- Require operation preview before every mutation.
- Use jj-stack for stacked PR submit first.
- Ensure existing Changeyard functionality and tests remain unaffected.
```

---

## 16. Test strategy

## 16.1 Unit tests

### Parser tests

Fixtures should cover:

- empty repository
- repo with one bookmark
- repo with multiple dependent bookmarks
- repo with parallel stacks
- multiple bookmarks at same revision
- divergent remote bookmark
- conflicted change
- hidden/remote-only bookmarks

### Graph tests

Assertions:

- bookmarks are assigned to the correct branch segment
- branch segments are ordered by ancestry
- stacks are grouped correctly
- base/trunk is excluded from feature stacks
- ambiguous branches produce diagnostics
- PR metadata attaches to the correct bookmark

### Operation mapping tests

For every `VcsOperationRequest`, assert:

- preview returns the expected argv array
- invalid source/target is rejected
- descendant moves are rejected
- pushed/open-PR rewrites produce warnings
- file paths outside repo are rejected

## 16.2 Integration tests

Use temporary repositories:

```bash
git init
jj git init --colocate
# or whatever init path is appropriate for current JJ version
```

Scenarios:

- create base commit/change
- create bookmark stack
- parse stack
- reorder change
- squash change
- absorb file
- move bookmark branch
- view operation log
- undo/restore operation

## 16.3 UI tests

Minimum:

- `/vcs` landing renders without JJ.
- `/vcs` landing renders with mocked JJ detection.
- `/vcs/jj` renders read-only stack fixture.
- drag/drop opens preview dialog.
- invalid drop shows an error.
- apply operation shows result state.

## 16.4 Manual smoke tests

- `cy ui` default route still works.
- Existing Kanban board still reads markdown correctly.
- Existing project creation/start/verify commands still work.
- `/vcs` hidden when feature flag is off.
- `/vcs` available when feature flag is on.
- JJ repo with no remote works read-only.
- JJ repo with `jst` missing shows clear PR disabled state.

---

## 17. Acceptance criteria for landing the feature

The feature is ready to land experimentally when:

- [ ] Existing Changeyard functionality is unaffected.
- [ ] Existing tests/build pass.
- [ ] `/vcs` is feature-flagged or otherwise non-invasive.
- [ ] `/vcs/jj` can render a real JJ repo stack.
- [ ] The UI shows unassigned changes, bookmarks, commits/changes, and PR metadata where available.
- [ ] Drag/drop operations produce previews before mutation.
- [ ] Confirmed mutation operations refresh the repo state and show undo affordances.
- [ ] `jj-stack` submit is integrated or gracefully disabled when unavailable.
- [ ] Documentation explains setup, limitations, and safety behaviour.
- [ ] The VCS package remains separate from the Kanban package.

---

## 18. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Accidentally breaking Kanban UI | Feature flag, separate package, full non-regression tests. |
| Copying GitButler too closely | Use public workflow concepts only; no source/assets/styles copied. |
| JJ CLI output changes | Use templates, fixtures, version diagnostics, parser tests. |
| Dangerous drag/drop mutation | Preview/confirm every operation, show commands, offer undo. |
| Rewriting pushed PR history unexpectedly | Warn when branch has PR or remote bookmark; require confirmation. |
| `jj-stack` output not machine-readable | Wrap it as an execution tool and build preview from local graph. |
| Provider auth complexity | Keep PR metadata optional and progressively enhanced. |
| UI dependency bloat | Add only VCS-local dependencies first. |
| Package duplication | Accept initially; consolidate into `packages/ui` after feature stabilises. |
| Split-app pressure | Keep route modular; split later only if runtime/build coupling becomes real. |

---

## 19. Open questions for the implementation agent to resolve during M0

1. Should VCS use the existing UI server or a new `cy vcs ui` command?
2. Is the current frontend React/Vite setup reusable directly for `packages/vcs`?
3. Where should VCS config be stored?
4. Where should VCS cache live?
5. Are provider abstractions already good enough to fetch PR metadata?
6. Is there an existing command runner that should be reused?
7. Does the repo already use Tailwind/shadcn conventions?
8. Which test framework is already used and should be extended?
9. Does Changeyard have a workspace/project selector that `/vcs` should respect?
10. Should the initial feature flag be environment-based, config-based, or CLI-flag-based?

---

## 20. Recommended first PR shape

The safest first PR should contain only:

- `docs/vcs-jj/repo-analysis.md`
- `docs/vcs-jj/plan.md`
- no runtime code, or only a no-op feature flag stub if maintainers prefer

The second PR should contain:

- `packages/vcs` static shell
- `/vcs` feature-flagged route
- no backend mutations
- no JJ command execution except optional detect endpoint if small enough

This sequencing makes the feature easy to review and reduces regression risk.

---

## 21. Source links

Public sources used to prepare this plan:

- GitButler repository: https://github.com/gitbutlerapp/gitbutler
- GitButler Desktop Overview: https://docs.gitbutler.com/features/desktop/overview
- GitButler Stacked Branches: https://docs.gitbutler.com/features/stacked-branches
- GitButler Commit Editing: https://docs.gitbutler.com/features/commit-editing
- GitButler Moving Branches: https://docs.gitbutler.com/features/moving-branches
- Changeyard repository: https://github.com/stevejuma/changeyard
- jj-stack repository: https://github.com/keanemind/jj-stack
- Jujutsu docs: https://jj-vcs.github.io/jj/latest/
- Jujutsu CLI reference: https://jj-vcs.github.io/jj/latest/cli-reference/

