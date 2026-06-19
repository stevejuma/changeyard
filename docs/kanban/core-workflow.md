# Kanban Core Workflow

The Kanban workflow follows the same lifecycle as the CLI. The UI makes the state easier to scan, but the gates and source files remain the same.

## 1. Create Or Pick A Change

Create a change in Kanban or with the CLI:

```sh
cy create --template agent-task --planning openspec-lite --strict --title "Describe the work"
```

Kanban reads the resulting `.changeyard/changes/<id>.md` file and shows status, planning state, provider metadata, and workspace state.

## 2. Fill Planning Sections

Strict planned changes must include summary, motivation, plan, proposal, specification deltas, design, tasks, verification, clarifications, checklist, consistency analysis, acceptance criteria, and agent plan.

Kanban can edit marker-scoped planning sections. If the underlying file changes while a section is open, the UI reloads instead of overwriting newer content.

## 3. Validate And Sync

Run lifecycle gates from the UI or CLI:

```sh
cy validate CY-0001
cy sync CY-0001
```

Validation checks the Markdown and planning gates. Sync updates the configured provider when one exists. In a noop provider setup, sync records local state only.

## 4. Start And Verify A Workspace

Starting a change creates an isolated workspace and moves implementation work out of the root checkout.

```sh
cy start CY-0001
cd .changeyard/workspaces/CY-0001/repo
cy verify CY-0001
```

Workspace engines decide how the checkout is created. The UI must treat `plain-copy`, `git-worktree`, and `jj` workspaces as valid implementations of the same lifecycle.

## 5. Implement, Review, And Complete

Implementation happens inside the verified workspace. The board reflects workspace state and review state from `.changeyard`.

Typical closeout:

```sh
cy validate CY-0001 --gate complete
cy complete CY-0001 --no-pr
```

When provider-backed publishing is configured, the completion flow can hand off to provider-specific review or pull request behavior. Kanban should surface those states without becoming the provider source of truth.

## 6. Clean Up Runtime Processes

Use the dashboard or CLI to inspect and stop hub instances when a session is finished:

```sh
cy hub list
cy hub kill stale
```
