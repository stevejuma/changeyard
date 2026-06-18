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
5. If start or verify fails, **halt** — use \`cy audit <id>\`, \`cy workspace status <id>\`, or \`cy recover <id>\` as directed before editing files.`,
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
4. Only edit files inside the verified workspace after verify passes.`,
  },
  {
    id: "complete",
    name: "Changeyard Complete",
    description: "Complete local work after checks and completion notes are ready.",
    category: "Changeyard",
    tags: ["changeyard", "complete"],
    body: `Complete a Changeyard change locally.

1. Ensure Completion Notes in the change markdown are filled in.
   They must summarize changed areas, checks run or not run, and remaining risks or follow-ups.
2. Run \`cy verify <id>\` from the workspace.
3. Run \`cy complete <id> --no-pr\` unless the user explicitly wants PR creation.
4. If completion fails, run \`cy audit <id>\` and follow the Recovery section.
5. If a review is needed, use \`/cy-review\` — do not skip filling the review markdown.`,
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
2. Run \`cy review start <id>\` to create \`.changeyard/reviews/<id>/review-NNN.md\`.
3. Edit the review file before completing:
   - **Summary** — what was reviewed, scope, risks, and decision rationale (replace the template placeholder).
   - **Required Changes** — check off items or mark none (e.g. \`- [x] None\`).
   - **Inline Comments** — optional \`path/to/file.ts:42: comment\` bullets, or write \`None.\`
4. Run \`cy review complete <id> --decision approve|request-changes|reject\` only after Summary is filled in.
5. Report the decision and any follow-up actions.

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
3. Summarize lifecycle state, workspace details, and next recommended action.`,
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
4. Use stale cleanup flags only when explicitly requested: \`--delete-stale-completed-workspaces\` for clean merged workspaces, \`--waive-stale-completed-reviews\` for completed changes missing review artifacts, and \`--stale-completed-days <days>\` to override the default age threshold.`,
  },
];

export function getCommandContents(): CommandContent[] {
  return CHANGEYARD_COMMANDS;
}
