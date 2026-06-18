import type { RuntimeAgentId } from "../core/api-contract.js";

type PromptVcsEngine = "git" | "jj" | "unknown";

export interface ChangeyardPromptContext {
	commandPrefix?: string | null;
	projectRoot?: string | null;
	vcsEngine?: "git" | "jj" | string | null;
	agentId?: RuntimeAgentId | null;
}

const DEFAULT_CHANGEYARD_COMMAND_PREFIX = "cy";

function normalizeCommandPrefix(commandPrefix?: string | null): string {
	const normalized = commandPrefix?.trim();
	return normalized && normalized.length > 0 ? normalized : DEFAULT_CHANGEYARD_COMMAND_PREFIX;
}

function normalizeProjectRoot(projectRoot?: string | null): string {
	const normalized = projectRoot?.trim();
	return normalized && normalized.length > 0 ? normalized : "the project root";
}

function normalizeVcsEngine(vcsEngine?: string | null): PromptVcsEngine {
	if (vcsEngine === "jj" || vcsEngine === "git") {
		return vcsEngine;
	}
	return "unknown";
}

function renderVcsGuidance(vcsEngine: PromptVcsEngine): string {
	if (vcsEngine === "jj") {
		return [
			"- Detected VCS: jj.",
			"- Do not create JJ workspaces or bookmarks directly. Use Changeyard commands such as `cy start` and `cy land` so metadata stays consistent.",
		].join("\n");
	}
	if (vcsEngine === "git") {
		return [
			"- Detected VCS: git.",
			"- Do not create git worktrees or branches directly for this workflow. Use Changeyard commands such as `cy start` and `cy land` so metadata stays consistent.",
		].join("\n");
	}
	return [
		"- Detected VCS: unknown.",
		"- Do not create VCS workspaces, bookmarks, branches, or worktrees directly. Use Changeyard commands so metadata stays consistent.",
	].join("\n");
}

function replaceCyExamples(prompt: string, commandPrefix: string): string {
	if (commandPrefix === DEFAULT_CHANGEYARD_COMMAND_PREFIX) {
		return prompt;
	}
	return prompt.replaceAll("`cy ", `\`${commandPrefix} `);
}

export function renderChangeyardSidebarPrompt(context: ChangeyardPromptContext = {}): string {
	const commandPrefix = normalizeCommandPrefix(context.commandPrefix);
	const projectRoot = normalizeProjectRoot(context.projectRoot);
	const vcsEngine = normalizeVcsEngine(context.vcsEngine);
	const selectedAgentId = context.agentId ?? "unknown";
	const prompt = `# Changeyard Sidebar

You are the Changeyard sidebar helper for this workspace. Help the user inspect, create, organize, and start Changeyard changes from the side panel. Prefer using the Changeyard CLI instead of describing manual steps.

Changeyard is a markdown-first workflow. Canonical change state lives in \`.changeyard/changes/*.md\`.

# CRITICAL: You are NOT a coding agent

NEVER edit, create, delete, or modify product files. NEVER implement a feature, fix a bug, or refactor code yourself. If the user asks for implementation work, help them create or start a Changeyard change so a coding agent can do the work through the lifecycle gates.

# Project Context

- Project root: ${projectRoot}
${renderVcsGuidance(vcsEngine)}
- If your current working directory is not the project root, pass \`--project-path ${projectRoot}\` where the CLI supports it, or first change to the project root.
- After \`cy start <id>\`, product edits belong only in the workspace path printed by Changeyard.

# Command Prefix

Use this prefix for every Changeyard command in this session:
\`${commandPrefix}\`

# Changeyard Commands

- List changes: \`cy list\`
- Create a planned agent change: \`cy create --template agent-task --planning openspec-lite --strict --title "<title>"\`
- Create a small quick change only when genuinely low risk: \`cy quick --title "<title>"\`
- Check actionability: \`cy audit <id>\` and \`cy next <id>\`
- Validate and sync before starting: \`cy validate <id>\`, then \`cy sync <id>\` when a provider is configured
- Start implementation workspace: \`cy start <id>\`
- Verify workspace context before editing: \`cy verify <id>\`
- Complete locally after implementation: \`cy complete <id> --no-pr\`

# Gate Rules

- Treat \`cy validate\`, \`cy sync\`, \`cy start\`, \`cy verify\`, and \`cy complete\` as hard gates.
- If a gate fails, stop and report the exact recovery command. Use \`cy audit <id>\`, \`cy next <id>\`, \`cy workspace status <id>\`, or \`cy doctor\` when the recovery step is unclear.
- Agents must not use doctor cleanup flags unless the user explicitly names the flag or asks for that exact cleanup.

# Session Notes

- Current home agent: \`${selectedAgentId}\`
- If the user asks to attach or recover a CLI session, use Changeyard session metadata returned by the CLI when available and report failures only if the user is asking about runtime/session tracking.`;
	return replaceCyExamples(prompt, commandPrefix);
}

export function buildChangeyardCodingAgentPrompt(userPrompt: string, context: ChangeyardPromptContext = {}): string {
	const commandPrefix = normalizeCommandPrefix(context.commandPrefix);
	const projectRoot = normalizeProjectRoot(context.projectRoot);
	const vcsEngine = normalizeVcsEngine(context.vcsEngine);
	const trimmedPrompt = userPrompt.trim();
	const prompt = `The prompt that follows is a request for a Changeyard change.

Start in the project root: ${projectRoot}

${renderVcsGuidance(vcsEngine)}

Use the Changeyard workflow to start implementation:

1. Create a strict planned change: \`cy create --template agent-task --planning openspec-lite --strict --title "<title>"\`
2. Fill in Summary, Motivation, Plan, Acceptance Criteria, and the generated planning sections.
3. Validate: \`cy validate <id>\`
4. Sync if a provider is configured: \`cy sync <id>\`
5. Start the isolated workspace: \`cy start <id>\`
6. Change into the workspace path printed by start, then verify: \`cy verify <id>\`
7. Implement only inside that verified workspace checkout.
8. Update Completion Notes with changed areas, checks run, and remaining risks or follow-ups.
9. Complete locally: \`cy complete <id> --no-pr\`

Lifecycle commands are hard gates. If a gate fails, stop implementation, run \`cy audit <id>\` or \`cy next <id>\` as appropriate, report the exact blocker and recovery command, and do not continue product edits until the gate passes.

For large or multi-step changes, make multiple logical commits inside the verified workspace. Every workspace commit message must start with the change id, for example \`CY-0001: Add parser validation\`.

User request:
${trimmedPrompt || "(No user request was provided. Ask the user for the change request before creating a Changeyard change.)"}`;
	return replaceCyExamples(prompt, commandPrefix);
}
