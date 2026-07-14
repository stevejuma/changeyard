import type { CommandContent } from "../command-generation/types.js";

const CHANGEYARD_COMMANDS: CommandContent[] = [
  {
    id: "create",
    name: "Changeyard Create",
    description: "Create a structured Changeyard change before implementation work.",
    category: "Changeyard",
    tags: ["changeyard", "create"],
    body: `Create a new strict planned Changeyard change for non-trivial work.

1. Ask for a concise title if the user did not provide one.
2. Run \`cy create --template agent-task --planning openspec-lite --strict --title "<title>"\` from the repository root.
3. Use \`cy quick\` or \`--no-planning\` only for small, low-risk changes with no behavior, public API, storage/schema, provider/workspace lifecycle, UI workflow, or security-sensitive impact.
4. Open the generated markdown file under \`.changeyard/changes/\`.
5. Fill in Summary, Motivation, Plan, Acceptance Criteria, and the generated planning sections before editing code.
6. Run \`cy plan status <id>\` and use \`cy plan prompt <id> <section>\` when a planning section needs drafting.
7. Run \`cy audit <id>\` if any gate is unclear or fails.
8. Tell the user the change id and next steps (\`cy validate\`, \`cy sync\`, \`cy start\`).`,
  },
  {
    id: "validate",
    name: "Changeyard Validate",
    description: "Validate a Changeyard change document and lifecycle gates.",
    category: "Changeyard",
    tags: ["changeyard", "validate"],
    body: `Validate the active Changeyard change.

1. Identify the target change id from context or run \`cy list\`.
2. Run \`cy validate <id>\`.
3. If validation fails, **halt** — use the printed Recovery section or run \`cy audit <id>\`, fix the markdown/frontmatter issues, and re-run validation.
4. Do not start implementation, sync, or workspace work until validation passes.`,
  },
  {
    id: "sync",
    name: "Changeyard Sync",
    description: "Sync a validated change through the configured provider.",
    category: "Changeyard",
    tags: ["changeyard", "sync"],
    body: `Sync a Changeyard change to its provider target.

1. Ensure the change is validated with \`cy validate <id>\`.
2. Run \`cy sync <id>\`.
3. If sync fails, **halt** — use the printed Recovery section or run \`cy audit <id>\`, fix the reported issue, and re-run sync before \`cy start\`.
4. Report provider output and updated change status.`,
  },
  {
    id: "start",
    name: "Changeyard Start",
    description: "Create an isolated workspace and move the change to in_progress.",
    category: "Changeyard",
    tags: ["changeyard", "start", "workspace"],
    body: `Start isolated work for a Changeyard change.

1. Ensure the change is ready/synced as required by project config.
2. Run \`cy start <id>\`.
3. Follow the printed \`cd\` path into the workspace checkout.
4. Run \`cy verify <id>\` from that checkout before editing files.
5. After each user-requested implementation increment, run focused validation and commit the slice with \`cy slice commit <id> -m "<summary>"\`; Changeyard generates the PR-style commit body.
6. Do not accumulate multiple requested iterations in one mutable JJ \`@\` or Git worktree unless the user explicitly asks for an uncommitted diff.
7. If start or verify fails, **halt** — use \`cy audit <id>\`, \`cy workspace status <id>\`, or \`cy recover <id>\` as directed before editing files.`,
  },
  {
    id: "verify",
    name: "Changeyard Verify",
    description: "Verify the current directory is the expected Changeyard workspace.",
    category: "Changeyard",
    tags: ["changeyard", "verify", "workspace"],
    body: `Verify workspace context before making code changes.

1. Run \`cy verify <id>\` from inside the expected workspace checkout.
2. If verification fails, **halt all implementation work.** Do not edit files in the main repo or workspace.
3. Diagnose with \`cy doctor\` or fix the workspace/CLI issue, then re-run verify from the path printed by \`cy start <id>\`.
4. For JJ workspaces, every commit in the landing stack must start with the change id, for example \`CY-0001: Add parser validation\`, and the final landing tip must have summary, slices, validation, files, and notes sections.
5. Only edit files inside the verified workspace after verify passes.`,
  },
  {
    id: "complete",
    name: "Changeyard Complete",
    description: "Complete local work after checks and completion notes are ready.",
    category: "Changeyard",
    tags: ["changeyard", "complete"],
    body: `Complete a Changeyard change locally only when the user explicitly asks to complete, mark ready, ready for PR, or complete and land.

1. Ensure Completion Notes summarize changed areas, remaining risks, and evidence such as \`Checks run: pnpm test.\`, \`Tests passed: focused suite.\`, or an explicit no-check explanation.
2. Review recorded slices with \`cy review slices <id>\`, then record each decision with \`--decision approve|request-changes --slice <slice-id>\`; use \`--all-pending\` only for deliberate bulk approval, and include \`--note\` with requested changes.
3. Run \`cy verify <id>\` from the workspace.
4. Run \`cy complete <id> --no-pr\`; create a provider PR later with \`cy pr new <id>\` only when explicitly requested.
5. For JJ workspaces, completion writes the final PR-style landing description; if land later reports missing context, run \`cy describe final <id>\`. Landing advances the target bookmark but intentionally leaves root \`@\` unchanged, so report the printed commit, files, and opt-in rebase hint.
6. Run \`cy next <id>\` and report its landing confirmation guidance.
6. Do not run \`cy land <id>\` for planned/OpenSpec-lite or legacy unplanned changes unless the user explicitly confirms landing in the current conversation.
7. Quick low-risk changes may land after successful checks when the user's task clearly asks for completion and no hold, review, or PR was requested.
8. If completion fails, run \`cy audit <id>\` and follow the Recovery section.
9. If a review is needed, use \`/cy-review\` — do not skip filling the review markdown.

Do not run \`cy complete\` for "looks good", "continue", or "next"; commit another slice or wait for explicit completion wording.`,
  },
  {
    id: "audit",
    name: "Changeyard Audit",
    description: "Audit a change against workflow gates and recovery guidance.",
    category: "Changeyard",
    tags: ["changeyard", "audit", "workflow"],
    body: `Audit one Changeyard change against the enforced workflow guardrails.

1. Identify the change id from context or run \`cy list\`.
2. Run \`cy audit <id>\`.
3. Review workflow mode, canonical path, expected cwd, next command, failed checks, blockers, and Recovery entries.
4. Treat failed checks as hard stops. Fix the canonical change document, workspace state, or completion context as directed.
5. Re-run \`cy audit <id>\` or \`cy next <id>\` after fixes to confirm the next valid command.`,
  },
  {
    id: "review",
    name: "Changeyard Review",
    description: "Start, write, and complete a markdown review for a change.",
    category: "Changeyard",
    tags: ["changeyard", "review"],
    body: `Review a completed Changeyard change.

1. Identify the change id from context or run \`cy list\`.
2. Review implementation slices with \`cy review slices <id>\`, then record \`--decision approve|request-changes --slice <slice-id>\`; requested changes require \`--note\`, and \`--all-pending\` is an explicit bulk path.
3. Run \`cy review start <id>\` to create \`.changeyard/reviews/<id>/review-NNN.md\` when a whole-change review artifact is needed.
4. Edit the review file before completing:
   - **Summary** — what was reviewed, scope, risks, and decision rationale (replace the template placeholder).
   - **Required Changes** — check off items or mark none (e.g. \`- [x] None\`).
   - **Inline Comments** — optional \`path/to/file.ts:42: comment\` bullets, or write \`None.\`
5. Run \`cy review complete <id> --decision approve|request-changes|reject\` only after Summary is filled in.
6. Report the decision and any follow-up actions.

Gate protocol (hard stop): do not run \`cy review complete\` while Summary still says "Review the change here." — the CLI rejects empty template reviews.`,
  },
  {
    id: "status",
    name: "Changeyard Status",
    description: "Show the current status summary for a change.",
    category: "Changeyard",
    tags: ["changeyard", "status"],
    body: `Inspect Changeyard change status.

1. Identify the change id from context or run \`cy list\`.
2. Run \`cy status <id>\`.
3. Summarize lifecycle state, workspace details, next recommended action, and any \`cy next\` landing confirmation guidance when the next action is land.`,
  },
  {
    id: "doctor",
    name: "Changeyard Doctor",
    description: "Check local Changeyard configuration and change health.",
    category: "Changeyard",
    tags: ["changeyard", "doctor"],
    body: `Run Changeyard diagnostics for the repository.

1. Run \`cy doctor\` from the repository root.
2. Summarize warnings/issues and suggest fixes.
3. Use \`cy doctor --fix\` only when the user asks to apply supported repairs.
4. Do not use cleanup flags unless the user explicitly names the flag or asks for that exact cleanup. Human-directed cleanup flags include \`--delete-stale-completed-workspaces\`, \`--check-completed-acceptance-criteria\`, \`--waive-missing-jj-bookmarks\`, \`--waive-stale-completed-reviews\`, and \`--stale-completed-days <days>\`.`,
  },
];

export function getCommandContents(): CommandContent[] {
  return CHANGEYARD_COMMANDS;
}
