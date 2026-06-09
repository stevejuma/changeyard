import type { CommandContent } from "../command-generation/types.js";

const CHANGEYARD_COMMANDS: CommandContent[] = [
  {
    id: "create",
    name: "Changeyard Create",
    description: "Create a structured Changeyard change before implementation work.",
    category: "Changeyard",
    tags: ["changeyard", "create"],
    body: `Create a new Changeyard change for non-trivial work.

1. Ask for a concise title if the user did not provide one.
2. Run \`cy create --template agent-task --title "<title>"\` from the repository root.
3. Open the generated markdown file under \`.changeyard/changes/\`.
4. Fill in Summary, Motivation, Plan, and Acceptance Criteria before editing code.
5. Tell the user the change id and next steps (\`cy validate\`, \`cy sync\`, \`cy start\`).`,
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
3. If validation fails, fix the markdown/frontmatter issues and re-run validation.
4. Do not start implementation until validation passes.`,
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
3. Report provider output and updated change status.`,
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
4. Run \`cy verify <id>\` before editing files.`,
  },
  {
    id: "verify",
    name: "Changeyard Verify",
    description: "Verify the current directory is the expected Changeyard workspace.",
    category: "Changeyard",
    tags: ["changeyard", "verify", "workspace"],
    body: `Verify workspace context before making code changes.

1. Run \`cy verify <id>\` from inside the expected workspace checkout.
2. If verification fails, return to the workspace path printed by \`cy start <id>\`.
3. Only edit files inside the verified workspace.`,
  },
  {
    id: "complete",
    name: "Changeyard Complete",
    description: "Complete local work after checks and completion notes are ready.",
    category: "Changeyard",
    tags: ["changeyard", "complete"],
    body: `Complete a Changeyard change locally.

1. Ensure Completion Notes in the change markdown are filled in.
2. Run \`cy verify <id>\` from the workspace.
3. Run \`cy complete <id> --no-pr\` unless the user explicitly wants PR creation.
4. Summarize checks, risks, and follow-up review steps.`,
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
3. Use \`cy doctor --fix\` only when the user asks to apply supported repairs.`,
  },
];

export function getCommandContents(): CommandContent[] {
  return CHANGEYARD_COMMANDS;
}
