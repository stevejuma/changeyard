---
name: Changeyard
command: cy
summary: Changeyard is a markdown-first local change workflow manager.
aliases:
  - cy new -> cy create
  - cy begin -> cy start
  - cy check -> cy verify
  - cy done -> cy complete
---

## Usage

```text
cy [-i|--tui] [--connect <url>] [--host <host>] [--port <port|auto>] [--project <path>] [--debug]
cy --dashboard [--host <host>] [--port <port|auto>] [--open|--no-open]
cy --version
cy <command> [options]
```

## Commands

- `init`: Create `.changeyard`, templates, skills, and agent commands.
- `update`: Refresh bundled templates, skills, and agent command artifacts.
- `create`: Create a local markdown change.
- `quick`: Create a low-risk quick change.
- `validate`: Validate one change against templates and schema.
- `sync`: Sync change metadata to the configured provider.
- `start`: Create a task workspace.
- `verify`: Verify a task workspace.
- `hydrate`: Copy configured workspace support files and optionally run warmup.
- `complete`: Validate and mark work ready to land.
- `next`: Show the next actionable workflow command.
- `audit`: Audit workflow gates and print recovery guidance.
- `land`: Land ready workspace work locally.
- `refresh`: Rebase a JJ workspace change onto the current target before landing.
- `slice`: Commit one reviewable implementation slice from a workspace.
- `workspace`: Inspect or clean task workspaces.
- `check`: Record manual validation evidence for a workspace change.
- `review`: Manage review artifacts.
- `diff`: Show focused Changeyard diffs.
- `summarize`: Summarize recorded Changeyard artifacts.
- `plan`: Inspect and update planning sections.
- `doctor`: Check Changeyard state and repair supported drift.
- `recover`: Recreate missing workspace markers and repair recoverable workspace drift.
- `repair`: Repair recoverable workspace state.
- `note`: Update Completion Notes for a change.
- `mark-in-progress`: Mark a recoverable change in progress.
- `hooks`: Forward terminal-agent hook events to the local runtime.
- `session`: Register external agent session metadata with the runtime.
- `hub`: Manage the shared UI/runtime hub.
- `config`: Print runtime config as JSON.
- `list`: List local changes.
- `status`: Print one change summary.
- `install`: Install local CLI symlinks.
- `uninstall`: Remove local CLI symlinks.
- `version`: Print the Changeyard version.
- `help`: Print command or topic help.

## Options

- `-i, --tui`: Start the OpenTUI terminal interface.
- `--dashboard`: Open the dashboard browser client.
- `--kanban`: Open the Kanban browser client.
- `--vcs`: Open the VCS browser client.
- `--json`: Print machine-readable output.
- `--version`: Print the Changeyard version.
- `--dry-run`: Simulate mutating commands without writing.
- `--verbose`: Print additional diagnostic output.
- `--quiet`: Suppress success output.
- `--color <when>`: Control ANSI color output. [possible values: always, never, auto]

## Examples

```sh
cy create --template agent-task --planning openspec-lite --strict --title "Add workspace verification"
cy validate CY-0001
cy start CY-0001
cy next CY-0001
cy audit CY-0001
cy help -k workflow
```
